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
import { getStoryByIdClientDbOnly } from '@/lib/storyClient'
import { pickTopIssue } from '@/lib/reviewSummary'
import WordPopover from '@/components/WordPopover'
import ClipTopBar from '@/components/ClipTopBar'
import ChunkDictionary from '@/components/ChunkDictionary'
import { useClipLessonProgress } from '@/lib/clipLessonProgress'
import { extractPracticeSteps, type FeedbackCategory } from '@/lib/practiceSteps'
import type { DiagnosticCategory, CefrLevel } from '@/lib/diagnosticSummary'
import {
  storeDiagnosticResult,
  isDiagnosticComplete,
  completeDiagnostic,
} from '@/lib/diagnosticSummary'
import { getOnboardingData } from '@/lib/onboardingStore'
import { fetchChunkHit, type ChunkHit } from '@/lib/chunkApi'
import { toHowItSoundsRemap, formatHowItSoundsDisplay } from '@/lib/howItSounds'
import { formatHowItSounds } from '@/lib/formatHowItSounds'
import InsightCard from '@/components/InsightCard'
import InsightCardSkeleton from '@/components/InsightCardSkeleton'
import { addPracticeEvent, type DetailedPracticeEvent } from '@/lib/userPreferences'
import { useSubscription } from '@/lib/useSubscription'
import { saveTip, getSavedTips, unsaveTip, type SaveTipData } from '@/lib/savedTips'

