'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'

export default function LandingPage() {
  const locale = useLocale()
  const t = useTranslations()
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  useEffect(() => {
    // Check authentication status
    // TODO: Replace with Supabase auth check
    // const { data: { user } } = await supabase.auth.getUser()
    // setIsAuthenticated(!!user)
    
    // For now, check if user has completed onboarding
    if (typeof window !== 'undefined') {
      const hasName = localStorage.getItem('userFirstName')
      setIsAuthenticated(!!hasName)
    }
  }, [])

  const ctaText = isAuthenticated ? t('common.continue') : t('landing.getStarted')
  const ctaHref = isAuthenticated ? `/${locale}/practice/select` : `/${locale}/auth`

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      {/* Max-width container for centering */}
      <div className="max-w-2xl mx-auto w-full space-y-8">
        <div className="space-y-4 text-center">
          <div className="mb-8">
            <h2 className="text-5xl font-bold text-blue-600 tracking-tight">
              {t('common.appName')}
            </h2>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 leading-tight">
            {t('landing.hero')}
          </h1>
          <p className="text-lg text-gray-600">
            {t('landing.subtitle')}
          </p>
        </div>

        <div className="pt-8 pb-6 space-y-3">
          <Link
            href={ctaHref}
            className="block w-full bg-blue-600 text-white text-center font-semibold py-4 px-6 rounded-xl shadow-lg active:bg-blue-700 transition-colors"
          >
            {ctaText}
          </Link>
          {!isAuthenticated && (
            <Link
              href={`/${locale}/auth/login`}
              className="block w-full text-center font-medium py-3 px-6 text-gray-600 hover:text-gray-900 transition-colors"
            >
              {t('landing.alreadyHaveAccount')}
            </Link>
          )}
        </div>
      </div>
    </main>
  )
}
