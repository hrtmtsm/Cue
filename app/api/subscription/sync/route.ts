import { NextRequest, NextResponse } from 'next/server'
import { resolveUserId } from '@/lib/supabase/resolveUserId'
import { getSupabaseAdminClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe/server'

/**
 * POST /api/subscription/sync
 * Fetches the latest subscription state directly from Stripe and syncs to DB.
 * Called when the user clicks "Refresh Status" so we always get accurate data.
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await resolveUserId(request)
    const supabase = getSupabaseAdminClient()

    // Get DB subscription record to find the Stripe customer ID
    const { data: dbSub } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!dbSub?.stripe_customer_id) {
      console.log('[Subscription Sync] No subscription record found for user:', userId.substring(0, 8) + '...')
      return NextResponse.json({ isPro: false, subscription: null })
    }

    // Fetch all active subscriptions from Stripe for this customer
    const stripeSubs = await stripe.subscriptions.list({
      customer: dbSub.stripe_customer_id,
      status: 'active',
      limit: 10,
    })

    // Also fetch canceled/past_due to capture full picture
    const allStripeSubs = await stripe.subscriptions.list({
      customer: dbSub.stripe_customer_id,
      limit: 10,
    })

    console.log('[Subscription Sync] Stripe subscriptions:', {
      customerId: dbSub.stripe_customer_id,
      activeCount: stripeSubs.data.length,
      totalCount: allStripeSubs.data.length,
    })

    // Find the most recent active subscription from Stripe
    const activeSubs = allStripeSubs.data
      .filter(s => s.status === 'active')
      .sort((a, b) => b.created - a.created)

    if (activeSubs.length === 0) {
      // No active subscriptions — mark as canceled in DB
      console.log('[Subscription Sync] No active Stripe subscriptions, marking as canceled')
      await supabase
        .from('subscriptions')
        .update({ status: 'canceled', cancel_at_period_end: false })
        .eq('id', dbSub.id)

      return NextResponse.json({ isPro: false, subscription: null })
    }

    // Use the most recent active subscription
    const latestSub = activeSubs[0]

    const updateData = {
      stripe_subscription_id: latestSub.id,
      stripe_price_id: latestSub.items.data[0]?.price.id ?? dbSub.stripe_price_id,
      status: latestSub.status,
      cancel_at_period_end: latestSub.cancel_at_period_end,
      current_period_start: new Date(latestSub.current_period_start * 1000).toISOString(),
      current_period_end: new Date(latestSub.current_period_end * 1000).toISOString(),
    }

    console.log('[Subscription Sync] Syncing from Stripe:', {
      userId: userId.substring(0, 8) + '...',
      subscriptionId: latestSub.id,
      cancelAtPeriodEnd: latestSub.cancel_at_period_end,
      dbWas: { subId: dbSub.stripe_subscription_id, cancelAtPeriodEnd: dbSub.cancel_at_period_end },
    })

    // Update DB to match Stripe
    await supabase
      .from('subscriptions')
      .update(updateData)
      .eq('id', dbSub.id)

    // Determine isPro: active + not expired + not canceling
    const now = new Date()
    const periodEnd = new Date(latestSub.current_period_end * 1000)
    const isPro = latestSub.status === 'active' && periodEnd > now && !latestSub.cancel_at_period_end

    console.log('[Subscription Sync] Result:', {
      userId: userId.substring(0, 8) + '...',
      isPro,
      cancelAtPeriodEnd: latestSub.cancel_at_period_end,
      periodEnd: periodEnd.toISOString(),
    })

    return NextResponse.json({
      isPro,
      subscription: {
        status: latestSub.status,
        currentPeriodEnd: new Date(latestSub.current_period_end * 1000).toISOString(),
        cancelAtPeriodEnd: latestSub.cancel_at_period_end,
      },
      synced: true,
    })
  } catch (error: any) {
    console.error('[Subscription Sync] Error:', error.message)

    if (error.message?.includes('Authentication required')) {
      return NextResponse.json({ isPro: false, subscription: null }, { status: 200 })
    }

    return NextResponse.json({ error: 'Failed to sync subscription' }, { status: 500 })
  }
}
