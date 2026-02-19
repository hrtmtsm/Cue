import { NextRequest, NextResponse } from 'next/server'
import { resolveUserId } from '@/lib/supabase/resolveUserId'
import { getUserSubscription } from '@/lib/subscriptionCheck'
import { getSupabaseAdminClient } from '@/lib/supabase/server'

/**
 * POST /api/session/check
 * Server-side validation for starting a practice session
 * Checks subscription status and validates daily limit for free users
 * 
 * SECURITY: No longer trusts client's hasCompletedToday value.
 * Instead, queries database to check if user completed a session today.
 */
export async function POST(request: NextRequest) {
  try {
    // Resolve user ID (auth user or dev guest)
    const { userId } = await resolveUserId(request)

    // Check subscription from database
    const { isPro } = await getUserSubscription(userId)

    // Pro users always allowed
    if (isPro) {
      return NextResponse.json({
        canStart: true,
        isPro: true,
      })
    }

    // Free users: Check database for today's completed sessions
    // This prevents bypass by deleting localStorage
    const supabaseAdmin = getSupabaseAdminClient()
    
    // Get today's date in UTC (YYYY-MM-DD format)
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    const todayStart = today.toISOString()
    const todayEnd = new Date(today)
    todayEnd.setUTCHours(23, 59, 59, 999)
    const todayEndISO = todayEnd.toISOString()

    // Check if user has completed a session today
    const { data: todaySessions, error: sessionError } = await supabaseAdmin
      .from('practice_sessions')
      .select('id')
      .eq('user_id', userId)
      .gte('completed_at', todayStart)
      .lte('completed_at', todayEndISO)
      .limit(1)

    if (sessionError) {
      // If table doesn't exist yet (migration not applied), log warning but allow
      // This provides graceful degradation during deployment
      console.warn('[Session Check] Error querying practice_sessions:', sessionError.message)
      if (sessionError.code === '42P01') {
        // Table doesn't exist - allow for now (migration may not be applied yet)
        console.warn('[Session Check] practice_sessions table not found, allowing session (migration may not be applied)')
        return NextResponse.json({
          canStart: true,
          isPro: false,
          warning: 'Session tracking not yet configured',
        })
      }
      // Other database errors - fail closed for security
      console.error('[Session Check] Database error:', sessionError)
      return NextResponse.json(
        {
          error: 'Failed to check session status',
          message: sessionError.message,
        },
        { status: 500 }
      )
    }

    // If user has completed a session today, block them
    if (todaySessions && todaySessions.length > 0) {
      return NextResponse.json({
        canStart: false,
        isPro: false,
        reason: "You've already completed your daily session. Upgrade to Pro for unlimited practice!",
      })
    }

    // No session completed today - allow
    return NextResponse.json({
      canStart: true,
      isPro: false,
    })
  } catch (error: any) {
    console.error('[Session Check] Error:', error.message)

    // If user is not authenticated in production, return free tier
    if (error.message?.includes('Authentication required')) {
      return NextResponse.json(
        {
          canStart: false,
          isPro: false,
          reason: 'Please sign in to start a practice session',
        },
        { status: 401 }
      )
    }

    return NextResponse.json(
      {
        error: 'Failed to check session',
        message: error.message,
      },
      { status: 500 }
    )
  }
}
