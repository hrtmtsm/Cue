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
import { getOnboardingData } from '@/lib/onboardingStore'

const IS_DEV = process.env.NODE_ENV === 'development'
const DIAGNOSTIC_CLIP_COUNT = 5

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
  const hasSubmittedRef = useRef(false) // Prevent double-submission

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

        // Take first 5 clips
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

  // Validation: wordCount >= 4 OR charCount >= 12 (after trimming)
  const trimmedInput = userInput.trim()
  const wordCount = trimmedInput.split(/\s+/).filter(w => w.length > 0).length
  const charCount = trimmedInput.length
  const isValidInput = wordCount >= 4 || charCount >= 12

  const handleSubmit = async (skipped: boolean = false) => {
    // Prevent double-submission: check both state and ref
    if (!currentClip || isSubmitting || hasSubmittedRef.current) {
      if (IS_DEV && hasSubmittedRef.current) {
        console.warn('⚠️ [Diagnosis] Submission blocked: already submitted for this clip')
      }
      return
    }

    // If not skipped, validate input
    if (!skipped && (!trimmedInput || !isValidInput)) {
      return
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
        practiceSteps = extractPracticeSteps(
          alignmentResult.events || [],
          alignmentResult.refTokens || [],
          alignmentResult.userTokens || [],
          10, // maxSteps
          currentClip.transcript,
          undefined // patterns - will use default
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

      // Store diagnostic result after each clip is completed
      storeDiagnosticResult({
        clipId: currentClip.id,
        accuracyPercent,
        categories: diagnosticCategories,
      })

      if (IS_DEV) {
        console.log('💾 [Diagnosis] Stored diagnostic result:', {
          clipId: currentClip.id,
          accuracyPercent,
          categories: diagnosticCategories,
          practiceStepsCount: practiceSteps.length,
          progress: `${currentIndex + 1}/${clips.length}`,
        })
      }

      // Check if diagnostic is complete (5/5 clips)
      if (currentIndex + 1 === DIAGNOSTIC_CLIP_COUNT) {
        if (IS_DEV) {
          console.log('🎉 [Diagnosis] All clips completed (5/5), building summary...')
        }

        // Get onboarding CEFR level
        const onboardingData = getOnboardingData()
        const levelMap: Record<string, 'A1' | 'A2' | 'B1' | 'B2'> = {
          'A1': 'A1',
          'A2': 'A2',
          'B1': 'B1',
          'B2': 'B2',
        }
        const onboardingCefr = (onboardingData.level && levelMap[onboardingData.level]) || 'A2'

        // Build and store summary
        const summary = completeDiagnostic({ 
          expectedCount: DIAGNOSTIC_CLIP_COUNT, 
          onboardingCefr 
        })

        if (summary) {
          // Log the returned DiagnosticSummary
          console.log('📊 [Diagnosis] DiagnosticSummary:', {
            version: summary.version,
            createdAt: summary.createdAt,
            cefr: summary.cefr,
            avgAccuracyPercent: summary.avgAccuracyPercent.toFixed(1) + '%',
            categoryScore: Object.entries(summary.categoryScore).map(([cat, score]) => ({
              category: cat,
              score: score.toFixed(3),
            })),
            weaknessRank: summary.weaknessRank,
            topWeaknesses: summary.weaknessRank.slice(0, 3),
          })

          // Set flag to show clips ready modal on next page load
          localStorage.setItem('showClipsReadyOnce', '1')

          if (IS_DEV) {
            console.log('✅ [Diagnosis] Diagnostic complete, setting showClipsReadyOnce flag and navigating to /practice/select')
          }

          // Navigate to practice select
          router.push('/practice/select')
          return
        } else {
          console.error('❌ [Diagnosis] Failed to build diagnostic summary')
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
        <div className="text-gray-500">No diagnostic clips found. Please try again.</div>
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
          <h1 className="text-xl font-bold text-gray-900">Diagnostic Test</h1>
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
          id="userInput"
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          placeholder="Type what you heard..."
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none transition-colors"
          rows={4}
          disabled={isSubmitting}
        />
        {/* Validation helper text */}
        {trimmedInput && !isValidInput && !isSubmitting && (
          <p className="mt-2 text-sm text-gray-500 min-h-[1.25rem]">
            Type at least 4 words (or 12 characters).
          </p>
        )}
        {/* Spacer when helper text is hidden to prevent layout shift */}
        {(!trimmedInput || isValidInput || isSubmitting) && (
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
