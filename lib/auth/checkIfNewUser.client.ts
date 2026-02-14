import { SupabaseClient } from '@supabase/supabase-js'

/**
 * Determines if a user is new (client-side) based on:
 * 1. has_accessed_practice flag (primary indicator)
 * 2. preferred_name (completed name step)
 * 3. Account age > 24 hours (legacy users)
 */
export async function checkIfNewUserClient(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  console.log('[checkIfNewUserClient] Starting check for user:', userId)
  
  try {
    const { data: { user }, error } = await supabase.auth.getUser()
    
    if (error || !user) {
      console.error('[checkIfNewUserClient] Failed to get user:', error)
      return true // Assume new user if can't fetch
    }
    
    // Primary: Has accessed practice page?
    if (user.user_metadata?.has_accessed_practice) {
      console.log('✅ [checkIfNewUserClient] Has accessed practice - returning user')
      return false
    }
    
    // Fallback 1: Has preferred_name (completed name step)
    if (user.user_metadata?.preferred_name) {
      console.log('✅ [checkIfNewUserClient] Has preferred_name - returning user')
      return false
    }
    
    // Fallback 2: Account older than 24 hours (legacy users)
    const accountAgeMs = Date.now() - new Date(user.created_at).getTime()
    if (accountAgeMs > 24 * 60 * 60 * 1000) {
      console.log('✅ [checkIfNewUserClient] Account > 24h - returning user (legacy)')
      return false
    }
    
    console.log('🆕 [checkIfNewUserClient] New user - needs onboarding')
    return true
  } catch (error) {
    console.error('❌ [checkIfNewUserClient] Unexpected error:', error)
    // On error, assume returning user to avoid forcing onboarding
    return false
  }
}
