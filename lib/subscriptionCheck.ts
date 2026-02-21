import { getSupabaseAdminClient } from '@/lib/supabase/server'

export interface SubscriptionData {
  id: string
  user_id: string
  stripe_customer_id: string
  stripe_subscription_id: string | null
  stripe_price_id: string
  status: string
  current_period_start: string
  current_period_end: string
  cancel_at_period_end: boolean
  created_at: string
  updated_at: string
}

export interface SubscriptionStatus {
  isPro: boolean
  subscription: SubscriptionData | null
}

/**
 * Get user's subscription status from database
 * Returns isPro = true if user has an active subscription with valid period
 * Handles multiple subscriptions by using the most recent active one
 */
export async function getUserSubscription(
  userId: string
): Promise<SubscriptionStatus> {
  try {
    const supabase = getSupabaseAdminClient()

    // Get all subscriptions for this user, ordered by created_at (most recent first)
    const { data: subscriptions, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) {
      // If error is "no rows", that's fine - user has no subscription
      if (error.code !== 'PGRST116') {
        console.error('[subscriptionCheck] Error querying subscriptions:', {
          error: error.message,
          code: error.code,
          userId: userId.substring(0, 8) + '...',
        })
      }
      return { isPro: false, subscription: null }
    }

    if (!subscriptions || subscriptions.length === 0) {
      console.log('[subscriptionCheck] No subscriptions found for user:', userId.substring(0, 8) + '...')
      return { isPro: false, subscription: null }
    }

    // Find the most recent active subscription that hasn't expired
    // NOTE: cancel_at_period_end=true means the sub will cancel at period end,
    // but the user still has Pro access until then — only affects UI display
    const now = new Date()
    let activeSubscription: SubscriptionData | null = null

    for (const sub of subscriptions) {
      const periodEnd = new Date(sub.current_period_end)
      const isActive = sub.status === 'active'
      const notExpired = periodEnd > now

      // User is Pro if: active and not expired (regardless of cancel_at_period_end)
      if (isActive && notExpired) {
        activeSubscription = sub
        break
      }
    }

    // If no active subscription found, use the most recent one (for logging purposes)
    const subscription = activeSubscription || subscriptions[0]
    const isPro = !!activeSubscription

    if (!isPro && subscription) {
      console.log('[subscriptionCheck] Subscription found but not active:', {
        userId: userId.substring(0, 8) + '...',
        status: subscription.status,
        periodEnd: new Date(subscription.current_period_end).toISOString(),
        now: now.toISOString(),
        isExpired: new Date(subscription.current_period_end) <= now,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        reason: new Date(subscription.current_period_end) <= now
          ? 'expired'
          : subscription.status !== 'active'
            ? `status_${subscription.status}`
            : 'unknown',
      })
    }

    return { isPro, subscription }
  } catch (error) {
    console.error('[subscriptionCheck] Error getting subscription:', error)
    return { isPro: false, subscription: null }
  }
}

/**
 * Check if user can access listening tips (Pro feature)
 */
export async function canAccessListeningTips(
  userId: string
): Promise<boolean> {
  const { isPro } = await getUserSubscription(userId)
  return isPro
}

/**
 * Check if user can start a new session
 * Pro users: unlimited sessions
 * Free users: client-side enforcement (1 per day)
 */
export async function canStartNewSession(userId: string): Promise<{
  canStart: boolean
  isPro: boolean
  reason?: string
}> {
  const { isPro } = await getUserSubscription(userId)

  if (isPro) {
    return { canStart: true, isPro: true }
  }

  // Free users: allow server-side, client enforces daily limit
  return {
    canStart: true,
    isPro: false,
    reason: 'free_tier_client_enforced',
  }
}

/**
 * Check if subscription is valid and not expired
 */
export function isSubscriptionValid(
  subscription: SubscriptionData | null
): boolean {
  if (!subscription) return false

  const isActive = subscription.status === 'active'
  const notExpired =
    new Date(subscription.current_period_end) > new Date()

  return isActive && notExpired
}
