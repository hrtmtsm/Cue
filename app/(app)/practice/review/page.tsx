'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense, useState, useEffect, useRef } from 'react'
import { ChevronLeft } from 'lucide-react'
import { ClipSession, Phrase, FeedbackBundle, Insight } from '@/lib/sessionTypes'
import { generateFeedback } from '@/lib/mockFeedbackGenerator'
import { getStoryByIdClient } from '@/lib/storyClient'
import { getCategoryColors } from '@/lib/coachSummary'
import { generateFeedbackFromErrors } from '@/lib/dataDrivenFeedback'
import WordPopover from '@/components/WordPopover'
import WordHelpSheet from '@/components/WordHelpSheet'
import ReviewInsightCard from '@/components/ReviewInsightCard'
import MoreInsights from '@/components/MoreInsights'

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

  // State for active highlight (switches when user expands/taps an insight)
  const [activeHighlightInsightId, setActiveHighlightInsightId] = useState<string | null>(null)
  
  // State for word-level diff
  const [diffResult, setDiffResult] = useState<any>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(true)
  
  // State for word popover
  const [popoverToken, setPopoverToken] = useState<any>(null)
  const [popoverOpen, setPopoverOpen] = useState(false)
  // State for word help (correct-word sheet)
  const [wordHelpToken, setWordHelpToken] = useState<any>(null)
  const [wordHelpOpen, setWordHelpOpen] = useState(false)
  
  // State for audio playback
  const [isPlaying, setIsPlaying] = useState(false)
  const [isSlow, setIsSlow] = useState(false)
  const [isLooping, setIsLooping] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  // Redirect target to avoid SSR/client markup mismatches
  const [redirectTo, setRedirectTo] = useState<string | null>(null)

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
        
      } catch (error) {
        console.error('❌ Failed to check answer:', error)
        setDiffResult(null)
      } finally {
        setIsAnalyzing(false)
      }
    }
    
    checkAnswer()
  }, [currentPhrase.text, userText])

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

  const handleWordTap = (token: any) => {
    // Route based on token status:
    // - correct  -> WordHelpSheet
    // - missing / extra / wrong -> Listening feedback (WordPopover)
    if (token.status === 'correct') {
      setWordHelpToken(token)
      setWordHelpOpen(true)
      return
    }

    setPopoverToken(token)
    setPopoverOpen(true)
  }

  const handleReplayWord = () => {
    // For now, just replay the whole sentence
    // TODO: Implement word-level replay
    handlePlayPause()
  }

  // Generate data-driven feedback from actual errors
  // Prefer new tokens schema; fallback to alignment; then legacy tokens
  const operations = (() => {
    const tokensNew = diffResult?.tokens
    if (Array.isArray(tokensNew) && tokensNew.length > 0 && 'status' in tokensNew[0]) {
      // Map new tokens to a unified op-like shape
      return tokensNew.map((t: any) => {
        const status = t.status as 'CORRECT' | 'MISHEARD' | 'MISSING' | 'EXTRA'
        if (status === 'CORRECT') {
          return {
            type: 'correct',
            ref: t.original,
            hyp: t.user,
            confidence: 1.0,
            startMs: t.startMs ?? null,
            endMs: t.endMs ?? null,
          }
        }
        if (status === 'MISSING') {
          return {
            type: 'missing',
            ref: t.original,
            confidence: t.confidence,
            startMs: t.startMs ?? null,
            endMs: t.endMs ?? null,
          }
        }
        if (status === 'EXTRA') {
          return {
            type: 'extra',
            hyp: t.user,
            confidence: t.confidence,
            startMs: t.startMs ?? null,
            endMs: t.endMs ?? null,
          }
        }
        // MISHEARD
        return {
          type: 'wrong',
          ref: t.original,
          hyp: t.user,
          confidence: t.confidence,
          startMs: t.startMs ?? null,
          endMs: t.endMs ?? null,
        }
      })
    }
    // Fallback to alignment (already in desired shape)
    if (Array.isArray(diffResult?.alignment)) return diffResult.alignment
    // Fallback to legacy tokens
    return diffResult?.tokensLegacy || []
  })()
  const dataDrivenFeedback = diffResult && operations.length > 0
    ? generateFeedbackFromErrors(operations)
    : null
  
  // Use API summary if available, otherwise use data-driven summary
  const coachSummary = diffResult?.summary || dataDrivenFeedback?.summary

  // Generate fallback feedback for insights (if needed)
  const feedback: FeedbackBundle = generateFeedback(currentPhrase, userText)
  
  // Use data-driven feedback if available, otherwise fall back to mock feedback
  const primaryInsight = dataDrivenFeedback
    ? {
        id: 'data-driven-primary',
        category: 'CONNECTED_SPEECH' as const,
        severity: 'high' as const,
        title: 'Listening pattern',
        whatHappened: dataDrivenFeedback.whatHappened,
        whyHard: dataDrivenFeedback.whyHard,
        examples: dataDrivenFeedback.examples,
        highlightRanges: [],
      }
    : feedback.insights[0]

  const additionalInsights: Insight[] = dataDrivenFeedback?.secondaryCause
    ? [
        {
          id: 'data-driven-secondary',
          category: 'CONNECTED_SPEECH' as const,
          severity: 'med' as const,
          title: 'Secondary pattern',
          whatHappened: `You also had trouble with ${dataDrivenFeedback.secondaryCause.toLowerCase().replace(/_/g, ' ')}.`,
          whyHard: `This pattern appeared ${Array.from(dataDrivenFeedback.errorCounts.values())[1] || 0} times in your response.`,
          highlightRanges: [],
        },
      ]
    : []

  // Determine which highlight ranges to show
  const activeInsight = activeHighlightInsightId
    ? [...(primaryInsight ? [primaryInsight] : []), ...additionalInsights].find((i) => i.id === activeHighlightInsightId)
    : primaryInsight
  const highlightRanges = activeInsight?.highlightRanges || []

  const isLastPhrase = phraseIndex >= session.phrases.length - 1
  const [isSaved, setIsSaved] = useState(false)

  const handleSaveInsights = () => {
    // Toggle save state
    setIsSaved(!isSaved)
    // In production, this would save to backend/localStorage
    // For MVP, just toggle local state
  }

  const handleContinue = () => {
    // Mark clip as done if this is a story clip
    if (storyId && storyClipId && typeof window !== 'undefined') {
      const key = `cue_done_${storyId}_${storyClipId}`
      localStorage.setItem(key, 'true')
      console.log('✅ Marked clip as done:', key)
      
      // Navigate back to story detail page
      router.push(`/practice/story/${storyId}`)
      return
    }
    
    if (isLastPhrase) {
      // Finish session
      const finalSessionId = clipId ? `clip-${clipId}` : sessionId
      router.push(`/practice/session-summary?session=${finalSessionId}`)
    } else {
      // Go to next phrase - redirect to respond for next phrase
      if (clipId) {
        // Single phrase session, so finish
        router.push(`/practice/session-summary?session=clip-${clipId}`)
      } else {
        router.push(
          `/practice/respond?session=${sessionId}&index=${phraseIndex + 1}&phraseId=${session.phrases[phraseIndex + 1].id}`
        )
      }
    }
  }

  const handleInsightTap = (insightId: string) => {
    // Switch active highlight to this insight
    setActiveHighlightInsightId(insightId === activeHighlightInsightId ? null : insightId)
  }

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 pb-20">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => router.back()}
            className="text-blue-600 font-medium text-lg py-2 px-1 -ml-1 inline-flex items-center gap-1"
          >
            <ChevronLeft className="w-5 h-5" />
            Back
          </button>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">
          Here's what made this hard
        </h1>
      </div>

      {/* Content */}
      <div className="flex-1 space-y-6">
        {/* Accuracy Summary */}
        {diffResult && (() => {
          // Use new accuracy field (0..1) if available, otherwise use accuracyPercent
          const accuracy = diffResult.accuracy !== undefined 
            ? diffResult.accuracy 
            : (diffResult.accuracyPercent || 0) / 100
          const accuracyPercent = Math.round(accuracy * 100)
          
          return (
            <div className="mb-6 p-4 bg-blue-50 rounded-xl border-2 border-blue-200">
              <div className="flex items-center justify-between mb-2">
                <div className="text-3xl font-bold text-blue-600">
                  {accuracyPercent}%
                </div>
                {/* Progress bar */}
                <div className="flex-1 ml-4 h-2 bg-blue-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-blue-600 transition-all duration-300"
                    style={{ width: `${accuracyPercent}%` }}
                  />
                </div>
              </div>
            </div>
          )
        })()}

        {/* Coach Summary - Use API summary or data-driven summary */}
        {diffResult && coachSummary && (() => {
          // Determine color based on primary mistake or default to blue
          const primaryCause = dataDrivenFeedback?.primaryCause || 'CONNECTED_SPEECH'
          const colors = getCategoryColors(primaryCause)
          
          return (
            <div className={`mb-6 p-4 ${colors.bg} rounded-xl border ${colors.border}`}>
              <div className="flex items-start gap-3">
                {/* Speaker/Insight icon */}
                <div className="flex-shrink-0 mt-0.5">
                  <svg className={`w-5 h-5 ${colors.icon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                {/* Coach summary text */}
                <div className="flex-1">
                  <div className={`text-sm font-medium ${colors.text} leading-relaxed`}>
                    {coachSummary}
                  </div>
                </div>
              </div>
            </div>
          )
        })()}

        {isAnalyzing && (
          <div className="mb-6 p-4 bg-blue-50 rounded-lg border-2 border-blue-200">
            <div className="flex items-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
              <span className="text-sm text-gray-600">Analyzing your answer...</span>
            </div>
          </div>
        )}

        {/* Sentence-based comparison with interactive words */}
        {diffResult && (() => {
          return (
            <div className="mb-6 p-6 bg-white border border-gray-200 rounded-xl">
              <h2 className="text-lg font-semibold mb-4 text-gray-900">Compared to what you heard</h2>
              
              {/* Natural sentence rendering */}
              <div className="text-lg leading-relaxed mb-4 text-gray-900">
                {operations.map((op: any, idx: number) => {
                  // Normalize token for tap handler
                  const ref = op.ref || op.expected || ''
                  const hyp = op.hyp || op.actual || op.word || ''
                  const status =
                    op.type === 'correct'
                      ? 'correct'
                      : op.type === 'wrong'
                      ? 'wrong'
                      : op.type === 'missing'
                      ? 'missing'
                      : 'extra'

                  // Get previous and next words for context
                  const prevOp = idx > 0 ? operations[idx - 1] : null
                  const nextOp = idx < operations.length - 1 ? operations[idx + 1] : null
                  const previousWord = prevOp ? (prevOp.ref || prevOp.expected || prevOp.word || null) : null
                  const nextWord = nextOp ? (nextOp.ref || nextOp.expected || nextOp.word || null) : null

                  const tokenForHandler = {
                    status,
                    type: op.type,
                    ref,
                    hyp,
                    confidence: op.confidence,
                    confidenceLevel:
                      op.confidence >= 0.75 ? 'HIGH' : op.confidence >= 0.55 ? 'MED' : 'LOW',
                    startMs: op.startMs ?? null,
                    endMs: op.endMs ?? null,
                    previousWord,
                    nextWord,
                    originalSentence: currentPhrase.text,
                    userInput: userText,
                  }

                  // Choose display word and styles by status
                  let display = hyp || ref || ''
                  let className = 'px-0.5 rounded transition-colors cursor-pointer'

                  if (status === 'correct') {
                    className += ' text-gray-900 hover:bg-gray-50'
                  } else if (status === 'wrong') {
                    className +=
                      ' text-red-600 underline decoration-dotted decoration-red-400 hover:bg-red-50'
                  } else if (status === 'missing') {
                    className +=
                      ' text-gray-500 underline decoration-dotted decoration-gray-400 hover:bg-gray-50'
                    display = ref
                  } else if (status === 'extra') {
                    className +=
                      ' text-gray-400 line-through hover:bg-gray-50'
                    display = hyp
                  }

                  return (
                    <span
                      key={idx}
                      onClick={() => handleWordTap(tokenForHandler)}
                      className={className}
                    >
                      {display}{' '}
                    </span>
                  )
                })}
              </div>
            
              {/* Inline audio controls */}
              {currentPhrase.audioUrl && (
                <div className="flex items-center space-x-3 pt-4 border-t border-gray-200">
                  <button
                    onClick={handlePlayPause}
                    className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium active:bg-blue-700 transition-colors"
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
                    className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors ${
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
                    className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors ${
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
          )
        })()}

        {/* Listening feedback sheet (for incorrect / missed words) */}
        <WordPopover
          isOpen={popoverOpen}
          onClose={() => setPopoverOpen(false)}
          token={popoverToken}
          onReplay={handleReplayWord}
        />

        {/* Word help sheet (for correct words) */}
        <WordHelpSheet
          open={wordHelpOpen}
          onClose={() => setWordHelpOpen(false)}
          word={wordHelpToken?.ref || wordHelpToken?.hyp || ''}
          previousWord={wordHelpToken?.previousWord || null}
          nextWord={wordHelpToken?.nextWord || null}
          originalSentence={wordHelpToken?.originalSentence || currentPhrase.text}
          userInput={wordHelpToken?.userInput || userText}
        />

        {/* Why this was hard section - Data-driven */}
        {dataDrivenFeedback && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-4 text-gray-900">Why this was hard</h2>
            
            {/* Primary Insight - collapsed by default */}
            {primaryInsight && (
              <div 
                className={`mb-3 ${activeHighlightInsightId === primaryInsight.id ? 'ring-2 ring-blue-400 rounded-xl' : ''}`}
              >
                <ReviewInsightCard 
                  insight={primaryInsight} 
                  defaultExpanded={false}
                  onTap={() => handleInsightTap(primaryInsight.id)}
                />
              </div>
            )}

            {/* More Insights */}
            {additionalInsights.length > 0 && (
              <MoreInsights 
                insights={additionalInsights} 
                onInsightTap={handleInsightTap}
                activeInsightId={activeHighlightInsightId}
              />
            )}
          </div>
        )}

        {/* Save Insights button */}
        <button
          onClick={handleSaveInsights}
          className={`w-full py-3 px-6 rounded-xl font-medium text-lg border-2 transition-colors ${
            isSaved
              ? 'bg-yellow-50 border-yellow-300 text-yellow-900'
              : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50 active:bg-gray-100'
          }`}
        >
          <div className="flex items-center justify-center space-x-2">
            {isSaved ? (
              <>
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
                <span>Saved insights</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
                <span>Save insights</span>
              </>
            )}
          </div>
        </button>
      </div>

      {/* Fixed bottom actions - using relative positioning since BottomNav is fixed */}
      <div className="pt-6 pb-6">
        <button
          onClick={handleContinue}
          className="w-full py-4 px-6 rounded-xl font-semibold text-lg bg-blue-600 text-white active:bg-blue-700 shadow-lg transition-colors"
        >
          Continue
        </button>
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
