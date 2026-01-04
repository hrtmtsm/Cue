'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense, useState } from 'react'
import { ClipSession, Phrase, FeedbackBundle, Insight } from '@/lib/sessionTypes'
import { generateFeedback } from '@/lib/mockFeedbackGenerator'
import PhraseCard from '@/components/PhraseCard'
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
  quick: {
    id: 'session-quick',
    currentIndex: 0,
    phrases: [
      {
        id: 'qp1',
        text: "I'm running a bit late, but I should be there in about ten minutes.",
        audioUrl: '/audio/quick.mp3',
        durationMs: 4000,
      },
    ],
  },
}

function ReviewPageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const clipId = searchParams.get('clip')
  const sessionId = searchParams.get('session')
  let phraseIndex = parseInt(searchParams.get('index') || '0', 10)
  const userText = searchParams.get('userText') || ''

  // State for active highlight (switches when user expands/taps an insight)
  const [activeHighlightInsightId, setActiveHighlightInsightId] = useState<string | null>(null)

  // Handle clip-based routing (single phrase session)
  let session: ClipSession
  let currentPhrase: Phrase
  
  if (clipId) {
    // Create a single-phrase session from clip
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
      quick: {
        text: "I'm running a bit late, but I should be there in about ten minutes.",
        audioUrl: '/audio/quick.mp3',
        durationMs: 4000,
      },
      custom: {
        text: 'This is a custom practice clip from YouTube.',
        audioUrl: '/audio/custom.mp3',
        durationMs: 3000,
      },
    }
    
    const phraseData = mockPhraseData[clipId] || mockPhraseData.quick
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
    const foundSession = sessionId ? mockSessions[sessionId] : mockSessions.quick
    session = foundSession || mockSessions.quick
    currentPhrase = session.phrases[phraseIndex]
  }

  if (!currentPhrase) {
    // Invalid phrase index, redirect to practice root
    router.push('/practice')
    return null
  }

  // Generate feedback for this phrase
  const feedback: FeedbackBundle = generateFeedback(currentPhrase, userText)
  
  // Sort insights by severity (high > med > low) for consistent ordering
  const severityOrder = { high: 3, med: 2, low: 1 }
  const sortedInsights = [...feedback.insights].sort((a, b) => {
    const severityDiff = severityOrder[b.severity] - severityOrder[a.severity]
    if (severityDiff !== 0) return severityDiff
    // If same severity, primary insight comes first
    if (a.id === feedback.primaryInsightId) return -1
    if (b.id === feedback.primaryInsightId) return 1
    return 0
  })
  
  const primaryInsight = sortedInsights[0]
  const additionalInsights = sortedInsights.slice(1)

  // Determine which highlight ranges to show
  // If user has selected a specific insight, use that; otherwise use primary
  const activeInsight = activeHighlightInsightId
    ? sortedInsights.find((i) => i.id === activeHighlightInsightId)
    : primaryInsight
  const highlightRanges = activeInsight?.highlightRanges || primaryInsight?.highlightRanges || []

  const isLastPhrase = phraseIndex >= session.phrases.length - 1
  const [isSaved, setIsSaved] = useState(false)

  const handleSaveInsights = () => {
    // Toggle save state
    setIsSaved(!isSaved)
    // In production, this would save to backend/localStorage
    // For MVP, just toggle local state
  }

  const handleContinue = () => {
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
            onClick={() => router.push('/practice')}
            className="text-blue-600 font-medium text-lg py-2 px-1 -ml-1"
          >
            Back
          </button>
          <span className="text-sm text-gray-500">
            Phrase {session.phrases.length > 1 ? `${phraseIndex + 1} / ${session.phrases.length}` : '1 / 1'}
          </span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">
          Here's what made this hard
        </h1>
      </div>

      {/* Content */}
      <div className="flex-1 space-y-6">
        {/* Phrase Card */}
        <PhraseCard phrase={currentPhrase} highlightRanges={highlightRanges} />

        {/* Primary Insight */}
        {primaryInsight && (
          <div 
            className={activeHighlightInsightId === primaryInsight.id ? 'ring-2 ring-blue-400 rounded-xl' : ''}
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
