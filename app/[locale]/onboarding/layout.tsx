'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useLocale } from 'next-intl'
import { getLocalePath } from '@/lib/localePath'

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const locale = useLocale()

  useEffect(() => {
    // Simple auth check - in production, use Supabase
    // For now, check if user has completed profile
    if (typeof window !== 'undefined') {
      // Skip check for name page - it's the entry point for Google auth
      // This prevents redirect loops when coming from OAuth callback
      if (pathname?.includes('/onboarding/name')) {
        console.log('🔓 [Locale Onboarding Layout] Skipping auth check for name page')
        return
      }
      
      const firstName = localStorage.getItem('userFirstName')
      if (!firstName) {
        // Redirect to auth if no profile
        console.log('🚫 [Locale Onboarding Layout] No firstName found, redirecting to auth/profile')
        router.push(getLocalePath(locale, '/auth/profile'))
        return
      }

      // Route guard: ensure diagnosis is completed before genre/ready
      if (pathname?.includes('/onboarding/genre') || pathname?.includes('/onboarding/ready')) {
        const onboardingData = localStorage.getItem('onboardingData')
        if (!onboardingData) {
          router.push(getLocalePath(locale, '/onboarding/diagnosis'))
          return
        }
        const data = JSON.parse(onboardingData)
        if (!data.listeningDifficulties || data.listeningDifficulties.length === 0) {
          router.push(getLocalePath(locale, '/onboarding/diagnosis'))
        }
      }
    }
  }, [router, pathname, locale])

  return (
    <div className="min-h-screen">
      <div className="max-w-2xl mx-auto">
        {children}
      </div>
    </div>
  )
}


