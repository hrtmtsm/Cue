import { NextRequest, NextResponse } from 'next/server'
import { resolveUserId } from '@/lib/supabase/resolveUserId'
import { getUserSubscription } from '@/lib/subscriptionCheck'

/**
 * GET /api/subscription/status
 * Returns user's subscription status
 */
export async function GET(request: NextRequest) {
  try {
    // Resolve user ID (auth user or dev guest)
    const { userId, source } = await resolveUserId(request)

    // Get subscription status
    const { isPro, subscription } = await getUserSubscription(userId)

    console.log('[Subscription Status] User:', {
      userId: userId.substring(0, 8) + '...',
      source,
      isPro,
      hasSubscription: !!subscription,
    })

    return NextResponse.json({
      isPro,
      subscription: subscription
        ? {
            status: subscription.status,
            currentPeriodEnd: subscription.current_period_end,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
          }
        : null,
    })
  } catch (error: any) {
    console.error('[Subscription Status] Error:', error.message)

    // If user is not authenticated in production, return free tier
    if (error.message?.includes('Authentication required')) {
      return NextResponse.json(
        {
          isPro: false,
          subscription: null,
        },
        { status: 200 }
      )
    }

    return NextResponse.json(
      {
        error: 'Failed to fetch subscription status',
        message: error.message,
      },
      { status: 500 }
    )
  }
}
