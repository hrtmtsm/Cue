'use client'

import { useState, useRef, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense } from 'react'

interface PracticeData {
  audioUrl: string
  transcript: string
}

// Mock data - same as before but simplified
const mockPracticeData: Record<string, PracticeData> = {
  '1': {
    audioUrl: '/audio/clip1.mp3',
    transcript: 'Can I get a large coffee with oat milk, please?',
  },
  '2': {
    audioUrl: '/audio/clip2.mp3',
    transcript: 'Tell me about your previous work experience and why you\'re interested in this role.',
  },
  '3': {
    audioUrl: '/audio/clip3.mp3',
    transcript: 'Nice weather today, isn\'t it? Perfect for a walk in the park.',
  },
  '4': {
    audioUrl: '/audio/clip4.mp3',
    transcript: 'I\'d like to order the pasta with marinara sauce and a side salad.',
  },
  quick: {
    audioUrl: '/audio/quick.mp3',
    transcript: 'I\'m running a bit late, but I should be there in about ten minutes.',
  },
  custom: {
    audioUrl: '/audio/custom.mp3',
    transcript: 'This is a custom practice clip from YouTube.',
  },
}

function RespondPageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  
  // Support both old clip-based routing and new session-based routing
  const clipId = searchParams.get('clip')
  const sessionId = searchParams.get('session') || 'quick'
  const phraseIndex = parseInt(searchParams.get('index') || '0', 10)
  const phraseId = searchParams.get('phraseId')
  const focusInsightId = searchParams.get('focusInsightId')
  
  const [inputMode, setInputMode] = useState<'type' | 'speak'>('type')
  const [userInput, setUserInput] = useState('')
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLooping, setIsLooping] = useState(!!focusInsightId) // Auto-enable loop if focused
  const audioRef = useRef<HTMLAudioElement | null>(null)
  
  // Get practice data - prefer clipId for backwards compatibility
  const practiceData = clipId 
    ? mockPracticeData[clipId] || mockPracticeData.quick
    : mockPracticeData.quick

  // Get focus insight title for banner (simplified - in real app, would fetch from API)
  const focusInsightTitle = focusInsightId ? (
    focusInsightId.includes('connected') ? 'Connected speech' :
    focusInsightId.includes('function') ? 'Function words' :
    focusInsightId.includes('speed') ? 'Speed & chunking' :
    'Focus practice'
  ) : null

  useEffect(() => {
    if (typeof window !== 'undefined') {
      audioRef.current = new Audio(practiceData.audioUrl)
      if (audioRef.current) {
        audioRef.current.addEventListener('ended', () => {
          if (isLooping && audioRef.current) {
            audioRef.current.currentTime = 0
            audioRef.current.play()
          } else {
            setIsPlaying(false)
          }
        })
      }
    }
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [practiceData.audioUrl, isLooping])

  const handlePlayPause = () => {
    if (!audioRef.current) return

    if (isPlaying) {
      audioRef.current.pause()
      setIsPlaying(false)
    } else {
      setIsPlaying(true)
      setTimeout(() => setIsPlaying(false), 3000)
    }
  }

  const handleReplay = () => {
    if (!audioRef.current) return
    audioRef.current.currentTime = 0
    if (!isPlaying) {
      handlePlayPause()
    }
  }

  const handleLoopToggle = () => {
    setIsLooping(!isLooping)
  }

  const handleCheckAnswer = () => {
    if (inputMode === 'type' && !userInput.trim()) return

    // Route to review screen - support both clip-based and session-based routing
    if (clipId) {
      // Clip-based routing (single phrase session)
      router.push(`/practice/review?clip=${clipId}&userText=${encodeURIComponent(userInput)}`)
    } else {
      // Session-based routing
      router.push(
        `/practice/review?session=${sessionId}&index=${phraseIndex}&userText=${encodeURIComponent(userInput)}${phraseId ? `&phraseId=${phraseId}` : ''}`
      )
    }
  }

  return (
    <main className="flex min-h-screen flex-col px-6 py-6">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => router.push('/practice')}
          className="text-blue-600 font-medium text-lg py-2 px-1 -ml-1"
        >
          Back
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 space-y-6">
        {/* Focus banner */}
        {focusInsightTitle && (
          <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
            <div className="flex items-center space-x-2">
              <span className="text-blue-600 font-semibold">Focus:</span>
              <span className="text-blue-900">{focusInsightTitle}</span>
            </div>
          </div>
        )}

        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-gray-900">
            Listen first
          </h1>
          <p className="text-gray-600">
            No text shown yet
          </p>
        </div>

        {/* Audio Controls - Always accessible */}
        <div className="flex items-center justify-center space-x-6 py-6">
          <button
            onClick={handleReplay}
            className="p-3 rounded-full bg-gray-100 active:bg-gray-200 transition-colors"
            aria-label="Replay"
          >
            <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          
          <button
            onClick={handlePlayPause}
            className="w-20 h-20 rounded-full bg-blue-600 text-white flex items-center justify-center active:bg-blue-700 transition-colors shadow-lg"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <svg className="w-10 h-10" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
            ) : (
              <svg className="w-10 h-10" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          {focusInsightId && (
            <button
              onClick={handleLoopToggle}
              className={`p-3 rounded-full transition-colors ${
                isLooping
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-700 active:bg-gray-200'
              }`}
              aria-label="Loop"
              title="Loop enabled for focused practice"
            >
              <span className="text-2xl">🎯</span>
            </button>
          )}
        </div>

        {/* Input mode toggle */}
        <div className="flex items-center space-x-4">
          <button
            onClick={() => setInputMode('type')}
            className={`flex-1 py-3 rounded-lg font-medium transition-colors ${
              inputMode === 'type'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600'
            }`}
          >
            Type
          </button>
          <button
            onClick={() => setInputMode('speak')}
            className={`flex-1 py-3 rounded-lg font-medium transition-colors ${
              inputMode === 'speak'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600'
            }`}
          >
            Speak
          </button>
        </div>

        {/* Input area */}
        {inputMode === 'type' ? (
          <div className="space-y-4">
            <label htmlFor="answer-input" className="block text-sm font-medium text-gray-700">
              Type what you heard
            </label>
            <textarea
              id="answer-input"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              placeholder="Type what you heard..."
              className="w-full h-40 p-4 border-2 border-gray-200 rounded-xl resize-none focus:outline-none focus:border-blue-600 text-lg"
            />
          </div>
        ) : (
          <div className="space-y-4">
            <label className="block text-sm font-medium text-gray-700">
              Speak what you heard
            </label>
            <div className="w-full h-40 p-4 border-2 border-gray-200 rounded-xl flex items-center justify-center bg-gray-50">
              <p className="text-gray-500 text-center">
                Speak functionality coming soon
                <br />
                <span className="text-sm">Switch to Type mode to continue</span>
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Sticky bottom button */}
      <div className="pt-6 pb-6">
        <button
          onClick={handleCheckAnswer}
          disabled={inputMode === 'type' && !userInput.trim()}
          className={`w-full py-4 px-6 rounded-xl font-semibold text-lg transition-colors ${
            inputMode === 'type' && userInput.trim()
              ? 'bg-blue-600 text-white active:bg-blue-700 shadow-lg'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          Check answer
        </button>
      </div>
    </main>
  )
}

export default function RespondPage() {
  return (
    <Suspense fallback={
      <main className="flex min-h-screen flex-col items-center justify-center px-6">
        <div className="text-gray-500">Loading...</div>
      </main>
    }>
      <RespondPageContent />
    </Suspense>
  )
}
