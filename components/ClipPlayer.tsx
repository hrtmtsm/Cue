'use client'

import { useState, useRef, useEffect } from 'react'
import { Play, Pause, RotateCcw, AlertCircle } from 'lucide-react'
import AudioWaveLine from './AudioWaveLine'
import { getAudioGenerationQueue } from '@/lib/audioGenerationQueue'

interface ClipPlayerProps {
  clip: {
    id: string
    transcript: string
    audioUrl?: string
    audioStatus?: 'ready' | 'needs_generation' | 'generating' | 'error'
    done?: boolean
    storyId?: string
  }
  onDone?: (clipId: string) => void
  onReplay?: () => void
  onAudioReady?: (clipId: string, audioUrl: string) => void
}

export default function ClipPlayer({ clip, onDone, onReplay, onAudioReady }: ClipPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1.0)
  const [showTranscript, setShowTranscript] = useState(false)
  const [voiceMode, setVoiceMode] = useState<'generated' | 'device'>('generated')
  const [playBlockedHint, setPlayBlockedHint] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const ttsRef = useRef<SpeechSynthesisUtterance | null>(null)
  
  // Single source of truth for audioStatus (from clip prop)
  const audioStatus = clip.audioStatus ?? 'needs_generation'

  // Initialize audio element
  useEffect(() => {
    console.log('🔍 [DEBUG ClipPlayer] Audio effect triggered:', {
      clipId: clip.id,
      audioUrl: clip.audioUrl,
      audioStatus: clip.audioStatus,
      hasAudioUrl: !!clip.audioUrl,
      transcript: clip.transcript?.substring(0, 30) + '...',
      resolvedAudioStatus: audioStatus,
    })

    // Check if needs generation
    if (audioStatus === 'needs_generation') {
      console.log('🔍 [DEBUG ClipPlayer] audioStatus is needs_generation - skipping Audio creation')
      return
    }

    // Only create Audio if status is 'ready' and audioUrl is non-empty
    if (audioStatus !== 'ready' || !clip.audioUrl) {
      console.log('🔍 [DEBUG ClipPlayer] Not ready to create Audio:', { audioStatus, hasAudioUrl: !!clip.audioUrl })
      return
    }

    if (typeof window === 'undefined') {
      return
    }

    // Clean up previous audio
    const prevAudio = audioRef.current
    if (prevAudio) {
      prevAudio.pause()
      audioRef.current = null
    }

    // Reset state
    setVoiceMode('generated')
    setPlayBlockedHint(false)

    // Create new audio element
    const resolvedAudioUrl = clip.audioUrl
    console.log('🎵 [DEBUG ClipPlayer] Creating Audio element with URL:', resolvedAudioUrl)
    console.log('🔍 [DEBUG ClipPlayer] Current state before audio creation:', {
      audioStatus: 'ready',
      voiceMode: 'generated',
      audioUrl: resolvedAudioUrl,
      clipId: clip.id,
    })

    const audio = new Audio(resolvedAudioUrl)
    audioRef.current = audio
    audio.playbackRate = playbackRate

    // Log audio URL for debugging
    console.log('🎵 [ClipPlayer] Loading audio from:', resolvedAudioUrl)

    // Event handlers
    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)
    const handleEnded = () => setIsPlaying(false)
    const handleError = (e: Event) => {
      const audioEl = e.target as HTMLAudioElement
      const errorCode = audioEl.error?.code
      const errorMessage = audioEl.error?.message || 'Unknown error'
      const currentSrc = audioEl.currentSrc
      
      console.error('🔴 [DEBUG ClipPlayer] Audio loading error event:', {
        clipId: clip.id,
        errorCode,
        errorMessage,
          errorName: audioEl.error ? (audioEl.error as any).name : undefined,
        currentSrc,
        attemptedUrl: resolvedAudioUrl,
        audioStatus: 'error',
      })
      console.error('🔴 [ClipPlayer] Audio loading error:', {
        code: errorCode,
        message: errorMessage,
        url: resolvedAudioUrl,
        currentSrc,
      })
      
      // Error occurred - but we can't update clip prop, so just stop playing
      // Parent component should handle status updates via onAudioStatusChange if needed
      setIsPlaying(false)
    }

    const handleLoadedData = () => {
      console.log('✅ [DEBUG ClipPlayer] Audio loadeddata event:', {
        clipId: clip.id,
        audioUrl: resolvedAudioUrl,
        currentSrc: audio.currentSrc,
        readyState: audio.readyState,
      })
      console.log('✅ [ClipPlayer] Audio loaded successfully:', resolvedAudioUrl)
      // Status is managed by parent via clip prop
    }

    audio.addEventListener('play', handlePlay)
    audio.addEventListener('pause', handlePause)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('error', handleError)
    audio.addEventListener('loadeddata', handleLoadedData)

    return () => {
      audio.pause()
      audio.removeEventListener('play', handlePlay)
      audio.removeEventListener('pause', handlePause)
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('error', handleError)
      audio.removeEventListener('loadeddata', handleLoadedData)
      if (audioRef.current === audio) {
        audioRef.current = null
      }
    }
  }, [clip.audioUrl, clip.audioStatus, playbackRate])

  const handlePlayPause = () => {
    // If using device voice
    if (voiceMode === 'device') {
      if (isPlaying) {
        // Stop device voice
        if (typeof window !== 'undefined' && window.speechSynthesis) {
          window.speechSynthesis.cancel()
        }
        setIsPlaying(false)
      } else {
        // Start device voice
        if (typeof window !== 'undefined' && window.speechSynthesis && clip.transcript) {
          const utterance = new SpeechSynthesisUtterance(clip.transcript)
          utterance.rate = playbackRate
          utterance.onend = () => setIsPlaying(false)
          utterance.onerror = (e) => {
            console.error('🔴 [ClipPlayer] Device voice error:', e)
            setIsPlaying(false)
          }
          ttsRef.current = utterance
          window.speechSynthesis.speak(utterance)
          setIsPlaying(true)
        }
        // Note: audioStatus is read-only from clip prop, can't update parent state
      }
      return
    }

    // Generated audio playback
    if (!audioRef.current) {
      console.warn('⚠️ [ClipPlayer] Audio not ready - cannot play')
      // Note: audioStatus is read-only from clip prop
      return
    }

    if (isPlaying) {
      audioRef.current.pause()
    } else {
      console.log('🎵 [DEBUG ClipPlayer] Attempting to play audio:', {
        clipId: clip.id,
        audioUrl: clip.audioUrl,
        currentSrc: audioRef.current.currentSrc,
        readyState: audioRef.current.readyState,
        audioStatus,
        voiceMode,
      })
      console.log('🎵 [ClipPlayer] Playing audio:', clip.audioUrl)
      audioRef.current.play().catch((err) => {
        console.error('🔴 [DEBUG ClipPlayer] play() promise rejection:', {
          clipId: clip.id,
          errorName: err.name,
          errorMessage: err.message,
          audioUrl: clip.audioUrl,
          currentSrc: audioRef.current?.currentSrc,
          readyState: audioRef.current?.readyState,
          audioStatus,
          voiceMode,
        })
        console.error('🔴 [ClipPlayer] Error playing audio:', err)
        
        // Check if it's a NotAllowedError (autoplay restriction)
        if (err.name === 'NotAllowedError') {
          console.log('ℹ️ [DEBUG ClipPlayer] NotAllowedError detected - showing hint')
          setPlayBlockedHint(true)
          // Note: audioStatus is read-only from clip prop
        } else {
          // Other errors - show error UI but can't update parent state
          console.log('🔴 [DEBUG ClipPlayer] Non-NotAllowedError - error occurred')
          // Note: audioStatus is read-only from clip prop, parent should handle status updates
        }
        setIsPlaying(false)
      })
    }
  }

  const handleReplay = () => {
    // If using device voice, replay device voice
    if (voiceMode === 'device') {
      if (typeof window !== 'undefined' && window.speechSynthesis && clip.transcript) {
        window.speechSynthesis.cancel()
        const utterance = new SpeechSynthesisUtterance(clip.transcript)
        utterance.rate = playbackRate
        utterance.onend = () => setIsPlaying(false)
        ttsRef.current = utterance
        window.speechSynthesis.speak(utterance)
        setIsPlaying(true)
      }
      if (onReplay) {
        onReplay()
      }
      return
    }

    // Generated audio replay
    if (!audioRef.current) return
    audioRef.current.currentTime = 0
    if (!isPlaying) {
      audioRef.current.play().catch((err) => {
        console.error('🔴 [ClipPlayer] Error replaying audio:', err)
        if (err.name === 'NotAllowedError') {
          setPlayBlockedHint(true)
        }
        // Note: audioStatus is read-only from clip prop
      })
    }
    if (onReplay) {
      onReplay()
    }
  }

  const handleSpeedToggle = () => {
    const rates = [1.0, 0.85, 0.7]
    const currentIndex = rates.indexOf(playbackRate)
    const nextIndex = (currentIndex + 1) % rates.length
    const newRate = rates[nextIndex]
    setPlaybackRate(newRate)
    
    // Update generated audio playback rate if playing
    if (audioRef.current && isPlaying && voiceMode === 'generated') {
      audioRef.current.playbackRate = newRate
    }
    
    // Update device voice rate if using device voice
    if (voiceMode === 'device' && isPlaying && typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel()
      if (clip.transcript) {
        const utterance = new SpeechSynthesisUtterance(clip.transcript)
        utterance.rate = newRate
        utterance.onend = () => setIsPlaying(false)
        ttsRef.current = utterance
        window.speechSynthesis.speak(utterance)
      }
    }
  }

  const handleMarkDone = () => {
    if (onDone) {
      onDone(clip.id)
    }
  }

  const formatSpeed = (rate: number) => {
    return `${rate}x`
  }

  // Cleanup TTS on unmount
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel()
      }
    }
  }, [])

  const handleRetry = () => {
    setPlayBlockedHint(false)
    // Note: audioStatus is read-only from clip prop, parent should handle retry
    // This will trigger useEffect to recreate audio if clip.audioStatus becomes 'ready'
  }

  const handleGenerateAudio = async () => {
    if (!clip.storyId) {
      console.error('Cannot generate audio: missing storyId')
      return
    }

    const queue = getAudioGenerationQueue()
    
    // Prioritize this clip
    queue.enqueue(
      {
        id: clip.id,
        storyId: clip.storyId,
        transcript: clip.transcript,
        priority: 1000, // High priority
      },
      (clipId, result) => {
        if ('audioUrl' in result) {
          // Notify parent that audio is ready
          onAudioReady?.(clipId, result.audioUrl)
        }
      }
    )
  }

  const handleUseDeviceVoice = () => {
    setVoiceMode('device')
    // Start device voice immediately
    if (typeof window !== 'undefined' && window.speechSynthesis && clip.transcript) {
      const utterance = new SpeechSynthesisUtterance(clip.transcript)
      utterance.rate = playbackRate
      utterance.onend = () => setIsPlaying(false)
      ttsRef.current = utterance
      window.speechSynthesis.speak(utterance)
      setIsPlaying(true)
    }
    // Note: audioStatus is read-only from clip prop
  }

  if (!clip.audioUrl && !clip.transcript && clip.audioStatus !== 'needs_generation') {
    return (
      <div className="p-4 border-2 border-gray-200 rounded-xl bg-gray-50">
        <p className="text-gray-500 text-center">Audio not available</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4 border-2 border-gray-200 rounded-xl bg-white">
      {/* Generating Status - Lightweight inline */}
      {audioStatus === 'generating' && (
        <div className="px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg mb-2">
          <p className="text-xs text-blue-800 text-center">Preparing audio...</p>
        </div>
      )}

      {/* Needs Generation - Lightweight inline */}
      {audioStatus === 'needs_generation' && (
        <div className="px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg mb-2">
          <p className="text-xs text-blue-800 text-center">Audio will be ready soon...</p>
        </div>
      )}

      {/* Error State - Only show after retries failed */}
      {audioStatus === 'error' && (
        <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg mb-2 space-y-2">
          <p className="text-xs text-gray-800 text-center">Audio unavailable</p>
          <div className="flex gap-2">
            <button
              onClick={handleRetry}
              className="flex-1 py-1.5 px-3 text-xs bg-gray-100 text-gray-700 rounded font-medium active:bg-gray-200 transition-colors"
            >
              Retry
            </button>
            <button
              onClick={handleUseDeviceVoice}
              className="flex-1 py-1.5 px-3 text-xs bg-blue-600 text-white rounded font-medium active:bg-blue-700 transition-colors"
            >
              Use device voice
            </button>
          </div>
        </div>
      )}

      {/* Play Blocked Hint */}
      {playBlockedHint && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-800">Tap again to play</p>
        </div>
      )}

      {/* Voice Mode Info Banner */}
      {voiceMode === 'device' && audioStatus === 'ready' && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-blue-800">Voice mode: Quick (device voice)</p>
          </div>
        </div>
      )}

      {/* Audio Controls */}
      <div className="relative flex flex-col items-center justify-center py-6 min-h-[140px] -mx-4 px-4">
        {/* Waveform background - only show if using generated audio */}
        {voiceMode === 'generated' && (
          <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 h-12 z-0">
            <AudioWaveLine audioRef={audioRef} isPlaying={isPlaying} side="full" height={48} />
          </div>
        )}

        {/* Controls */}
        <div className="relative flex items-center justify-center space-x-4 z-10">
          <button
            onClick={handlePlayPause}
            disabled={!clip.transcript}
            className={`w-16 h-16 rounded-full text-white flex items-center justify-center transition-colors shadow-lg ${
              clip.transcript
                ? 'bg-blue-600 active:bg-blue-700'
                : 'bg-gray-400 cursor-not-allowed'
            }`}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            title="Play audio"
          >
            {isPlaying ? (
              <Pause className="w-8 h-8" />
            ) : (
              <Play className="w-8 h-8 ml-1" />
            )}
          </button>

          <button
            onClick={handleReplay}
            className="p-3 rounded-full bg-gray-100 text-gray-700 active:bg-gray-200 transition-colors"
            aria-label="Replay"
            title="Replay"
          >
            <RotateCcw className="w-5 h-5" />
          </button>

          <button
            onClick={handleSpeedToggle}
            className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 active:bg-gray-200 transition-colors font-medium text-sm"
            aria-label={`Speed: ${formatSpeed(playbackRate)}`}
            title={`Speed: ${formatSpeed(playbackRate)}`}
          >
            {formatSpeed(playbackRate)}
          </button>
        </div>
      </div>

      {/* Transcript Toggle */}
      <button
        onClick={() => setShowTranscript(!showTranscript)}
        className="w-full py-2 px-4 rounded-lg bg-gray-100 text-gray-700 active:bg-gray-200 transition-colors text-sm font-medium"
      >
        {showTranscript ? 'Hide' : 'Show'} Transcript
      </button>

      {/* Transcript Display */}
      {showTranscript && (
        <div className="p-4 bg-gray-50 rounded-lg">
          <p className="text-gray-900 text-lg leading-relaxed">{clip.transcript}</p>
        </div>
      )}

      {/* Mark as Done Button */}
      <button
        onClick={handleMarkDone}
        disabled={clip.done}
        className={`w-full py-3 px-4 rounded-lg font-medium transition-colors ${
          clip.done
            ? 'bg-green-100 text-green-700 cursor-not-allowed'
            : 'bg-blue-600 text-white active:bg-blue-700'
        }`}
      >
        {clip.done ? '✓ Done' : 'Mark as Done'}
      </button>
    </div>
  )
}

