import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Determines if a user is new (server-side) based on:
 * 1. has_accessed_practice flag (primary indicator)
 * 2. preferred_name (completed name step)
 * 3. Account age > 24 hours (legacy users)
 */
export async function checkIfNewUser(userId: string): Promise<boolean> {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
      },
    }
  )

  try {
    // Get user from admin API to access metadata
    const { data: { user }, error } = await supabase.auth.getUser()
    
    if (error || !user) {
      console.error('❌ [checkIfNewUser] Failed to get user:', error)
      // On error, assume returning user to avoid forcing onboarding
      return false
    }
    
    console.log('[checkIfNewUser] Checking user:', {
      userId: user.id.substring(0, 8),
      has_accessed_practice: !!user.user_metadata?.has_accessed_practice,
      preferred_name: !!user.user_metadata?.preferred_name,
      created_at: user.created_at
    })
    
    // Primary: Has accessed practice page?
    if (user.user_metadata?.has_accessed_practice) {
      console.log('✅ [checkIfNewUser] Has accessed practice - returning user')
      return false
    }
    
    // Fallback 1: Has preferred_name (completed name step)
    if (user.user_metadata?.preferred_name) {
      console.log('✅ [checkIfNewUser] Has preferred_name - returning user')
      return false
    }
    
    // Fallback 2: Account older than 24 hours (legacy users)
    const accountAgeMs = Date.now() - new Date(user.created_at).getTime()
    if (accountAgeMs > 24 * 60 * 60 * 1000) {
      console.log('✅ [checkIfNewUser] Account > 24h - returning user (legacy)')
      return false
    }
    
    console.log('🆕 [checkIfNewUser] New user - needs onboarding')
    return true
  } catch (error) {
    console.error('❌ [checkIfNewUser] Error:', error)
    // On error, assume returning user to avoid forcing onboarding
    return false
  }
}
