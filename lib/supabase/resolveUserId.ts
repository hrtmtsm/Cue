/**
 * Server-only user resolution with cookie-based authentication
 * This file imports from 'next/headers' and should ONLY be used in:
 * - API routes (app/api/*)
 * - Server Actions
 * - Server Components
 * 
 * DO NOT import this in client components!
 */

import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { getAuthUser } from './server'

/**
 * Resolve userId from cookies, headers, or dev guest user
 * Prioritizes cookie-based auth (browser requests), then header-based (API calls with Bearer tokens)
 * In dev/preview mode, falls back to DEV_GUEST_USER_ID if not authenticated
 * In production, requires authentication
 */
export async function resolveUserId(request: Request): Promise<{ userId: string; source: 'auth' | 'dev_guest' }> {
  // First: Try cookie-based authentication (primary method for browser requests)
  try {
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

    const { data: { user }, error } = await supabase.auth.getUser()
    
    if (!error && user) {
      console.log('✅ [resolveUserId] Authenticated user (cookies):', {
        userId: user.id.substring(0, 8) + '...',
        source: 'auth',
        email: user.email,
      })
      return { userId: user.id, source: 'auth' }
    }
  } catch (cookieError) {
    console.warn('[resolveUserId] Cookie auth failed:', cookieError)
  }

  // Second: Try header-based authentication (fallback for API calls with Bearer tokens)
  const auth = await getAuthUser(request)
  if (auth) {
    console.log('✅ [resolveUserId] Authenticated user (header):', {
      userId: auth.userId.substring(0, 8) + '...',
      source: 'auth',
    })
    return { userId: auth.userId, source: 'auth' }
  }

  // Third: Dev guest fallback (non-production only)
  const vercelEnv = process.env.VERCEL_ENV || 'development'
  const isProduction = vercelEnv === 'production' && process.env.NODE_ENV === 'production'
  
  if (!isProduction) {
    const devGuestUserId = process.env.DEV_GUEST_USER_ID
    if (!devGuestUserId) {
      throw new Error('DEV_GUEST_USER_ID environment variable is required in development/preview mode when user is not authenticated')
    }
    console.log('⚠️  [resolveUserId] Using dev guest user (no auth found):', {
      userId: devGuestUserId.substring(0, 8) + '...',
      source: 'dev_guest',
    })
    return { userId: devGuestUserId, source: 'dev_guest' }
  }

  // Production: require authentication
  throw new Error('Authentication required in production mode')
}
