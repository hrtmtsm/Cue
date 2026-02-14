import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdminClient } from '@/lib/supabase/server'
import { resolveUserId } from '@/lib/supabase/resolveUserId'
import { Clip, Situation } from '@/lib/clipTypes'

/**
 * Map difficulty levels to CEFR levels
 * Easy: A1, A2 (beginner)
 * Medium: B1 (intermediate)
 * Hard: B2, C1 (advanced)
 */
function mapDifficultyToCEFR(difficulties: string[]): string[] {
  const cefrLevels: string[] = []
  
  for (const difficulty of difficulties) {
    switch (difficulty.toLowerCase()) {
      case 'easy':
        cefrLevels.push('A1', 'A2')
        break
      case 'medium':
        cefrLevels.push('B1')
        break
      case 'hard':
        cefrLevels.push('B2', 'C1')
        break
      default:
        // Unknown difficulty - include all levels
        cefrLevels.push('A1', 'A2', 'B1', 'B2')
    }
  }
  
  // Remove duplicates
  return Array.from(new Set(cefrLevels))
}

/**
 * Map onboarding situation keys to database situation values
 * Onboarding: work_meetings, daily, travel, videos_shows, interviews_presentations, general
 * Database: work, daily, travel, media, formal, general
 */
function mapOnboardingSituations(onboardingSituations: string[]): string[] {
  const situationMap: Record<string, string> = {
    'work_meetings': 'work',
    'daily': 'daily',
    'travel': 'travel',
    'videos_shows': 'media',
    'interviews_presentations': 'formal',
    'general': 'general',
  }
  
  return onboardingSituations
    .map(s => situationMap[s] || s)
    .filter((s, i, arr) => arr.indexOf(s) === i) // Remove duplicates
}

/**
 * GET /api/clips/user
 * 
 * Fetches all clips for the current user from curated_clips table
 * Returns clips in the Clip format for story generation
 */
