'use client'

import { useState, useRef, useEffect } from 'react'
import { Phrase } from '@/lib/sessionTypes'

interface PhraseCardProps {
  phrase: Phrase
  highlightRanges?: Array<{ start: number; end: number }>
}

export default function PhraseCard({ phrase, highlightRanges = [] }: PhraseCardProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [isSlow, setIsSlow] = useState(false)
  const [isLooping, setIsLooping] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      audioRef.current = new Audio(phrase.audioUrl)
      audioRef.current.addEventListener('ended', handleAudioEnded)
    }
    return () => {
      if (audioRef.current) {
        audioRef.current.removeEventListener('ended', handleAudioEnded)
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [phrase.audioUrl])

  const handleAudioEnded = () => {
    if (isLooping) {
      // Loop 2-3 times
      if (audioRef.current) {
        audioRef.current.currentTime = 0
        audioRef.current.play()
      }
    } else {
      setIsPlaying(false)
    }
  }

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

  // Render phrase text with highlights
  const renderPhraseText = () => {
    if (highlightRanges.length === 0) {
      return <span>{phrase.text}</span>
    }

    // Sort ranges by start position
    const sortedRanges = [...highlightRanges].sort((a, b) => a.start - b.start)
    const words = phrase.text.split(/\s+/)
    const elements: React.ReactNode[] = []
    let lastIndex = 0

    sortedRanges.forEach((range) => {
      // Add text before highlight
      if (range.start > lastIndex) {
        elements.push(
          <span key={`before-${range.start}`}>
            {words.slice(lastIndex, range.start).join(' ')}
            {range.start > 0 && ' '}
          </span>
        )
      }

      // Add highlighted text
      elements.push(
        <mark
          key={`highlight-${range.start}-${range.end}`}
          className="bg-yellow-200 font-semibold px-1 rounded"
        >
          {words.slice(range.start, range.end).join(' ')}
        </mark>
      )

      lastIndex = range.end
    })

    // Add remaining text
    if (lastIndex < words.length) {
      elements.push(
        <span key="after">
          {' '}
          {words.slice(lastIndex).join(' ')}
        </span>
      )
    }

    return <>{elements}</>
  }

  return (
    <div className="bg-white border-2 border-gray-200 rounded-xl p-5 space-y-4">
      {/* Phrase text */}
      <div className="text-lg leading-relaxed">{renderPhraseText()}</div>

      {/* Audio controls */}
      <div className="flex items-center space-x-3 pt-2 border-t border-gray-200">
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
    </div>
  )
}


