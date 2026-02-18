import { NextRequest, NextResponse } from 'next/server'
import { resolveUserId } from '@/lib/supabase/resolveUserId'
import { getUserSubscription } from '@/lib/subscriptionCheck'

/**
 * POST /api/session/check
 * Server-side validation for starting a practice session
 * Checks subscription status and validates daily limit for free users
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

    // Free users: validate client's localStorage check
    const body = await request.json()
    const { hasCompletedToday } = body

    if (hasCompletedToday) {
      return NextResponse.json({
        canStart: false,
        isPro: false,
        reason: "You've already completed your daily session. Upgrade to Pro for unlimited practice!",
      })
    }

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
