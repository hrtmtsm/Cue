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
import { useLocale, useTranslations } from 'next-intl'
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
  const locale = useLocale()
  const t = useTranslations()
  const clipId = searchParams.get('clip')
  const storyId = searchParams.get('storyId')
  const storyClipId = searchParams.get('clipId') // Clip ID within a story
  const sessionId = searchParams.get('session')
  let phraseIndex = parseInt(searchParams.get('index') || '0', 10)
  const clipIndexParam = searchParams.get('clipIndex')
  const clipIndex = parseInt(clipIndexParam || '0', 10)
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
  
  // Type for diff result with semantic evaluation and pattern feedback
  interface DiffResult {
    accuracyPercent?: number
    refTokens?: any[]
    userTokens?: any[]
    tokens?: any[]
    events?: any[]
    stats?: any
    transcript?: string
    userText?: string
    semanticEval?: {
      understood: boolean
      semanticScore: number
      missingUnits: string[]
      missingKeywords: string[]
      capturedKeywords?: string[]
    }
    patternFeedback?: Array<{
      patternKey: string
      writtenForm: string
      spokenForm: string
      listeningStrategy?: string
      whatToFocusOn?: string
      explanationShort?: string
      explanationMedium?: string
      affectedUnit?: string | null
      affectedKeyword?: string | null
    }>
  }
  
  // State for word-level diff
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null)
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
  const [showInsightsModal, setShowInsightsModal] = useState(false)
  
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
      
      // Determine the correct database clip ID
      // Priority: storyClipId (from story) > clipId (from URL) > currentPhrase.id
      const dbClipId = (storyClipId || clipId || currentPhrase?.id || '').trim()
      
      if (!transcript || !userAnswer) {
        console.warn('Missing transcript or userText for answer checking', {
          hasTranscript: !!transcript,
          hasUserAnswer: !!userAnswer,
        })
        setIsAnalyzing(false)
        return
      }
      
      console.log('📝 [ReviewPage] Calling /api/check-answer with:', {
        transcriptLength: transcript.length,
        userTextLength: userAnswer.length,
        dbClipId: dbClipId || '(none)',
        clipId: clipId || '(none)',
        storyClipId: storyClipId || '(none)',
        currentPhraseId: currentPhrase?.id || '(none)',
      })
      
      try {
        const requestBody: {
          transcript: string
          userText: string
          clipId?: string
        } = {
          transcript: transcript,
          userText: userAnswer,
        }
        
        // Only include clipId if it's a valid non-empty string
        if (dbClipId && dbClipId.length > 0) {
          requestBody.clipId = dbClipId
        }
        
        const response = await fetch('/api/check-answer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        })
        
        if (!response.ok) {
          throw new Error(`API error: ${response.status}`)
        }
        
        const data = await response.json()
        
        // Map API response to DiffResult with semantic evaluation
        const diffResult: DiffResult = {
          ...data,
          semanticEval: data.understood !== undefined ? {
            understood: data.understood,
            semanticScore: data.semanticScore ?? 0,
            missingUnits: data.missingUnits ?? [],
            missingKeywords: data.missingKeywords ?? [],
            capturedKeywords: data.capturedKeywords ?? [],
          } : undefined,
          patternFeedback: data.patternFeedback ?? [],
        }
        
        setDiffResult(diffResult)
        console.log('✅ Answer checked, accuracy:', data.accuracyPercent + '%', {
          accuracy: data.accuracy,
          wer: data.wer,
          stats: data.stats,
          topMistakes: data.topMistakes?.length || 0,
          summary: data.summary,
          understood: data.understood,
          semanticScore: data.semanticScore,
          patternFeedbackCount: data.patternFeedback?.length || 0,
        })
        
        // If in diagnostic mode, extract categories and store result
        if (isDiagnosticMode && diagnosticClipId) {
          try {
            // Load patterns from API (with variants) for pattern matching
            let patternsForMatching: any[] | undefined = undefined
            try {
              const patternsResponse = await fetch('/api/listening-patterns')
              if (patternsResponse.ok) {
                const patternsData = await patternsResponse.json()
                if (Array.isArray(patternsData) && patternsData.length > 0) {
                  patternsForMatching = patternsData
                  if (process.env.NODE_ENV === 'development') {
                    console.log('✅ [Review] Loaded patterns for matching:', {
                      patternsCount: patternsForMatching.length,
                      gonnaPattern: patternsForMatching.find((p: any) => p.id === 'gonna' || (p as any).patternKey === 'gonna'),
                    })
                  }
                }
              }
            } catch (err) {
              console.warn('⚠️ [Review] Failed to load patterns, will use fallback:', err)
            }
            
            // Generate practiceSteps from alignment events
            const practiceSteps = extractPracticeSteps(
              data.events || [],
              data.refTokens || [],
              data.userTokens || [],
              10, // maxSteps
              data.transcript,
              patternsForMatching, // patterns with variants from API
              data.patternFeedback // variant-specific feedback from clip_pattern_spans
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
            const diagnosticCategories: DiagnosticCategory[] = Array.from(
              new Set(errorCategories.map(mapToDiagnosticCategory))
            )
            
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
                  router.push(`/${locale}/practice/select`)
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
      router.push(`/${locale}${redirectTo}`)
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

  const handleContinue = () => {
    // Story-based flow with explicit clipIndex: go to next clip in same story,
    // but when all clips are finished, go to completion screen.
    if (storyId && clipIndexParam !== null) {
      const currentIndex = parseInt(clipIndexParam, 10)
      const safeCurrentIndex = Number.isNaN(currentIndex) ? 0 : currentIndex

      // Look up how many clips this story has
      const { story } = getStoryByIdClient(storyId)
      const totalClips = story?.clips?.length || 3

      const nextClipIndex = safeCurrentIndex + 1

      console.log('🔁 [Review] Continue clicked (story flow)', {
        storyId,
        currentIndex: safeCurrentIndex,
        nextClipIndex,
        totalClips,
      })

      // If we've finished the last clip, end the session and go to completion screen
      if (nextClipIndex >= totalClips) {
        console.log('✅ [Review] Session complete, redirecting to /practice/complete')
        router.push(`/${locale}/practice/complete?storyId=${storyId}`)
        return
      }

      // Otherwise, continue to the next clip in this story
      router.push(`/${locale}/practice/story/${storyId}?clipIndex=${nextClipIndex}`)
      return
    }

    // Story-based flow without clipIndex: return to story page (it decides what to show next)
    if (storyId) {
      console.log('🔁 [Review] Continue → back to story page (no clipIndex)', { storyId })
      router.push(`/${locale}/practice/story/${storyId}`)
      return
    }
    
    // No story context: go back to practice select
    console.log('🔁 [Review] Continue → practice select (no story context)')
    router.push('/practice/select')
  }

  const handleBack = () => {
    router.back()
  }

  return (
    <main className="flex min-h-screen flex-col">
      {/* Top Bar - Progress bar at very top (Duolingo style) */}
      {/* Progress now managed by shared ClipLessonProgress context */}
      <ClipTopBar
        onBack={handleBack}
        // Override percent to show cumulative per-clip progress (3-clip session)
        overridePercent={(() => {
          const totalClips = 3
          const safeIndex = Number.isNaN(clipIndex) ? 0 : Math.max(0, clipIndex)
          const progress = ((safeIndex + 1) / totalClips) * 100
          return Math.max(0, Math.min(100, progress))
        })()}
      />

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
              {/* Accuracy % + Label - Only show if NO semantic evaluation exists */}
              {!diffResult?.semanticEval && (
              <div className="mb-4">
                <div className="flex items-baseline justify-between mb-2">
                  <div className="text-5xl font-bold text-blue-600">
                  {accuracyPercent}%
                  </div>
                  <div className="text-body-small font-medium text-gray-600">
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
              )}

              {/* Summary Card - Semantic Evaluation Based */}
              {diffResult.semanticEval ? (
                diffResult.semanticEval.understood ? (
                  <div className="mb-6 p-5 bg-green-50 rounded-xl border border-green-200">
                    <div className="flex items-start gap-3">
                      {/* Success Icon */}
                      <div className="flex-shrink-0 mt-0.5">
                        <div className="w-5 h-5 text-green-600 text-xl font-bold">✓</div>
                      </div>
                      {/* Summary text */}
                      <div className="flex-1 space-y-2">
                        <div className="text-body font-medium text-green-900 leading-relaxed">
                          Great! You got the meaning
                        </div>
                        {diffResult.semanticEval.missingKeywords.length > 0 && (
                          <div className="text-sm text-green-700 leading-relaxed">
                            Minor corrections: {diffResult.semanticEval.missingKeywords.join(', ')}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mb-6 p-5 bg-orange-50 rounded-xl border border-orange-200">
                    <div className="flex items-start gap-3">
                      {/* Warning Icon */}
                      <div className="flex-shrink-0 mt-0.5">
                        <div className="w-5 h-5 text-orange-600 text-xl">⚠️</div>
                      </div>
                      {/* Summary text */}
                      <div className="flex-1 space-y-2">
                        <div className="text-body font-medium text-orange-900 leading-relaxed">
                          {t('practice.notQuite')}
                        </div>
                        {diffResult.semanticEval.missingUnits.length > 0 && (
                          <div className="text-sm text-orange-700 leading-relaxed">
                            You missed: {diffResult.semanticEval.missingUnits.join(', ')}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              ) : (
                // Fallback to old summary if semanticEval not available
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
                    <div className="text-body font-medium text-blue-900 leading-relaxed">
                        {reviewSummary?.title || 'Review your answer'}
                    </div>
                      {reviewSummary && (
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
                      )}
                  </div>
                </div>
              </div>
              )}

              {/* Result + Compared to what you heard (minimal diff view) */}
            <div className="mb-6 p-6 bg-white border border-gray-200 rounded-xl">
              <h2 className="text-heading-3 mb-4 text-gray-900">{t('practice.comparedToWhatYouHeard')}</h2>
              
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

              {/* Minimal primary actions */}
              <div className="mt-4 space-y-3">
                <button
                  type="button"
                  onClick={() => setShowInsightsModal(true)}
                  className="w-full py-3 px-4 rounded-xl border-2 border-blue-200 bg-blue-50 text-blue-900 font-semibold text-base flex items-center justify-center gap-2 active:bg-blue-100 transition-colors"
                >
                  <span>💡 {t('practice.whyDidIMissThis')}</span>
                </button>
                <button
                  type="button"
                  onClick={handleContinue}
                  className="w-full py-4 px-6 rounded-xl font-semibold text-lg bg-blue-600 text-white active:bg-blue-700 shadow-lg transition-colors"
                >
                  {t('practice.continueArrow')}
                </button>
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
      </div>

      {/* Insights modal (pattern feedback + detailed bullets) */}
      {showInsightsModal && diffResult && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/30">
          <div className="w-full max-w-md mx-4 bg-white rounded-2xl shadow-xl max-h-[80vh] overflow-y-auto p-5 space-y-4">
            <div className="flex items-center justify-between">
                    <h2 className="text-heading-3 text-gray-900">Why this was hard</h2>
              <button
                type="button"
                onClick={() => setShowInsightsModal(false)}
                className="text-gray-400 hover:text-gray-600 text-sm"
              >
                Close
              </button>
            </div>

            {/* Helpful message when no pattern feedback available */}
            {!diffResult?.semanticEval?.understood && 
             (!diffResult?.patternFeedback || diffResult.patternFeedback.length === 0) && (
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <h3 className="text-body-small font-semibold mb-2 text-gray-900">💡 Listening Tip</h3>
                <p className="text-sm text-gray-700 mb-2">
                  You stopped listening partway through the sentence. In natural speech, 
                  the most important information often comes at the end.
                </p>
                <p className="text-sm text-gray-700">
                  <strong>Try this:</strong> Stay focused through the entire sentence, 
                  even after you catch the main idea. The details matter!
                </p>
              </div>
            )}

            {/* Pattern Feedback Section - Only show if not understood and pattern feedback exists */}
            {diffResult.semanticEval && !diffResult.semanticEval.understood && diffResult.patternFeedback && diffResult.patternFeedback.length > 0 && (
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <h3 className="text-body-small font-semibold mb-3 text-gray-900">💡 What happened here</h3>
                {(() => {
                  const pattern = diffResult.patternFeedback![0]
                  return (
                    <>
                      <div className="mb-3">
                        <div className="text-xs text-gray-600 mb-1">Written form:</div>
                        <div className="text-sm font-medium text-gray-900">{pattern.writtenForm}</div>
                        <div className="text-xs text-gray-600 mt-2 mb-1">Sounds like:</div>
                        <div className="text-sm font-medium text-blue-700">{pattern.spokenForm}</div>
                      </div>
                      
                      {pattern.whatToFocusOn && (
                        <div className="mb-3 p-3 bg-white rounded border border-blue-100">
                          <div className="text-xs font-semibold text-blue-900 mb-1">
                            🎯 What to focus on
                          </div>
                          <p className="text-xs text-gray-700">{pattern.whatToFocusOn}</p>
                        </div>
                      )}
                      
                      {pattern.listeningStrategy && (
                        <div className="p-3 bg-white rounded border border-blue-100">
                          <div className="text-xs font-semibold text-blue-900 mb-1">
                            💡 Listening strategy
                          </div>
                          <p className="text-xs text-gray-700">{pattern.listeningStrategy}</p>
                        </div>
                      )}
                    </>
                  )
                })()}
              </div>
            )}

            {/* Detailed bullets (was 'See details') */}
            <div className="p-4 bg-white border border-gray-200 rounded-xl space-y-3">
              <h3 className="text-body-small font-semibold text-gray-900">More details</h3>
                    {(() => {
                      const bullets: Array<{ text: string; example: string }> = []
                      const refTokens = diffResult.refTokens || []
                      const events = diffResult.events || []
                      
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
                      <div className="text-sm text-gray-900">{bullet.text}</div>
                      <div className="text-xs text-gray-600 mt-1">
                              Example: "{bullet.example}"
                            </div>
                          </div>
                        </div>
                      ))
                    })()}
                  </div>
            </div>
          </div>
        )}
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
