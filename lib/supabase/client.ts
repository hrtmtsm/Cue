/**
 * Supabase Client
 * For use in client components
 * Lazy initialization - only initializes when getSupabase() is called
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js'

let supabaseInstance: SupabaseClient | null = null

function getSupabaseClient(): SupabaseClient {
  if (supabaseInstance) {
    return supabaseInstance
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    // Return a mock client that will fail gracefully
    // This allows the app to load even if Supabase isn't configured yet
    console.warn('⚠️ Supabase not configured: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY missing')
    // Create a client with dummy values - it will fail on actual API calls but won't crash the app
    supabaseInstance = createClient(
      'https://placeholder.supabase.co',
      'placeholder-key'
    )
    return supabaseInstance
  }

  supabaseInstance = createClient(url, anonKey)
  return supabaseInstance
}

// Export getter function for lazy initialization
// This is the preferred way to access Supabase - only initializes when called
export function getSupabase(): SupabaseClient {
  return getSupabaseClient()
}

// For backward compatibility - but this WILL initialize at module load
// Use getSupabase() instead for true lazy loading
// Only export this if absolutely necessary for existing code
// export const supabase = getSupabaseClient()
