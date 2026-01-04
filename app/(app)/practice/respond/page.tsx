'use client'

import { useState, useRef, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import AudioWaveLine from '@/components/AudioWaveLine'

interface PracticeData {
  audioUrl: string
  transcript: string
}

// Mock data - removed quick.mp3 fallback
// Clips should always come from localStorage/sessionStorage or be generated
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
  const [practiceData, setPracticeData] = useState<PracticeData>({
    audioUrl: '',
    transcript: 'Loading...',
  })
  
  // Load practice data - check sessionStorage first, then localStorage, then mock
  useEffect(() => {
    if (clipId && typeof window !== 'undefined') {
      // Check sessionStorage for generated clip (stored when clip was selected)
      const storedClip = sessionStorage.getItem(`clip_${clipId}`)
      if (storedClip) {
        try {
          const clip = JSON.parse(storedClip)
          console.log('📦 Loaded clip from sessionStorage:', clip.audioUrl)
          setPracticeData({
            audioUrl: clip.audioUrl,
            transcript: clip.text,
          })
          return
        } catch (error) {
          console.error('Error parsing stored clip from sessionStorage:', error)
        }
      }
      
      // Check localStorage for generated clips (fallback)
      try {
        const userClips = localStorage.getItem('userClips')
        if (userClips) {
          const clips = JSON.parse(userClips)
          const clip = clips.find((c: any) => c.id === clipId)
          if (clip) {
            console.log('📦 Loaded clip from localStorage:', clip.audioUrl)
            // Also store in sessionStorage for next time
            sessionStorage.setItem(`clip_${clipId}`, JSON.stringify({
              text: clip.text,
              audioUrl: clip.audioUrl,
            }))
            setPracticeData({
              audioUrl: clip.audioUrl,
              transcript: clip.text,
            })
            return
          }
        }
      } catch (error) {
        console.error('Error loading clips from localStorage:', error)
      }
      
      // No fallback to quick.mp3 - clip must exist in storage or be generated
      if (mockPracticeData[clipId]) {
        console.warn('⚠️ Using mock data fallback for clip:', clipId, '- audio will not play')
        setPracticeData(mockPracticeData[clipId])
      } else {
        console.error('❌ No clip data found for clipId:', clipId)
        // Show error state - user should regenerate clips
        setPracticeData({
          audioUrl: '',
          transcript: 'Clip not found. Please generate new clips from onboarding.',
        })
      }
    } else {
      // No clipId - error state
      console.error('❌ No clipId provided')
      setPracticeData({
        audioUrl: '',
        transcript: 'No clip selected. Please select a clip from the practice list.',
      })
    }
  }, [clipId])

  // Get focus insight title for banner (simplified - in real app, would fetch from API)
  const focusInsightTitle = focusInsightId ? (
    focusInsightId.includes('connected') ? 'Connected speech' :
    focusInsightId.includes('function') ? 'Function words' :
    focusInsightId.includes('speed') ? 'Speed & chunking' :
    'Focus practice'
  ) : null

  useEffect(() => {
    if (typeof window !== 'undefined' && practiceData && practiceData.audioUrl) {
      // Clean up previous audio
      const prevAudio = audioRef.current
      if (prevAudio) {
        prevAudio.pause()
        audioRef.current = null
      }
      
      // Create new audio element
      const audio = new Audio(practiceData.audioUrl)
      audioRef.current = audio
      
      // Handle loading errors
      audio.addEventListener('error', (e) => {
        console.error('🔴 Audio loading error:', e)
        console.error('🔴 Failed to load audio from:', practiceData.audioUrl)
        setIsPlaying(false)
      })
      
      // Handle successful load
      audio.addEventListener('loadeddata', () => {
        console.log('✅ Audio loaded successfully:', practiceData.audioUrl)
      })
      
      // Handle play/pause events to sync state
      const handleAudioPlay = () => {
        setIsPlaying(true)
      }
      
      const handleAudioPause = () => {
        setIsPlaying(false)
      }
      
      const handleAudioEnded = () => {
        if (isLooping && audioRef.current) {
          audioRef.current.currentTime = 0
          audioRef.current.play().catch((err) => {
            console.error('Error replaying audio:', err)
            setIsPlaying(false)
          })
        } else {
          setIsPlaying(false)
        }
      }
      
      audio.addEventListener('play', handleAudioPlay)
      audio.addEventListener('pause', handleAudioPause)
      audio.addEventListener('ended', handleAudioEnded)
      
      // Cleanup function
      return () => {
        if (audioRef.current === audio) {
          audio.pause()
          audio.removeEventListener('play', handleAudioPlay)
          audio.removeEventListener('pause', handleAudioPause)
          audio.removeEventListener('ended', handleAudioEnded)
          if (audioRef.current === audio) {
            audioRef.current = null
          }
        }
      }
    } else if (audioRef.current) {
      // Clean up audio if no URL available
      audioRef.current.pause()
      audioRef.current = null
      setIsPlaying(false)
    }
  }, [practiceData?.audioUrl, isLooping])

  const handlePlayPause = () => {
    if (!audioRef.current) {
      console.warn('⚠️ Audio not ready - cannot play')
      return
    }

    if (isPlaying) {
      // Pause audio
      audioRef.current.pause()
      // State will be updated by the 'pause' event listener
    } else {
      // Play audio
      console.log('🎵 Playing audio:', practiceData?.audioUrl)
      audioRef.current.play().catch((error) => {
        console.error('🔴 Error playing audio:', error)
        setIsPlaying(false)
        alert('Failed to play audio. Please check if the audio file exists.')
      })
      // State will be updated by the 'play' event listener
    }
  }

  const handleReplay = () => {
    if (!audioRef.current) {
      console.warn('⚠️ Audio not ready - cannot replay')
      return
    }
    console.log('🔁 Replaying audio')
    audioRef.current.currentTime = 0
    if (!isPlaying) {
      audioRef.current.play().catch((error) => {
        console.error('🔴 Error replaying audio:', error)
        setIsPlaying(false)
        alert('Failed to replay audio. Please check if the audio file exists.')
      })
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
          className="text-blue-600 font-medium text-lg py-2 px-1 -ml-1 inline-flex items-center gap-1"
        >
          <ChevronLeft className="w-5 h-5" />
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
        <div className="relative flex flex-col items-center justify-center py-6 min-h-[140px] -mx-6 px-6">
          {/* Continuous waveform line - full width behind controls */}
          <div className="absolute inset-x-6 top-1/2 -translate-y-1/2 h-12 z-0">
            <AudioWaveLine audioRef={audioRef} isPlaying={isPlaying} side="full" height={48} />
          </div>
          
          {/* Center controls - overlays waveform */}
          <div className="relative flex items-center justify-center space-x-6 z-10">
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
