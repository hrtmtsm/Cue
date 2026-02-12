'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'
import { ChevronLeft, Eye, EyeOff } from 'lucide-react'
import { getSupabaseClient } from '@/lib/supabase/auth-helpers'

export default function EmailSignupPage() {
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
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
    setSuccessMessage('')
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
        // Standard signup flow: Always require email confirmation
        // User will be redirected to onboarding after clicking confirmation link in email
        setSuccessMessage('Please check your email to confirm your account. After confirming, you can sign in.')
        setIsLoading(false)
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred')
      setIsLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen flex-col px-6 py-12">
      <div className="max-w-2xl w-full mx-auto">
        <div className="mb-8">
          <Link
            href="/auth"
            className="text-blue-600 font-medium text-lg py-2 px-1 -ml-1 inline-flex items-center gap-1"
          >
            <ChevronLeft className="w-5 h-5" />
            Back
          </Link>
        </div>

        <div className="space-y-8">
        <div className="space-y-4">
          <h1 className="text-3xl font-bold text-gray-900 leading-tight">
            {t('auth.createAccount')}
          </h1>
          <p className="text-lg text-gray-600">
            Sign up with your email address
          </p>
        </div>

        {successMessage && (
          <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-xl">
            {successMessage}
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">
            {error}
          </div>
        )}

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

