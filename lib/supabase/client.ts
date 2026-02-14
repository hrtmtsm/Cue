/**
 * Supabase Client
 * For use in client components
 * Uses createBrowserClient from @supabase/ssr
 * which properly handles PKCE flow for OAuth
 */
import { createBrowserClient } from '@supabase/ssr'
import { SupabaseClient } from '@supabase/supabase-js'

let supabaseInstance: SupabaseClient | null = null

/**
 * Extract project reference from Supabase URL
 * Example: https://imlrsvugipgkqwjcffdq.supabase.co -> imlrsvugipgkqwjcffdq
 */
function extractProjectRef(url: string): string | null {
  const match = url.match(/https?:\/\/([^.]+)\.supabase\.co/)
  return match ? match[1] : null
}

function getSupabaseClient(): SupabaseClient {
  if (supabaseInstance) {
    return supabaseInstance
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Fast-fail assertion in development
  if (process.env.NODE_ENV === 'development') {
    if (!url || !url.trim()) {
      throw new Error('NEXT_PUBLIC_SUPABASE_URL is missing or empty. Check your .env.local file and restart the dev server.')
    }
    if (!anonKey || !anonKey.trim()) {
      throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is missing or empty. Check your .env.local file and restart the dev server.')
    }
    
    // Validate URL format
    const projectRef = extractProjectRef(url)
    if (!projectRef) {
      throw new Error(`Invalid NEXT_PUBLIC_SUPABASE_URL format: "${url}". Expected: https://<project-ref>.supabase.co`)
    }
  }

  // Production: fail if env vars are missing
  if (!url || !anonKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is missing')
  }

  // Use createBrowserClient from @supabase/ssr which handles PKCE flow automatically
  // This ensures OAuth uses code flow (?code=) instead of implicit flow (#access_token=)
  supabaseInstance = createBrowserClient(url, anonKey)
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
