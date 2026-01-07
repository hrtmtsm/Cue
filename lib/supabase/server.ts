/**
 * Supabase Server Client
 * For use in API routes and server components
 * Lazy initialization to avoid errors if env vars are missing
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js'

let supabaseAdminInstance: SupabaseClient | null = null

function getSupabaseAdmin(): SupabaseClient {
  if (supabaseAdminInstance) {
    return supabaseAdminInstance
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    // Return a mock client that will fail gracefully
    // This allows the app to load even if Supabase isn't configured yet
    console.warn('Supabase not configured: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing')
    // Create a client with dummy values - it will fail on actual API calls but won't crash the app
    supabaseAdminInstance = createClient(
      'https://placeholder.supabase.co',
      'placeholder-key',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )
    return supabaseAdminInstance
  }

  supabaseAdminInstance = createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
  return supabaseAdminInstance
}

// Export getter function - lazy initialization
export function getSupabaseAdminClient(): SupabaseClient {
  return getSupabaseAdmin()
}

// For backward compatibility - lazy getter using Proxy
// Only initializes when accessed, not at module load
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (getSupabaseAdmin() as any)[prop]
  },
})

/**
 * Get authenticated user from request headers
 */
export async function getAuthUser(request: Request): Promise<{ userId: string } | null> {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return null
  }

  const token = authHeader.substring(7)
  const admin = getSupabaseAdmin()
  const { data: { user }, error } = await admin.auth.getUser(token)
  
  if (error || !user) {
    return null
  }

  return { userId: user.id }
}

/**
 * Resolve userId from auth or dev guest user
 * In dev/preview mode, falls back to DEV_GUEST_USER_ID if not authenticated
 * In production, requires authentication
 */
export async function resolveUserId(request: Request): Promise<{ userId: string; source: 'auth' | 'dev_guest' }> {
  // Try to get authenticated user first
  const auth = await getAuthUser(request)
  if (auth) {
    const vercelEnv = process.env.VERCEL_ENV || 'development'
    console.log('✅ [resolveUserId] Authenticated user:', {
      userId: auth.userId.substring(0, 8) + '...',
      source: 'auth',
      VERCEL_ENV: vercelEnv,
      NODE_ENV: process.env.NODE_ENV,
    })
    return { userId: auth.userId, source: 'auth' }
  }

  // Not authenticated - check if we're in dev/preview mode
  // Use VERCEL_ENV for Vercel deployments, NODE_ENV for local dev
  const vercelEnv = process.env.VERCEL_ENV || 'development'
  const isProduction = vercelEnv === 'production' && process.env.NODE_ENV === 'production'
  
  if (!isProduction) {
    const devGuestUserId = process.env.DEV_GUEST_USER_ID
    if (!devGuestUserId) {
      throw new Error('DEV_GUEST_USER_ID environment variable is required in development/preview mode when user is not authenticated')
    }
    console.log('✅ [resolveUserId] Using dev guest user:', {
      userId: devGuestUserId.substring(0, 8) + '...',
      source: 'dev_guest',
      VERCEL_ENV: vercelEnv,
      NODE_ENV: process.env.NODE_ENV,
    })
    return { userId: devGuestUserId, source: 'dev_guest' }
  }

  // Production mode - require authentication
  console.error('❌ [resolveUserId] Authentication required in production:', {
    VERCEL_ENV: vercelEnv,
    NODE_ENV: process.env.NODE_ENV,
  })
  throw new Error('Authentication required in production mode')
}
