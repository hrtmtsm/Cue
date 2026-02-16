'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { Eye, EyeOff } from 'lucide-react'
import { Heading, Label, Caption } from '@/components/ui/Typography'
import { getSupabaseClient } from '@/lib/supabase/auth-helpers'
import { usePostHog, trackEvent } from '@/lib/posthog/usePostHog'

export default function AuthChoicePage() {
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations()
  const posthog = usePostHog()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})
  const [isLoading, setIsLoading] = useState(false)

  async function handleGoogle() {
    console.log('🔵 [Google OAuth] ===== BUTTON CLICKED =====')
    console.log('🔵 [Google OAuth] Function called, starting OAuth flow...')
    
    // Track Google signup CTA click
    trackEvent('cta_clicked', { location: 'auth', type: 'google_signup' })
    
    setError('')
    setIsLoading(true)
    
    try {
      console.log('🔵 [Google OAuth] Importing Supabase client...')
      const { getSupabaseClient } = await import('@/lib/supabase/auth-helpers')
      const supabase = getSupabaseClient()
      const redirectUrl = `${window.location.origin}/${locale}/auth/callback`
      
      console.log('🔵 [Auth] Starting Google OAuth with code flow')
      console.log('🔵 [Auth] Redirect URL:', redirectUrl)
      console.log('🔵 [Auth] Locale:', locale)
      
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
          // This tells Supabase to use code flow instead of implicit flow
          skipBrowserRedirect: false
        }
      })
      
      console.log('🔵 [Google OAuth] Full OAuth response:', {
        hasData: !!data,
        hasUrl: !!data?.url,
        url: data?.url ? data.url.substring(0, 100) + '...' : null,
        hasError: !!oauthError,
        error: oauthError ? {
          message: oauthError.message,
          status: oauthError.status,
          name: oauthError.name
        } : null
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
        console.log('✅ [Auth] OAuth redirect initiated')
        window.location.href = data.url
        // Don't set isLoading to false - we're redirecting
      } else {
        // Unexpected: no error but no URL either
        console.warn('⚠️ [Auth] No URL returned from OAuth')
        setError('OAuth flow failed. Please try again.')
        setIsLoading(false)
      }
    } catch (err: any) {
      if (err.message?.includes('missing OAuth secret') || err.message?.includes('Unsupported provider')) {
        setError('Google sign-in is not configured yet. Please use email/password sign-in for now.')
      } else {
        setError(err.message || 'An error occurred')
      }
      setIsLoading(false)
    }
  }

  const validate = () => {
    const newErrors: { email?: string; password?: string } = {}
    
    if (!email) {
      newErrors.email = t('auth.emailRequired') || 'Email is required'
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = t('auth.emailInvalid') || 'Email is invalid'
    }
    
    if (!password) {
      newErrors.password = t('auth.passwordRequired') || 'Password is required'
    } else if (password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters'
    }
    
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  async function handleEmailSignup(e: React.FormEvent) {
    e.preventDefault()
    
    if (!validate()) return
    
    setError('')
    setIsLoading(true)
    
    try {
      const supabase = getSupabaseClient()
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/${locale}/auth/callback`
        }
      })

      if (signUpError) {
        // Check for rate limit errors
        const errorMsg = signUpError.message.toLowerCase()
        if (errorMsg.includes('rate limit') || errorMsg.includes('rate_limit') || errorMsg.includes('too many') || errorMsg.includes('exceeded')) {
          setError('Too many signup attempts. Please wait a few minutes before trying again, or use a different email address.')
        } else {
          setError(signUpError.message)
        }
        setSuccessMessage('')
        setIsLoading(false)
      } else {
        // Check if session exists (email confirmation may be required)
        const { data: { session } } = await supabase.auth.getSession()
        
        if (session) {
          // User is logged in - CRITICAL: Identify FIRST, then track event
          posthog.identify(session.user.id, {
            email: session.user.email,
          })
          trackEvent('signup_completed', { method: 'email' })
          
          // Redirect to onboarding
          router.push(`/${locale}/onboarding/name`)
          router.refresh()
        } else {
          // Email confirmation required - show success message (blue info box)
          setSuccessMessage('Please check your email to confirm your account. After confirming, you can sign in.')
          setError('')
          setIsLoading(false)
        }
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred')
      setIsLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <div className="max-w-md md:max-w-lg w-full space-y-6">
        <div className="text-center">
          <Heading as="h1" size="page" className="text-gray-900">
            {t('auth.createAccount')}
          </Heading>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">
            {error}
          </div>
        )}

        {successMessage && (
          <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-xl">
            {successMessage}
          </div>
        )}

        <form onSubmit={handleEmailSignup} className="space-y-4">
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
                placeholder="At least 6 characters"
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setShowPassword(!showPassword)
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-gray-600 hover:text-gray-800 focus:outline-none disabled:opacity-50 z-10 flex items-center justify-center"
                disabled={isLoading}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <EyeOff className="w-6 h-6" />
                ) : (
                  <Eye className="w-6 h-6" />
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
            {isLoading ? (t('auth.signingUp') || 'Creating account...') : (t('auth.createAccount') || 'Create account')}
          </button>
        </form>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-gray-200"></div>
          <Caption tone="muted" className="text-xs uppercase tracking-wide">OR</Caption>
          <div className="flex-1 h-px bg-gray-200"></div>
        </div>

        <button
          onClick={(e) => {
            console.log('🔵 [Google OAuth] ===== BUTTON CLICK EVENT =====')
            e.preventDefault()
            handleGoogle()
          }}
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
            href={`/${locale}/auth/login`}
            className="block w-full text-center py-1.5 text-gray-500 hover:text-gray-600 transition-colors"
          >
            <Label size="action" tone="muted" className="text-sm">{t('auth.alreadyHaveAccount')}</Label>
          </Link>
        </div>
      </div>
    </main>
  )
}

