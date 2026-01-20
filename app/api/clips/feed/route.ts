import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdminClient } from '@/lib/supabase/server'

type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2'

interface FeedRequest {
  cefr: CefrLevel
  preferredGenre?: string
  limit?: number
  // Note: weaknessRank removed for MVP - categories only for explanation UI
}

interface Clip {
  id: string
  transcript: string
  difficultyCefr: CefrLevel
  focusAreas: string[]
  situation?: string
  lengthSec?: number
  clipType: 'practice'
}

const IS_DEV = process.env.NODE_ENV === 'development'

/**
 * Map CEFR to difficulty (for fallback if cefr column doesn't exist)
 */
const cefrToDifficulty: Record<CefrLevel, string> = {
  'A1': 'easy',
  'A2': 'easy',
  'B1': 'medium',
  'B2': 'hard',
}

/**
 * Get allowed CEFR levels (same or one step easier)
 */
function getAllowedCefrLevels(userCefr: CefrLevel): CefrLevel[] {
  const cefrOrder: CefrLevel[] = ['A1', 'A2', 'B1', 'B2']
  const userIndex = cefrOrder.indexOf(userCefr)
  if (userIndex === -1) return [userCefr]
  
  // Return same level and one step easier
  const allowed: CefrLevel[] = [userCefr]
  if (userIndex > 0) {
    allowed.push(cefrOrder[userIndex - 1])
  }
  return allowed
}

/**
 * Format clips to response shape
 */
function formatClips(clips: any[], limit: number, defaultCefr: CefrLevel): Clip[] {
  const selected = clips.slice(0, limit)

  return selected.map((clip: any) => {
    let difficultyCefr: CefrLevel = defaultCefr
    
    if (clip.cefr) {
      difficultyCefr = clip.cefr as CefrLevel
    } else if (clip.difficulty) {
      const difficultyToCefr: Record<string, CefrLevel> = {
        'easy': 'A2',
        'medium': 'B1',
        'hard': 'B2',
      }
      difficultyCefr = difficultyToCefr[clip.difficulty] || defaultCefr
    }

    const focusAreas = Array.isArray(clip.focus_areas)
      ? clip.focus_areas.map((area: any) => String(area))
      : Array.isArray(clip.focus)
        ? clip.focus.map((area: any) => String(area))
        : []

    return {
      id: clip.id,
      transcript: clip.transcript,
      difficultyCefr,
      focusAreas,
      situation: clip.situation || undefined,
      lengthSec: clip.length_sec || undefined,
      clipType: 'practice' as const,
    }
  })
}

