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

    // If NO DB record at all, do a Stripe lookup by email to self-heal
    // This handles the case where checkout completed but webhook never fired
    if (!subscription) {
      try {
        const supabase = getSupabaseAdminClient()
        const { data: { user } } = await supabase.auth.admin.getUserById(userId)
        if (user?.email) {
          const customers = await stripe.customers.list({ email: user.email, limit: 5 })
          for (const customer of customers.data) {
            const stripeSubs = await stripe.subscriptions.list({
              customer: customer.id,
              status: 'active',
              limit: 5,
            })
            if (stripeSubs.data.length > 0) {
              const latestSub = stripeSubs.data[0]
              const now = new Date()
              const periodEnd = new Date(latestSub.current_period_end * 1000)
              const syncedIsPro = periodEnd > now

              // Upsert to DB so future requests don't need to hit Stripe
              await supabase.from('subscriptions').upsert({
                user_id: userId,
                stripe_customer_id: customer.id,
                stripe_subscription_id: latestSub.id,
                stripe_price_id: latestSub.items.data[0]?.price.id ?? '',
                status: latestSub.status,
                cancel_at_period_end: latestSub.cancel_at_period_end,
                current_period_start: new Date(latestSub.current_period_start * 1000).toISOString(),
                current_period_end: periodEnd.toISOString(),
              }, { onConflict: 'user_id' })

              console.log('[Subscription Status] Self-healed from Stripe (no DB record):', {
                userId: userId.substring(0, 8) + '...',
                customerId: customer.id,
                isPro: syncedIsPro,
              })

              return NextResponse.json({
                isPro: syncedIsPro,
                subscription: {
                  status: latestSub.status,
                  currentPeriodEnd: periodEnd.toISOString(),
                  cancelAtPeriodEnd: latestSub.cancel_at_period_end,
                },
              })
            }
          }
        }
      } catch (healErr) {
        console.warn('[Subscription Status] Self-heal Stripe lookup failed:', healErr)
      }
    }

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
