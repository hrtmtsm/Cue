import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdminClient } from '@/lib/supabase/server'
import { resolveUserId } from '@/lib/supabase/resolveUserId'

export interface UserProgress {
  id: string
  user_id: string
  streak: number
  last_practice_date: string | null
  total_sessions: number
  total_listening_minutes: number
  completed_stories: string[]
  created_at: string
  updated_at: string
}

// GET /api/progress - Get user's progress
export async function GET(request: NextRequest) {
  try {
    const { userId } = await resolveUserId(request)
    const supabase = getSupabaseAdminClient()

    console.log('📊 [GET /api/progress] Fetching progress for user:', userId)

    const { data, error } = await supabase
      .from('user_progress')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        // No progress record yet, return defaults
        console.log('📊 [GET /api/progress] No progress found, returning defaults')
        return NextResponse.json({
          progress: {
            streak: 0,
            last_practice_date: null,
            total_sessions: 0,
            total_listening_minutes: 0,
            completed_stories: [],
          },
        })
      }
      console.error('❌ [GET /api/progress] Error fetching progress:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log('✅ [GET /api/progress] Progress fetched:', data)
    return NextResponse.json({ progress: data })
  } catch (error: any) {
    console.error('❌ [GET /api/progress] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 401 })
  }
}

// POST /api/progress - Create or update user's progress
export async function POST(request: NextRequest) {
  try {
    const { userId } = await resolveUserId(request)
    const supabase = getSupabaseAdminClient()
    const body = await request.json()

    console.log('📊 [POST /api/progress] Updating progress for user:', userId, body)

    const {
      streak,
      last_practice_date,
      total_sessions,
      total_listening_minutes,
      completed_stories,
    } = body

    // Upsert (insert or update)
    const { data, error } = await supabase
      .from('user_progress')
      .upsert(
        {
          user_id: userId,
          streak: streak ?? 0,
          last_practice_date: last_practice_date || null,
          total_sessions: total_sessions ?? 0,
          total_listening_minutes: total_listening_minutes ?? 0,
          completed_stories: completed_stories || [],
        },
        {
          onConflict: 'user_id',
        }
      )
      .select()
      .single()

    if (error) {
      console.error('❌ [POST /api/progress] Error upserting progress:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log('✅ [POST /api/progress] Progress updated:', data)
    return NextResponse.json({ success: true, progress: data })
  } catch (error: any) {
    console.error('❌ [POST /api/progress] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 401 })
  }
}

// PATCH /api/progress - Increment session/time or update streak
export async function PATCH(request: NextRequest) {
  try {
    const { userId } = await resolveUserId(request)
    
    if (!userId) {
      console.error('❌ [PATCH /api/progress] No userId resolved')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const supabase = getSupabaseAdminClient()
    const body = await request.json()

    console.log('📊 [PATCH /api/progress] Incrementing progress for user:', {
      userId: userId.substring(0, 8) + '...',
      body: {
        increment_sessions: body.increment_sessions,
        increment_minutes: body.increment_minutes,
        add_story: body.add_story,
        update_streak: body.update_streak ? {
          streak: body.update_streak.streak,
          last_practice_date: body.update_streak.last_practice_date,
        } : undefined,
      },
    })

    const {
      increment_sessions,
      increment_minutes,
      add_story,
      update_streak,
    } = body

    // First, get current progress
    console.log('📊 [PATCH /api/progress] Fetching current progress from DB...')
    const { data: currentProgress, error: fetchError } = await supabase
      .from('user_progress')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('❌ [PATCH /api/progress] Error fetching current progress:', {
        error: fetchError.message,
        code: fetchError.code,
        details: fetchError,
      })
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    if (currentProgress) {
      console.log('📊 [PATCH /api/progress] Current progress:', {
        streak: currentProgress.streak,
        totalSessions: currentProgress.total_sessions,
        totalMinutes: currentProgress.total_listening_minutes,
        completedStories: currentProgress.completed_stories?.length || 0,
      })
    } else {
      console.log('📊 [PATCH /api/progress] No existing progress - creating new record')
    }

    // Build update object
    const updates: any = { user_id: userId }

    if (currentProgress) {
      updates.total_sessions = currentProgress.total_sessions + (increment_sessions || 0)
      updates.total_listening_minutes = currentProgress.total_listening_minutes + (increment_minutes || 0)
      
      if (add_story) {
        const stories = currentProgress.completed_stories || []
        if (!stories.includes(add_story)) {
          updates.completed_stories = [...stories, add_story]
        } else {
          updates.completed_stories = stories
        }
      } else {
        updates.completed_stories = currentProgress.completed_stories || []
      }

      if (update_streak !== undefined) {
        updates.streak = update_streak.streak
        updates.last_practice_date = update_streak.last_practice_date
      } else {
        updates.streak = currentProgress.streak
        updates.last_practice_date = currentProgress.last_practice_date
      }
    } else {
      // No existing progress, create new
      updates.total_sessions = increment_sessions || 0
      updates.total_listening_minutes = increment_minutes || 0
      updates.completed_stories = add_story ? [add_story] : []
      
      if (update_streak !== undefined) {
        updates.streak = update_streak.streak
        updates.last_practice_date = update_streak.last_practice_date
      } else {
        updates.streak = 0
        updates.last_practice_date = null
      }
    }

    // Upsert the progress
    console.log('📊 [PATCH /api/progress] Upserting progress with updates:', {
      user_id: updates.user_id?.substring(0, 8) + '...',
      total_sessions: updates.total_sessions,
      total_listening_minutes: updates.total_listening_minutes,
      streak: updates.streak,
      last_practice_date: updates.last_practice_date,
      completed_stories_count: updates.completed_stories?.length || 0,
    })
    
    const { data, error } = await supabase
      .from('user_progress')
      .upsert(updates, { onConflict: 'user_id' })
      .select()
      .single()

    if (error) {
      console.error('❌ [PATCH /api/progress] Error updating progress:', {
        error: error.message,
        code: error.code,
        details: error,
        updates,
      })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!data) {
      console.error('❌ [PATCH /api/progress] No data returned from upsert')
      return NextResponse.json({ error: 'No data returned from database' }, { status: 500 })
    }

    console.log('✅ [PATCH /api/progress] Progress incremented successfully:', {
      streak: data.streak,
      totalSessions: data.total_sessions,
      totalMinutes: data.total_listening_minutes,
      completedStories: data.completed_stories?.length || 0,
    })
    
    return NextResponse.json({ success: true, progress: data })
  } catch (error: any) {
    console.error('❌ [PATCH /api/progress] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 401 })
  }
}
