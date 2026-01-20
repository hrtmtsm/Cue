'use client'

/**
 * Review Page (Step 1: Summary-only)
 * 
 * DISPLAYS:
 * - Accuracy % + progress bar (Figma Make style: % on left, "accuracy" label on right)
 * - ONE coaching insight with example phrase from THIS clip
 * - Collapsed "See details" section (optional, default hidden)
 * - ONE primary CTA: "Continue" → Practice flow
 * 
 * HIDDEN/REMOVED:
 * - Full sentence diff block
 * - "Why this was hard" accordions
 * - Word tap modals/sheets
 * - "confidence" labels
 * - Multiple CTAs
 * 
 * DATA FLOW:
 * - Receives alignment tokens/events from /api/check-answer
 * - Uses pickTopIssue() to determine ONE insight category
 * - Extracts example phrase (2-5 words) from actual sentence
 * - Stores alignment data in sessionStorage for Practice page
 * - Navigates to /practice/[clipId]/practice with phrases as fallback
 */

import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense, useState, useEffect, useRef, useMemo } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { ClipSession, Phrase } from '@/lib/sessionTypes'
import { getStoryByIdClient } from '@/lib/storyClient'
import { pickTopIssue } from '@/lib/reviewSummary'
import WordPopover from '@/components/WordPopover'
import ClipTopBar from '@/components/ClipTopBar'
import { useClipLessonProgress } from '@/lib/clipLessonProgress'
import { extractPracticeSteps, type FeedbackCategory } from '@/lib/practiceSteps'
import type { DiagnosticCategory, CefrLevel } from '@/lib/diagnosticSummary'
import {
  storeDiagnosticResult,
  isDiagnosticComplete,
  completeDiagnostic,
} from '@/lib/diagnosticSummary'
import { getOnboardingData } from '@/lib/onboardingStore'

// Mock session data - in production this would come from API/state
const mockSessions: Record<string, ClipSession> = {
  '1': {
    id: 'session-1',
    currentIndex: 0,
    phrases: [
      {
        id: 'p1',
        text: "Can I get a large coffee with oat milk, please?",
        audioUrl: '/audio/clip1.mp3',
        durationMs: 3000,
      },
      {
        id: 'p2',
        text: "Tell me about your previous work experience and why you're interested in this role.",
        audioUrl: '/audio/clip2.mp3',
        durationMs: 5000,
      },
    ],
  },
}

function ReviewPageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const clipId = searchParams.get('clip')
  const storyId = searchParams.get('storyId')
  const storyClipId = searchParams.get('clipId') // Clip ID within a story
  const sessionId = searchParams.get('session')
  let phraseIndex = parseInt(searchParams.get('index') || '0', 10)
  const userText = searchParams.get('userText') || ''
  
  // Check if we're in diagnostic mode (clipId starts with 'diagnostic-')
  const isDiagnosticMode = clipId?.startsWith('diagnostic-') || storyClipId?.startsWith('diagnostic-')
  const diagnosticClipId = clipId || storyClipId || ''

  // Debug logging
  console.log('🔍 [ReviewPage] Route params:', {
    clipId,
    storyId,
    storyClipId,
    sessionId,
    phraseIndex,
    hasUserText: !!userText,
    pathname: typeof window !== 'undefined' ? window.location.pathname : 'SSR',
    search: typeof window !== 'undefined' ? window.location.search : 'SSR',
  })
  
  // State for word-level diff
  const [diffResult, setDiffResult] = useState<any>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(true)
  
  // State for word popover
  const [popoverToken, setPopoverToken] = useState<any>(null)
  const [popoverOpen, setPopoverOpen] = useState(false)
  // Insight state for tapped error events
  const [selectedInsight, setSelectedInsight] = useState<any>(null)
  const [loadingInsight, setLoadingInsight] = useState(false)
  
  // State for audio playback
  const [isPlaying, setIsPlaying] = useState(false)
  const [isSlow, setIsSlow] = useState(false)
  const [isLooping, setIsLooping] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  // Redirect target to avoid SSR/client markup mismatches
  const [redirectTo, setRedirectTo] = useState<string | null>(null)
  // State for showing/hiding details section
  const [showDetails, setShowDetails] = useState(false)
  
  // Shared clip lesson progress
  const { completeStep, initialize } = useClipLessonProgress()
  const hasEnteredScreenRef = useRef(false) // Track if we've marked this screen entry
  
  // Initialize progress with details count when diffResult is available
  // NOTE: This should only update details count, not re-initialize if progress already exists
  const DEBUG_PROGRESS = process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_DEBUG_PROGRESS !== 'false'
  
  useEffect(() => {
    if (diffResult && Array.isArray(diffResult.events)) {
      const detailsCount = diffResult.events.length || 0
      // Cap at 5 practice steps max
      const cappedCount = Math.min(detailsCount, 5)
      
      if (DEBUG_PROGRESS && typeof window !== 'undefined') {
        console.log('🎯 [PROGRESS DEBUG] Review page: Calling initialize with details count:', {
          source: 'Review page useEffect',
          detailsCount: cappedCount,
          hasEvents: diffResult.events.length > 0,
          pathname: window.location.pathname,
          timestamp: Date.now(),
        })
      }
      
      // initialize() will check if progress already exists and only update details count
      initialize(cappedCount)
      
      // Complete 'input' and 'check' steps when Review page loads (screen entry)
      // Progress only advances on screen entry, not button clicks
      if (!hasEnteredScreenRef.current) {
        hasEnteredScreenRef.current = true
        completeStep('input')
        completeStep('check')
        completeStep('review')
      }
    }
  }, [diffResult, initialize, completeStep, DEBUG_PROGRESS])

  // Handle clip-based routing (single phrase session)
  let session: ClipSession
  let currentPhrase: Phrase
  
  // Priority 1: Story-based routing (storyId + storyClipId)
  if (storyId && storyClipId) {
    // Load from story data
    const { story } = getStoryByIdClient(storyId)
    
    if (story) {
      const clip = story.clips.find(c => c.id === storyClipId)
      if (clip) {
        currentPhrase = {
          id: clip.id,
          text: clip.transcript,
          audioUrl: clip.audioUrl || '',
          durationMs: (story.durationSec / story.clips.length) * 1000, // Estimate
        }
        session = {
          id: `story-${storyId}`,
          phrases: [currentPhrase],
          currentIndex: 0,
        }
        phraseIndex = 0
        console.log('✅ Review: Loaded from story', { storyId, storyClipId })
      } else {
        console.error('❌ Review: Clip not found in story', { storyId, storyClipId })
        // Fallback phrase to keep DOM stable; redirect on client
        currentPhrase = {
          id: 'error',
          text: 'Clip not found in this story. Redirecting…',
          audioUrl: '',
          durationMs: 0,
        }
        session = {
          id: `story-${storyId}`,
          phrases: [currentPhrase],
          currentIndex: 0,
        }
        phraseIndex = 0
        setRedirectTo('/practice/select')
      }
    } else {
      console.error('❌ Review: Story not found', { storyId })
      // Fallback phrase to keep DOM stable; redirect on client
      currentPhrase = {
        id: 'error',
        text: 'Story not found. Redirecting…',
        audioUrl: '',
        durationMs: 0,
      }
      session = {
        id: `story-${storyId}`,
        phrases: [currentPhrase],
        currentIndex: 0,
      }
      phraseIndex = 0
      setRedirectTo('/practice/select')
    }
  } else if (clipId) {
    // Try to load from sessionStorage or localStorage first
    let phraseData: { text: string; audioUrl: string; durationMs: number } | null = null
    
    if (typeof window !== 'undefined') {
      // Check sessionStorage first
      const storedClip = sessionStorage.getItem(`clip_${clipId}`)
      if (storedClip) {
        try {
          const clip = JSON.parse(storedClip)
          phraseData = {
            text: clip.text,
            audioUrl: clip.audioUrl,
            durationMs: clip.durationMs || 5000, // Default duration
          }
          console.log('📦 Review: Loaded clip from sessionStorage:', phraseData.audioUrl)
        } catch (error) {
          console.error('Error parsing stored clip in review:', error)
        }
      }
      
      // Check localStorage as fallback
      if (!phraseData) {
        try {
          const userClips = localStorage.getItem('userClips')
          if (userClips) {
            const clips = JSON.parse(userClips)
            const clip = clips.find((c: any) => c.id === clipId)
            if (clip) {
              phraseData = {
                text: clip.text,
                audioUrl: clip.audioUrl,
                durationMs: (clip.lengthSec || 5) * 1000,
              }
              console.log('📦 Review: Loaded clip from localStorage:', phraseData.audioUrl)
            }
          }
        } catch (error) {
          console.error('Error loading clips from localStorage in review:', error)
        }
      }
    }
    
    // Fall back to mock data if not found (but no quick.mp3)
    if (!phraseData) {
      console.warn('⚠️ Review: Using mock data fallback for clip:', clipId, '- audio will not play')
      const mockPhraseData: Record<string, { text: string; audioUrl: string; durationMs: number }> = {
        '1': {
          text: "Can I get a large coffee with oat milk, please?",
          audioUrl: '/audio/clip1.mp3',
          durationMs: 3000,
        },
        '2': {
          text: "Tell me about your previous work experience and why you're interested in this role.",
          audioUrl: '/audio/clip2.mp3',
          durationMs: 5000,
        },
        '3': {
          text: "Nice weather today, isn't it? Perfect for a walk in the park.",
          audioUrl: '/audio/clip3.mp3',
          durationMs: 3500,
        },
        '4': {
          text: "I'd like to order the pasta with marinara sauce and a side salad.",
          audioUrl: '/audio/clip4.mp3',
          durationMs: 4000,
        },
      }
      phraseData = mockPhraseData[clipId]
      if (!phraseData) {
        // No mock data - create error state
        phraseData = {
          text: 'Clip not found. Please generate new clips from onboarding.',
          audioUrl: '',
          durationMs: 0,
        }
      }
    }
    
    currentPhrase = {
      id: `clip-${clipId}`,
      text: phraseData.text,
      audioUrl: phraseData.audioUrl,
      durationMs: phraseData.durationMs,
    }
    session = {
      id: `session-${clipId}`,
      phrases: [currentPhrase],
      currentIndex: 0,
    }
    phraseIndex = 0
  } else {
    // Session-based routing
    const foundSession = sessionId ? mockSessions[sessionId] : null
    if (!foundSession) {
      // No session found - check if we have any valid params before redirecting
      console.warn('⚠️ Review: No valid routing params found', {
        clipId,
        storyId,
        storyClipId,
        sessionId,
      })
      // Only redirect if we truly have no valid params
      // If we have storyId but no storyClipId, that's an error case
      if (!storyId && !clipId && !sessionId) {
        console.error('❌ Review: No routing params, redirecting to /practice/select')
        // Fallback phrase to keep DOM stable; redirect on client
        currentPhrase = {
          id: 'error',
          text: 'Missing parameters. Redirecting…',
          audioUrl: '',
          durationMs: 0,
        }
        session = {
          id: 'error-session',
          phrases: [currentPhrase],
          currentIndex: 0,
        }
        phraseIndex = 0
        setRedirectTo('/practice/select')
      } else {
        // We have some params but they're incomplete - show error state instead of redirecting
        console.error('❌ Review: Incomplete routing params, showing error state')
        // Create error phrase to show error message
        currentPhrase = {
          id: 'error',
          text: 'Missing required parameters. Please try again from the practice page.',
          audioUrl: '',
          durationMs: 0,
        }
        session = {
          id: 'error-session',
          phrases: [currentPhrase],
          currentIndex: 0,
        }
        phraseIndex = 0
      }
    } else {
    session = foundSession
    currentPhrase = session.phrases[phraseIndex]
    }
  }

  if (!currentPhrase) {
    // Ensure a stable UI tree; redirect on client
    currentPhrase = {
      id: 'error',
      text: 'Unable to load this clip. Redirecting…',
      audioUrl: '',
      durationMs: 0,
    }
    session = {
      id: 'error-session',
      phrases: [currentPhrase],
      currentIndex: 0,
    }
    phraseIndex = 0
    setRedirectTo('/practice')
  }

  // Call check-answer API on mount to get word-level diff
  useEffect(() => {
    const checkAnswer = async () => {
      // Get transcript from currentPhrase and userText from query params
      const transcript = currentPhrase.text
      const userAnswer = userText
      
      if (!transcript || !userAnswer) {
        console.warn('Missing transcript or userText for answer checking', {
          hasTranscript: !!transcript,
          hasUserAnswer: !!userAnswer,
        })
        setIsAnalyzing(false)
        return
      }
      
      try {
        const response = await fetch('/api/check-answer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transcript: transcript,
            userText: userAnswer,
          }),
        })
        
        if (!response.ok) {
          throw new Error(`API error: ${response.status}`)
        }
        
        const data = await response.json()
        setDiffResult(data)
        console.log('✅ Answer checked, accuracy:', data.accuracyPercent + '%', {
          accuracy: data.accuracy,
          wer: data.wer,
          stats: data.stats,
          topMistakes: data.topMistakes?.length || 0,
          summary: data.summary,
        })
        
        // If in diagnostic mode, extract categories and store result
        if (isDiagnosticMode && diagnosticClipId) {
          try {
            // Generate practiceSteps from alignment events
            const practiceSteps = extractPracticeSteps(
              data.events || [],
              data.refTokens || [],
              data.userTokens || [],
              10, // maxSteps
              data.transcript,
              undefined // patterns - will use default from practiceSteps
            )
            
            // Extract categories from error steps only (missing/substitution)
            const errorCategories = practiceSteps
              .filter(step => step.type === 'missing' || step.type === 'substitution')
              .map(step => step.category)
            
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
                  return 'idioms' // Map similar_words to idioms
                case 'missed':
                default:
                  return 'missed'
              }
            }
            
            // Map and deduplicate categories
            const diagnosticCategories: DiagnosticCategory[] = [
              ...new Set(errorCategories.map(mapToDiagnosticCategory))
            ]
            
            // Store diagnostic result
            storeDiagnosticResult({
              clipId: diagnosticClipId,
              accuracyPercent: data.accuracyPercent || 0,
              categories: diagnosticCategories,
            })
            
            // Check if diagnostic is complete (5 clips)
            const expectedCount = 5
            if (isDiagnosticComplete(expectedCount)) {
              // Get onboarding CEFR level
              const onboardingData = getOnboardingData()
              // Map onboarding level to CefrLevel (default to A2 if not found)
              const levelMap: Record<string, CefrLevel> = {
                'A1': 'A1',
                'A2': 'A2',
                'B1': 'B1',
                'B2': 'B2',
              }
              const onboardingCefr: CefrLevel = 
                (onboardingData.level && levelMap[onboardingData.level]) || 'A2'
              
              // Build and store summary
              const summary = completeDiagnostic({ expectedCount, onboardingCefr })
              
              if (summary) {
                console.log('✅ [Diagnostic] Completed all diagnostic clips, redirecting to /practice/select')
                // Small delay to ensure localStorage is committed
                setTimeout(() => {
                  router.push('/practice/select')
                }, 100)
              }
            }
          } catch (error) {
            console.error('❌ [Diagnostic] Failed to process diagnostic result:', error)
          }
        }
        
      } catch (error) {
        console.error('❌ Failed to check answer:', error)
        setDiffResult(null)
      } finally {
        setIsAnalyzing(false)
      }
    }
    
    checkAnswer()
  }, [currentPhrase.text, userText, isDiagnosticMode, diagnosticClipId, router])

  // Audio playback handlers
  useEffect(() => {
    if (typeof window === 'undefined' || !currentPhrase.audioUrl) return

    audioRef.current = new Audio(currentPhrase.audioUrl)
    audioRef.current.addEventListener('ended', () => {
      if (isLooping) {
        audioRef.current?.play()
      } else {
        setIsPlaying(false)
      }
    })

    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [currentPhrase.audioUrl, isLooping])

  // Perform client-side redirect after initial paint to avoid hydration mismatch
  useEffect(() => {
    if (redirectTo) {
      router.push(redirectTo)
    }
  }, [redirectTo, router])

  const handlePlayPause = () => {
    if (!audioRef.current) return

    if (isPlaying) {
      audioRef.current.pause()
      setIsPlaying(false)
    } else {
      audioRef.current.playbackRate = isSlow ? 0.75 : 1.0
      audioRef.current.play()
      setIsPlaying(true)
    }
  }

  const handleSlow = () => {
    setIsSlow(!isSlow)
    if (audioRef.current && isPlaying) {
      audioRef.current.playbackRate = !isSlow ? 0.75 : 1.0
    }
  }

  const handleLoop = () => {
    setIsLooping(!isLooping)
  }

  async function openInsightForToken(token: any) {
    const events = diffResult?.events || []
    const transcript = diffResult?.transcript || currentPhrase.text
    const userTextForReq = diffResult?.userText || userText

    const candidate = events.find((e: any) => {
      if (token.type === 'missing' && e.type === 'missing') return e.refStart === token.refIndex
      if (token.type === 'substitution' && e.type === 'substitution') return e.refStart === token.refIndex
      if (token.type === 'extra' && e.type === 'extra') return e.userStart === token.userIndex
      return false
    })
    if (!candidate) return

    setLoadingInsight(true)
    try {
      const res = await fetch('/api/insight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: candidate,
          transcript,
          userText: userTextForReq,
          userLocale: 'en',
        }),
      })
      if (!res.ok) return
      const insight = await res.json()
      setSelectedInsight(insight)
      setPopoverToken({ insight, event: candidate })
      setPopoverOpen(true)
    } finally {
      setLoadingInsight(false)
    }
  }

  const handleReplayWord = () => {
    // For now, just replay the whole sentence
    // TODO: Implement word-level replay
    handlePlayPause()
  }

  // Generate review summary for Step 1
  const reviewSummary = useMemo(() => {
    if (!diffResult || !Array.isArray(diffResult.tokens) || !Array.isArray(diffResult.events)) {
      return null
    }
    const accuracyPercent = diffResult.accuracyPercent || 0
    const refTokens = diffResult.refTokens || []
    const refText = diffResult.transcript || currentPhrase.text
    const userTextForSummary = diffResult.userText || userText
    return pickTopIssue(
      diffResult.tokens,
      diffResult.events,
      refTokens,
      refText,
      userTextForSummary,
      accuracyPercent
    )
  }, [diffResult, currentPhrase.text, userText])

  const isLastPhrase = phraseIndex >= session.phrases.length - 1

  const handleContinue = () => {
    // Navigate to practice flow with alignment data
    const practiceId = storyClipId || clipId || currentPhrase?.id
    if (!practiceId) {
      // Fallback: continue to next step in session
    if (storyId && storyClipId && typeof window !== 'undefined') {
      const key = `cue_done_${storyId}_${storyClipId}`
      localStorage.setItem(key, 'true')
      router.push(`/practice/story/${storyId}`)
      return
    }
    if (isLastPhrase) {
      const finalSessionId = clipId ? `clip-${clipId}` : sessionId
      router.push(`/practice/session-summary?session=${finalSessionId}`)
      } else if (clipId) {
        router.push(`/practice/session-summary?session=clip-${clipId}`)
      } else {
        router.push(
          `/practice/respond?session=${sessionId}&index=${phraseIndex + 1}&phraseId=${session.phrases[phraseIndex + 1].id}`
        )
      }
      return
    }
    
    // Store alignment data in sessionStorage for Practice page
    if (typeof window !== 'undefined' && diffResult) {
      try {
        sessionStorage.setItem(`alignment_${practiceId}`, JSON.stringify({
          events: diffResult.events || [],
          refTokens: diffResult.refTokens || [],
          userTokens: diffResult.userTokens || [],
          transcript: diffResult.transcript || currentPhrase.text,
          userText: diffResult.userText || userText,
        }))
      } catch (e) {
        console.error('Failed to store alignment data:', e)
      }
    }
    
    // Extract phrases to practice (fallback if alignment data not available)
    const phrasesToPractice = reviewSummary?.phrasesToPractice || []
    const phrasesParam = encodeURIComponent(JSON.stringify(phrasesToPractice))
    const returnTo = typeof window !== 'undefined' 
      ? window.location.pathname + window.location.search 
      : '/practice/review'
    
    // Don't complete steps here - progress advances when Practice page loads (screen entry)
    // Progress only advances on screen entry, not button clicks
    
    // Navigate to practice page
    router.push(
      `/practice/${encodeURIComponent(practiceId)}/practice?phrases=${phrasesParam}&returnTo=${encodeURIComponent(returnTo)}`
    )
  }

  const handleBack = () => {
    router.back()
  }

  return (
    <main className="flex min-h-screen flex-col">
      {/* Top Bar - Progress bar at very top (Duolingo style) */}
      {/* Progress now managed by shared ClipLessonProgress context */}
      <ClipTopBar onBack={handleBack} />

      {/* Content with padding */}
      <div className="flex-1 px-6 py-6 pb-20">
      {/* Content */}
      <div className="flex-1 space-y-6">
        {isAnalyzing && (
          <div className="mb-6 p-4 bg-blue-50 rounded-lg border-2 border-blue-200">
            <div className="flex items-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
              <span className="text-sm text-gray-600">Analyzing your answer...</span>
            </div>
          </div>
        )}

        {/* Step 1: Summary Screen */}
        {diffResult && reviewSummary ? (() => {
          const accuracyPercent = diffResult.accuracyPercent || 0
          
          return (
            <>
              {/* Accuracy % + Label (Figma Make style) */}
              <div className="mb-4">
                <div className="flex items-baseline justify-between mb-2">
                  <div className="text-5xl font-bold text-blue-600">
                  {accuracyPercent}%
                  </div>
                  <div className="text-sm font-medium text-gray-600">
                    accuracy
                  </div>
                </div>
                {/* Progress bar */}
                <div className="h-2 bg-blue-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-blue-600 transition-all duration-300"
                    style={{ width: `${accuracyPercent}%` }}
                  />
                </div>
              </div>

              {/* Summary Card with Icon */}
              <div className="mb-6 p-5 bg-blue-50 rounded-xl border border-blue-200">
              <div className="flex items-start gap-3">
                  {/* Icon */}
                <div className="flex-shrink-0 mt-0.5">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                  {/* Summary text */}
                  <div className="flex-1 space-y-2">
                    <div className="text-base font-medium text-blue-900 leading-relaxed">
                      {reviewSummary.title}
                    </div>
                    <div className="text-sm text-blue-700 leading-relaxed">
                      {reviewSummary.categoryId === 'words_blended' && (
                        <>For example, "{reviewSummary.examplePhrase}" sounded like one word.</>
                      )}
                      {reviewSummary.categoryId === 'casual_shortcuts' && (
                        <>For example, "{reviewSummary.examplePhrase}" can sound different when spoken quickly.</>
                      )}
                      {reviewSummary.categoryId === 'brain_filled_in' && (
                        <>For example, you might have heard an extra word near "{reviewSummary.examplePhrase}".</>
                      )}
                      {reviewSummary.categoryId === 'key_words_hard' && (
                        <>For example, "{reviewSummary.examplePhrase}" was hard to catch in fast speech.</>
                      )}
                      {reviewSummary.categoryId === 'speed_fast' && (
                        <>For example, "{reviewSummary.examplePhrase}" went by too quickly.</>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Compared to what you heard (REQUIRED) */}
            <div className="mb-6 p-6 bg-white border border-gray-200 rounded-xl">
              <h2 className="text-lg font-semibold mb-4 text-gray-900">Compared to what you heard</h2>
              
                {/* Diff rendering with color rules */}
              <div className="text-lg leading-relaxed mb-4 text-gray-900">
                  {(diffResult.tokens || []).map((t: any, idx: number) => {
                    const word = (t.type === 'extra' ? t.actual : t.expected) ?? ''

                    const className =
                      t.type === 'correct'
                        ? 'px-0.5 rounded text-gray-900'
                        : t.type === 'missing'
                        ? 'px-0.5 rounded text-gray-500 underline decoration-dotted decoration-gray-400'
                        : t.type === 'extra'
                        ? 'px-0.5 rounded text-gray-500 line-through'
                        : 'px-0.5 rounded text-red-600 underline decoration-dotted decoration-red-400'

                  return (
                    <span
                        key={t.id ?? idx}
                      className={className}
                    >
                        {word}{' '}
                    </span>
                  )
                })}
              </div>
            
                {/* Audio controls - horizontal row (Duolingo style) */}
              {currentPhrase.audioUrl && (
                  <div className="flex items-center gap-3 pt-4 border-t border-gray-200">
                  <button
                    onClick={handlePlayPause}
                      className="flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-full font-medium active:bg-blue-700 transition-colors flex-1"
                    aria-label={isPlaying ? 'Pause' : 'Play'}
                  >
                    {isPlaying ? (
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    )}
                    <span>{isPlaying ? 'Pause' : 'Play'}</span>
                  </button>

                  <button
                    onClick={handleSlow}
                      className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-full font-medium transition-colors flex-1 ${
                      isSlow
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-700 active:bg-gray-200'
                    }`}
                    aria-label="Slow"
                  >
                    <span className="text-lg">🐢</span>
                    <span>Slow</span>
                  </button>

                  <button
                    onClick={handleLoop}
                      className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-full font-medium transition-colors flex-1 ${
                      isLooping
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-700 active:bg-gray-200'
                    }`}
                    aria-label="Loop"
                  >
                    <span className="text-lg">🎯</span>
                    <span>Loop</span>
                  </button>
                </div>
              )}
            </div>

              {/* Why this was hard (Collapsible) */}
              <div className="mb-6">
                <button
                  onClick={() => setShowDetails(!showDetails)}
                  className="w-full py-2 px-4 text-sm text-gray-600 hover:text-gray-900 flex items-start justify-center gap-1 transition-colors mb-2"
                >
                  {showDetails ? (
                    <>
                      <ChevronUp className="w-4 h-4" />
                      <span>Hide details</span>
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-4 h-4" />
                      <span>See details</span>
                    </>
                  )}
                </button>

                {showDetails && (
                  <div className="p-5 bg-white border border-gray-200 rounded-xl space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                    <h2 className="text-lg font-semibold text-gray-900">Why this was hard</h2>
                    
                    {/* Generate 1-3 bullets from actual mistakes */}
                    {(() => {
                      const bullets: Array<{ text: string; example: string }> = []
                      const refTokens = diffResult.refTokens || []
                      const events = diffResult.events || []
                      
                      // Group by type and find examples
                      const missingEvents = events.filter((e: any) => e.type === 'missing').slice(0, 1)
                      const substitutionEvents = events.filter((e: any) => e.type === 'substitution').slice(0, 1)
                      const extraEvents = events.filter((e: any) => e.type === 'extra').slice(0, 1)
                      
                      if (missingEvents.length > 0) {
                        const event = missingEvents[0]
                        const example = event.expectedSpan || (refTokens.length > 0 ? refTokens.slice(event.refStart || 0, event.refEnd || 0).join(' ') : '')
                        if (example) {
                          bullets.push({
                            text: 'Some phrases blended together when words were spoken quickly.',
                            example: example
                          })
                        }
                      }
                      
                      if (substitutionEvents.length > 0) {
                        const event = substitutionEvents[0]
                        const example = event.expectedSpan || (refTokens.length > 0 ? refTokens.slice(event.refStart || 0, event.refEnd || 0).join(' ') : '')
                        if (example) {
                          bullets.push({
                            text: 'Some words can sound similar when spoken in fast speech.',
                            example: example
                          })
                        }
                      }
                      
                      if (extraEvents.length > 0) {
                        bullets.push({
                          text: 'Your brain sometimes fills in extra words when the audio is unclear.',
                          example: 'This happens naturally when listening.'
                        })
                      }
                      
                      // Fallback if no events
                      if (bullets.length === 0 && refTokens.length > 0) {
                        bullets.push({
                          text: 'Fast speech can make it hard to catch every word.',
                          example: refTokens.slice(0, Math.min(3, refTokens.length)).join(' ')
                        })
                      }
                      
                      return bullets.slice(0, 3).map((bullet, idx) => (
                        <div key={idx} className="flex items-start gap-3">
                          <div className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-blue-600 mt-2" />
                          <div className="flex-1">
                            <div className="text-base text-gray-900">{bullet.text}</div>
                            <div className="text-sm text-gray-600 mt-1">
                              Example: "{bullet.example}"
                            </div>
                          </div>
                        </div>
                      ))
                    })()}
                  </div>
                )}
              </div>
            </>
          )
        })() : !isAnalyzing && !diffResult && (
          <div className="mb-6 p-4 bg-gray-50 rounded-xl border border-gray-200">
            <div className="text-sm text-gray-600 text-center">
              Unable to analyze your answer. Please try again.
            </div>
          </div>
        )}

        {/* Word tap modals hidden in Step 1 - only show in details if needed */}
        {false && (
        <WordPopover
          isOpen={popoverOpen}
          onClose={() => setPopoverOpen(false)}
          token={popoverToken}
          onReplay={handleReplayWord}
        />
        )}
      </div>

        {/* Fixed bottom actions - only show if we have diffResult */}
        {diffResult && reviewSummary && (
      <div className="pt-6 pb-6">
        <button
          onClick={handleContinue}
          className="w-full py-4 px-6 rounded-xl font-semibold text-lg bg-blue-600 text-white active:bg-blue-700 shadow-lg transition-colors"
        >
          Continue
        </button>
          </div>
        )}
      </div>
    </main>
  )
}

export default function ReviewPage() {
  return (
    <Suspense fallback={
      <main className="flex min-h-screen flex-col items-center justify-center px-6">
        <div className="text-gray-500">Loading...</div>
      </main>
    }>
      <ReviewPageContent />
    </Suspense>
  )
}
