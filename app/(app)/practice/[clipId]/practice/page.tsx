'use client'

/**
 * Practice Steps Page - Duolingo-like step-by-step phrase practice
 * 
 * TESTING CHECKLIST:
 * 1. Start with a clip in Review screen → Click "Continue"
 * 2. Verify: Step progress bar starts at "Step 1 / N" (0% complete)
 * 3. Verify: Each step shows:
 *    - "Compared to what you heard" with expected vs actual
 *    - Phrase card with meaning and "how it sounds"
 *    - Audio controls (Play / Slow / Replay this part)
 * 4. Verify: Phrases are 2-5 words, deduplicated (no "i heard they" + "i heard they have")
 * 5. Verify: Example phrases come from actual sentence (not hardcoded)
 * 6. Verify: Progress bar updates correctly (Step X/N, X/N * 100%)
 * 7. Verify: Navigation works (Back / Next / Done)
 * 8. Verify: After last step, "Done" navigates to next clip (not back to Review)
 * 9. Verify: Step data comes from alignment events (top 3-5 mistakes)
 * 10. Verify: Meaning and "how it sounds" are context-specific (no jargon)
 */

import { useEffect, useMemo, useState, useRef } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import ClipTopBar from '@/components/ClipTopBar'
import PhraseCard from '@/components/PhraseCard'
import { extractPracticeSteps, type PracticeStep, type FeedbackCategory } from '@/lib/practiceSteps'
import { useClipLessonProgress } from '@/lib/clipLessonProgress'
import { useListeningPatterns } from '@/lib/useListeningPatterns'

