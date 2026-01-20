import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdminClient } from '@/lib/supabase/server'

type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2'

interface FeedRequest {
  cefr: CefrLevel
  weaknessRank?: string[]
  preferredGenre?: string
  limit?: number
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
 * - CEFR level (required)
 * - Weakness rank (optional, prioritizes matching clips)
 * - Preferred genre (optional, for future use)
 * 
 * Strategy:
 * - If weaknessRank[0] exists, do two queries:
 *   1) Focused: clips matching focus_areas contains weaknessRank[0]
 *   2) Fallback: remaining clips by cefr
 * - Merge unique by id until limit
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

    if (body.weaknessRank && !Array.isArray(body.weaknessRank)) {
      return NextResponse.json(
        {
          error: 'Invalid weaknessRank',
          code: 'VALIDATION_ERROR',
          message: 'weaknessRank must be an array',
        },
        { status: 400 }
      )
    }

    const limit = body.limit || 10
    const supabase = getSupabaseAdminClient()
    const chosenFocus = body.weaknessRank?.[0] || null

    // Dev-only log
    if (IS_DEV) {
      console.log('🔍 [Clips Feed] Request (dev only):', {
        cefr: body.cefr,
        chosenFocus,
        weaknessRank: body.weaknessRank?.slice(0, 3),
        preferredGenre: body.preferredGenre,
        limit,
      })
    }

    let focusedClips: any[] = []
    let fallbackClips: any[] = []

    // Query 1: Focused clips (if weaknessRank[0] exists)
    if (chosenFocus) {
      try {
        // Try cefr column first, fallback to difficulty mapping
        let focusedQuery = supabase
          .from('curated_clips')
          .select('*')
          .eq('clip_type', 'practice')
          .contains('focus_areas', [chosenFocus]) // Array contains check
        
        // Filter by cefr column if it exists
        focusedQuery = focusedQuery.eq('cefr', body.cefr) as any

        const { data: focused, error: focusedError } = await focusedQuery

        if (focusedError) {
          // If cefr column doesn't exist, try difficulty mapping
          if (focusedError.message?.includes('column') && focusedError.message?.includes('cefr')) {
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
              .contains('focus_areas', [chosenFocus])
              .eq('difficulty', difficulty)
            
            const { data: retryFocused, error: retryError } = await retryQuery
            
            if (retryError) {
              console.error('❌ [Clips Feed] Focused query error:', retryError)
            } else {
              focusedClips = retryFocused || []
            }
          } else {
            console.error('❌ [Clips Feed] Focused query error:', focusedError)
          }
        } else {
          focusedClips = focused || []
        }
      } catch (error) {
        console.error('❌ [Clips Feed] Focused query exception:', error)
      }
    }

    // Query 2: Fallback clips (remaining clips by cefr, excluding focused ones)
    try {
      const focusedIds = new Set(focusedClips.map(c => c.id))
      
      let fallbackQuery = supabase
        .from('curated_clips')
        .select('*')
        .eq('clip_type', 'practice')
        .eq('cefr', body.cefr)

      const { data: fallback, error: fallbackError } = await fallbackQuery

      if (fallbackError) {
        // If cefr column doesn't exist, try difficulty mapping
        if (fallbackError.message?.includes('column') && fallbackError.message?.includes('cefr')) {
          const cefrToDifficulty: Record<CefrLevel, string> = {
            'A1': 'easy',
            'A2': 'easy',
            'B1': 'medium',
            'B2': 'hard',
          }
          const difficulty = cefrToDifficulty[body.cefr]
          
          const retryFallbackQuery = supabase
            .from('curated_clips')
            .select('*')
            .eq('clip_type', 'practice')
            .eq('difficulty', difficulty)
          
          const { data: retryFallback, error: retryFallbackError } = await retryFallbackQuery
          
          if (retryFallbackError) {
            console.error('❌ [Clips Feed] Fallback query error:', retryFallbackError)
          } else {
            // Filter out focused clips in JavaScript
            fallbackClips = (retryFallback || []).filter((c: any) => !focusedIds.has(c.id))
          }
        } else {
          console.error('❌ [Clips Feed] Fallback query error:', fallbackError)
        }
      } else {
        // Filter out focused clips in JavaScript
        fallbackClips = (fallback || []).filter((c: any) => !focusedIds.has(c.id))
      }
    } catch (error) {
      console.error('❌ [Clips Feed] Fallback query exception:', error)
    }

    // Merge unique by id until limit
    const clipMap = new Map<string, any>()
    
    // First add focused clips (prioritized)
    for (const clip of focusedClips) {
      if (clipMap.size >= limit) break
      if (!clipMap.has(clip.id)) {
        clipMap.set(clip.id, clip)
      }
    }
    
    // Then add fallback clips until limit
    for (const clip of fallbackClips) {
      if (clipMap.size >= limit) break
      if (!clipMap.has(clip.id)) {
        clipMap.set(clip.id, clip)
      }
    }

    const mergedClips = Array.from(clipMap.values())

    if (mergedClips.length === 0) {
      console.warn('⚠️ [Clips Feed] No practice clips found for CEFR level:', body.cefr)
      return NextResponse.json(
        {
          clips: [],
        },
        { status: 200 }
      )
    }

    // Map to response shape (same as diagnostic endpoint)
    const formattedClips = formatClips(mergedClips, limit, body.cefr)

    const returnedCount = formattedClips.length
    const firstIds = formattedClips.slice(0, 5).map(c => c.id)

    // Dev-only logs
    if (IS_DEV) {
      console.log('📊 [Clips Feed] Results (dev only):', {
        chosenFocus,
        returnedCount,
        firstIds,
        focusedCount: focusedClips.length,
        fallbackCount: fallbackClips.length,
        mergedCount: mergedClips.length,
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
    const weaknessParam = searchParams.get('weakness')
    const situationParam = searchParams.get('situation')
    const limitParam = searchParams.get('limit')

    // Parse weakness (comma-separated string)
    const weakness = weaknessParam
      ? weaknessParam.split(',').map(w => w.trim()).filter(Boolean)
      : undefined

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
        weakness: weakness?.slice(0, 3),
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

      // Priority 1: focusAreas overlap with weakness
      if (weakness && weakness.length > 0) {
        const clipFocusAreas = Array.isArray(clip.focus_areas)
          ? clip.focus_areas.map((f: any) => String(f).toLowerCase())
          : Array.isArray(clip.focus)
            ? clip.focus.map((f: any) => String(f).toLowerCase())
            : []

        const weaknesses = weakness.map(w => w.toLowerCase())
        
        for (const w of weaknesses) {
          if (clipFocusAreas.includes(w)) {
            score += 1000 // High priority for weakness match
          }
        }
      }

      // Priority 2: situation match
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
        weakness: weakness?.slice(0, 3),
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
