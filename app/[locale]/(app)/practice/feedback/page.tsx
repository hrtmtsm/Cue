'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense, useState, useRef, useEffect } from 'react'
import { ChevronLeft } from 'lucide-react'
import { analyzeFeedback } from '@/lib/feedbackEngine'
// LearningCard removed - feedback flow now uses review page

interface PracticeData {
  audioUrl: string
  transcript: string
}

// Mock data - removed quick.mp3
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
}

function FeedbackPageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const clipId = searchParams.get('clip') || ''
  const userInput = searchParams.get('userInput') || ''
  const practiceData = clipId && mockPracticeData[clipId] ? mockPracticeData[clipId] : {
    audioUrl: '',
    transcript: 'Clip not found. Please select a clip from the practice list.',
  }

  // Analyze feedback using the engine
  const feedback = analyzeFeedback(practiceData.transcript, userInput)

  // Audio controls state
  const [isPlaying, setIsPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      audioRef.current = new Audio()
    }
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [])

  const handlePlay = () => {
    if (!audioRef.current) return
    // Simulate playing
    setIsPlaying(true)
    setTimeout(() => setIsPlaying(false), 3000)
  }

  const handleSlow = () => {
    if (!audioRef.current) return
    // Stub: slow playback (would adjust playback rate in real implementation)
    setIsPlaying(true)
    setTimeout(() => setIsPlaying(false), 4000)
  }

  const handleLoop = () => {
    if (!audioRef.current) return
    // Stub: loop highlight section
    setIsPlaying(true)
    setTimeout(() => setIsPlaying(false), 2000)
  }

  const handleRetry = () => {
    // Replay the same clip
    router.push(`/practice/respond?clip=${clipId}`)
  }

  const handleNext = () => {
    // Continue to next clip
    router.push('/practice')
  }

  return (
    <main className="flex min-h-screen flex-col px-6 py-6">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => router.push(`/practice/respond?clip=${clipId}`)}
          className="text-blue-600 font-medium text-lg py-2 px-1 -ml-1 inline-flex items-center gap-1"
        >
          <ChevronLeft className="w-5 h-5" />
          Back
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Here's what made this hard
        </h1>

        {/* TODO: This page redirects to review - feedback flow moved to /practice/review */}
        <div className="p-6 bg-gray-50 rounded-xl border border-gray-200">
          <p className="text-gray-600">Feedback screen has moved to the review page.</p>
          <button
            onClick={() => router.push(`/practice/review?clip=${clipId}&userText=${encodeURIComponent(userInput)}`)}
            className="mt-4 w-full py-3 px-6 rounded-xl font-medium bg-blue-600 text-white"
          >
            View Review
          </button>
        </div>
      </div>
    </main>
  )
}

export default function FeedbackPage() {
  return (
    <Suspense fallback={
      <main className="flex min-h-screen flex-col items-center justify-center px-6">
        <div className="text-gray-500">Loading...</div>
      </main>
    }>
      <FeedbackPageContent />
    </Suspense>
  )
}
