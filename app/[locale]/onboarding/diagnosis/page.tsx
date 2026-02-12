'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { Play, Pause } from '@phosphor-icons/react'
import AudioWaveLine from '@/components/AudioWaveLine'
import FullScreenLoader from '@/components/FullScreenLoader'
import VoiceRecorder from '@/components/VoiceRecorder'
import MicPermissionModal from '@/components/MicPermissionModal'
import ClipProgressBar from '@/components/ClipProgressBar'
import ClipTopBar from '@/components/ClipTopBar'
import { Heading } from '@/components/ui/Typography'
import { getAudioMetadata } from '@/lib/audioApi'
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
  const locale = useLocale()
  const t = useTranslations('practice')
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
  const [showMicPermissionModal, setShowMicPermissionModal] = useState(false)
  const [speechError, setSpeechError] = useState<string | null>(null)
  const [audioLevels, setAudioLevels] = useState<number[]>(new Array(40).fill(0))
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const updateIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Polling function for async audio status checks
  const startPolling = (clipId: string, transcript: string) => {
    // Clear any existing polling
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current)
    }

    pollingIntervalRef.current = setInterval(async () => {
      try {
        const metadata = await getAudioMetadata(clipId, transcript, 'clean_normal')
        
        if (metadata.audioStatus === 'ready' && metadata.audioUrl) {
          // Stop polling and set audio
          clearInterval(pollingIntervalRef.current!)
          pollingIntervalRef.current = null
          
          setAudioUrl(metadata.audioUrl)
          setAudioStatus('ready')
          
          if (IS_DEV) {
            console.log('✅ [Diagnosis] Audio ready after polling:', clipId)
          }
        } else if (metadata.audioStatus === 'error') {
          clearInterval(pollingIntervalRef.current!)
          pollingIntervalRef.current = null
          setAudioStatus('error')
        }
        // Keep polling if status is 'generating'
      } catch (error) {
        console.error('❌ [Diagnosis] Polling error:', error)
      }
    }, 2000) // Poll every 2 seconds
  }

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
        // Check for existing audio (diagnostic clips should have pre-generated shared audio)
        const metadata = await getAudioMetadata(currentClip.id, currentClip.transcript, 'clean_normal')
        
        if (metadata.audioStatus === 'ready' && metadata.audioUrl) {
          setAudioUrl(metadata.audioUrl)
          setAudioStatus('ready')
          
          if (IS_DEV) {
            console.log('✅ [Diagnosis] Audio ready for clip:', currentClip.id)
          }
        } else if (metadata.audioStatus === 'generating') {
          // Already generating - start polling
          setAudioStatus('generating')
          startPolling(currentClip.id, currentClip.transcript)
          
          if (IS_DEV) {
            console.log('⏳ [Diagnosis] Audio generating, started polling:', currentClip.id)
          }
        } else {
          // Diagnostic clips should have pre-generated audio
          // If not found, log warning but don't attempt generation
          console.warn('⚠️ [Diagnosis] Audio not found for diagnostic clip:', currentClip.id)
          setAudioStatus('error')
          
          if (IS_DEV) {
            console.log('⚠️ [Diagnosis] Diagnostic clips should have pre-generated audio. Run scripts/pregenerateDiagnosticAudio.ts to generate audio.')
          }
        }
      } catch (error: any) {
        console.error('❌ [Diagnosis] Error loading audio:', error)
        setAudioStatus('error')
      }
    }

    loadAudio()
    
    // Cleanup polling on unmount or clip change
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
        pollingIntervalRef.current = null
      }
    }
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
          router.push(`/${locale}/onboarding/situations`)
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
    <main className="flex min-h-screen flex-col">
      <ClipTopBar 
        onBack={() => router.push(`/${locale}/onboarding/welcome`)}
        overridePercent={((currentIndex + 1) / clips.length) * 100}
      />
      
      {/* Content with padding */}
      <div className="flex-1 py-6">
        <div className="w-full max-w-[640px] mx-auto px-6 space-y-6">

      {/* Heading */}
      <div className="text-center">
        <Heading as="h1" size="page" className="text-gray-900">
          {t('enterWhatYouHear')}
        </Heading>
      </div>

      {/* Audio player */}
      <div className="relative flex flex-col items-center justify-center py-4">
        <div className="flex items-center justify-center gap-4">
          <div
            className={`rounded-2xl ${isPlaying ? 'animate-breathing' : ''}`}
            style={{ width: '72px', height: '72px' }}
          >
            <button
              onClick={handlePlayPause}
              disabled={!isAudioReady}
              className={`w-full h-full rounded-2xl flex items-center justify-center transition-all ${
                isAudioReady
                  ? 'bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.98] shadow-sm'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              title={isAudioReady ? 'Play audio' : 'Preparing audio...'}
            >
              {isPlaying ? (
                <Pause weight="fill" size={28} />
              ) : (
                <Play weight="fill" size={28} />
              )}
            </button>
          </div>
        </div>

        {audioStatus === 'generating' && (
          <div className="mt-2 text-center text-sm text-gray-600">
            Preparing audio...
          </div>
        )}

        {audioStatus === 'error' && (
          <div className="mt-2 text-center text-sm text-red-600">
            Audio error. Please try again.
          </div>
        )}

        {isAudioReady && audioUrl && (
          <audio ref={audioRef} className="hidden" />
        )}
      </div>

      {/* Input field with voice recorder */}
      <div className="mb-4">
        <label htmlFor="userInput" className="block text-sm font-medium text-gray-700 mb-2">
          {t('typeWhatYouHeard').replace('...', '')}
        </label>
        
        <div className="relative">
        <textarea
          ref={inputRef}
          id="userInput"
          value={userInput}
          onChange={(e) => {
            setUserInput(e.target.value)
            if (inputError) {
              setInputError(null)
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !isSubmitting && isAudioReady) {
              e.preventDefault()
              handleSubmit(false)
            }
          }}
          placeholder={t('typeWhatYouHeard')}
          className={`w-full min-h-[160px] md:min-h-[180px] pt-3 pb-5 px-4 pr-14 border-2 rounded-[18px] resize-none focus:outline-none text-lg md:text-xl leading-relaxed bg-white placeholder:text-gray-400 transition-all ${
            inputError 
              ? 'border-red-300 focus:border-red-500 focus:shadow-[0_0_0_3px_rgba(239,68,68,0.1)]' 
              : 'border-gray-200 focus:border-blue-600 focus:shadow-[0_0_0_3px_rgba(37,99,235,0.1)]'
          }`}
          disabled={isSubmitting}
        />
          
          {/* Voice recorder button (bottom-right corner) */}
          <VoiceRecorder
            onTranscript={(transcript) => {
              setUserInput(transcript)
              if (inputError) {
                setInputError(null)
              }
            }}
            onPermissionDenied={() => setShowMicPermissionModal(true)}
            onError={(error) => setSpeechError(error)}
          >
            {({ state, startRecording, stopRecording, stream }) => {
              // Audio analysis for real-time waveform
              useEffect(() => {
                if (state === 'recording' && stream) {
                  // Create audio context and analyser
                  const audioContext = new AudioContext()
                  const analyser = audioContext.createAnalyser()
                  const source = audioContext.createMediaStreamSource(stream)
                  
                  source.connect(analyser)
                  analyser.fftSize = 128
                  analyser.smoothingTimeConstant = 0.5
                  
                  audioContextRef.current = audioContext
                  analyserRef.current = analyser
                  
                  const dataArray = new Uint8Array(analyser.frequencyBinCount)
                  
                  // Update every 100ms
                  const interval = setInterval(() => {
                    analyser.getByteFrequencyData(dataArray)
                    
                    // Focus on speech frequencies (300-3400 Hz range)
                    const speechStart = Math.floor(dataArray.length * 0.1)
                    const speechEnd = Math.floor(dataArray.length * 0.5)
                    const speechData = dataArray.slice(speechStart, speechEnd)
                    const average = speechData.reduce((sum, val) => sum + val, 0) / speechData.length
                    
                    // Amplify by 2x for natural dynamic range
                    let normalizedLevel = Math.min(1, (average / 255) * 2)
                    
                    // Scroll the waveform: remove leftmost, add rightmost
                    setAudioLevels(prev => {
                      const newLevels = [...prev]
                      newLevels.shift()
                      newLevels.push(normalizedLevel)
                      return newLevels
                    })
                  }, 100)
                  
                  updateIntervalRef.current = interval
                } else {
                  // Stop analysis and reset levels
                  if (updateIntervalRef.current) {
                    clearInterval(updateIntervalRef.current)
                    updateIntervalRef.current = null
                  }
                  if (audioContextRef.current) {
                    audioContextRef.current.close()
                    audioContextRef.current = null
                  }
                  setAudioLevels(new Array(40).fill(0))
                }
              }, [state, stream])
              
              const handleMicClick = async () => {
                if (state === 'recording') {
                  stopRecording()
                } else if (state === 'idle' || state === 'error') {
                  await startRecording()
                }
              }
              
              return (
                <div className="absolute bottom-4 right-4 left-4 flex items-center justify-end gap-2 pointer-events-none">
                  {/* Waveform timeline - shows recording history */}
                  {state === 'recording' && (
                    <div className="flex items-center gap-px h-10 py-1 px-2 bg-gray-50 rounded-lg pointer-events-none">
                      {audioLevels.map((level, i) => (
                        <div
                          key={i}
                          className="w-1 rounded-sm transition-all duration-100"
                          style={{
                            height: `${Math.min(50, Math.max(8, level * 100))}%`,
                            backgroundColor: level > 0.1 ? '#3b82f6' : '#d1d5db',
                          }}
                        />
                      ))}
                    </div>
                  )}
                  
                  {/* Mic/Stop button */}
                  <button
                    type="button"
                    className={`p-3 rounded-full border transition-all active:scale-95 z-10 pointer-events-auto ${
                      state === 'recording'
                        ? 'bg-white border-blue-600'
                        : 'bg-white border-blue-600'
                    }`}
                    onClick={handleMicClick}
                    disabled={state === 'transcribing' || isSubmitting}
                    aria-label={
                      state === 'recording' 
                        ? 'Tap to stop recording' 
                        : state === 'transcribing'
                        ? 'Transcribing...'
                        : 'Tap to record'
                    }
                  >
                    {state === 'recording' ? (
                      // Stop icon (square)
                      <svg className="w-6 h-6 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
                        <rect x="6" y="6" width="12" height="12" rx="2" />
                      </svg>
                    ) : state === 'transcribing' ? (
                      // Spinner
                      <svg
                        className="animate-spin h-6 w-6 text-blue-600"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                    ) : (
                      // Mic icon
                      <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                        />
                      </svg>
                    )}
                  </button>
                </div>
              )
            }}
          </VoiceRecorder>
        </div>
        
        {/* Error messages */}
        {inputError && (
          <p className="mt-2 text-sm text-red-600">
            {inputError}
          </p>
        )}
        {speechError && !inputError && (
          <p className="mt-2 text-sm text-red-600">
            {speechError}
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
          {isSubmitting ? t('checkingAudio') : t('submit')}
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
          {t('couldntCatchIt')}
        </button>
      </div>

      {/* Mic permission modal */}
      <MicPermissionModal
        isOpen={showMicPermissionModal}
        onClose={() => setShowMicPermissionModal(false)}
      />

        </div>
      </div>
    </main>
  )
}