export async function GET(request: NextRequest) {
  try {
    // Resolve userId (authenticated user or dev guest)
    let userIdResolved: { userId: string; source: 'auth' | 'dev_guest' }
    try {
      userIdResolved = await resolveUserId(request)
      console.log('✅ [User Clips API] User resolved:', {
        userId: userIdResolved.userId.substring(0, 8) + '...',
        source: userIdResolved.source,
      })
    } catch (error: any) {
      console.error('🚫 [User Clips API] Failed to resolve user:', error.message)
      return NextResponse.json(
        { 
          error: 'Unauthorized',
          code: 'AUTH_REQUIRED',
          message: error.message || 'Authentication required. Please sign in.'
        },
        { status: 401 }
      )
    }

    const userId = userIdResolved.userId

    // Get filters from query params (optional)
    const { searchParams } = new URL(request.url)
    
    // Difficulty filter - convert to CEFR levels
    const difficultiesParam = searchParams.get('difficulties')
    let cefrFilter: string[] | null = null
    if (difficultiesParam) {
      try {
        const difficultiesFilter = JSON.parse(difficultiesParam)
        cefrFilter = mapDifficultyToCEFR(difficultiesFilter)
        console.log('🎯 [User Clips API] Filtering by difficulties:', {
          input: difficultiesFilter,
          cefrLevels: cefrFilter,
        })
      } catch (error) {
        console.warn('⚠️ [User Clips API] Invalid difficulties param, ignoring:', error)
        cefrFilter = null
      }
    }
    
    // Situations filter - map onboarding keys to DB values
    const situationsParam = searchParams.get('situations')
    let situationsFilter: string[] | null = null
    if (situationsParam) {
      try {
        const onboardingSituations = JSON.parse(situationsParam)
        situationsFilter = mapOnboardingSituations(onboardingSituations)
        console.log('🎯 [User Clips API] Filtering by situations:', {
          input: onboardingSituations,
          mapped: situationsFilter,
        })
      } catch (error) {
        console.warn('⚠️ [User Clips API] Invalid situations param, ignoring:', error)
        situationsFilter = null
      }
    }
    
    // Focus areas filter
    const focusParam = searchParams.get('focus')
    let focusFilter: string[] | null = null
    if (focusParam) {
      try {
        focusFilter = JSON.parse(focusParam)
        console.log('🎯 [User Clips API] Filtering by focus areas:', focusFilter)
      } catch (error) {
        console.warn('⚠️ [User Clips API] Invalid focus param, ignoring:', error)
        focusFilter = null
      }
    }

    // Get Supabase admin client
    const supabaseAdmin = getSupabaseAdminClient()
    
    // Fetch clips from curated_clips
    // Note: curated_clips may or may not have user_id column (could be shared/public table)
    let clipsData: any[] | null = null
    let fetchError: any = null
    
    // First, try with user_id filter (if column exists)
    let queryWithUser = supabaseAdmin
      .from('curated_clips')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100) // Reasonable limit for performance
    
    // Filter by clip_type (exclude diagnostic clips)
    queryWithUser = queryWithUser.neq('clip_type', 'diagnostic')
    
    // Apply CEFR filter if provided and not empty
    if (cefrFilter && cefrFilter.length > 0) {
      queryWithUser = queryWithUser.in('cefr', cefrFilter)
    }
    
    // Apply situations filter if provided
    if (situationsFilter && situationsFilter.length > 0) {
      queryWithUser = queryWithUser.in('situation', situationsFilter)
    }
    
    // Apply focus areas filter if provided (array overlap)
    if (focusFilter && focusFilter.length > 0) {
      queryWithUser = queryWithUser.overlaps('focus_areas', focusFilter)
    }
    
    const resultWithUser = await queryWithUser
    
    if (resultWithUser.error) {
      // If error is about missing column, try without user_id filter
      if (resultWithUser.error.message?.includes('column') && resultWithUser.error.message?.includes('user_id')) {
        console.log('⚠️ [User Clips API] user_id column not found, fetching all clips (shared table)')
        let queryAll = supabaseAdmin
          .from('curated_clips')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100)
        
        // Filter by clip_type (exclude diagnostic clips)
        queryAll = queryAll.neq('clip_type', 'diagnostic')
        
        // Apply CEFR filter if provided
        if (cefrFilter && cefrFilter.length > 0) {
          queryAll = queryAll.in('cefr', cefrFilter)
        }
        
        // Apply situations filter if provided
        if (situationsFilter && situationsFilter.length > 0) {
          queryAll = queryAll.in('situation', situationsFilter)
        }
        
        // Apply focus areas filter if provided
        if (focusFilter && focusFilter.length > 0) {
          queryAll = queryAll.overlaps('focus_areas', focusFilter)
        }
        
        const resultAll = await queryAll
        
        clipsData = resultAll.data
        fetchError = resultAll.error
      } else {
        // Other error - use it
        clipsData = resultWithUser.data
        fetchError = resultWithUser.error
      }
    } else {
      // Success with user_id filter
      clipsData = resultWithUser.data
      fetchError = resultWithUser.error
    }

    if (fetchError) {
      console.error('❌ [User Clips API] Error fetching clips:', fetchError)
      return NextResponse.json(
        { error: 'Failed to fetch clips', message: fetchError.message },
        { status: 500 }
      )
    }

    if (!clipsData || clipsData.length === 0) {
      console.log('⚠️ [User Clips API] No clips found for user')
      return NextResponse.json({ clips: [] })
    }

    console.log('✅ [User Clips API] Fetched clips:', {
      count: clipsData.length,
      userId: userId.substring(0, 8) + '...',
    })

    // DEBUG: Check for NULL or empty IDs
    const invalidClips = clipsData.filter((clip: any) => !clip.id || clip.id.trim() === '')
    if (invalidClips.length > 0) {
      console.error('❌ [User Clips API] Found clips with NULL or empty id:', {
        count: invalidClips.length,
        sample: invalidClips.slice(0, 3).map((c: any) => ({
          id: c.id,
          transcript: c.transcript?.substring(0, 30),
          allKeys: Object.keys(c),
        })),
      })
    }

    // Transform to Clip format
    const clips: Clip[] = clipsData
      .map((dbClip: any) => {
        // Validate id field
        if (!dbClip.id || dbClip.id.trim() === '') {
          console.error('❌ [User Clips API] Clip with invalid id:', {
            transcript: dbClip.transcript?.substring(0, 30),
            allKeys: Object.keys(dbClip),
          })
          // Skip this clip or use a fallback ID
          return null
        }
        // Map situation to Situation type
        const situationMap: Record<string, Situation> = {
          'work': 'Work',
          'Work': 'Work',
          'daily': 'Daily Life',
          'Daily Life': 'Daily Life',
          'social': 'Social',
          'Social': 'Social',
          'travel': 'Travel',
          'Travel': 'Travel',
          'media': 'Media',
          'Media': 'Media',
        }

        const situation = situationMap[dbClip.situation || ''] || 'Daily Life'

        // Parse focus array (handle both string[] and JSON string)
        let focus: string[] = []
        if (Array.isArray(dbClip.focus_areas)) {
          focus = dbClip.focus_areas
        } else if (Array.isArray(dbClip.focus)) {
          focus = dbClip.focus
        } else if (typeof dbClip.focus_areas === 'string') {
          try {
            focus = JSON.parse(dbClip.focus_areas)
          } catch {
            focus = ['connected_speech']
          }
        } else if (typeof dbClip.focus === 'string') {
          try {
            focus = JSON.parse(dbClip.focus)
          } catch {
            focus = ['connected_speech']
          }
        } else {
          focus = ['connected_speech']
        }

        // Map CEFR to difficulty for frontend compatibility
        const cefrToDifficulty = (cefr: string): 'easy' | 'medium' | 'hard' => {
          switch (cefr) {
            case 'A1':
            case 'A2':
              return 'easy'
            case 'B1':
              return 'medium'
            case 'B2':
            case 'C1':
            case 'C2':
              return 'hard'
            default:
              return 'medium'
          }
        }

        return {
          id: dbClip.id,
          text: dbClip.transcript,
          title: dbClip.title || 'Practice Clip',
          audioUrl: dbClip.audio_url || '',
          focus,
          targetStyle: dbClip.target_style || 'Everyday conversations',
          situation,
          lengthSec: dbClip.length_sec || 15,
          difficulty: dbClip.cefr ? cefrToDifficulty(dbClip.cefr) : 'medium',
          createdAt: dbClip.created_at || new Date().toISOString(),
        }
      })
      .filter((clip): clip is Clip => clip !== null)

    // DEBUG: Log clip IDs being returned
    console.log('✅ [User Clips API] Returning clips with IDs:', {
      count: clips.length,
      clipIds: clips.map(c => c.id).slice(0, 10),
      allIdsValid: clips.every(c => c.id && c.id.trim() !== ''),
    })

    return NextResponse.json({ clips })
  } catch (error: any) {
    console.error('❌ [User Clips API] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    )
  }
}