export default function PracticeChunkPage() {
  const router = useRouter()
  const params = useParams<{ clipId: string }>()
  const searchParams = useSearchParams()

  const clipId = params?.clipId
  const returnTo = searchParams.get('returnTo')
  const phrasesParam = searchParams.get('phrases') // JSON array of phrases (fallback)
  
  // Internal step for navigating through practice items (0-based)
  const [step, setStep] = useState(0)
  const [alignmentData, setAlignmentData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  
  // Fetch listening patterns (async, but hook handles fallback)
  const { patterns } = useListeningPatterns()
  
  // Shared clip lesson progress
  const { completeStep, setDetailStep } = useClipLessonProgress()
  const hasEnteredScreenRef = useRef(false) // Track if we've marked this screen entry
  
  // Mark screen entry when practice page loads
  useEffect(() => {
    if (!hasEnteredScreenRef.current) {
      hasEnteredScreenRef.current = true
      // Complete 'review' and 'continue' steps when Practice page loads (screen entry)
      // Progress only advances on screen entry, not button clicks
      completeStep('review')
      completeStep('continue')
    }
  }, [completeStep])
  
  const handleBackToFlow = () => {
    // Go back to Review (step 3) in the clip flow
    if (returnTo) {
      router.push(returnTo)
    } else {
      router.back()
    }
  }

  // Extract practice steps from alignment data
  // NOTE: extractPracticeSteps is synchronous - patterns are passed as optional param
  // If patterns are still loading, undefined is passed and function uses local fallback
  const practiceSteps = useMemo<PracticeStep[]>(() => {
    if (alignmentData?.events && alignmentData?.refTokens && alignmentData?.userTokens) {
      return extractPracticeSteps(
        alignmentData.events,
        alignmentData.refTokens,
        alignmentData.userTokens,
        5, // Max 5 steps
        alignmentData.transcript, // Pass full transcript for context
        patterns // Pass patterns from Supabase (or undefined for local fallback)
      )
    }
    
    // Fallback: use phrases from query param if available
    if (phrasesParam) {
      try {
        const phrases = JSON.parse(decodeURIComponent(phrasesParam))
        const fallbackTranscript = phrases.join(' ') || 'Practice these phrases.'
        return phrases.map((phrase: string, idx: number) => {
          const category: FeedbackCategory = 'missed'
          const heardAs = phrase.toLowerCase().replace(/\s+/g, '')
          return {
            id: `fallback-${idx}`,
            target: phrase,
            expectedSpan: phrase, // Legacy compatibility
            actualSpan: undefined,
            refStart: 0,
            refEnd: phrase.split(' ').length,
            type: 'missing' as const,
            category,
            meaningInContext: 'Practice this phrase from the sentence.',
            meaning: 'Practice this phrase from the sentence.', // Legacy compatibility
            soundRule: 'Usually spoken quickly as one smooth chunk.',
            howItSounds: 'Usually spoken quickly as one smooth chunk.', // Legacy compatibility
            inSentence: {
              original: fallbackTranscript,
              highlighted: phrase,
              heardAs,
            },
            extraExample: {
              sentence: `Another example: "${phrase}".`,
            },
          }
        })
      } catch (e) {
        console.error('Failed to parse phrases param:', e)
      }
    }
    
    return []
  }, [alignmentData, phrasesParam])

  const totalSteps = practiceSteps.length
  const current = practiceSteps[Math.min(step, totalSteps - 1)] || null

  // Fetch alignment data from review
  useEffect(() => {
    const fetchAlignmentData = async () => {
      if (!clipId) {
        setLoading(false)
        return
      }
      
      // Try to get alignment data from sessionStorage (stored by Review page)
      if (typeof window !== 'undefined') {
        const stored = sessionStorage.getItem(`alignment_${clipId}`)
        if (stored) {
          try {
            const data = JSON.parse(stored)
            setAlignmentData(data)
            setLoading(false)
            return
          } catch (e) {
            console.error('Failed to parse alignment data:', e)
          }
        }
      }
      
      // If not found, we'll use fallback phrases from query param
      setLoading(false)
    }
    
    fetchAlignmentData()
  }, [clipId])

  const canGoBack = step > 0
  const canGoNext = step < totalSteps - 1

  const analytics = useMemo(() => {
    return {
      next_chunk: () => console.log('next_chunk', { clipId, step, stepId: current?.id, phrase: current?.expectedSpan }),
      prev_chunk: () => console.log('prev_chunk', { clipId, step, stepId: current?.id, phrase: current?.expectedSpan }),
      done_practice: () => console.log('done_practice', { clipId }),
    }
  }, [clipId, step, current])

  const handleNext = () => {
    if (!canGoNext) return
    analytics.next_chunk()
    
    // Complete current detail step - this is OK because we're navigating to next practice item
    // Practice detail steps are sub-steps within the practice screen
    if (totalSteps > 0) {
      completeStep('detail', step)
    }
    
    const nextStep = step + 1
    setStep(nextStep)
    
    // Update shared progress to reflect new detail step
    if (nextStep < totalSteps) {
      setDetailStep(nextStep, totalSteps)
    }
  }

  const handleBack = () => {
    if (!canGoBack) return
    analytics.prev_chunk()
    
    const prevStep = step - 1
    setStep(prevStep)
    
    // Update shared progress to reflect previous detail step
    if (prevStep >= 0) {
      setDetailStep(prevStep, totalSteps)
    }
  }

  const handleDone = () => {
    analytics.done_practice()
    
    // Complete final detail step if not already completed
    // This is OK because practice detail steps are sub-steps within the practice screen
    if (totalSteps > 0 && step < totalSteps) {
      completeStep('detail', step)
    }
    
    // After completing practice, navigate to next clip or session summary
    // Don't complete steps here - progress advances on screen entry only
    if (returnTo && !returnTo.includes('/practice/review')) {
      router.push(returnTo)
    } else {
      // Navigate to next clip or session summary
      router.push('/practice/select')
    }
  }
  
  // Update shared progress when step changes or totalSteps is known
  useEffect(() => {
    if (totalSteps > 0 && step >= 0) {
      setDetailStep(step, totalSteps)
    }
  }, [step, totalSteps, setDetailStep])

  // Keyboard support:
  // - Enter -> Next (or Done on last step)
  // Back navigation uses top left button (Shift+Enter removed since no back button)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.shiftKey) return
      e.preventDefault()
      if (canGoNext) handleNext()
      else handleDone()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [canGoNext, handleDone, handleNext])

  return (
    <main className="flex min-h-screen flex-col">
      {/* Top Bar - Progress bar at very top (unified clip flow, Step 4) */}
      {/* Progress now managed by shared ClipLessonProgress context */}
      <ClipTopBar onBack={handleBackToFlow} />

      {/* Content with padding */}
      <div className="flex-1 px-6 py-6 pb-6">
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-gray-500">Loading practice steps...</div>
          </div>
        ) : !current ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-gray-500">No practice steps available.</div>
          </div>
        ) : (
          <>
          <div className="flex-1 space-y-4">
            {/* Phrase info card (includes comparison, category badge, and inline play buttons) */}
            <PhraseCard feedbackItem={current} />
          </div>
          </>
        )}

        {/* Bottom actions - single Continue button */}
        <div className="w-full bg-white border-t border-gray-200 px-6 py-4 mt-6">
          <div className="w-full">
            {canGoNext ? (
              <button
                onClick={handleNext}
                className="w-full py-4 px-6 rounded-xl font-semibold text-lg bg-blue-600 text-white active:bg-blue-700 shadow-lg transition-colors"
              >
                Continue
              </button>
            ) : (
              <button
                onClick={handleDone}
                className="w-full py-4 px-6 rounded-xl font-semibold text-lg bg-blue-600 text-white active:bg-blue-700 shadow-lg transition-colors"
              >
                Continue
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}


