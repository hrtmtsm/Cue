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
 */
export async function getUserSubscription(
  userId: string
): Promise<SubscriptionStatus> {
  try {
    const supabase = getSupabaseAdminClient()

    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (error || !data) {
      return { isPro: false, subscription: null }
    }

    // Check if subscription is active and within valid period
    const isPro =
      data.status === 'active' &&
      new Date(data.current_period_end) > new Date()

    return { isPro, subscription: data }
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
