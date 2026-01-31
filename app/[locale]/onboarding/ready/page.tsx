'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { getOnboardingData } from '@/lib/onboardingStore'
import { Clip } from '@/lib/clipTypes'
import { convertClipsToStories } from '@/lib/clipToStoryConverter'
import { saveUserStories } from '@/lib/storyClient'

export default function ReadyPage() {
  const router = useRouter()
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
        
        // Route to diagnostic session
        console.log('✅ [DIAGNOSTIC] Navigating to /onboarding/diagnosis')
        router.push('/onboarding/diagnosis')
      } else {
        // OLD: Generation flow - generate clips using OpenAI
        const requestBody = { onboardingData: data }
        console.log('🔵 Calling API: POST /api/clips/generate')
        console.log('🔵 Request body:', JSON.stringify(requestBody, null, 2))
        
        // Call API once to generate all 3 clips
        const response = await fetch('/api/clips/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        })
        
        console.log('🔵 API response status:', response.status, response.statusText)
        console.log('🔵 API response headers:', Object.fromEntries(response.headers.entries()))
        
        if (!response.ok) {
          const errorText = await response.text()
          console.error('🔴 API error response text:', errorText)
          let errorData: { error?: string; code?: string; details?: string }
          try {
            errorData = JSON.parse(errorText)
          } catch {
            errorData = { error: errorText || 'Unknown error' }
          }
          
          // Build user-friendly error message
          let errorMessage = errorData.details || errorData.error || `Failed to generate clips: ${response.statusText}`
          
          // Add specific guidance based on error code
          if (errorData.code === 'MISSING_API_KEY') {
            errorMessage = 'OpenAI API key is not configured. Please check your .env.local file and restart the server.'
          } else if (errorData.code === 'QUOTA_EXCEEDED') {
            errorMessage = 'OpenAI API quota exceeded. Please check your billing or contact support.'
          } else if (errorData.code === 'CLIENT_INIT_ERROR') {
            errorMessage = 'Failed to initialize OpenAI client. Please verify your API key is valid.'
          }
          
          throw new Error(errorMessage)
        }
        
        const result = await response.json()
        console.log('🔵 API returned result:', JSON.stringify(result, null, 2))
        console.log('🔵 Response keys:', Object.keys(result))
        console.log('🔵 result.source:', result.source, '(type:', typeof result.source, ')')
        console.log('🔵 result.clips exists:', !!result.clips)
        console.log('🔵 result.clips is array:', Array.isArray(result.clips))
        
        if (!result.clips || !Array.isArray(result.clips) || result.clips.length === 0) {
          throw new Error('No clips were generated. Please try again or check server logs.')
        }
        
        // Check if mock clips were used
        const source = result.source
        console.log(`🔵 Clip source detected: "${source}" (type: ${typeof source})`)
        
        if (!source || source === 'unknown') {
          console.error('🔴 Missing or unknown source in API response. Full response:', result)
          throw new Error('API response missing source field. This indicates a server error. Check server logs.')
        }
        
        if (source === 'mock') {
          // Show warning and do NOT navigate
          setError('Using mock clips. Check OPENAI_API_KEY / USE_MOCK_CLIPS and restart dev server.')
          setIsGenerating(false)
          return // Stop here - don't navigate
        }
        
        const generatedClips: Clip[] = result.clips
        console.log(`Generated ${generatedClips.length} clips successfully (source: ${source})`)
        console.log('🔵 [DEBUG] Generated clips:', generatedClips.length)
        console.log('🔵 [DEBUG] Clip situations:', Array.from(new Set(generatedClips.map(c => c.situation))))
        
        // Verify source is 'openai' - if not, something went wrong
        if (source !== 'openai') {
          console.warn(`⚠️ Unexpected source: ${source}, expected 'openai'`)
          setError(`Unexpected clip source: ${source}. Expected 'openai'. Check server logs.`)
          setIsGenerating(false)
          return
        }
        
        // Store clips in localStorage (for compatibility / quick practice)
        localStorage.setItem('userClips', JSON.stringify(generatedClips))
        localStorage.setItem('hasGeneratedClips', 'true')

        // Convert clips into stories and persist as single source of truth for stories
        const userStories = convertClipsToStories(generatedClips)
        console.log('🔵 [DEBUG] Converted stories:', userStories.length)
        console.log('🔵 [DEBUG] Story titles:', userStories.map(s => s.title))
        saveUserStories(userStories)
        
        // Debug: Check localStorage after save
        const storedStories = JSON.parse(localStorage.getItem('userStories') || '[]')
        console.log('🔵 [DEBUG] userStories in localStorage:', storedStories.length)

        console.log('✅ [ONBOARDING] Onboarding result saved:', {
          clipCount: generatedClips.length,
          clipIds: generatedClips.map(c => c.id),
          sampleTranscript: generatedClips[0]?.text?.substring(0, 50) + '...',
          situations: Array.from(new Set(generatedClips.map(c => c.situation))),
          storyCount: userStories.length,
          storyIds: userStories.map(s => s.id),
          storyTitles: userStories.map(s => s.title),
        })
        console.log('✅ [ONBOARDING] Stored clips in localStorage')
        console.log('✅ [ONBOARDING] Verification - userClips:', localStorage.getItem('userClips') ? 'present' : 'missing')
        console.log('✅ [ONBOARDING] Verification - hasGeneratedClips:', localStorage.getItem('hasGeneratedClips'))
        
        // Small delay to ensure localStorage is committed before navigation
        await new Promise(resolve => setTimeout(resolve, 50))
        
        // Route to practice
        console.log('Navigating to /practice')
        router.push('/practice')
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
            href="/onboarding/level-select"
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
                  router.push('/practice')
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
