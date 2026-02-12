'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    // Simple auth check - in production, use Supabase
    // For now, check if user has completed profile
    if (typeof window !== 'undefined') {
      // Skip check for name page - it's the entry point for Google auth
      // This prevents redirect loops when coming from OAuth callback
      if (pathname?.includes('/onboarding/name')) {
        console.log('🔓 [Onboarding Layout] Skipping auth check for name page')
        return
      }
      
      const firstName = localStorage.getItem('userFirstName')
      if (!firstName) {
        // Redirect to auth if no profile
        console.log('🚫 [Onboarding Layout] No firstName found, redirecting to auth/profile')
        router.push('/auth/profile')
        return
      }

      // Route guard: ensure diagnosis is completed before genre/ready
      if (pathname?.startsWith('/onboarding/genre') || pathname?.startsWith('/onboarding/ready')) {
        const onboardingData = localStorage.getItem('onboardingData')
        if (!onboardingData) {
          router.push('/onboarding/diagnosis')
          return
        }
        const data = JSON.parse(onboardingData)
        if (!data.listeningDifficulties || data.listeningDifficulties.length === 0) {
          router.push('/onboarding/diagnosis')
        }
      }
    }
  }, [router, pathname])

  return (
    <div className="min-h-screen">
      <div className="max-w-2xl mx-auto">
        {children}
      </div>
    </div>
  )
}


