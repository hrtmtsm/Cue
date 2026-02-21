import { NextRequest, NextResponse } from 'next/server'
import { resolveUserId } from '@/lib/supabase/resolveUserId'
import { getSupabaseAdminClient } from '@/lib/supabase/server'

/**
 * POST /api/session/complete
 * Records a practice session completion in the database
 * Only records for free users (Pro users have unlimited sessions)
 */
export async function POST(request: NextRequest) {
  try {
    // Resolve user ID (auth user or dev guest)
    const { userId } = await resolveUserId(request)

    // Parse request body
    const body = await request.json()
    const { storyId } = body

    // Record session completion in database
    const supabaseAdmin = getSupabaseAdminClient()
    
    // Check if session already recorded today (idempotent)
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    const todayStart = today.toISOString()
    const todayEnd = new Date(today)
    todayEnd.setUTCHours(23, 59, 59, 999)
    const todayEndISO = todayEnd.toISOString()

    const { data: existingSession } = await supabaseAdmin
      .from('practice_sessions')
      .select('id')
      .eq('user_id', userId)
      .gte('completed_at', todayStart)
      .lte('completed_at', todayEndISO)
      .limit(1)
      .maybeSingle()

    // If already recorded today, return success (idempotent)
    if (existingSession) {
      return NextResponse.json({
        success: true,
        message: 'Session already recorded today',
      })
    }

    // Insert new session record
    const { data, error } = await supabaseAdmin
      .from('practice_sessions')
      .insert({
        user_id: userId,
        story_id: storyId || null,
        completed_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      // Handle unique constraint violation (race condition)
      if (error.code === '23505') {
        // Another request already recorded today - that's fine
        return NextResponse.json({
          success: true,
          message: 'Session already recorded (race condition handled)',
        })
      }

      console.error('[Session Complete] Database error:', error)
      return NextResponse.json(
        {
          error: 'Failed to record session',
          message: error.message,
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      session: data,
    })
  } catch (error: any) {
    console.error('[Session Complete] Error:', error.message)

    // If user is not authenticated in production, return error
    if (error.message?.includes('Authentication required')) {
      return NextResponse.json(
        {
          error: 'Unauthorized',
          message: 'Please sign in to record session completion',
        },
        { status: 401 }
      )
    }

    return NextResponse.json(
      {
        error: 'Failed to record session',
        message: error.message,
      },
      { status: 500 }
    )
  }
}
