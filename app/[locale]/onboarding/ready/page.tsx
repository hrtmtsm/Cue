'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale } from 'next-intl'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { getOnboardingData } from '@/lib/onboardingStore'
import { Clip } from '@/lib/clipTypes'
import { convertClipsToStories } from '@/lib/clipToStoryConverter'
import { saveUserStories } from '@/lib/storyClient'
import { trackEvent } from '@/lib/posthog/usePostHog'

export default function ReadyPage() {
  const router = useRouter()
  const locale = useLocale()
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Feature flag: Use diagnostic clips instead of generated clips
  const USE_DIAGNOSTIC = true

  const handleStart = async () => {
    console.log('🔵 ONBOARDING COMPLETION: handleStart called')
    const data = getOnboardingData()
    console.log('🔵 Onboarding data:', JSON.stringify(data, null, 2))
    setIsGenerating(true)
    setError(null)
    
    try {
      if (USE_DIAGNOSTIC) {
        // NEW: Diagnostic flow - fetch curated diagnostic clips
        console.log('🔵 [DIAGNOSTIC] Calling API: GET /api/clips/diagnostic')
        
        const response = await fetch('/api/clips/diagnostic', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        })
        
        console.log('🔵 [DIAGNOSTIC] API response status:', response.status, response.statusText)
        
        if (!response.ok) {
          const errorText = await response.text()
          console.error('🔴 [DIAGNOSTIC] API error response text:', errorText)
          let errorData: { error?: string; code?: string; message?: string }
          try {
            errorData = JSON.parse(errorText)
          } catch {
            errorData = { error: errorText || 'Unknown error' }
          }
          
          const errorMessage = errorData.message || errorData.error || `Failed to fetch diagnostic clips: ${response.statusText}`
          throw new Error(errorMessage)
        }
        
        const result = await response.json()
        console.log('🔵 [DIAGNOSTIC] API returned result:', JSON.stringify(result, null, 2))
        
        if (!result.clips || !Array.isArray(result.clips) || result.clips.length === 0) {
          throw new Error('No diagnostic clips found. Please try again or check server logs.')
        }
        
        const diagnosticClips = result.clips
        console.log(`✅ [DIAGNOSTIC] Fetched ${diagnosticClips.length} diagnostic clips`)
        console.log('🔵 [DIAGNOSTIC] Clip IDs:', diagnosticClips.map((c: any) => c.id))
        
        // Store diagnostic clips in localStorage
        localStorage.setItem('diagnosticClips', JSON.stringify(diagnosticClips))
        console.log('✅ [DIAGNOSTIC] Stored diagnostic clips in localStorage')
        console.log('✅ [DIAGNOSTIC] Verification - diagnosticClips:', localStorage.getItem('diagnosticClips') ? 'present' : 'missing')
        
        // Clear old cached practice data
        localStorage.removeItem('userStories')
        localStorage.removeItem('userClips')
        
        // Dev-only: Confirm keys were cleared
        if (process.env.NODE_ENV === 'development') {
          console.log('🧹 [DIAGNOSTIC] Cleared old cached practice data (dev only):', {
            userStoriesCleared: !localStorage.getItem('userStories'),
            userClipsCleared: !localStorage.getItem('userClips'),
          })
        }
        
        // Small delay to ensure localStorage is committed before navigation
        await new Promise(resolve => setTimeout(resolve, 50))
        
        // Track onboarding completion
        trackEvent('onboarding_completed')
        
        // Route to diagnostic session
        console.log('✅ [DIAGNOSTIC] Navigating to /onboarding/diagnosis')
        router.push(`/${locale}/onboarding/diagnosis`)
      } else {
        // All users now go through diagnostic flow
        // Clips will be fetched from database in practice/select page
        console.log('✅ [ONBOARDING] Navigating to practice/select (clips will be fetched from DB)')
        router.push(`/${locale}/practice/select`)
      }
    } catch (err: any) {
      console.error('Error in handleStart:', err)
      const errorMessage = err.message || 'Failed to fetch clips. Please try again.'
      setError(errorMessage)
      setIsGenerating(false)
      // Do NOT redirect on error - user stays on page to see error
    }
  }

  return (
    <main className="flex min-h-screen flex-col px-6 py-12">
      {/* Header */}
      {!isGenerating && (
        <div className="mb-8">
          <Link
            href={`/${locale}/onboarding/level-select`}
            className="text-blue-600 font-medium text-lg py-2 px-1 -ml-1 inline-flex items-center gap-1"
          >
            <ChevronLeft className="w-5 h-5" />
            Back
          </Link>
        </div>
      )}

      {/* Content */}
      <div className="flex flex-col justify-center flex-1 space-y-8">
        <div className="space-y-4 text-center">
          <h1 className="text-3xl font-bold text-gray-900 leading-tight">
            You're all set
          </h1>
          <p className="text-lg text-gray-600">
            We'll start with a short listening clip based on your choices.
          </p>
        </div>
      </div>

      {/* Sticky bottom button */}
      <div className="pt-8 pb-6">
        {error && (
          <div className={`mb-4 p-3 border rounded-lg text-sm space-y-1 ${
            error.includes('Using mock clips') 
              ? 'bg-yellow-50 border-yellow-200 text-yellow-800'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}>
            <div className="font-medium">
              {error.includes('Using mock clips') ? '⚠️ Warning' : 'Failed to generate clips'}
            </div>
            <div className="text-xs">{error}</div>
            {error.includes('Using mock clips') && (
              <button
                onClick={() => {
                  setError(null)
                  router.push(`/${locale}/practice`)
                }}
                className="mt-2 text-xs underline hover:no-underline"
              >
                Continue with mock clips
              </button>
            )}
          </div>
        )}
        <button
          onClick={handleStart}
          disabled={isGenerating}
          className="w-full py-4 px-6 rounded-xl font-semibold text-lg bg-blue-600 text-white active:bg-blue-700 shadow-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isGenerating ? 'Generating your clips...' : 'Start listening'}
        </button>
      </div>
    </main>
  )
}
