import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdminClient } from '@/lib/supabase/server'

/**
 * GET /api/clips/diagnostic
 * 
 * Returns fixed set of diagnostic clips (clip_type = 'diagnostic')
 * Ordered by id ASC for consistent results
 * 
 * Response shape matches curated clip format with CEFR difficulty levels
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseAdminClient()
    
    // Fetch diagnostic clips from curated_clips table
    const { data: clips, error } = await supabase
      .from('curated_clips')
      .select('*')
      .eq('clip_type', 'diagnostic')
      .order('id', { ascending: true })
    
    if (error) {
      console.error('❌ [Diagnostic Clips] Supabase error:', error)
      return NextResponse.json(
        {
          error: 'Failed to fetch diagnostic clips',
          code: 'DB_QUERY_ERROR',
          message: error.message || 'Database query failed',
        },
        { status: 500 }
      )
    }
    
    if (!clips || clips.length === 0) {
      console.warn('⚠️ [Diagnostic Clips] No diagnostic clips found in database')
      return NextResponse.json(
        {
          clips: [],
        },
        { status: 200 }
      )
    }
    
    // Dev-only: Log one raw row to confirm column names
    const IS_DEV = process.env.NODE_ENV === 'development'
    if (IS_DEV && clips.length > 0) {
      console.log('🔍 [Diagnostic Clips] Raw row from Supabase (dev only):', {
        id: clips[0].id,
        transcript: clips[0].transcript?.substring(0, 50) + '...',
        cefr: clips[0].cefr,
        focus_areas: clips[0].focus_areas,
        focus: clips[0].focus, // Old column (if exists)
        difficulty: clips[0].difficulty, // Old column (if exists)
        situation: clips[0].situation,
        length_sec: clips[0].length_sec,
        clip_type: clips[0].clip_type,
        allColumns: Object.keys(clips[0]),
      })
    }
    
    // Map database rows to response shape
    const formattedClips = clips.map((clip: any) => {
      // Map from cefr column directly (not from difficulty)
      const difficultyCefr: 'A1' | 'A2' | 'B1' | 'B2' = 
        clip.cefr || 
        // Fallback: map from difficulty if cefr column doesn't exist
        (clip.difficulty === 'easy' ? 'A2' :
         clip.difficulty === 'medium' ? 'B1' :
         clip.difficulty === 'hard' ? 'B2' :
         'B1') // Default to B1 if unknown
      
      // Map from focus_areas column (ensure it's an array of strings)
      const focusAreas = Array.isArray(clip.focus_areas) 
        ? clip.focus_areas 
        : Array.isArray(clip.focus) 
          ? clip.focus 
          : [] // Fallback to empty array if neither column exists
      
      return {
        id: clip.id,
        transcript: clip.transcript,
        difficultyCefr: difficultyCefr as 'A1' | 'A2' | 'B1' | 'B2',
        focusAreas: focusAreas.map((area: any) => String(area)), // Ensure all are strings
        situation: clip.situation || undefined,
        lengthSec: clip.length_sec || undefined,
        clipType: 'diagnostic' as const,
      }
    })
    
    console.log('✅ [Diagnostic Clips] Fetched clips:', {
      count: formattedClips.length,
      clipIds: formattedClips.map(c => c.id),
    })
    
    return NextResponse.json({
      clips: formattedClips,
    })
  } catch (error: any) {
    console.error('❌ [Diagnostic Clips] Unhandled error:', error)
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