// Get contextually appropriate labels based on mistake type (moved outside component)
function getInsightLabels(eventType: string, t: any) {
  switch (eventType) {
    case 'missing':
      return {
        userLabel: null,  // Don't show "what you heard" for missing
        correctLabel: `❌ ${t('feedback.whatYouMissed')}`
      }
    case 'substitution':
      return {
        userLabel: `💭 ${t('feedback.whatYouMightHaveHeard')}`,
        correctLabel: `✅ ${t('feedback.whatItActuallyWas')}`
      }
    case 'extra':
      return {
        userLabel: `➕ ${t('feedback.whatYouAdded')}`,
        correctLabel: `✅ ${t('feedback.whatItShouldBe')}`
      }
    default:
      return {
        userLabel: `💭 ${t('feedback.whatYouMightHaveHeard')}`,
        correctLabel: `✅ ${t('feedback.whatItActuallyWas')}`
      }
  }
}

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
  
  // Check subscription status for listening tips feature
  const { isPro, loading: subLoading, refetch } = useSubscription()
  
  // Check for ?upgraded=true parameter and refetch subscription status
  useEffect(() => {
    const upgraded = searchParams.get('upgraded')
    if (upgraded === 'true' && refetch) {
      console.log('[Review Page] Detected upgrade completion, refetching subscription...')
      refetch()
      
      // Clean up the URL parameter after refetch
      const newUrl = new URL(window.location.href)
      newUrl.searchParams.delete('upgraded')
      router.replace(newUrl.pathname + newUrl.search)
    }
  }, [searchParams, refetch, router])
  
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
  
  // State for AI insights carousel
  const [aiInsights, setAiInsights] = useState<any[]>([])
  const [currentInsightIndex, setCurrentInsightIndex] = useState(0)
  // Generate stable voiceId for caching (based on clipId + userId + day)
  const stableVoiceId = useMemo(() => {
    const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD
    const userId = typeof window !== 'undefined' ? localStorage.getItem('userId') || 'anonymous' : 'anonymous'
    const clipIdForVoice = clipId || storyClipId || 'default'
    return `${clipIdForVoice}:${userId}:${today}`
  }, [clipId, storyClipId])
  const [insightLoading, setInsightLoading] = useState(false)
  const [insightError, setInsightError] = useState<string | null>(null)
  // Cache last successful feedback keyed by phraseId to prevent overwriting on failure
  const lastSuccessfulFeedbackRef = useRef<Map<string, any[]>>(new Map())
  // AbortController for race condition handling
  const insightAbortControllerRef = useRef<AbortController | null>(null)
  
  // State for swipe gestures
  const [touchStart, setTouchStart] = useState(0)
  const [touchEnd, setTouchEnd] = useState(0)
  
  // State for saved tips - map phrase to tip ID for deletion
  const [savedTips, setSavedTips] = useState<Map<string, string>>(new Map())
  
  // NEW: State for practice event tracking (for linguistic metrics)
  const [replayCount, setReplayCount] = useState(0)
  const [practiceStartTime] = useState(Date.now())  // Track when practice session started
  
  // State for chunk dictionary
  const [chunkHit, setChunkHit] = useState<ChunkHit | null>(null)
  const [isChunkModalOpen, setIsChunkModalOpen] = useState(false)
  const [isLoadingChunk, setIsLoadingChunk] = useState(false)
  const [isResolvingChunk, setIsResolvingChunk] = useState(false)
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)
  const transcriptRef = useRef<HTMLDivElement>(null)
  const currentStoryClipRef = useRef<{ id: string; dbClipId?: string } | null>(null) // Store clip for dbClipId access
  
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

  // Validate story/clip and set redirect if needed (in useEffect to avoid render loop)
  useEffect(() => {
    if (storyId && storyClipId) {
      const { story } = getStoryByIdClientDbOnly(storyId)
      
      if (!story) {
        console.error('❌ Review: Story not found in DB (DB-backed only)', { storyId })
        setRedirectTo('/practice/select')
        return
      }
      
      const clip = story.clips.find(c => c.id === storyClipId)
      if (!clip) {
        console.error('❌ Review: Clip not found in story', { storyId, storyClipId })
        setRedirectTo('/practice/select')
        return
      }
      
      // Validate clip has dbClipId (required for chunk lookup and feedback)
      if (!clip.dbClipId) {
        // FALLBACK: Use clip.id as dbClipId if missing (for backward compat with cached data)
        console.warn('⚠️ [ReviewPage] Clip missing dbClipId, using clip.id as fallback:', {
          storyId,
          storyClipId: clip.id,
          fallbackDbClipId: clip.id,
          transcript: clip.transcript.substring(0, 50) + '...',
        })
        // Continue with review - clip.id will be used as fallback
      }
    }
  }, [storyId, storyClipId])

  // Handle clip-based routing (single phrase session)
  let session: ClipSession
  let currentPhrase: Phrase
  
  // Priority 1: Story-based routing (storyId + storyClipId)
  // CRITICAL: Must use DB-only lookup - mock stories are not allowed in practice/review
  if (storyId && storyClipId) {
    const { story } = getStoryByIdClientDbOnly(storyId)
    
    if (story) {
      const clip = story.clips.find(c => c.id === storyClipId)
      if (clip) {
        // Warn if dbClipId is missing but continue (for backward compatibility with cached data)
        if (!clip.dbClipId) {
          console.warn('⚠️ [Review] Clip missing dbClipId, using clip.id as fallback:', {
            storyId,
            storyClipId: clip.id,
            fallbackDbClipId: clip.id,
          })
        }
        currentStoryClipRef.current = clip // Store clip for dbClipId access
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
        console.log('✅ Review: Loaded from DB-backed story', { storyId, storyClipId, dbClipId: clip.dbClipId || clip.id })
      } else {
        // Error state: clip not found in story
        currentPhrase = {
          id: 'error',
          text: 'This clip is not available. Please select a different practice clip.',
          audioUrl: '',
          durationMs: 0,
        }
        session = {
          id: `story-${storyId}`,
          phrases: [currentPhrase],
          currentIndex: 0,
        }
        phraseIndex = 0
      }
    } else {
      // Error state (redirect handled in useEffect above)
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
        // Redirect handled in useEffect below
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
    // Redirect handled in useEffect below
  }

  // Handle redirects for error cases (in useEffect to avoid render loop)
  useEffect(() => {
    if (!currentPhrase || currentPhrase.id === 'error') {
      // Check which error case we're in
      if (storyId && storyClipId) {
        // Story-based error - already handled in earlier useEffect
        return
      } else if (clipId) {
        // Clip-based error
        setRedirectTo('/practice/select')
      } else if (!currentPhrase) {
        // No phrase at all
        setRedirectTo('/practice')
      }
    }
  }, [currentPhrase, storyId, storyClipId, clipId])

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
        
        // NEW: Save DetailedPracticeEvent for linguistic metrics tracking
        try {
          // Calculate which patterns were succeeded vs failed
          const patternsEncountered = (diffResult.patternFeedback || []).map(p => p.patternKey)
          const patternsFailed: string[] = []
          const patternsSucceeded: string[] = []
          
          // Check if patterns were in the missed areas
          diffResult.patternFeedback?.forEach(pattern => {
            // If pattern affects a missing/substitution event, mark as failed
            // Otherwise, mark as succeeded
            const affectedByError = diffResult.events?.some(event => 
              (event.type === 'missing' || event.type === 'substitution') &&
              event.refStart <= pattern.ref_start &&
              event.refEnd >= pattern.ref_end
            )
            
            if (affectedByError) {
              patternsFailed.push(pattern.patternKey)
            } else {
              patternsSucceeded.push(pattern.patternKey)
            }
          })
          
          const detailedEvent: DetailedPracticeEvent = {
            clipId: dbClipId || clipId || storyClipId || 'unknown',
            timestamp: new Date().toISOString(),
            replays: replayCount,
            timeToSubmitMs: Date.now() - practiceStartTime,
            accuracyScore: (data.accuracyPercent || 0) / 100,
            gaveUp: false,  // TODO: track if user gave up
            revealedTranscript: false,  // TODO: track if user revealed transcript
            
            // Detailed data
            alignmentEvents: diffResult.events || [],
            alignmentStats: data.stats || { correct: 0, substitutions: 0, missing: 0, extra: 0 },
            semanticScore: data.semanticScore ?? null,
            understood: data.understood ?? false,
            missingKeywords: data.missingKeywords || [],
            capturedKeywords: data.capturedKeywords || [],
            missingUnits: data.missingUnits || [],
            patternsEncountered,
            patternsSucceeded,
            patternsFailed,
            transcriptWordCount: data.refTokens?.length || 0,
            transcriptText: data.transcript || transcript,
          }
          
          addPracticeEvent(detailedEvent)
          
          console.log('📊 [Metrics] Saved DetailedPracticeEvent:', {
            clipId: detailedEvent.clipId,
            accuracy: detailedEvent.accuracyScore,
            patterns: patternsEncountered.length,
            timeMs: detailedEvent.timeToSubmitMs,
          })
        } catch (eventError) {
          console.error('❌ [Metrics] Error saving practice event:', eventError)
          // Don't fail the review page if event tracking fails
        }
        
        // Detailed patternFeedback inspection
        console.log('[patternFeedback]', {
          clipId: dbClipId || '(none)',
          count: diffResult.patternFeedback?.length ?? 0,
          first: diffResult.patternFeedback?.[0] ?? null,
        })
        
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

  const handleSaveTip = async (tipData: SaveTipData): Promise<boolean> => {
    try {
      const result = await saveTip(tipData)
      if (result.success && result.tip) {
        setSavedTips(prev => new Map(prev).set(tipData.phrase, result.tip.id))
        return true
      }
      return false
    } catch (error) {
      console.error('[Review] Error saving tip:', error)
      return false
    }
  }

  const handleUnsaveTip = async (phrase: string): Promise<boolean> => {
    try {
      const tipId = savedTips.get(phrase)
      if (!tipId) {
        console.warn('[Review] No tip ID found for phrase:', phrase)
        return false
      }
      
      const result = await unsaveTip(tipId)
      if (result.success) {
        setSavedTips(prev => {
          const newMap = new Map(prev)
          newMap.delete(phrase)
          return newMap
        })
        return true
      }
      return false
    } catch (error) {
      console.error('[Review] Error unsaving tip:', error)
      return false
    }
  }

  // Merge consecutive missing/extra words into phrases
  const mergeConsecutiveMistakes = (events: any[]) => {
    const merged: any[] = []
    let current: any = null
    
    for (const event of events) {
      if (!current) {
        current = { ...event }
        continue
      }
      
      // If same type and consecutive position, merge
      if (
        current.type === event.type &&
        current.refEnd + 1 === event.refStart &&
        (current.type === 'missing' || current.type === 'extra')
      ) {
        // Preserve phraseHint if it exists and covers the merged range
        // Prefer phraseHint from either event if it spans the merged range
        if (event.phraseHint) {
          // If the new event has a phraseHint that covers both, use it
          if (event.phraseHint.spanRefStart <= current.refStart && 
              event.phraseHint.spanRefEnd >= event.refEnd) {
            current.phraseHint = event.phraseHint
            current.expectedSpan = event.phraseHint.spanText
          } else if (current.phraseHint) {
            // Keep current phraseHint if it still covers the range
            if (current.phraseHint.spanRefStart <= current.refStart && 
                current.phraseHint.spanRefEnd >= event.refEnd) {
              // Current phraseHint still valid, keep it
            } else {
              // Current phraseHint doesn't cover merged range, concatenate spans
              current.expectedSpan = `${current.expectedSpan || ''} ${event.expectedSpan || ''}`.trim()
              // Clear phraseHint if it doesn't cover the full merged range
              current.phraseHint = undefined
            }
          } else {
            // No phraseHint on current, concatenate
            current.expectedSpan = `${current.expectedSpan || ''} ${event.expectedSpan || ''}`.trim()
          }
        } else if (current.phraseHint) {
          // Current has phraseHint but new event doesn't
          // Check if phraseHint still covers the merged range
          if (current.phraseHint.spanRefStart <= current.refStart && 
              current.phraseHint.spanRefEnd >= event.refEnd) {
            // phraseHint still covers merged range, keep it
          } else {
            // phraseHint doesn't cover merged range, concatenate and clear it
            current.expectedSpan = `${current.expectedSpan || ''} ${event.expectedSpan || ''}`.trim()
            current.phraseHint = undefined
          }
        } else {
          // Neither has phraseHint, just concatenate
          current.expectedSpan = `${current.expectedSpan || ''} ${event.expectedSpan || ''}`.trim()
        }
        
        // For missing words, keep single "(not heard)" instead of concatenating
        if (current.type === 'missing') {
          current.actualSpan = current.actualSpan || '(not heard)'
        } else {
          // For extra words, concatenate the actual text
          current.actualSpan = `${current.actualSpan || ''} ${event.actualSpan || ''}`.trim()
        }
        
        current.refEnd = event.refEnd
      } else {
        merged.push(current)
        current = { ...event }
      }
    }
    
    if (current) merged.push(current)
    
    console.log('🔗 [Review] Merged consecutive mistakes:', 
      merged.map(m => ({
        type: m.type,
        expectedSpan: m.expectedSpan,
        actualSpan: m.actualSpan,
        hasPhraseHint: !!m.phraseHint,
        phraseHintText: m.phraseHint?.spanText
      }))
    )
    
    return merged
  }

  // Helper: Expand single token to natural listening chunk
  function expandToListeningChunk(
    event: any,
    refTokens: string[]
  ): { chunkText: string; chunkRefStart: number; chunkRefEnd: number } {
    // Priority A: Use phraseHint if available
    if (event.phraseHint?.spanText) {
      return {
        chunkText: event.phraseHint.spanText,
        chunkRefStart: event.phraseHint.spanRefStart ?? event.refStart ?? 0,
        chunkRefEnd: event.phraseHint.spanRefEnd ?? event.refEnd ?? event.refStart ?? 0
      }
    }

    const startToken = event.refStart ?? 0
    const endToken = event.refEnd ?? startToken
    const expectedSpan = event.expectedSpan || ''
    const expectedLower = expectedSpan.toLowerCase().trim()

    // Articles/determiners that should be included before nouns
    const ARTICLES = new Set(['the', 'a', 'an', 'this', 'that', 'my', 'your', 'his', 'her', 'our', 'their', 'its'])
    
    // Function words for infinitive/prep patterns
    const PREP_PATTERNS = [
      { before: ['to'], after: ['to'], match: 'get' }, // "to get to"
      { before: ['for'], after: ['a'], match: 'second' }, // "for a second"
      { before: ['at'], after: [], match: 'the' }, // "at the"
      { before: ['in'], after: [], match: 'the' }, // "in the"
      { before: ['on'], after: [], match: 'the' }, // "on the"
    ]

    let expandedStart = startToken
    let expandedEnd = endToken

    // Rule 1: If noun preceded by article/determiner, include it
    if (startToken > 0) {
      const prevToken = refTokens[startToken - 1]?.toLowerCase()
      if (prevToken && ARTICLES.has(prevToken)) {
        expandedStart = startToken - 1
      }
    }

    // Rule 2: Check for infinitive/prep patterns
    for (const pattern of PREP_PATTERNS) {
      if (expectedLower === pattern.match) {
        // Check before tokens
        let matchesBefore = true
        for (let i = 0; i < pattern.before.length; i++) {
          const tokenIdx = startToken - pattern.before.length + i
          if (tokenIdx < 0 || refTokens[tokenIdx]?.toLowerCase() !== pattern.before[i]) {
            matchesBefore = false
            break
          }
        }
        // Check after tokens
        let matchesAfter = true
        for (let i = 0; i < pattern.after.length; i++) {
          const tokenIdx = endToken + 1 + i
          if (tokenIdx >= refTokens.length || refTokens[tokenIdx]?.toLowerCase() !== pattern.after[i]) {
            matchesAfter = false
            break
          }
        }
        if (matchesBefore && matchesAfter) {
          expandedStart = Math.max(0, startToken - pattern.before.length)
          expandedEnd = Math.min(refTokens.length - 1, endToken + pattern.after.length)
        } else if (matchesBefore) {
          expandedStart = Math.max(0, startToken - pattern.before.length)
        } else if (matchesAfter) {
          expandedEnd = Math.min(refTokens.length - 1, endToken + pattern.after.length)
        }
        break
      }
    }

    // Rule 3: If noun, check if next token is also a noun (compound noun like "train station")
    if (endToken < refTokens.length - 1) {
      const nextToken = refTokens[endToken + 1]?.toLowerCase()
      // Simple heuristic: if next token exists and current is a noun-like word, include it
      if (nextToken && !ARTICLES.has(nextToken) && !['to', 'of', 'at', 'in', 'on', 'for', 'and', 'but'].includes(nextToken)) {
        // Check if it forms a compound (limit expansion to +1 token)
        expandedEnd = endToken + 1
      }
    }

    // Limit expansion: max 2 tokens on each side
    const maxExpansion = 2
    expandedStart = Math.max(0, startToken - maxExpansion)
    expandedEnd = Math.min(refTokens.length - 1, endToken + maxExpansion)

    const chunkText = refTokens.slice(expandedStart, expandedEnd + 1).join(' ')

    return {
      chunkText: chunkText || expectedSpan,
      chunkRefStart: expandedStart,
      chunkRefEnd: expandedEnd
    }
  }

  // Helper: Build display_chunk from event + patternFeedback or expand with function words
  function buildDisplayChunk(
    event: any,
    refTokens: string[],
    patternFeedback?: Array<any>
  ): { display_chunk: string; highlight_start_token: number; highlight_end_token: number } {
    // Task A.1: Check if patternFeedback contains overlapping span
    if (patternFeedback && patternFeedback.length > 0) {
      const eventCharStart = refTokens.slice(0, event.refStart).join(' ').length + (event.refStart > 0 ? 1 : 0)
      const eventCharEnd = eventCharStart + (refTokens.slice(event.refStart, event.refEnd + 1).join(' ').length)
      
      const matchingPattern = patternFeedback.find((pf: any) => {
        // Check if pattern span overlaps with event range (character indices)
        return pf.ref_start <= eventCharEnd && pf.ref_end >= eventCharStart
      })
      
      if (matchingPattern) {
        // Convert character indices to token indices
        let charCount = 0
        let startToken = -1
        let endToken = -1
        
        for (let i = 0; i < refTokens.length; i++) {
          const token = refTokens[i]
          const tokenStart = charCount
          const tokenEnd = charCount + token.length
          
          if (startToken === -1 && matchingPattern.ref_start >= tokenStart && matchingPattern.ref_start < tokenEnd) {
            startToken = i
          }
          if (matchingPattern.ref_end >= tokenStart && matchingPattern.ref_end <= tokenEnd) {
            endToken = i
            break
          }
          
          charCount = tokenEnd + 1 // +1 for space
        }
        
        if (startToken >= 0 && endToken >= 0) {
          return {
            display_chunk: matchingPattern.writtenForm || matchingPattern.written_form || event.expectedSpan,
            highlight_start_token: startToken,
            highlight_end_token: endToken
          }
        }
      }
    }
    
    // Task A.2: Build display_chunk by expanding with function words
    const FUNCTION_WORDS = new Set(['to', 'the', 'a', 'an', 'of', 'at', 'in', 'on', 'for', 'and', 'but'])
    const words = event.expectedSpan.split(/\s+/).filter((w: string) => w.trim())
    const startToken = event.refStart
    const endToken = event.refEnd
    
    // Expand backward: add function words within -1 token
    let expandedStart = startToken
    if (startToken > 0) {
      const prevToken = refTokens[startToken - 1]?.toLowerCase()
      if (prevToken && FUNCTION_WORDS.has(prevToken)) {
        expandedStart = startToken - 1
      }
    }
    
    // Expand forward: add function words within +1 token
    let expandedEnd = endToken
    if (endToken < refTokens.length - 1) {
      const nextToken = refTokens[endToken + 1]?.toLowerCase()
      if (nextToken && FUNCTION_WORDS.has(nextToken)) {
        expandedEnd = endToken + 1
      }
    }
    
    // Ensure 2-6 words
    const expandedTokens = refTokens.slice(expandedStart, expandedEnd + 1)
    if (expandedTokens.length < 2) {
      // Too short, expand more
      if (expandedStart > 0) expandedStart = Math.max(0, expandedStart - 1)
      if (expandedEnd < refTokens.length - 1) expandedEnd = Math.min(refTokens.length - 1, expandedEnd + 1)
    } else if (expandedTokens.length > 6) {
      // Too long, take centered chunk
      const center = Math.floor((expandedStart + expandedEnd) / 2)
      expandedStart = Math.max(0, center - 2)
      expandedEnd = Math.min(refTokens.length - 1, center + 3)
    }
    
    const display_chunk = refTokens.slice(expandedStart, expandedEnd + 1).join(' ')
    
    return {
      display_chunk,
      highlight_start_token: expandedStart,
      highlight_end_token: expandedEnd
    }
  }

  // Type definition for event groups
  type EventGroup = {
    key: string
    spoken_unit: string | null
    context_source?: 'db' | 'phraseHint' | 'derived' | 'none' // Track where context came from
    events: AlignmentEvent[]
    target_texts: string[]
    heard_texts: string[]
    refStart: number
    refEnd: number
    hasPhraseHint: boolean
    isMultiToken: boolean // Track if context is multi-token
  }

  // Common function words that should be grouped with context
  const FUNCTION_WORDS = new Set([
    'a', 'an', 'the',
    'to', 'of', 'for', 'at', 'in', 'on', 'with', 'from', 'by',
    'and', 'but', 'or', 'so', 'if', 'as',
    'is', 'was', 'are', 'were', 'be', 'been',
    'have', 'has', 'had',
    'do', 'does', 'did',
    'will', 'would', 'can', 'could', 'should', 'may', 'might',
    'this', 'that', 'these', 'those',
    'my', 'your', 'his', 'her', 'its', 'our', 'their'
  ])

  /**
   * Build token-to-char index mapping (ONE PASS)
   * Returns tokenStartChar[i] = character index where refTokens[i] starts in transcript
   * 
   * Approach:
   * - Walk transcript left-to-right with a pointer
   * - For each token, find next occurrence at or after pointer
   * - Tolerant to punctuation and smart quotes
   * - Never crashes (fallback to last known position)
   */
  function buildTokenCharIndexMap(refTokens: string[], transcript: string): number[] {
    const tokenStartChar: number[] = []
    let pointer = 0
    
    // Normalize for matching (handle smart quotes, case-insensitive)
    const normalizeForMatch = (s: string) => 
      s.toLowerCase()
        .replace(/['']/g, "'")  // Smart apostrophes → normal apostrophe
        .replace(/[""]/g, '"')  // Smart quotes → normal quotes
        .trim()
    
    const normalizedTranscript = normalizeForMatch(transcript)
    
    for (let i = 0; i < refTokens.length; i++) {
      const token = refTokens[i]
      const normalizedToken = normalizeForMatch(token)
      
      if (!normalizedToken) {
        // Empty token, use current pointer
        tokenStartChar.push(pointer)
        continue
      }
      
      // Find next occurrence at or after pointer
      const searchArea = normalizedTranscript.slice(pointer)
      const relativeIdx = searchArea.indexOf(normalizedToken)
      
      if (relativeIdx === -1) {
        // Token not found - fallback to current pointer (don't crash)
        tokenStartChar.push(pointer)
        if (process.env.NODE_ENV === 'development') {
          console.warn('[TokenCharMap] Token not found:', { token, pointer, transcript: transcript.substring(pointer, pointer + 50) })
        }
      } else {
        // Found token
        const charIdx = pointer + relativeIdx
        tokenStartChar.push(charIdx)
        // Move pointer past this token
        pointer = charIdx + normalizedToken.length
      }
    }
    
    return tokenStartChar
  }

  // Build context chunk for an event (derive from refTokens if no phraseHint)
  function buildContextChunkForEvent(event: AlignmentEvent, refTokens: string[]): string {
    // A) If phraseHint exists, use it
    if (event.phraseHint?.spanText) {
      return event.phraseHint.spanText
    }

    const expectedSpan = event.expectedSpan || ''
    const normalizedSpan = expectedSpan.toLowerCase().trim()
    
    // B) If function word, expand forward up to 3 tokens
    if (FUNCTION_WORDS.has(normalizedSpan)) {
      const startIdx = event.refStart
      const contextTokens: string[] = []
      
      // Add the function word itself
      if (startIdx < refTokens.length) {
        contextTokens.push(refTokens[startIdx])
      }
      
      // Expand forward up to 3 more tokens (stop at punctuation)
      for (let i = 1; i <= 3 && (startIdx + i) < refTokens.length; i++) {
        const token = refTokens[startIdx + i]
        // Stop at punctuation
        if (/^[.,;:!?]$/.test(token)) break
        contextTokens.push(token)
      }
      
      return contextTokens.join(' ')
    }
    
    // C) Content word: optionally expand to include immediate function words
    const startIdx = event.refStart
    const endIdx = event.refEnd
    const contextTokens: string[] = []
    
    // Check backward for function word
    if (startIdx > 0) {
      const prevToken = refTokens[startIdx - 1]
      if (FUNCTION_WORDS.has(prevToken?.toLowerCase())) {
        contextTokens.push(prevToken)
      }
    }
    
    // Add the content word(s)
    for (let i = startIdx; i <= endIdx && i < refTokens.length; i++) {
      contextTokens.push(refTokens[i])
    }
    
    // Check forward for function word
    if (endIdx + 1 < refTokens.length) {
      const nextToken = refTokens[endIdx + 1]
      if (FUNCTION_WORDS.has(nextToken?.toLowerCase())) {
        contextTokens.push(nextToken)
      }
    }
    
    // Keep it short (max 5 tokens)
    return contextTokens.slice(0, 5).join(' ')
  }

  // Group alignment events by spoken unit (phraseHint or derived context) for chunk-first insight cards
  function groupEventsBySpokenUnit(events: AlignmentEvent[], refTokens: string[]): EventGroup[] {
    const groupMap = new Map<string, EventGroup>()
    
    for (const event of events) {
      // Only group missing/substitution events
      if (event.type !== 'missing' && event.type !== 'substitution') continue
      
      // Build context chunk (phraseHint or derived from refTokens)
      const contextChunk = buildContextChunkForEvent(event, refTokens)
      const groupKey = contextChunk || event.expectedSpan || 'unknown'
      
      if (!groupMap.has(groupKey)) {
        const isMultiToken = groupKey.split(/\s+/).length > 1
        groupMap.set(groupKey, {
          key: groupKey,
          spoken_unit: contextChunk,
          events: [],
          target_texts: [],
          heard_texts: [],
          refStart: event.refStart,
          refEnd: event.refEnd,
          hasPhraseHint: !!event.phraseHint,
          isMultiToken,
        })
      }
      
      const group = groupMap.get(groupKey)!
      group.events.push(event)
      group.target_texts.push(event.expectedSpan)
      if (event.type === 'substitution' && event.actualSpan) {
        group.heard_texts.push(event.actualSpan)
      }
      group.refStart = Math.min(group.refStart, event.refStart)
      group.refEnd = Math.max(group.refEnd, event.refEnd)
    }
    
    return Array.from(groupMap.values())
  }

  // Select top 3 groups by priority: multi-token > phraseHint > size > position
  function selectTop3Groups(groups: EventGroup[]): EventGroup[] {
    // Sort by:
    // 1. Multi-token context (chunk-like) - highest priority
    // 2. Has phraseHint (explicitly marked chunks) - high priority
    // 3. Size (number of missed parts) - more issues = higher priority
    // 4. Position in sentence (earlier = higher priority)
    const sorted = groups.sort((a, b) => {
      // Prioritize multi-token contexts
      if (a.isMultiToken !== b.isMultiToken) {
        return a.isMultiToken ? -1 : 1
      }
      // Then phraseHint
      if (a.hasPhraseHint !== b.hasPhraseHint) {
        return a.hasPhraseHint ? -1 : 1
      }
      // Then size
      if (a.events.length !== b.events.length) {
        return b.events.length - a.events.length
      }
      // Finally position
      return a.refStart - b.refStart
    })
    
    return sorted.slice(0, 3)
  }

  // Fetch AI insights for top 3 mistakes
  const fetchMultipleInsights = async () => {
    // Generate a unique key for this phrase to cache feedback
    const phraseId = `${clipId || storyClipId || 'default'}_${diffResult?.transcript || ''}`
    
    // Check cache first
    const cachedFeedback = lastSuccessfulFeedbackRef.current.get(phraseId)
    if (cachedFeedback && cachedFeedback.length > 0) {
      if (process.env.NODE_ENV === 'development') {
        console.log('✅ [Review] Using cached feedback for phrase:', phraseId)
      }
      setAiInsights(cachedFeedback)
      setInsightError(null)
      return
    }
    
    if (!diffResult?.events || diffResult.events.length === 0) {
      // No events - this is expected, don't treat as error
      setInsightError(null)
      return
    }
    
    // Cancel any previous request
    if (insightAbortControllerRef.current) {
      insightAbortControllerRef.current.abort()
    }
    
    // Create new AbortController for this request
    const abortController = new AbortController()
    insightAbortControllerRef.current = abortController
    
    setInsightLoading(true)
    setInsightError(null)
    
    try {
      // Import prioritization utility
      const { prioritizeAndSelectTop3 } = await import('@/lib/mistakePrioritization')
      
      // Get clip metadata if available (for focusAreas)
      let clipMetadata: { focusAreas?: string[] } | undefined = undefined
      if (storyId && clipId) {
        // Try to get clip metadata from session storage
        const storedClip = sessionStorage.getItem(`clip_${clipId}`)
        if (storedClip) {
          try {
            const data = JSON.parse(storedClip)
            clipMetadata = { focusAreas: data.focusAreas || [] }
          } catch (e) {
            console.warn('Failed to parse stored clip:', e)
          }
        }
      }
      
      // Debug logging: Raw events
      if (process.env.NODE_ENV === 'development') {
        console.log('[WHYHARD] Raw events:', diffResult.events.length)
        console.table(diffResult.events.map((e: any) => ({
          type: e.type,
          expectedSpan: e.expectedSpan,
          actualSpan: e.actualSpan,
          phraseHint: e.phraseHint?.spanText || null,
          refStart: e.refStart,
          refEnd: e.refEnd,
        })))
      }
      
      // Get refTokens for context derivation
      const refTokens = diffResult.refTokens || []
      
      // NEW APPROACH: Group events by spoken unit before selecting top 3
      // This creates chunk-first cards and reduces single-token cards
      // Context is derived from refTokens when phraseHint is missing
      const groups = groupEventsBySpokenUnit(diffResult.events, refTokens)
      
      // Debug logging: All groups (before selection)
      if (process.env.NODE_ENV === 'development') {
        console.log('[WHYHARD] Grouped events into:', groups.length, 'groups')
        console.table(groups.map(g => ({
          key: g.key,
          context: g.spoken_unit || '(none)',
          targets: g.target_texts.join(' | '),
          heard: g.heard_texts.join(' | '),
          size: g.events.length,
          multiToken: g.isMultiToken,
          hasPhraseHint: g.hasPhraseHint,
        })))
      }
      
      // Select top 3 groups by priority
      const topGroups = selectTop3Groups(groups)
      
      // Debug logging: Selected groups (before DB enrichment)
      if (process.env.NODE_ENV === 'development') {
        console.log('[WHYHARD] Selected top 3 groups (before DB enrichment):')
        console.table(topGroups.map((g, i) => ({
          rank: i + 1,
          targets: g.target_texts.join(' | '),
          context_before: g.spoken_unit || '(none)',
          source_before: g.hasPhraseHint ? 'phraseHint' : 'derived',
          multiToken: g.isMultiToken,
          size: g.events.length,
        })))
      }
      
      // ✨ DB CHUNK ENRICHMENT: Overwrite context with DB chunks for top groups only
      // This ensures chunk boundaries match Chunk Dictionary (max 3 API calls)
      const transcript = diffResult.transcript || currentPhrase.text
      const dbClipId = currentStoryClipRef.current?.dbClipId || clipId || ''
      
      if (dbClipId && transcript && topGroups.length > 0) {
        // Build token→char index map (ONE PASS for all groups)
        const tokenStartChar = buildTokenCharIndexMap(refTokens, transcript)
        
        if (process.env.NODE_ENV === 'development') {
          console.log('[WHYHARD] Built token→char map:', {
            tokenCount: refTokens.length,
            mapLength: tokenStartChar.length,
            sample: tokenStartChar.slice(0, 5),
          })
        }
        
        // For each top group, try to fetch DB chunk
        for (let i = 0; i < topGroups.length; i++) {
          const group = topGroups[i]
          const repTokenIndex = group.refStart // Representative token for this group
          const charIdx = tokenStartChar[repTokenIndex] || 0
          
          try {
            const chunkHit = await fetchChunkHit(dbClipId, charIdx)
            
            if (chunkHit?.chunk_display) {
              // DB chunk found - overwrite context
              group.spoken_unit = chunkHit.chunk_display
              group.context_source = 'db'
              
              if (process.env.NODE_ENV === 'development') {
                console.log(`[WHYHARD] DB chunk enrichment for group ${i + 1}:`, {
                  targets: group.target_texts.join(' | '),
                  repTokenIndex,
                  charIdx,
                  dbChunk: chunkHit.chunk_display,
                })
              }
            } else {
              // DB chunk not found - mark as fallback
              group.context_source = group.hasPhraseHint ? 'phraseHint' : 'derived'
              
              if (process.env.NODE_ENV === 'development') {
                console.log(`[WHYHARD] No DB chunk for group ${i + 1}, using fallback:`, {
                  targets: group.target_texts.join(' | '),
                  charIdx,
                  fallbackContext: group.spoken_unit,
                })
              }
            }
          } catch (err) {
            // DB lookup failed - keep existing context
            group.context_source = group.hasPhraseHint ? 'phraseHint' : 'derived'
            
            if (process.env.NODE_ENV === 'development') {
              console.warn('[WHYHARD] DB chunk lookup failed for group', i + 1, err)
            }
          }
        }
        
        // Debug logging: Coverage stats
        if (process.env.NODE_ENV === 'development') {
          const dbCount = topGroups.filter(g => g.context_source === 'db').length
          const phraseCount = topGroups.filter(g => g.context_source === 'phraseHint').length
          const derivedCount = topGroups.filter(g => g.context_source === 'derived').length
          
          console.log('[WHYHARD] DB enrichment complete:', {
            totalGroups: topGroups.length,
            dbChunks: dbCount,
            phraseHint: phraseCount,
            derived: derivedCount,
            dbCoverage: `${Math.round(dbCount / topGroups.length * 100)}%`,
          })
          
          console.log('[WHYHARD] Final top groups (after DB enrichment):')
          console.table(topGroups.map((g, i) => ({
            rank: i + 1,
            targets: g.target_texts.join(' | '),
            context_after: g.spoken_unit || '(none)',
            source_after: g.context_source || 'unknown',
            multiToken: g.isMultiToken,
            size: g.events.length,
          })))
        }
      } else {
        // Missing dbClipId or transcript - skip DB enrichment
        if (process.env.NODE_ENV === 'development') {
          console.warn('[WHYHARD] Skipping DB enrichment:', {
            hasDbClipId: !!dbClipId,
            hasTranscript: !!transcript,
            groupCount: topGroups.length,
          })
        }
        
        // Mark all as fallback
        topGroups.forEach(g => {
          g.context_source = g.hasPhraseHint ? 'phraseHint' : 'derived'
        })
      }
      
      console.log(`📝 [Review] Fetching insights for ${topGroups.length} mistake groups`)
      
      // 3. Fetch insights for each group (up to 3 groups)
      const insightPromises = topGroups.map((group, groupIndex) => {
        // For each group, create ONE insight card
        // target_text: join all missed parts (or single if only one)
        // context_chunk: the spoken unit (phraseHint) if available
        // heard_text: join all misheard parts
        
        const targetText = group.target_texts.length === 1 
          ? group.target_texts[0] 
          : group.target_texts.join(', ')
        
        const contextChunk = group.spoken_unit
        
        const heardText = group.heard_texts.length > 0 
          ? group.heard_texts.join(', ') 
          : null
        
        // Use group's aggregated range
        const highlightStart = group.refStart
        const highlightEnd = group.refEnd
        
        // Dev logging
        if (process.env.NODE_ENV === 'development') {
          console.log('[InsightChunk] Group', groupIndex, {
            key: group.key,
            targetText,
            contextChunk,
            heardText,
            refStart: highlightStart,
            refEnd: highlightEnd,
            eventCount: group.events.length
          })
        }
        
        // Extract context tokens (prev/next) for better pronunciation hints
        // (refTokens already declared above)
        const prevToken = highlightStart > 0 ? refTokens[highlightStart - 1] : undefined
        const nextToken = highlightEnd < refTokens.length ? refTokens[highlightEnd] : undefined
        
        return fetch('/api/insight', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            target_text: targetText,
            heard_text: heardText,
            context_chunk: contextChunk,
            transcript: diffResult.transcript || currentPhrase.text,
            userText: diffResult.userText || userText,
            userLocale: locale,
            chunkRefStart: highlightStart,
            chunkRefEnd: highlightEnd
          }),
          signal: abortController.signal
        }).then(async r => {
          // Check if request was aborted
          if (abortController.signal.aborted) {
            throw new Error('Request aborted')
          }
          const insight = await r.json()
          
          // Dev logging
          if (process.env.NODE_ENV === 'development') {
            console.log('[InsightLLM]', {
              request: { target_text: targetText, heard_text: heardText, context_chunk: contextChunk },
              response: {
                missed_text: insight.missed_text,
                context_chunk: insight.context_chunk,
                has_how_it_sounds: !!insight.how_it_sounds,
                has_example: !!insight.example
              }
            })
          }
          
          // Generate stable card ID: phraseId:groupId
          const phraseId = `${clipId || storyClipId || 'default'}`
          const groupId = groupIndex
          const stableCardId = `${phraseId}:${groupId}`
          
          // Determine event type from group (use first event as representative)
          const representativeType = group.events[0]?.type || 'missing'
          
          return {
            ...insight,
            id: stableCardId, // Explicit card ID for logging
            eventType: representativeType,
            highlight_start_token: highlightStart,
            highlight_end_token: highlightEnd,
            // Store stable card ID for React key and cache key generation
            _cardId: stableCardId
          }
        })
      })
      
      const insights = await Promise.all(insightPromises)
      
      // Check if request was aborted before updating state
      if (abortController.signal.aborted) {
        return
      }
      
      // Cache successful feedback
      lastSuccessfulFeedbackRef.current.set(phraseId, insights)
      
      setAiInsights(insights)
      setInsightError(null)
      
      // Debug logging: Check what the insights contain
      if (process.env.NODE_ENV === 'development') {
        console.log(`✅ [Review] Generated ${insights.length} insights:`, 
          insights.map((insight, idx) => ({
            index: idx,
            what_it_was: insight.what_it_was, // This is the displayed "missed part" text
            replay_target: insight.replay_target, // This contains the highlight range
            eventType: insight.eventType
          }))
        )
      }
      
    } catch (error: any) {
      // Don't update state if request was aborted
      if (abortController.signal.aborted || error.name === 'AbortError') {
        if (process.env.NODE_ENV === 'development') {
          console.log('🔄 [Review] Request aborted (new request started)')
        }
        return
      }
      
      console.error('❌ [Review] Failed to fetch multiple insights:', error)
      
      // Try to use cached feedback if available
      const cachedFeedback = lastSuccessfulFeedbackRef.current.get(phraseId)
      if (cachedFeedback && cachedFeedback.length > 0) {
        if (process.env.NODE_ENV === 'development') {
          console.log('🔄 [Review] Using cached feedback after error')
        }
        setAiInsights(cachedFeedback)
        setInsightError(null)
      } else {
        // Only set error if we have no cached feedback
        setInsightError(error.message || 'Failed to load feedback. Please try again.')
        // Don't clear aiInsights - keep last successful state if any
      }
    } finally {
      // Only update loading state if this request wasn't aborted
      if (!abortController.signal.aborted) {
        setInsightLoading(false)
      }
    }
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
    const summary = pickTopIssue(
      diffResult.tokens,
      diffResult.events,
      refTokens,
      refText,
      userTextForSummary,
      accuracyPercent
    )
    
    // Debug logging: Check what examplePhrase we got
    if (process.env.NODE_ENV === 'development' && summary) {
      console.log('🔍 [Review] reviewSummary generated:', {
        examplePhrase: summary.examplePhrase,
        categoryId: summary.categoryId,
        title: summary.title,
        phrasesToPractice: summary.phrasesToPractice,
        // Check if any events have phraseHint
        eventsWithPhraseHint: diffResult.events.filter((e: any) => e.phraseHint).map((e: any) => ({
          type: e.type,
          expectedSpan: e.expectedSpan,
          phraseHint: e.phraseHint?.spanText
        }))
      })
    }
    
    return summary
  }, [diffResult, currentPhrase.text, userText])

  const handleContinue = () => {
    // Story-based flow with explicit clipIndex: go to next clip in same story,
    // but when all clips are finished, go to completion screen.
    if (storyId && clipIndexParam !== null) {
      const currentIndex = parseInt(clipIndexParam, 10)
      const safeCurrentIndex = Number.isNaN(currentIndex) ? 0 : currentIndex

      // Look up how many clips this story has (DB-only)
      const { story } = getStoryByIdClientDbOnly(storyId)
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
    router.push(`/${locale}/practice/select`)
  }

  const handleBack = () => {
    router.back()
  }

  // Handle transcript click to fetch chunk
  const handleTranscriptClick = async (charIdx: number, anchorRect: DOMRect | null) => {
    if (!diffResult) return

    // Use the same reference string as used for rendering
    const refTokens = diffResult.refTokens || []
    const transcriptForOffsets = 
      (refTokens.length > 0 ? refTokens.join(' ') : null) ||
      diffResult.transcript ||
      currentPhrase.text ||
      ''
    
    if (!transcriptForOffsets || transcriptForOffsets.length === 0) {
      if (process.env.NODE_ENV === 'development') {
        console.error('❌ [Review] Cannot lookup chunk: transcriptForOffsets is empty')
      }
      return
    }
    
    if (charIdx < 0 || charIdx >= transcriptForOffsets.length) {
      if (process.env.NODE_ENV === 'development') {
        console.error('❌ [Review] Invalid charIdx:', {
          charIdx,
          transcriptLength: transcriptForOffsets.length,
        })
      }
      return
    }

    // Resolve clipId with priority: route clipId > story clip dbClipId
    // CRITICAL: Do NOT fallback to storyClipId (mock IDs like 'clip-5-4' won't work in DB)
    const resolvedClipId = (() => {
      // Priority 1: Route param clipId (if present)
      if (clipId && clipId.trim()) {
        return clipId.trim()
      }
      
      // Priority 2: dbClipId from story clip (REQUIRED for chunk lookup)
      if (currentStoryClipRef.current?.dbClipId && currentStoryClipRef.current.dbClipId.trim()) {
        return currentStoryClipRef.current.dbClipId.trim()
      }
      
      // No valid DB clip ID - chunk lookup unavailable
      return null
    })()

    // If no valid DB clip ID, show warning and disable chunk lookup
    if (!resolvedClipId) {
      console.warn('⚠️ [Review] Chunk lookup unavailable: no valid DB clip ID', {
        storyId,
        storyClipId,
        routeClipId: clipId || null,
        currentStoryClipId: currentStoryClipRef.current?.id || null,
        currentStoryClipDbClipId: currentStoryClipRef.current?.dbClipId || null,
        message: 'Dictionary unavailable for mock clips without DB match',
      })
      // TODO: Show toast notification to user: "Dictionary unavailable for this clip"
      return
    }

    // Open modal immediately with neutral title and skeleton
    const tempHit: ChunkHit = {
      clip_id: resolvedClipId,
      pattern_key: null,
      chunk_display: 'Looking up...', // Neutral title, will be replaced
      pattern_kind: null,
      gloss: null, // No gloss = skeleton will show
      translation_ja: null,
      ref_start: charIdx,
      ref_end: charIdx,
    }

    console.log('🖱️ [Review] Word clicked -> opening popover immediately', { charIdx, resolvedClipId })
    
    // Open modal immediately
    setChunkHit(tempHit)
    setAnchorRect(anchorRect)
    setIsChunkModalOpen(true)
    setIsResolvingChunk(true)

    if (!resolvedClipId || !resolvedClipId.trim()) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('⚠️ [Review] Cannot fetch chunk: resolvedClipId is missing/empty', {
          clipId: clipId || null,
          storyClipId: storyClipId || null,
          currentStoryClipDbClipId: currentStoryClipRef.current?.dbClipId || null,
        })
      }
      setIsResolvingChunk(false)
      return
    }

    // Fetch full chunk data and update hit (will replace skeleton with actual content)
    console.log('📡 [Review] Calling /api/chunk', { clipId: resolvedClipId, charIdx })
    await fetchAndShowChunk(resolvedClipId, charIdx, anchorRect)
  }

  // Helper: Find event(s) at a given charIdx for fallback feedback
  const findEventAtCharIdx = (charIdx: number): any | null => {
    if (!diffResult?.events || !diffResult.refTokens) return null
    
    const refTokens = diffResult.refTokens
    const transcriptForOffsets = 
      (refTokens.length > 0 ? refTokens.join(' ') : null) ||
      diffResult.transcript ||
      ''
    
    if (!transcriptForOffsets || charIdx < 0 || charIdx >= transcriptForOffsets.length) {
      return null
    }
    
    // Find which token contains this charIdx
    let charCount = 0
    let tokenIndex = -1
    
    for (let i = 0; i < refTokens.length; i++) {
      const token = refTokens[i]
      const tokenStart = charCount
      const tokenEnd = charCount + token.length
      
      if (charIdx >= tokenStart && charIdx < tokenEnd) {
        tokenIndex = i
        break
      }
      
      charCount = tokenEnd + 1 // +1 for space
    }
    
    if (tokenIndex < 0) return null
    
    // Find event(s) that overlap with this token
    const overlappingEvent = diffResult.events.find((event: any) => {
      return event.refStart <= tokenIndex && event.refEnd >= tokenIndex
    })
    
    return overlappingEvent || null
  }

  const fetchAndShowChunk = async (clipId: string, charIdx: number, anchorRect: DOMRect | null) => {
    setIsLoadingChunk(true)
    
    // Modal is already open with neutral title and skeleton - update it with API response
    try {
      const startTime = Date.now()
      const hit = await fetchChunkHit(clipId, charIdx)
      const duration = Date.now() - startTime
      
      console.log('✅ [Review] /api/chunk response received', { 
        duration: `${duration}ms`,
        hasHit: !!hit,
        chunk_display: hit?.chunk_display,
        hasGloss: !!hit?.gloss,
        chunk_id: hit?.chunk_id,
      })
      
      if (!hit) {
        // No chunk found - close modal
        console.log('⚠️ [Review] API returned hit=null, closing modal')
        setAnchorRect(null)
        setChunkHit(null)
        setIsChunkModalOpen(false)
        setIsResolvingChunk(false)
        return
      }
      
      // Update hit with API response (will replace skeleton with actual content)
      if (hit.chunk_display) {
        console.log('✨ [Review] Updating popover with resolved chunk', {
          chunk_display: hit.chunk_display,
          hasMeaning: !!hit.gloss,
        })
        setChunkHit(hit)
        // Keep anchorRect and modal open (already open)
      } else {
        // Chunk exists but has no display text - close modal
        console.log('⚠️ [Review] Chunk found but no display text, closing modal')
        setAnchorRect(null)
        setChunkHit(null)
        setIsChunkModalOpen(false)
      }
    } catch (error) {
      console.error('❌ [Review] Failed to fetch chunk:', error)
      // On error, keep modal open but hit will remain with skeleton (no gloss)
      // User can still see the chunk text and close manually
    } finally {
      setIsLoadingChunk(false)
      setIsResolvingChunk(false)
    }
  }

  // Helper: Open insight modal for a specific event
  const openInsightForEvent = async (event: any) => {
    if (!diffResult) return
    
    const transcript = diffResult.transcript || ''
    const userTextForReq = diffResult.userText || ''
    
    setLoadingInsight(true)
    try {
      const res = await fetch('/api/insight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event,
          transcript,
          userText: userTextForReq,
          userLocale: 'en',
        }),
      })
      
      if (!res.ok) {
        // If insight API fails, just show existing insights modal
        if (aiInsights.length > 0) {
          setShowInsightsModal(true)
          setCurrentInsightIndex(0)
        }
        return
      }
      
      const insight = await res.json()
      
      // Create a single insight array and show modal
      setAiInsights([insight])
      setCurrentInsightIndex(0)
      setShowInsightsModal(true)
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('❌ [Review] Failed to fetch insight for event:', error)
      }
      // Fallback: show existing insights if available
      if (aiInsights.length > 0) {
        setShowInsightsModal(true)
        setCurrentInsightIndex(0)
      }
    } finally {
      setLoadingInsight(false)
    }
  }

  return (
    <main className="flex min-h-screen flex-col">
      {/* Top Bar - Progress bar at very top (Duolingo style) */}
      {/* Progress now managed by shared ClipLessonProgress context */}
      <ClipTopBar
        onBack={handleBack}
        // Override percent to show cumulative per-clip progress within the current story session
        overridePercent={(() => {
          // Get story to determine total clips in session
          let totalClips = 3 // Default fallback
          if (storyId) {
            const { story } = getStoryByIdClientDbOnly(storyId)
            if (story?.clips?.length) {
              totalClips = story.clips.length
            }
          }
          
          const safeIndex = Number.isNaN(clipIndex) ? 0 : Math.max(0, clipIndex)
          // Calculate progress: (current clip index + 1) / total clips
          // clipIndex is 0-indexed, so clipIndex=0 means "clip 1 of N"
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
                  <div className="mb-6 p-6 py-7 bg-green-50 rounded-xl border border-green-200">
                    <div className="flex items-start gap-3">
                      {/* Success Icon */}
                      <div className="flex-shrink-0 mt-0.5">
                        <div className="w-5 h-5 text-green-600 text-xl font-bold">✓</div>
                      </div>
                      {/* Summary text */}
                      <div className="flex-1 space-y-2">
                        <div className="text-base md:text-lg font-medium text-green-900 leading-relaxed">
                          Great! You got the meaning
                        </div>
                        {diffResult.semanticEval.missingKeywords.length > 0 && (
                          <div className="text-sm md:text-base text-green-700 leading-relaxed">
                            Minor corrections: {diffResult.semanticEval.missingKeywords.join(', ')}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mb-6 p-6 py-7 bg-orange-50 rounded-xl border border-orange-200">
                    <div className="flex items-start gap-3">
                      {/* Warning Icon */}
                      <div className="flex-shrink-0 mt-0.5">
                        <div className="w-5 h-5 text-orange-600 text-xl">⚠️</div>
                      </div>
                      {/* Summary text */}
                      <div className="flex-1 space-y-2">
                        <div className="text-base md:text-lg font-medium text-orange-900 leading-relaxed">
                          {t('practice.notQuite')}
                        </div>
                        {diffResult.semanticEval.missingUnits.length > 0 && (
                          <div className="text-sm md:text-base text-orange-700 leading-relaxed">
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
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm md:text-base font-medium text-gray-600">{t('practice.comparedToWhatYouHeard')}</h2>
                
                {/* Simple playback controls for re-listening - always use original sentence audio */}
                {currentPhrase.audioUrl && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        // Create a fresh audio instance for reliable playback
                        const audio = new Audio(currentPhrase.audioUrl)
                        audio.playbackRate = 1.0
                        audio.play()
                        setIsPlaying(true)
                        audio.addEventListener('ended', () => setIsPlaying(false))
                        audio.addEventListener('error', () => setIsPlaying(false))
                      }}
                      className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1.5 px-3 py-1.5 rounded-md hover:bg-blue-50 transition-colors"
                    >
                      ▶ Play
                    </button>
                    <button
                      onClick={() => {
                        // Create a fresh audio instance for slow playback
                        const audio = new Audio(currentPhrase.audioUrl)
                        audio.playbackRate = 0.75
                        audio.play()
                        setIsPlaying(true)
                        setIsSlow(true)
                        audio.addEventListener('ended', () => {
                          setIsPlaying(false)
                          setIsSlow(false)
                        })
                        audio.addEventListener('error', () => {
                          setIsPlaying(false)
                          setIsSlow(false)
                        })
                      }}
                      className="text-sm text-gray-600 hover:text-gray-700 font-medium flex items-center gap-1.5 px-3 py-1.5 rounded-md hover:bg-gray-100 transition-colors"
                    >
                      🐢 Slow
                    </button>
                  </div>
                )}
              </div>
              
                {/* Diff rendering with color rules - clickable for chunk lookup */}
              <div
                ref={transcriptRef}
                className="text-xl md:text-2xl font-medium leading-[1.7] mb-4 text-gray-900 select-text"
                style={{ userSelect: 'text' }}
              >
                  {(() => {
                    // Use the exact reference string that is rendered - this is the source of truth
                    // Priority: refTokens.join(' ') > diffResult.transcript > currentPhrase.text
                    const refTokens = diffResult.refTokens || []
                    const transcriptForOffsets = 
                      (refTokens.length > 0 ? refTokens.join(' ') : null) ||
                      diffResult.transcript ||
                      currentPhrase.text ||
                      ''
                    
                    if (!transcriptForOffsets) {
                      if (process.env.NODE_ENV === 'development') {
                        console.error('❌ [Review] transcriptForOffsets is empty - cannot compute charIdx')
                      }
                      return null
                    }

                    // Dev-only validation
                    if (process.env.NODE_ENV === 'development') {
                      console.log('🔍 [Review] Using transcriptForOffsets for charIdx mapping:', {
                        length: transcriptForOffsets.length,
                        preview: transcriptForOffsets.substring(0, 50) + (transcriptForOffsets.length > 50 ? '...' : ''),
                        source: refTokens.length > 0 ? 'refTokens' : diffResult.transcript ? 'diffResult.transcript' : 'currentPhrase.text',
                      })
                    }

                    // Get current insight's replay_target for highlighting (if insights modal is open)
                    const currentInsight = showInsightsModal && aiInsights.length > 0 
                      ? aiInsights[currentInsightIndex] 
                      : null
                    const replayTarget = currentInsight?.replay_target
                    const highlightStart = replayTarget?.refStart ?? -1
                    const highlightEnd = replayTarget?.refEnd ?? -1
                    
                    // Dev logging: Log highlight range and first/last tokens
                    if (process.env.NODE_ENV === 'development' && replayTarget) {
                      const refTokens = diffResult.refTokens || []
                      const firstHighlightToken = highlightStart >= 0 && highlightStart < refTokens.length 
                        ? refTokens[highlightStart] 
                        : null
                      const lastHighlightToken = highlightEnd >= 0 && highlightEnd < refTokens.length 
                        ? refTokens[highlightEnd] 
                        : null
                      console.log('🎨 [Transcript Highlight] Applying chunk highlight:', {
                        replay_target: replayTarget,
                        highlightRange: [highlightStart, highlightEnd],
                        firstToken: firstHighlightToken,
                        lastToken: lastHighlightToken,
                        what_it_was: currentInsight?.what_it_was
                      })
                    }
                    
                    // Track current position in refTokens for highlighting
                    // refTokens indices are what replay_target.refStart/refEnd refer to
                    let refTokenIndex = 0
                    
                    // Deterministic mapping: find each word's actual position in transcriptForOffsets
                    let cursor = 0
                    return (diffResult.tokens || []).map((t: any, idx: number) => {
                      const word = (t.type === 'extra' ? t.actual : t.expected) ?? ''
                      
                      // Find word's position in transcriptForOffsets starting from cursor
                      const start = transcriptForOffsets.indexOf(word, cursor)
                      let wordStart = start
                      
                      if (start === -1) {
                        // Fallback: use cursor position (dev warning - only log once per render)
                        if (process.env.NODE_ENV === 'development' && idx === 0) {
                          console.warn('⚠️ [Review] Word not found in transcriptForOffsets (first occurrence):', {
                            word,
                            cursor,
                            transcriptLength: transcriptForOffsets.length,
                            transcriptPreview: transcriptForOffsets.substring(Math.max(0, cursor - 10), Math.min(transcriptForOffsets.length, cursor + 50)),
                          })
                        }
                        wordStart = cursor
                        cursor = wordStart + word.length
                      } else {
                        cursor = start + word.length
                      }

                      // Determine refTokenIndex: tokens that exist in reference (correct/missing/substitution) map to refTokens
                      // Extra tokens don't exist in refTokens, so they get -1
                      let currentRefTokenIndex = -1
                      if (t.type !== 'extra') {
                        // This token corresponds to a position in refTokens
                        // Use refIndex if available, otherwise use the tracked refTokenIndex
                        currentRefTokenIndex = t.refIndex !== undefined ? t.refIndex : refTokenIndex
                        refTokenIndex++ // Advance for next reference token
                      }
                      
                      // Check if this token should be highlighted (refTokenIndex within replay_target range)
                      const isHighlighted = replayTarget && 
                        highlightStart >= 0 && 
                        highlightEnd >= 0 && 
                        currentRefTokenIndex >= 0 && // Only highlight tokens that exist in reference
                        currentRefTokenIndex >= highlightStart && 
                        currentRefTokenIndex <= highlightEnd

                      // Check if chunk lookup is available (requires valid DB clip ID)
                      const hasDbClipId = (() => {
                        if (clipId && clipId.trim()) return true
                        if (currentStoryClipRef.current?.dbClipId && currentStoryClipRef.current.dbClipId.trim()) {
                          return true
                        }
                        return false
                      })()

                      // Base className for token type
                      // Disable cursor-pointer if chunk lookup unavailable
                      const cursorClass = hasDbClipId ? 'cursor-pointer hover:bg-blue-50' : 'cursor-not-allowed opacity-60'
                      let baseClassName = 
                        t.type === 'correct'
                          ? `px-0.5 rounded text-gray-900 ${cursorClass}`
                          : t.type === 'missing'
                          ? `px-0.5 rounded text-gray-500 underline decoration-dotted decoration-gray-400 ${cursorClass}`
                          : t.type === 'extra'
                          ? `px-0.5 rounded text-gray-500 line-through ${cursorClass}`
                          : `px-0.5 rounded text-red-600 underline decoration-dotted decoration-red-400 ${cursorClass}`
                      
                      // Add highlight class if within replay_target range
                      const className = isHighlighted 
                        ? `${baseClassName} bg-blue-100 rounded px-0.5 font-semibold`
                        : baseClassName

                      return (
                        <span
                          key={t.id ?? idx}
                          className={className}
                          data-start={wordStart}
                          onClick={async (e) => {
                            e.stopPropagation()
                            
                            // Check if chunk lookup is available (requires valid DB clip ID)
                            const hasDbClipId = (() => {
                              if (clipId && clipId.trim()) return true
                              if (currentStoryClipRef.current?.dbClipId && currentStoryClipRef.current.dbClipId.trim()) {
                                return true
                              }
                              return false
                            })()

                            if (!hasDbClipId) {
                              // Chunk lookup unavailable - show warning
                              console.warn('⚠️ [Review] Chunk lookup disabled: no DB clip ID', {
                                storyId,
                                storyClipId,
                                routeClipId: clipId || null,
                                currentStoryClipDbClipId: currentStoryClipRef.current?.dbClipId || null,
                                message: 'Dictionary unavailable for mock clips without DB match',
                              })
                              // TODO: Show toast: "Dictionary unavailable for this clip"
                              return
                            }
                            
                            // Validate transcriptForOffsets is available
                            if (!transcriptForOffsets || transcriptForOffsets.length === 0) {
                              if (process.env.NODE_ENV === 'development') {
                                console.error('❌ [Review] Cannot lookup chunk: transcriptForOffsets is empty')
                              }
                              return
                            }
                            
                            // Use the stored start index
                            const start = wordStart
                            
                            // Validate start index
                            if (start < 0 || start >= transcriptForOffsets.length) {
                              if (process.env.NODE_ENV === 'development') {
                                console.error('❌ [Review] Invalid start index:', {
                                  start,
                                  transcriptLength: transcriptForOffsets.length,
                                  word,
                                })
                              }
                              return
                            }
                            
                            // Dev-only logging
                            if (process.env.NODE_ENV === 'development') {
                              const resolvedClipId = (() => {
                                if (clipId && clipId.trim()) return clipId.trim()
                                if (currentStoryClipRef.current?.dbClipId && currentStoryClipRef.current.dbClipId.trim()) {
                                  return currentStoryClipRef.current.dbClipId.trim()
                                }
                                return null
                              })()
                              
                              console.log('🔍 [Review] Word clicked:', {
                                clickedWord: word,
                                start,
                                end: start + word.length,
                                resolvedClipId,
                                transcriptForOffsetsLength: transcriptForOffsets.length,
                                transcriptContext: transcriptForOffsets.substring(Math.max(0, start - 5), Math.min(transcriptForOffsets.length, start + word.length + 5)),
                              })
                            }
                            
                            // Capture clicked element's bounding rect
                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                            await handleTranscriptClick(start, rect)
                          }}
                        >
                          {word}{' '}
                        </span>
                      )
                    })
                  })()}
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
                  onClick={() => {
                    // Free users: redirect to Pro page with return URL
                    if (!isPro && !subLoading) {
                      // Capture current URL for return after subscription
                      const currentPath = typeof window !== 'undefined' ? window.location.pathname + window.location.search : ''
                      const returnTo = encodeURIComponent(currentPath)
                      router.push(`/${locale}/pro?returnTo=${returnTo}`)
                      return
                    }
                    // Pro users: show modal with insights
                    setShowInsightsModal(true)
                    fetchMultipleInsights()
                  }}
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

        {/* Chunk Dictionary Popover */}
        <ChunkDictionary
          isOpen={isChunkModalOpen}
          onClose={() => {
            setIsChunkModalOpen(false)
            setChunkHit(null)
            setAnchorRect(null)
          }}
          hit={chunkHit}
          anchorRect={anchorRect}
        />
      </div>
      </div>

      {/* Insights modal (AI-generated feedback + fallback) */}
      {showInsightsModal && diffResult && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/30">
          <div className="w-full max-w-md md:max-w-2xl mx-4 bg-white rounded-2xl shadow-xl max-h-[85vh] flex flex-col overflow-hidden">
            {/* Header - Centered Title + Close */}
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div className="w-16"></div>{/* Spacer for balance */}
                
                <h2 className="text-base font-semibold text-gray-900" style={{ fontFamily: "'SF Pro Rounded', -apple-system, system-ui, sans-serif" }}>
                  Listening tip
                </h2>
                
                <button
                  type="button"
                  onClick={() => {
                    // Cancel any pending requests
                    if (insightAbortControllerRef.current) {
                      insightAbortControllerRef.current.abort()
                      insightAbortControllerRef.current = null
                    }
                    setShowInsightsModal(false)
                    // Don't reset aiInsights - keep them for next time modal opens
                    setCurrentInsightIndex(0) // Reset index
                    setInsightError(null) // Clear error
                  }}
                  className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
                  style={{ fontFamily: "'SF Pro Rounded', -apple-system, system-ui, sans-serif" }}
                >
                  {t('common.close')}
                </button>
              </div>
            </div>

            {/* Content wrapper with padding - scrollable */}
            <div className="px-6 py-6 overflow-y-auto flex-1">
              {/* Loading state - show skeleton while loading insights */}
              {insightLoading && aiInsights.length === 0 && (
                <InsightCardSkeleton />
              )}

            {/* Error state - show error UI with retry button */}
            {insightError && !insightLoading && aiInsights.length === 0 && (
              <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                <div className="space-y-3">
                  <h3 className="text-body-small font-semibold text-red-900">⚠️ Error loading feedback</h3>
                  <p className="text-sm text-red-700">{insightError}</p>
                  <button
                    onClick={() => {
                      setInsightError(null)
                      fetchMultipleInsights()
                    }}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
                  >
                    Retry
                  </button>
                </div>
              </div>
            )}

              {/* AI-generated insights carousel */}
              {aiInsights.length > 0 && !insightLoading && (
                <div className="relative">
                  {/* Current insight card with swipe support */}
                  <div
                    onTouchStart={(e) => setTouchStart(e.targetTouches[0].clientX)}
                    onTouchMove={(e) => setTouchEnd(e.targetTouches[0].clientX)}
                    onTouchEnd={() => {
                      if (touchStart - touchEnd > 75) {
                        // Swipe left → next
                        setCurrentInsightIndex(i => Math.min(aiInsights.length - 1, i + 1))
                      }
                      if (touchStart - touchEnd < -75) {
                        // Swipe right → previous
                        setCurrentInsightIndex(i => Math.max(0, i - 1))
                      }
                    }}
                    className="space-y-4"
                  >
                    {/* Render current insight using InsightCard component */}
                    <InsightCard 
                      insight={aiInsights[currentInsightIndex]} 
                      voiceId={stableVoiceId}
                      cardId={aiInsights[currentInsightIndex]?._cardId || `${clipId || storyClipId || 'default'}:${currentInsightIndex}`}
                      key={aiInsights[currentInsightIndex]?._cardId || `insight-${currentInsightIndex}`}
                      onSave={handleSaveTip}
                      onUnsave={handleUnsaveTip}
                      isSaved={savedTips.has(aiInsights[currentInsightIndex]?.missed_text || aiInsights[currentInsightIndex]?.display_chunk || aiInsights[currentInsightIndex]?.what_it_was || '')}
                    />
                  </div>
                </div>
              )}

            {/* Fallback: Show when no mistakes exist OR when API failed but we have events */}
            {(() => {
              const hasEvents = diffResult?.events && Array.isArray(diffResult.events) && diffResult.events.length > 0
              const shouldShowFallback = aiInsights.length === 0 && !insightLoading && !insightError && !hasEvents
              
              if (shouldShowFallback) {
                // No mistakes detected - show friendly message
                return (
                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-body-small font-semibold mb-2 text-gray-900">✅ No specific miss detected</h3>
                        <p className="text-sm text-gray-700">
                          Great job! You caught the main content. Keep listening for details like articles, prepositions, and linking sounds.
                        </p>
                      </div>
                    </div>
                  </div>
                )
              }
              
              // If we have events but no insights and no error, show a loading-like state
              // This should rarely happen, but ensures modal never appears blank
              if (hasEvents && aiInsights.length === 0 && !insightLoading && !insightError) {
                // This is a safety net - should not normally reach here
                if (process.env.NODE_ENV === 'development') {
                  console.warn('⚠️ [Review] Modal in unexpected state - showing safety fallback', {
                    hasEvents,
                    aiInsightsLength: aiInsights.length,
                    insightLoading,
                    insightError,
                    eventsCount: diffResult?.events?.length || 0
                  })
                }
                
                // Generate a minimal fallback insight from the first event
                const firstEvent = diffResult.events?.[0]
                const missedText = firstEvent?.expectedSpan || 'a word'
                
                return (
                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-body-small font-semibold mb-2 text-gray-900">❌ What you missed</h3>
                        <p className="text-base font-medium text-gray-900 mb-2">{missedText}</p>
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold mb-1 text-gray-800">👂 How it sounds</h4>
                        <p className="text-sm text-gray-700">
                          In fast speech, small words like "{missedText}" often blend with surrounding words. Listen for linking sounds and weak forms.
                        </p>
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold mb-1 text-gray-800">🔁 One example</h4>
                        <p className="text-sm text-gray-700 italic">
                          "{diffResult?.transcript || 'Example sentence'}"
                        </p>
                      </div>
                    </div>
                  </div>
                )
              }
              
              return null
            })()}

            {/* Pattern Feedback Section - Only show as fallback if AI insights not available */}
            {aiInsights.length === 0 && !insightLoading && diffResult.semanticEval && !diffResult.semanticEval.understood && diffResult.patternFeedback && diffResult.patternFeedback.length > 0 && (
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

              {/* Removed generic fallback card - use normal per-mistake cards instead */}
              {/* If no insights but events exist, they should be shown via normal cards above */}
            </div>
            {/* End content wrapper */}
            
            {/* Fixed Footer - Navigation (ALWAYS show if multiple insights) */}
            {aiInsights.length > 1 && (
              <div className="px-6 py-4 border-t border-gray-200 bg-white">
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setCurrentInsightIndex(i => Math.max(0, i - 1))}
                    disabled={currentInsightIndex === 0}
                    className="text-sm font-medium text-gray-600 hover:text-gray-900 disabled:text-gray-300 disabled:cursor-not-allowed transition-colors"
                    style={{ fontFamily: "'SF Pro Rounded', -apple-system, system-ui, sans-serif" }}
                  >
                    ← Prev
                  </button>
                  
                  <div className="text-sm font-medium text-gray-500" style={{ fontFamily: "'SF Pro Rounded', -apple-system, system-ui, sans-serif" }}>
                    {currentInsightIndex + 1} / {aiInsights.length}
                  </div>
                  
                  <button
                    onClick={() => setCurrentInsightIndex(i => Math.min(aiInsights.length - 1, i + 1))}
                    disabled={currentInsightIndex === aiInsights.length - 1}
                    className="text-sm font-medium text-gray-600 hover:text-gray-900 disabled:text-gray-300 disabled:cursor-not-allowed transition-colors"
                    style={{ fontFamily: "'SF Pro Rounded', -apple-system, system-ui, sans-serif" }}
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
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
