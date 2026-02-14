'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'
import { Eye, EyeOff } from 'lucide-react'
import { getSupabaseClient } from '@/lib/supabase/auth-helpers'
import { Heading, Body, Label, Caption } from '@/components/ui/Typography'

export default function LoginPage() {
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})

  const validate = () => {
    const newErrors: { email?: string; password?: string } = {}
    
    if (!email) {
      newErrors.email = t('auth.emailRequired')
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = t('auth.emailInvalid')
    }
    
    if (!password) {
      newErrors.password = t('auth.passwordRequired')
    }
    
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault()
    
    if (!validate()) return
    
    setError('')
    setIsLoading(true)
    
    try {
      const supabase = getSupabaseClient()
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (signInError) {
        // Check for rate limit errors
        const errorMsg = signInError.message.toLowerCase()
        if (errorMsg.includes('rate limit') || errorMsg.includes('rate_limit') || errorMsg.includes('too many') || errorMsg.includes('exceeded')) {
          setError('Too many login attempts. Please wait a few minutes before trying again.')
        } else {
          setError(signInError.message)
        }
        setIsLoading(false)
      } else {
        // Ensure session is properly initialized before proceeding
        console.log('🔄 [Login] Sign in successful, initializing session...')
        
        // Add small delay to allow session to be persisted in cookies
        await new Promise(resolve => setTimeout(resolve, 200))
        
        // Try to refresh session to ensure it's active
        const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession()
        
        // Get current session (fallback if refresh didn't work)
        let session = refreshedSession
        if (refreshError || !session) {
          console.log('⚠️ [Login] Refresh failed, trying getSession:', refreshError?.message)
          const { data: { session: currentSession }, error: sessionError } = await supabase.auth.getSession()
          session = currentSession
          
          if (sessionError) {
            console.error('❌ [Login] Failed to get session:', sessionError)
          }
        }
        
        if (!session) {
          console.error('❌ [Login] No session available after sign in')
          setError('Failed to initialize session. Please try again.')
          setIsLoading(false)
          return
        }
        
        console.log('✅ [Login] Session initialized:', {
          hasSession: !!session,
          userId: session.user?.id?.substring(0, 8),
          email: session.user?.email
        })
        
        const user = session.user
        const userMetadata = user?.user_metadata || {}
        
        // Try to get name from metadata first
        let nameFromMetadata = 
          userMetadata.preferred_name ||
          userMetadata.first_name ||
          userMetadata.full_name?.split(' ')[0] || // First name from full_name
          userMetadata.name?.split(' ')[0] || // First name from name
          null
        
        // If no name in metadata but user exists, try to populate it from Google data
        if (!nameFromMetadata && user && userMetadata.full_name && session) {
          const firstName = userMetadata.full_name.split(' ')[0]
          if (firstName) {
            console.log('🔧 [Login] Updating user metadata with name:', firstName)
            // Update user metadata to add preferred_name (session already checked above)
            await supabase.auth.updateUser({
              data: {
                preferred_name: firstName,
                first_name: firstName
              }
            })
            nameFromMetadata = firstName
          }
        }
        
        // Fallback to email prefix if still no name
        if (!nameFromMetadata && user?.email) {
          nameFromMetadata = user.email.split('@')[0]
        }
        
        if (nameFromMetadata && typeof window !== 'undefined') {
          localStorage.setItem('userFirstName', nameFromMetadata)
          console.log('✅ [Login] Loaded name from Supabase:', nameFromMetadata)
        }
        
        // Check if user is new by looking at database activity (not metadata)
        console.log('🔍 [Login] User session details:', {
          userId: user.id,
          email: user.email,
          hasMetadata: !!user.user_metadata
        })
        
        // Import checkIfNewUserClient from shared utility
        const { checkIfNewUserClient } = await import('@/lib/auth/checkIfNewUser.client')
        const isNewUser = await checkIfNewUserClient(supabase, user.id)
        
        // Add another small delay before redirect to ensure everything is persisted
        await new Promise(resolve => setTimeout(resolve, 100))
        
        console.log('🚀 [Login] Redirecting...', {
          isNewUser,
          destination: isNewUser ? 'onboarding/name' : 'practice/select'
        })
        
        if (isNewUser) {
          // Redirect to onboarding name page
          router.push(`/${locale}/onboarding/name`)
        } else {
          router.push(`/${locale}/practice/select`)
        }
        router.refresh()
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred')
      setIsLoading(false)
    }
  }

  async function handleGoogleLogin() {
    setError('')
    setIsLoading(true)
    
    try {
      const supabase = getSupabaseClient()
      const redirectUrl = `${window.location.origin}/${locale}/auth/callback`
      
      console.log('🔵 [Login] Starting Google OAuth with code flow')
      console.log('🔵 [Login] Redirect URL:', redirectUrl)
      console.log('🔵 [Login] Locale:', locale)
      
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          }
        }
      })
      
      console.log('🔵 [Login] OAuth response:', {
        hasData: !!data,
        hasUrl: !!data?.url,
        urlPreview: data?.url ? data.url.substring(0, 100) + '...' : null,
        hasError: !!oauthError,
        errorMessage: oauthError?.message
      })

      console.log('🔵 [Google OAuth] OAuth response:', {
        hasData: !!data,
        hasUrl: !!data?.url,
        hasError: !!oauthError,
        redirectUrl
      })

      if (oauthError) {
        console.error('❌ [Google OAuth] ===== OAUTH ERROR =====')
        console.error('❌ [Google OAuth] Error details:', {
          message: oauthError.message,
          status: oauthError.status,
          name: oauthError.name,
          fullError: oauthError
        })
        // Check if it's a configuration error
        if (oauthError.message.includes('missing OAuth secret') || oauthError.message.includes('Unsupported provider')) {
          setError('Google sign-in is not configured yet. Please use email/password sign-in for now.')
        } else {
          setError(oauthError.message)
        }
        setIsLoading(false)
      } else if (data?.url) {
        // Redirect to Google OAuth
        console.log('✅ [Login] OAuth redirect initiated')
        window.location.href = data.url
        // Don't set isLoading to false - we're redirecting
      } else {
        // Unexpected: no error but no URL either
        console.warn('⚠️ [Login] No URL returned from OAuth')
        setError('OAuth flow failed. Please try again.')
        setIsLoading(false)
      }
    } catch (err: any) {
      console.error('❌ [Login] Google OAuth error:', err)
      if (err.message?.includes('missing OAuth secret') || err.message?.includes('Unsupported provider')) {
        setError('Google sign-in is not configured yet. Please use email/password sign-in for now.')
      } else {
        setError(err.message || 'An error occurred')
      }
      setIsLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <div className="max-w-md md:max-w-lg w-full space-y-6">
        <div className="text-center space-y-2">
          <Heading as="h1" size="page" className="text-gray-900">
            {t('auth.signIn')}
          </Heading>
          <Body size="body" tone="sub" className="text-base md:text-lg">
            {t('auth.signInToContinue') || 'Sign in to continue learning'}
          </Body>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">
            {error}
          </div>
        )}

        <form onSubmit={handleEmailLogin} className="space-y-4">
          <div>
            <Label size="label" tone="sub" className="block mb-2">
              {t('auth.email')}
            </Label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setErrors({ ...errors, email: undefined })
                setError('')
              }}
              className={`w-full px-4 py-3 border-2 rounded-xl focus:outline-none focus:border-blue-600 text-base ${
                errors.email ? 'border-red-300' : 'border-gray-200'
              }`}
              placeholder="you@example.com"
              disabled={isLoading}
            />
            {errors.email && (
              <Caption className="mt-1 text-red-600">{errors.email}</Caption>
            )}
          </div>

          <div>
            <Label size="label" tone="sub" className="block mb-2">
              {t('auth.password')}
            </Label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setErrors({ ...errors, password: undefined })
                  setError('')
                }}
                className={`w-full px-4 py-3 pr-12 border-2 rounded-xl focus:outline-none focus:border-blue-600 text-base ${
                  errors.password ? 'border-red-300' : 'border-gray-200'
                }`}
                placeholder="Enter your password"
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-gray-500 hover:text-gray-700 focus:outline-none disabled:opacity-50"
                disabled={isLoading}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <EyeOff className="w-5 h-5" />
                ) : (
                  <Eye className="w-5 h-5" />
                )}
              </button>
            </div>
            {errors.password && (
              <Caption className="mt-1 text-red-600">{errors.password}</Caption>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-blue-600 text-white text-center font-semibold h-12 flex items-center justify-center px-6 rounded-xl hover:bg-blue-700 active:bg-blue-700 shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed text-base"
          >
            {isLoading ? (t('auth.signingIn') || 'Signing in...') : t('auth.signIn')}
          </button>
        </form>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-gray-200"></div>
          <Caption tone="muted" className="text-xs uppercase tracking-wide">OR</Caption>
          <div className="flex-1 h-px bg-gray-200"></div>
        </div>

        <button
          onClick={handleGoogleLogin}
          disabled={isLoading}
          className="w-full bg-white border-2 border-gray-300 text-gray-900 text-center font-semibold h-12 flex items-center justify-center px-6 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed space-x-3 text-base"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          <span>{t('auth.continueWithGoogle')}</span>
        </button>

        <div className="pt-2">
          <Link
            href={`/${locale}/auth`}
            className="block w-full text-center py-1.5 text-gray-500 hover:text-gray-600 transition-colors"
          >
            <Label size="action" tone="muted" className="text-sm">
              {t('auth.dontHaveAccount') || "Don't have an account? Sign up"}
            </Label>
          </Link>
        </div>
      </div>
    </main>
  )
}

