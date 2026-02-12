import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { checkIfNewUser } from '@/lib/auth/checkIfNewUser.server'

const isDevelopment = process.env.NODE_ENV === 'development'

/**
 * Canonical OAuth callback route handler
 * Handles PKCE code exchange for Google OAuth and redirects appropriately
 */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const error = requestUrl.searchParams.get('error')
  const errorDescription = requestUrl.searchParams.get('error_description')
  
  // Extract locale from pathname (e.g., /en/auth/callback -> en)
  const pathParts = requestUrl.pathname.split('/').filter(Boolean)
  const locale = pathParts[0] || 'en'
  
  // Development-only logging
  if (isDevelopment) {
    console.log('🔍 [Callback] Request received')
    console.log('🔍 [Callback] Full URL:', requestUrl.href)
    console.log('🔍 [Callback] Pathname:', requestUrl.pathname)
    console.log('🔍 [Callback] Search params:', requestUrl.search)
    console.log('🔍 [Callback] Has code:', !!code)
    console.log('🔍 [Callback] Locale:', locale)
  }
  
  // Handle OAuth errors
  if (error) {
    const errorMessage = errorDescription || error
    if (isDevelopment) {
      console.error('❌ [Callback] OAuth error:', error, errorDescription)
    }
    return NextResponse.redirect(
      `${requestUrl.origin}/${locale}/auth/login?error=${encodeURIComponent(errorMessage)}`
    )
  }
  
  // Check for email confirmation flow (different from OAuth)
  const tokenHash = requestUrl.searchParams.get('token_hash')
  const type = requestUrl.searchParams.get('type')
  
  // Email confirmation flow - handle separately from OAuth
  if (tokenHash && type === 'signup') {
    if (isDevelopment) {
      console.log('📧 [Callback] Email confirmation detected')
      console.log('   → Token hash present:', !!tokenHash)
      console.log('   → Type:', type)
    }
    
    try {
      // Validate environment variables
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      
      if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('Supabase environment variables missing')
      }
      
      // Create Supabase client for email verification
      const cookieStore = await cookies()
      const requestCookies = request.cookies
      
      const supabase = createServerClient(
        supabaseUrl,
        supabaseAnonKey,
        {
          cookies: {
            getAll() {
              return requestCookies.getAll()
            },
            setAll(cookiesToSet) {
              try {
                cookiesToSet.forEach(({ name, value, options }) =>
                  cookieStore.set(name, value, options)
                )
              } catch {
                // Ignore errors in server component context
              }
            },
          },
        }
      )
      
      if (isDevelopment) {
        console.log('🔄 [Callback] Verifying email OTP...')
      }
      
      // Verify the email confirmation token
      const { data: { session }, error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: 'signup'
      })
      
      if (verifyError) {
        console.error('❌ [Callback] Email verification failed:', verifyError.message)
        return NextResponse.redirect(
          `${requestUrl.origin}/${locale}/auth/login?error=${encodeURIComponent('Email verification failed. Please try again.')}`
        )
      }
      
      if (!session) {
        console.error('❌ [Callback] No session after email verification')
        return NextResponse.redirect(
          `${requestUrl.origin}/${locale}/auth/login?error=verification_failed`
        )
      }
      
      if (isDevelopment) {
        console.log('✅ [Callback] Email verified for:', session.user.email)
      }
      
      // Email users who just confirmed are always new users
      // Redirect to onboarding (without googleAuth param)
      const redirectPath = `/${locale}/onboarding/name`
      
      if (isDevelopment) {
        console.log('🔄 [Email Callback] Redirecting to:', redirectPath)
        console.log('   → Full URL:', `${requestUrl.origin}${redirectPath}`)
      }
      
      return NextResponse.redirect(`${requestUrl.origin}${redirectPath}`)
      
    } catch (error: any) {
      console.error('❌ [Callback] Email verification exception:', error)
      return NextResponse.redirect(
        `${requestUrl.origin}/${locale}/auth/login?error=verification_exception`
      )
    }
  }
  
  // OAuth flow - requires 'code' parameter
  if (!code) {
    if (isDevelopment) {
      console.error('❌ [Callback] No code parameter')
      console.warn('⚠️ [Callback] This usually means:')
      console.warn('   1. Redirect URL in Supabase Dashboard does not match this URL')
      console.warn('   2. OAuth flow was cancelled')
      console.warn('   3. Error occurred during OAuth')
      console.warn('⚠️ [Callback] Expected URL format:', `${requestUrl.origin}/${locale}/auth/callback`)
    }
    return NextResponse.redirect(`${requestUrl.origin}/${locale}/auth/login?error=no_code`)
  }
  
  try {
    // Validate environment variables with runtime assertions
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    
    // Runtime assertion - fail fast if env vars are missing
    if (!supabaseUrl || !supabaseUrl.trim()) {
      const error = 'NEXT_PUBLIC_SUPABASE_URL is missing or empty. Check your .env.local file and restart the dev server.'
      if (isDevelopment) {
        console.error('❌ [Callback]', error)
      }
      throw new Error(error)
    }
    
    if (!supabaseAnonKey || !supabaseAnonKey.trim()) {
      const error = 'NEXT_PUBLIC_SUPABASE_ANON_KEY is missing or empty. Check your .env.local file and restart the dev server.'
      if (isDevelopment) {
        console.error('❌ [Callback]', error)
      }
      throw new Error(error)
    }
    
    // Extract and validate project ref from URL
    const urlProjectRef = supabaseUrl.match(/https?:\/\/([^.]+)\.supabase\.co/)?.[1]
    if (!urlProjectRef) {
      const error = `Invalid NEXT_PUBLIC_SUPABASE_URL format: "${supabaseUrl}". Expected: https://<project-ref>.supabase.co`
      console.error('❌ [Callback]', error)
      throw new Error(error)
    }
    
    // Read cookies from the incoming request (not from next/headers cookies())
    // This is critical for PKCE - the code_verifier is stored in browser cookies
    // and must be read from the request that contains them
    const cookieStore = await cookies() // Next.js 16: cookies() is now async
    const requestCookies = request.cookies
    
    // Development-only validation and debugging (no sensitive data in logs)
    if (isDevelopment) {
      console.log('✅ [Callback] Environment variables loaded')
      console.log('   Project ref:', urlProjectRef)
      
      // Check for project ref mismatch in cookies (dev-only)
      const allCookies = requestCookies.getAll()
      const supabaseCookies = allCookies.filter(c => c.name.includes('sb-'))
      
      if (supabaseCookies.length > 0) {
        // Extract project ref from cookie name (format: sb-<project-ref>-auth-token)
        const cookieProjectRefs = supabaseCookies
          .map(c => {
            const match = c.name.match(/sb-([^-]+)-/)
            return match ? match[1] : null
          })
          .filter(Boolean) as string[]
        
        const uniqueCookieRefs = [...new Set(cookieProjectRefs)]
        
        if (uniqueCookieRefs.length > 0 && !uniqueCookieRefs.includes(urlProjectRef)) {
          console.error('❌ [Callback] Project ref mismatch detected')
          console.error('   URL project ref:', urlProjectRef)
          console.error('   Cookie project refs:', uniqueCookieRefs)
        } else if (uniqueCookieRefs.length > 0) {
          console.log('✅ [Callback] Project refs match')
        }
        
        // Check for PKCE verifier cookie (dev-only, no sensitive data)
        const pkceCookies = allCookies.filter(c => 
          c.name.includes('code-verifier') || c.name.includes('auth-code')
        )
        console.log('🍪 [Callback] PKCE cookies found:', pkceCookies.length > 0)
      }
    }
    
    const supabase = createServerClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        cookies: {
          getAll() {
            // CRITICAL: Read from request cookies, not from next/headers cookies()
            // The PKCE verifier is in the browser cookies sent with the request
            return requestCookies.getAll()
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              )
            } catch {
              // The `setAll` method was called from a Server Component.
              // This can be ignored if you have middleware refreshing
              // user sessions.
            }
          },
        },
      }
    )
    
    if (isDevelopment) {
      console.log('🔄 [Callback] Exchanging code for session...')
    }
    
    const { data: { session }, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
    
    if (exchangeError) {
      // Log exchange errors (no sensitive data)
      console.error('❌ [Callback] Exchange failed:', exchangeError.message)
      if (isDevelopment) {
        console.error('❌ [Callback] Error details:', {
          message: exchangeError.message,
          status: exchangeError.status,
          name: exchangeError.name,
        })
      }
      
      return NextResponse.redirect(
        `${requestUrl.origin}/${locale}/auth/login?error=${encodeURIComponent(exchangeError.message || 'exchange_failed')}`
      )
    }
    
    if (!session) {
      if (isDevelopment) {
        console.error('❌ [Callback] No session returned')
      }
      return NextResponse.redirect(
        `${requestUrl.origin}/${locale}/auth/login?error=no_session`
      )
    }
    
    if (isDevelopment) {
      console.log('✅ [Callback] Session created for:', session.user.email)
    }
    
    // Additional detailed logging
    console.log('✅ [OAuth Callback] Session created:', {
      hasSession: !!session,
      userId: session?.user?.id?.substring(0, 8),
      expiresAt: session?.expires_at
    });
    
    // Check if new user by checking database activity (not metadata)
    // This is more reliable than metadata which may be missing for legacy users
    const isNewUser = await checkIfNewUser(session.user.id)
    
    if (isDevelopment) {
      console.log('👤 [Callback] User:', {
        email: session.user.email,
        isNew: isNewUser,
        userId: session.user.id.substring(0, 8),
        metadata: session.user.user_metadata
      })
    }
    
    // Determine redirect destination
    if (isNewUser) {
      const redirectPath = `/${locale}/onboarding/name?googleAuth=true`;
      console.log('🔄 [OAuth Callback] Redirecting to:', redirectPath);
      console.log('   → Full URL:', `${requestUrl.origin}${redirectPath}`);
      if (isDevelopment) {
        console.log('→ Redirecting to onboarding')
      }
      return NextResponse.redirect(
        `${requestUrl.origin}${redirectPath}`
      )
    } else {
      const redirectPath = `/${locale}/practice/select`;
      console.log('🔄 [OAuth Callback] Redirecting to:', redirectPath);
      console.log('   → Full URL:', `${requestUrl.origin}${redirectPath}`);
      if (isDevelopment) {
        console.log('→ Redirecting to practice')
      }
      return NextResponse.redirect(
        `${requestUrl.origin}${redirectPath}`
      )
    }
    
  } catch (error: any) {
    if (isDevelopment) {
      console.error('❌ [Callback] Exception:', error)
    }
    return NextResponse.redirect(
      `${requestUrl.origin}/${locale}/auth/login?error=callback_exception`
    )
  }
}

