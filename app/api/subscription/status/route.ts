import { NextRequest, NextResponse } from 'next/server'
import { resolveUserId } from '@/lib/supabase/resolveUserId'
import { getUserSubscription } from '@/lib/subscriptionCheck'
import { getSupabaseAdminClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe/server'

/**
 * GET /api/subscription/status
 * Returns user's subscription status.
 * Always verifies against Stripe to ensure cancel_at_period_end is current.
 */
export async function GET(request: NextRequest) {
  try {
    // Resolve user ID (auth user or dev guest)
    const { userId, source } = await resolveUserId(request)

    // Get subscription from DB first (fast)
    const { isPro, subscription } = await getUserSubscription(userId)

    // If we have a subscription record, silently sync cancel_at_period_end from Stripe
    // This ensures cancellations are always reflected even without webhooks
    if (subscription?.stripe_subscription_id) {
      try {
        const stripeSub = await stripe.subscriptions.retrieve(subscription.stripe_subscription_id)
        const dbCancelAtPeriodEnd = subscription.cancel_at_period_end
        const stripeCancelAtPeriodEnd = stripeSub.cancel_at_period_end
        const stripeStatus = stripeSub.status

        // If Stripe and DB disagree, update DB silently
        if (dbCancelAtPeriodEnd !== stripeCancelAtPeriodEnd || subscription.status !== stripeStatus) {
          console.log('[Subscription Status] Syncing from Stripe:', {
            userId: userId.substring(0, 8) + '...',
            dbCancelAtPeriodEnd,
            stripeCancelAtPeriodEnd,
            stripeStatus,
          })
          const supabase = getSupabaseAdminClient()
          await supabase.from('subscriptions')
            .update({
              cancel_at_period_end: stripeCancelAtPeriodEnd,
              status: stripeStatus,
            })
            .eq('user_id', userId)

          // Use synced Stripe values for the response
          const now = new Date()
          const periodEnd = new Date(stripeSub.current_period_end * 1000)
          const syncedIsPro = stripeStatus === 'active' && periodEnd > now

          return NextResponse.json({
            isPro: syncedIsPro,
            subscription: {
              status: stripeStatus,
              currentPeriodEnd: periodEnd.toISOString(),
              cancelAtPeriodEnd: stripeCancelAtPeriodEnd,
            },
          })
        }
      } catch (stripeErr) {
        // Don't fail the request if Stripe check fails — fall through to DB result
        console.warn('[Subscription Status] Stripe check failed, using DB:', stripeErr)
      }
    }

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
