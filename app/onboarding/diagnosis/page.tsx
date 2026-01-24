'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import AudioWaveLine from '@/components/AudioWaveLine'
import FullScreenLoader from '@/components/FullScreenLoader'
import { getAudioMetadata, generateAudio } from '@/lib/audioApi'
import { extractPracticeSteps, type FeedbackCategory } from '@/lib/practiceSteps'
import type { DiagnosticCategory } from '@/lib/diagnosticSummary'
import {
  storeDiagnosticResult,
  isDiagnosticComplete,
  completeDiagnostic,
} from '@/lib/diagnosticSummary'
import {
  storeQuickStartClipResult,
  completeQuickStart,
} from '@/lib/quickStartSummary'
import { getOnboardingData } from '@/lib/onboardingStore'

const IS_DEV = process.env.NODE_ENV === 'development'
const DIAGNOSTIC_CLIP_COUNT = 3 // Reduced from 5 to 3 for quick listening check
const MIN_INPUT_CHARS = 3

interface DiagnosticClip {
  id: string
  transcript: string
  difficultyCefr: 'A1' | 'A2' | 'B1' | 'B2'
  focusAreas: string[]
  situation?: string
  lengthSec?: number
  clipType: 'diagnostic'
}

export default function DiagnosisPage() {
  const router = useRouter()
  const [currentIndex, setCurrentIndex] = useState(0)
  const [clips, setClips] = useState<DiagnosticClip[]>([])
  const [currentClip, setCurrentClip] = useState<DiagnosticClip | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [userInput, setUserInput] = useState('')
  const [isPlaying, setIsPlaying] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [audioStatus, setAudioStatus] = useState<'ready' | 'needs_generation' | 'generating' | 'error'>('needs_generation')
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const hasSubmittedRef = useRef(false) // Prevent double-submission
  const [inputError, setInputError] = useState<string | null>(null)

  // Load diagnostic clips on mount
  useEffect(() => {
    const loadDiagnosticClips = async () => {
      try {
        // Try to load from localStorage first
        const stored = localStorage.getItem('diagnosticClips')
        let diagnosticClips: DiagnosticClip[] = []

        if (stored) {
          try {
            diagnosticClips = JSON.parse(stored)
            if (IS_DEV) {
              console.log('📂 [Diagnosis] Loaded diagnostic clips from localStorage:', {
                count: diagnosticClips.length,
                clipIds: diagnosticClips.map(c => c.id),
              })
            }
          } catch (error) {
            console.error('❌ [Diagnosis] Error parsing diagnosticClips:', error)
          }
        }

        // Fallback: fetch from API if localStorage is empty
        if (diagnosticClips.length === 0) {
          if (IS_DEV) {
            console.log('📡 [Diagnosis] Fetching diagnostic clips from API...')
          }
          
          const response = await fetch('/api/clips/diagnostic', {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
          })

          if (!response.ok) {
            throw new Error(`Failed to fetch diagnostic clips: ${response.status}`)
          }

          const result = await response.json()
          diagnosticClips = result.clips || []
          
          // Store in localStorage for future use
          localStorage.setItem('diagnosticClips', JSON.stringify(diagnosticClips))
          
          if (IS_DEV) {
            console.log('✅ [Diagnosis] Fetched and stored diagnostic clips:', {
              count: diagnosticClips.length,
              clipIds: diagnosticClips.map(c => c.id),
            })
          }
        }

        if (diagnosticClips.length === 0) {
          throw new Error('No diagnostic clips found')
        }

        // Take first 3 clips (quick listening check)
        const clipsToUse = diagnosticClips.slice(0, DIAGNOSTIC_CLIP_COUNT)
        setClips(clipsToUse)
        setCurrentClip(clipsToUse[0])
        setIsLoading(false)

        if (IS_DEV) {
          console.log('✅ [Diagnosis] Loaded clip:', {
            index: 0,
            clipId: clipsToUse[0].id,
            transcript: clipsToUse[0].transcript.substring(0, 50) + '...',
            progress: `1/${clipsToUse.length}`,
          })
        }
      } catch (error) {
        console.error('❌ [Diagnosis] Error loading diagnostic clips:', error)
        // TODO: Show error UI
        setIsLoading(false)
      }
    }

    loadDiagnosticClips()
  }, [])

  // Load audio for current clip
  useEffect(() => {
    if (!currentClip) return

    // Reset submission guard when clip changes
    hasSubmittedRef.current = false

    const loadAudio = async () => {
      setAudioStatus('needs_generation')
      
      try {
      // Check for existing audio
      let metadata: any
      try {
        metadata = await getAudioMetadata(currentClip.id, currentClip.transcript)
      } catch (err: any) {
        console.error('[Diagnosis] Error', {
          message: err?.message || 'Failed to get audio metadata',
          name: err?.name,
          stack: err?.stack,
          err,
        })
        setAudioStatus('error')
        return
      }
      
      if (metadata.audioStatus === 'ready' && metadata.audioUrl) {
        setAudioUrl(metadata.audioUrl)
        setAudioStatus('ready')
        
        if (IS_DEV) {
          console.log('✅ [Diagnosis] Audio ready for clip:', {
            clipId: currentClip.id,
            audioUrl: metadata.audioUrl.substring(0, 50) + '...',
          })
        }
      } else {
        // Generate audio
        setAudioStatus('generating')
        let result: any
        try {
          result = await generateAudio(currentClip.id, currentClip.transcript)
        } catch (err: any) {
          console.error('[Diagnosis] Error', {
            message: err?.message || 'Failed to generate audio',
            name: err?.name,
            stack: err?.stack,
            err,
          })
          setAudioStatus('error')
          return
        }
        
        if (result.success && result.audioUrl) {
          setAudioUrl(result.audioUrl)
          setAudioStatus('ready')
          
          if (IS_DEV) {
            console.log('✅ [Diagnosis] Generated audio for clip:', {
              clipId: currentClip.id,
            })
          }
        } else {
          console.error('[Diagnosis] Error', {
            message: result?.error || 'Audio generation failed',
            code: result?.code,
            details: result?.details,
          })
          setAudioStatus('error')
        }
      }
    } catch (error: any) {
      console.error('[Diagnosis] Error', {
        message: error?.message || 'Unexpected error loading audio',
        name: error?.name,
        stack: error?.stack,
        err: error,
      })
      setAudioStatus('error')
    }
    }

    loadAudio()
  }, [currentClip])

  // Handle audio playback
  useEffect(() => {
    if (!audioRef.current || !audioUrl) return

    audioRef.current.src = audioUrl
    audioRef.current.addEventListener('ended', () => setIsPlaying(false))

    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
      }
    }
  }, [audioUrl])

  const handlePlayPause = () => {
    if (!audioRef.current) return

    if (isPlaying) {
      audioRef.current.pause()
      setIsPlaying(false)
    } else {
      audioRef.current.play()
      setIsPlaying(true)
    }
  }

  // Validation: charCount >= MIN_INPUT_CHARS (after trimming)
  const trimmedInput = userInput.trim()
  const charCount = trimmedInput.length
  const isValidInput = charCount >= MIN_INPUT_CHARS

  const handleSubmit = async (skipped: boolean = false) => {
    // Prevent double-submission: check both state and ref
    if (!currentClip || isSubmitting || hasSubmittedRef.current) {
      if (IS_DEV && hasSubmittedRef.current) {
        console.warn('⚠️ [Diagnosis] Submission blocked: already submitted for this clip')
      }
      return
    }

    // If not skipped, validate input length
    if (!skipped) {
      if (!trimmedInput || !isValidInput) {
        // Show error and focus input
        setInputError(`Please type at least ${MIN_INPUT_CHARS} characters`)
        inputRef.current?.focus()
        return
      }
      // Clear error if input is valid
      setInputError(null)
    }

    // Mark as submitted immediately to prevent double-submission
    hasSubmittedRef.current = true
    setIsSubmitting(true)

    try {
      if (IS_DEV) {
        console.log('📤 [Diagnosis] Submitting answer for clip:', {
          index: currentIndex,
          clipId: currentClip.id,
          skipped,
          userInput: skipped ? '[skipped]' : userInput.substring(0, 50) + '...',
          progress: `${currentIndex + 1}/${clips.length}`,
        })
      }

      // Call check-answer API
      let response: Response
      try {
        response = await fetch('/api/check-answer', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            transcript: currentClip.transcript,
            userText: skipped ? '' : userInput,
            skipped: skipped || undefined,
            clipId: currentClip.id, // Add clipId for variant-specific feedback
          }),
        })
      } catch (err: any) {
        console.error('[Diagnosis] Error', {
          message: err?.message,
          name: err?.name,
          stack: err?.stack,
          err,
        })
        throw err
      }

      if (!response.ok) {
        let errorText = ''
        try {
          errorText = await response.text()
        } catch (e) {
          // Ignore text parsing errors
        }
        console.error('[Diagnosis] Error', {
          message: `Check answer failed: ${response.status}`,
          name: 'ResponseError',
          status: response.status,
          statusText: response.statusText,
          errorText,
          err: response,
        })
        throw new Error(`Check answer failed: ${response.status} ${response.statusText}`)
      }

      let alignmentResult: any
      try {
        alignmentResult = await response.json()
      } catch (err: any) {
        console.error('[Diagnosis] Error', {
          message: err?.message || 'Failed to parse response JSON',
          name: err?.name,
          stack: err?.stack,
          err,
        })
        throw err
      }
      const accuracyPercent = skipped ? 0 : (alignmentResult.accuracyPercent || 0)

      if (IS_DEV) {
        console.log('✅ [Diagnosis] Answer checked:', {
          clipId: currentClip.id,
          skipped,
          accuracyPercent,
          alignmentEvents: skipped ? 0 : alignmentResult.events?.length || 0,
        })
      }

      // Generate practiceSteps from alignment events (only if not skipped)
      let practiceSteps: any[] = []
      let errorCategories: FeedbackCategory[] = []

      if (!skipped) {
        // Load patterns from API (with variants) for pattern matching
        let patternsForMatching: any[] | undefined = undefined
        try {
          const patternsResponse = await fetch('/api/listening-patterns')
          if (patternsResponse.ok) {
            const patternsData = await patternsResponse.json()
            if (Array.isArray(patternsData) && patternsData.length > 0) {
              patternsForMatching = patternsData
              if (IS_DEV) {
                console.log('✅ [Diagnosis] Loaded patterns for matching:', {
                  patternsCount: patternsForMatching.length,
                  gonnaPattern: patternsForMatching.find((p: any) => p.id === 'gonna' || (p as any).patternKey === 'gonna'),
                })
              }
            }
          }
        } catch (err) {
          console.warn('⚠️ [Diagnosis] Failed to load patterns, will use fallback:', err)
        }
        
        practiceSteps = extractPracticeSteps(
          alignmentResult.events || [],
          alignmentResult.refTokens || [],
          alignmentResult.userTokens || [],
          10, // maxSteps
          currentClip.transcript,
          patternsForMatching, // patterns with variants from API
          alignmentResult.patternFeedback // variant-specific feedback from clip_pattern_spans
        )

        // Extract categories from error steps only (missing/substitution)
        errorCategories = practiceSteps
          .filter(step => step.type === 'missing' || step.type === 'substitution')
          .map(step => step.category)
      }

      // Map FeedbackCategory to DiagnosticCategory
      const mapToDiagnosticCategory = (category: FeedbackCategory): DiagnosticCategory => {
        switch (category) {
          case 'weak_form':
            return 'weak_forms'
          case 'linking':
            return 'linking'
          case 'elision':
            return 'reductions'
          case 'contraction':
            return 'reductions'
          case 'spelling':
            return 'spelling'
          case 'speed_chunking':
            return 'speed'
          case 'similar_words':
            return 'idioms'
          case 'missed':
          default:
            return 'missed'
        }
      }

      // Map and deduplicate categories (empty array if skipped)
      const diagnosticCategories: DiagnosticCategory[] = skipped
        ? []
        : Array.from(new Set(errorCategories.map(mapToDiagnosticCategory)))

      // Store diagnostic result after each clip is completed (for analytics only)
      storeDiagnosticResult({
        clipId: currentClip.id,
        accuracyPercent,
        categories: diagnosticCategories,
      })

      // Store quick start clip result
      storeQuickStartClipResult({
        clipId: currentClip.id,
        skipped: skipped || false,
        userInputLength: trimmedInput.length,
        accuracyPercent,
      })

      if (IS_DEV) {
        console.log('💾 [QuickStart] Stored clip result:', {
          clipId: currentClip.id,
          skipped,
          userInputLength: trimmedInput.length,
          accuracyPercent,
          progress: `${currentIndex + 1}/${clips.length}`,
        })
      }

      // Check if Quick Start is complete (3/3 clips)
      if (currentIndex + 1 === DIAGNOSTIC_CLIP_COUNT) {
        if (IS_DEV) {
          console.log('🎉 [QuickStart] All clips completed (3/3), building summary...')
        }

        // Build and store quick start summary
        const quickStartSummary = completeQuickStart()

        if (quickStartSummary) {
          // Log the quick start summary
          console.log('📊 [QuickStart] Summary:', {
            version: quickStartSummary.version,
            createdAt: new Date(quickStartSummary.createdAt).toISOString(),
            missedRate: (quickStartSummary.missedRate * 100).toFixed(1) + '%',
            attemptAccuracy: quickStartSummary.attemptAccuracy.toFixed(1) + '%',
            startingDifficulty: quickStartSummary.startingDifficulty,
          })

          // Set flag to show clips ready modal on next page load
          localStorage.setItem('showClipsReadyOnce', '1')

          if (IS_DEV) {
            console.log('✅ [QuickStart] Complete, setting showClipsReadyOnce flag and navigating to /onboarding/situations')
          }

          // Navigate to situations onboarding page
          router.push('/onboarding/situations')
          return
        } else {
          console.error('❌ [QuickStart] Failed to build summary')
          setIsSubmitting(false)
          hasSubmittedRef.current = false
          return
        }
      }

      // Move to next clip (only one clip advances per answer)
      const nextIndex = currentIndex + 1
      if (nextIndex < clips.length) {
        // Reset submission guard for next clip
        hasSubmittedRef.current = false
        
        setCurrentIndex(nextIndex)
        setCurrentClip(clips[nextIndex])
        setUserInput('')
        setInputError(null)
        setIsSubmitting(false)

        if (IS_DEV) {
          console.log('➡️ [Diagnosis] Moving to next clip:', {
            index: nextIndex,
            clipId: clips[nextIndex].id,
            progress: `${nextIndex + 1}/${clips.length}`,
          })
        }
      } else {
        // This shouldn't happen if we checked completion above, but handle it
        if (IS_DEV) {
          console.warn('⚠️ [Diagnosis] No more clips but diagnostic not complete')
        }
        setIsSubmitting(false)
        hasSubmittedRef.current = false
      }
    } catch (error: any) {
      console.error('[Diagnosis] Error', {
        message: error?.message,
        name: error?.name,
        stack: error?.stack,
        err: error,
      })
      setIsSubmitting(false)
      hasSubmittedRef.current = false // Reset on error so user can retry
      // TODO: Show error UI
    }
  }

  if (isLoading) {
    return (
      <FullScreenLoader open={true} />
    )
  }

  if (!currentClip) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-6">
        <div className="text-gray-500">No clips found. Please try again.</div>
      </main>
    )
  }

  const progressText = `${currentIndex + 1}/${clips.length}`
  const isAudioReady = audioStatus === 'ready' && audioUrl

  return (
    <main className="flex min-h-screen flex-col px-6 py-6">
      {/* Progress indicator */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-xl font-bold text-gray-900">Quick Start</h1>
          <span className="text-sm text-gray-600">{progressText}</span>
      </div>
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-600 transition-all duration-300"
            style={{ width: `${((currentIndex + 1) / clips.length) * 100}%` }}
          />
        </div>
        </div>

      {/* Audio player */}
      <div className="mb-6">
        <div className="flex items-center justify-center mb-4">
              <button
            onClick={handlePlayPause}
            disabled={!isAudioReady}
            className={`w-16 h-16 rounded-full flex items-center justify-center ${
              isAudioReady
                ? 'bg-blue-600 text-white active:bg-blue-700'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            } transition-colors`}
          >
            {isPlaying ? (
              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
            ) : (
              <svg className="w-8 h-8 ml-1" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
                    </svg>
                  )}
              </button>
        </div>

        {audioStatus === 'generating' && (
          <div className="text-center text-sm text-gray-600 mb-4">
            Preparing audio...
          </div>
        )}

        {audioStatus === 'error' && (
          <div className="text-center text-sm text-red-600 mb-4">
            Audio error. Please try again.
          </div>
        )}

        {isAudioReady && audioUrl && (
          <audio ref={audioRef} className="hidden" />
        )}
      </div>

      {/* Input field */}
      <div className="mb-4">
        <label htmlFor="userInput" className="block text-sm font-medium text-gray-700 mb-2">
          Type what you heard
        </label>
        <textarea
          ref={inputRef}
          id="userInput"
          value={userInput}
          onChange={(e) => {
            setUserInput(e.target.value)
            // Clear error as soon as user starts typing
            if (inputError) {
              setInputError(null)
            }
          }}
          onKeyDown={(e) => {
            // Handle Enter-submit: Enter (without Shift) submits via handleSubmit
            // Shift+Enter creates new line
            if (e.key === 'Enter' && !e.shiftKey && !isSubmitting && isAudioReady) {
              e.preventDefault()
              handleSubmit(false)
            }
          }}
          placeholder="Type what you heard..."
          className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none transition-colors ${
            inputError ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : 'border-gray-300'
          }`}
          rows={4}
          disabled={isSubmitting}
        />
        {/* Validation error text */}
        {inputError && (
          <p className="mt-2 text-sm text-red-600 min-h-[1.25rem]">
            {inputError}
          </p>
        )}
        {/* Spacer when error text is hidden to prevent layout shift */}
        {!inputError && (
          <p className="mt-2 text-sm text-transparent min-h-[1.25rem]" aria-hidden="true">
            &nbsp;
          </p>
        )}
      </div>

      {/* Action buttons */}
      <div className="space-y-3 pt-2 pb-6">
        {/* Submit button */}
        <button
          onClick={() => handleSubmit(false)}
          disabled={!isValidInput || isSubmitting || !isAudioReady}
          className={`w-full py-4 px-6 rounded-xl font-semibold text-lg transition-colors ${
            isValidInput && !isSubmitting && isAudioReady
              ? 'bg-blue-600 text-white active:bg-blue-700 shadow-lg'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          {isSubmitting ? 'Checking...' : 'Submit'}
        </button>

        {/* Escape hatch button */}
        <button
          onClick={() => handleSubmit(true)}
          disabled={isSubmitting || !isAudioReady}
          className={`w-full py-3 px-6 rounded-xl font-medium text-base transition-colors border-2 ${
            !isSubmitting && isAudioReady
              ? 'border-gray-300 text-gray-700 hover:bg-gray-50 active:bg-gray-100'
              : 'border-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          I couldn't catch it
        </button>
      </div>
    </main>
  )
}
