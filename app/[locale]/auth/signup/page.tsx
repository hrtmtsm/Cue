'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'
import { ChevronLeft, Eye, EyeOff } from 'lucide-react'
import { getSupabaseClient } from '@/lib/supabase/auth-helpers'

export default function SignupPage() {
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
        setIsLoading(false)
      } else {
        // Check if session exists (email confirmation may be required)
        const { data: { session } } = await supabase.auth.getSession()
        
        if (session) {
          // User is logged in - redirect to onboarding
          router.push(`/${locale}/onboarding/name`)
          router.refresh()
        } else {
          // Email confirmation required - show message
          setError('Please check your email to confirm your account. After confirming, you can sign in.')
          setIsLoading(false)
        }
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
      
      console.log('🔵 [Signup] Starting Google OAuth with code flow')
      console.log('🔵 [Signup] Redirect URL:', redirectUrl)
      console.log('🔵 [Signup] Locale:', locale)
      
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
          setError('Google sign-in is not configured yet. Please use email/password sign-up for now.')
        } else {
          setError(oauthError.message)
        }
        setIsLoading(false)
      } else if (data?.url) {
        // Redirect to Google OAuth
        console.log('✅ [Signup] OAuth redirect initiated')
        window.location.href = data.url
        // Don't set isLoading to false - we're redirecting
      } else {
        // Unexpected: no error but no URL either
        console.warn('⚠️ [Signup] No URL returned from OAuth')
        setError('OAuth flow failed. Please try again.')
        setIsLoading(false)
      }
    } catch (err: any) {
      if (err.message?.includes('missing OAuth secret') || err.message?.includes('Unsupported provider')) {
        setError('Google sign-in is not configured yet. Please use email/password sign-up for now.')
      } else {
        setError(err.message || 'An error occurred')
      }
      setIsLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen flex-col px-6 py-12">
      <div className="max-w-2xl w-full mx-auto">
        <div className="mb-8">
          <Link
            href="/"
            className="text-blue-600 font-medium text-lg py-2 px-1 -ml-1 inline-flex items-center gap-1"
          >
            <ChevronLeft className="w-5 h-5" />
            {t('common.back')}
          </Link>
        </div>

        <div className="space-y-8">
        <div className="space-y-4">
          <h1 className="text-3xl font-bold text-gray-900 leading-tight">
            {t('auth.createAccount')}
          </h1>
          <p className="text-lg text-gray-600">
            {t('auth.signInToContinue')}
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <button
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className="w-full bg-white border-2 border-gray-300 text-gray-900 text-center font-semibold py-4 px-6 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors flex items-center justify-center space-x-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            <span>{t('auth.continueWithGoogle')}</span>
          </button>

        </div>

        <div className="relative py-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-gray-500">{t('auth.or')}</span>
          </div>
        </div>

        <form onSubmit={handleEmailSignup} className="space-y-6">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
              {t('auth.email')}
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`w-full p-4 border-2 rounded-xl focus:outline-none focus:border-blue-600 text-lg ${
                errors.email ? 'border-red-300' : 'border-gray-200'
              }`}
              placeholder="you@example.com"
              disabled={isLoading}
            />
            {errors.email && (
              <p className="mt-1 text-sm text-red-600">{errors.email}</p>
            )}
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
              {t('auth.password')}
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`w-full p-4 pr-12 border-2 rounded-xl focus:outline-none focus:border-blue-600 text-lg ${
                  errors.password ? 'border-red-300' : 'border-gray-200'
                }`}
                placeholder="Enter your password"
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
              <p className="mt-1 text-sm text-red-600">{errors.password}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className={`w-full py-4 px-6 rounded-xl font-semibold text-lg text-white shadow-lg transition-colors ${
              isLoading
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 active:bg-blue-700'
            }`}
          >
            {isLoading ? t('auth.signingUp') : t('auth.signUp')}
          </button>
        </form>

        <p className="text-center text-sm text-gray-600">
          {t('auth.alreadyHaveAccount')}{' '}
          <Link href={`/${locale}/auth/login`} className="text-blue-600 hover:underline">
            {t('auth.signIn')}
          </Link>
        </p>
        </div>
      </div>
    </main>
  )
}