/**
 * POST /api/clips/feed
 * 
 * Returns adaptive feed of practice clips based on:
 * - CEFR level (required, from quickStartSummary.startingDifficulty)
 * - Preferred genre (optional, for future use)
 * 
 * Strategy:
 * - Fetch clips by CEFR level only (no weakness-based ranking for MVP)
 * - Limit to requested count
 * 
 * Note: weaknessRank removed for MVP - categories only for explanation UI
 * 
 * Response shape matches diagnostic endpoint shape
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as FeedRequest

    // Validation
    if (!body.cefr || !['A1', 'A2', 'B1', 'B2'].includes(body.cefr)) {
      return NextResponse.json(
        {
          error: 'Invalid or missing cefr',
          code: 'VALIDATION_ERROR',
          message: 'cefr must be one of: A1, A2, B1, B2',
        },
        { status: 400 }
      )
    }

    const limit = body.limit || 10
    const supabase = getSupabaseAdminClient()

    // Dev-only log
    if (IS_DEV) {
      console.log('🔍 [Clips Feed POST] Request (dev only):', {
        cefr: body.cefr,
        preferredGenre: body.preferredGenre,
        limit,
      })
    }

    // Fetch clips by CEFR only (no weakness-based ranking for MVP)
    let clips: any[] = []

    try {
      let query = supabase
        .from('curated_clips')
        .select('*')
        .eq('clip_type', 'practice')
        .eq('cefr', body.cefr)
        .limit(limit)

      const { data, error } = await query

      if (error) {
        // If cefr column doesn't exist, try difficulty mapping
        if (error.message?.includes('column') && error.message?.includes('cefr')) {
          const cefrToDifficulty: Record<CefrLevel, string> = {
            'A1': 'easy',
            'A2': 'easy',
            'B1': 'medium',
            'B2': 'hard',
          }
          const difficulty = cefrToDifficulty[body.cefr]
          
          const retryQuery = supabase
            .from('curated_clips')
            .select('*')
            .eq('clip_type', 'practice')
            .eq('difficulty', difficulty)
            .limit(limit)
          
          const { data: retryData, error: retryError } = await retryQuery
          
          if (retryError) {
            console.error('❌ [Clips Feed POST] Query error:', retryError)
          } else {
            clips = retryData || []
          }
        } else {
          console.error('❌ [Clips Feed POST] Query error:', error)
        }
      } else {
        clips = data || []
      }
    } catch (error) {
      console.error('❌ [Clips Feed POST] Query exception:', error)
    }

    if (clips.length === 0) {
      console.warn('⚠️ [Clips Feed POST] No practice clips found for CEFR level:', body.cefr)
      return NextResponse.json(
        {
          clips: [],
        },
        { status: 200 }
      )
    }

    // Map to response shape (same as diagnostic endpoint)
    const formattedClips = formatClips(clips, limit, body.cefr)

    const returnedCount = formattedClips.length
    const firstIds = formattedClips.slice(0, 5).map(c => c.id)

    // Dev-only logs
    if (IS_DEV) {
      console.log('📊 [Clips Feed POST] Results (dev only):', {
        returnedCount,
        firstIds,
        clipCount: clips.length,
      })
    }

    return NextResponse.json({
      clips: formattedClips,
    })
  } catch (error: any) {
    console.error('❌ [Clips Feed] Unhandled error:', error)
    
    // Handle JSON parsing errors
    if (error instanceof SyntaxError || error.message?.includes('JSON')) {
      return NextResponse.json(
        {
          error: 'Invalid JSON',
          code: 'VALIDATION_ERROR',
          message: 'Request body must be valid JSON',
        },
        { status: 400 }
      )
    }
    
    return NextResponse.json(
      {
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
        message: error.message || 'An unexpected error occurred',
      },
      { status: 500 }
    )
  }
}

/**
 * GET /api/clips/feed
 * 
 * Returns adaptive feed of practice clips based on query parameters:
 * - cefr: User's CEFR level (required)
 * - weakness: Comma-separated weakness categories (optional)
 * - situation: Preferred situation/genre (optional)
 * 
 * Query: Returns 10 clips from DB where clip_type='practice'
 * 
 * Prioritization:
 * 1) focusAreas overlap with weakness
 * 2) situation match
 * 3) difficultyCefr <= cefr (or one step easier)
 * 
 * Response shape matches diagnostic endpoint shape
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const cefrParam = searchParams.get('cefr')
    const situationParam = searchParams.get('situation')
    const limitParam = searchParams.get('limit')

    // Note: weakness parameter removed for MVP - categories only for explanation UI

    const cefr = cefrParam as CefrLevel | null
    const situation = situationParam || undefined
    const limit = limitParam ? parseInt(limitParam, 10) : 10

    // Validation
    if (!cefr || !['A1', 'A2', 'B1', 'B2'].includes(cefr)) {
      // Fallback: return default practice clips (no filtering)
      if (IS_DEV) {
        console.log('⚠️ [Clips Feed GET] Invalid/missing cefr, returning default clips')
      }
      
      const supabase = getSupabaseAdminClient()
      const { data: defaultClips, error } = await supabase
        .from('curated_clips')
        .select('*')
        .eq('clip_type', 'practice')
        .limit(limit)

      if (error) {
        console.error('❌ [Clips Feed GET] Error fetching default clips:', error)
        return NextResponse.json(
          {
            error: 'Failed to fetch clips',
            code: 'DB_QUERY_ERROR',
            message: error.message || 'Database query failed',
          },
          { status: 500 }
        )
      }

      const formattedClips = formatClips(defaultClips || [], limit, 'A2')
      return NextResponse.json({ clips: formattedClips })
    }

    // Validation
    if (!cefr || !['A1', 'A2', 'B1', 'B2'].includes(cefr)) {
      return NextResponse.json(
        {
          error: 'Invalid or missing cefr',
          code: 'VALIDATION_ERROR',
          message: 'cefr must be one of: A1, A2, B1, B2',
        },
        { status: 400 }
      )
    }

    const supabase = getSupabaseAdminClient()
    const allowedCefrLevels = getAllowedCefrLevels(cefr)
    
    if (IS_DEV) {
      console.log('🔍 [Clips Feed GET] Request (dev only):', {
        cefr,
        situation,
        allowedCefrLevels,
        limit,
      })
    }

    // Fetch all practice clips
    let allClips: any[] = []
    
    try {
      let query = supabase
        .from('curated_clips')
        .select('*')
        .eq('clip_type', 'practice')

      const { data, error } = await query

      if (error) {
        throw error
      } else {
        allClips = data || []
      }
    } catch (error) {
      console.error('❌ [Clips Feed GET] Query exception:', error)
      return NextResponse.json(
        {
          error: 'Failed to fetch clips',
          code: 'DB_QUERY_ERROR',
          message: error instanceof Error ? error.message : 'Database query failed',
        },
        { status: 500 }
      )
    }

    if (allClips.length === 0) {
      console.warn('⚠️ [Clips Feed GET] No practice clips found')
      return NextResponse.json({ clips: [] }, { status: 200 })
    }

    // Score and rank clips based on priorities
    const scoredClips = allClips.map((clip: any) => {
      let score = 0

      // Get clip CEFR level (from cefr column or map from difficulty)
      const clipCefr: CefrLevel | null = clip.cefr || 
        (clip.difficulty === 'easy' ? 'A2' :
         clip.difficulty === 'medium' ? 'B1' :
         clip.difficulty === 'hard' ? 'B2' : null)

      // Priority 3: difficultyCefr <= cefr (or one step easier)
      if (clipCefr && allowedCefrLevels.includes(clipCefr)) {
        if (clipCefr === cefr) {
          score += 100 // Exact match = highest base score
        } else {
          score += 50 // One step easier = good base score
        }
      } else if (!clipCefr) {
        // If no CEFR level, skip this clip (or give minimal score)
        return { clip, score: -1 }
      } else {
        // Clip is too difficult, skip it
        return { clip, score: -1 }
      }

      // Priority 1: situation match (weakness-based ranking removed for MVP)
      if (situation && clip.situation) {
        const clipSituation = String(clip.situation).toLowerCase()
        const requestedSituation = String(situation).toLowerCase()
        
        if (clipSituation === requestedSituation || 
            clipSituation.includes(requestedSituation) || 
            requestedSituation.includes(clipSituation)) {
          score += 500 // High priority for situation match
        }
      }

      return { clip, score }
    })

    // Filter out clips that don't meet difficulty requirement, then sort by score
    const validClips = scoredClips.filter(item => item.score >= 0)
    
    // Sort by score descending, then by id for consistency
    validClips.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score
      }
      return a.clip.id.localeCompare(b.clip.id)
    })

    // Take top N clips (default 10)
    const topClips = validClips.slice(0, limit).map(item => item.clip)
    const formattedClips = formatClips(topClips, limit, cefr)

    if (IS_DEV) {
      console.log('📊 [Clips Feed GET] Results (dev only):', {
        cefr,
        situation,
        totalClipsFetched: allClips.length,
        validClips: validClips.length,
        returnedCount: formattedClips.length,
        topScores: validClips.slice(0, 5).map(item => ({
          clipId: item.clip.id,
          score: item.score,
        })),
        firstIds: formattedClips.slice(0, 5).map(c => c.id),
      })
    }

    return NextResponse.json({
      clips: formattedClips,
    })
  } catch (error: any) {
    console.error('❌ [Clips Feed GET] Unhandled error:', error)
    
    return NextResponse.json(
      {
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
        message: error.message || 'An unexpected error occurred',
      },
      { status: 500 }
    )
  }
}
