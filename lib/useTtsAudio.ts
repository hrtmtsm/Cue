'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

interface TtsAudioState {
  normal: { blobUrl: string | null; isReady: boolean }
  slow_clear: { blobUrl: string | null; isReady: boolean }
}

interface UseTtsAudioOptions {
  text: string
  voiceId?: string
  autoPrefetch?: boolean
}

interface UseTtsAudioReturn {
  play: (mode: 'normal' | 'slow_clear') => Promise<void>
  prefetch: () => Promise<void>
  isReady: (mode: 'normal' | 'slow_clear') => boolean
  isPlaying: boolean
  currentMode: 'normal' | 'slow_clear' | null
  isLoading: boolean
}

// Client-side cache for prefetched audio
const prefetchCache = new Map<string, TtsAudioState>()

// Generate stable cache key
// voiceId may already be a composite key including cardId, so use it as-is
function generateCacheKey(text: string, voiceId: string): string {
  // If voiceId already contains the full cache key structure (has 3+ colons), use it directly
  // Format: cardId:section:text:voiceSeed
  const parts = voiceId.split(':')
  if (parts.length >= 4) {
    // voiceId is already a composite key (e.g., "cardId:howItSounds:text:voiceSeed")
    return voiceId
  }
  // Otherwise, construct a simple key
  return `${text}:${voiceId}`
}

// Extract base voice seed from composite cache key
// If voiceId is "cardId:section:text:voiceSeed", extract "voiceSeed"
// Otherwise, return voiceId as-is
function extractVoiceSeed(voiceId: string): string {
  const parts = voiceId.split(':')
  if (parts.length >= 4) {
    // Return the last segment as the voice seed
    return parts[parts.length - 1]
  }
  // If it's the stableVoiceId format (clipId:userId:date), return as-is
  // Otherwise, return voiceId as-is
  return voiceId
}

export function useTtsAudio({ text, voiceId = 'default', autoPrefetch = true }: UseTtsAudioOptions): UseTtsAudioReturn {
  const [state, setState] = useState<TtsAudioState>(() => {
    const cacheKey = generateCacheKey(text, voiceId)
    return prefetchCache.get(cacheKey) || {
      normal: { blobUrl: null, isReady: false },
      slow_clear: { blobUrl: null, isReady: false },
    }
  })
  
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentMode, setCurrentMode] = useState<'normal' | 'slow_clear' | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const currentAudioRef = useRef<HTMLAudioElement | null>(null)
  const cacheKey = generateCacheKey(text, voiceId)

  // Prefetch normal mode only (simplified for "Why this was hard" card)
  const prefetch = useCallback(async () => {
    if (!text || text.trim() === '') return

    // Check if already prefetched
    const cached = prefetchCache.get(cacheKey)
    if (cached?.normal.isReady) {
      setState(cached)
      return
    }

    setIsLoading(true)

    try {
      // Extract base voice seed from composite cache key
      const baseVoiceSeed = extractVoiceSeed(voiceId)
      
      // Prefetch normal mode only
      const normalResponse = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text.trim(),
          mode: 'normal',
          voiceSeed: baseVoiceSeed,
          cacheKey: `${cacheKey}:normal`,
        }),
      })

      if (!normalResponse.ok) {
        throw new Error('TTS prefetch failed')
      }

      const normalBlob = await normalResponse.blob()
      const normalUrl = URL.createObjectURL(normalBlob)

      const newState: TtsAudioState = {
        normal: { blobUrl: normalUrl, isReady: true },
        slow_clear: cached?.slow_clear || { blobUrl: null, isReady: false },
      }

      // Store in cache
      prefetchCache.set(cacheKey, newState)
      setState(newState)
    } catch (error) {
      console.error('TTS prefetch error:', error)
    } finally {
      setIsLoading(false)
    }
  }, [text, voiceId, cacheKey])

  // Auto-prefetch on mount or text change
  // CRITICAL: Reset state when cache key changes (card changed)
  useEffect(() => {
    // Check if cache key changed (card changed)
    const currentCacheKey = generateCacheKey(text, voiceId)
    if (currentCacheKey !== cacheKey) {
      // Card changed - reset state to prevent stale audio
      setState({
        normal: { blobUrl: null, isReady: false },
        slow_clear: { blobUrl: null, isReady: false },
      })
      setIsPlaying(false)
      setCurrentMode(null)
      if (currentAudioRef.current) {
        currentAudioRef.current.pause()
        currentAudioRef.current = null
      }
    }
    
    if (autoPrefetch && text && text.trim()) {
      prefetch()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPrefetch, text, voiceId]) // Depend on voiceId too (includes cardId)

  // Play audio
  const play = useCallback(async (mode: 'normal' | 'slow_clear') => {
    // Stop any current audio
    if (currentAudioRef.current) {
      currentAudioRef.current.pause()
      currentAudioRef.current.currentTime = 0
      currentAudioRef.current = null
    }

    // Get current state (may have been updated by prefetch)
    const currentState = prefetchCache.get(cacheKey) || state
    const audioState = currentState[mode]
    
    // If not ready, try to prefetch first
    if (!audioState.isReady || !audioState.blobUrl) {
      await prefetch()
      // Re-check state after prefetch
      const updatedState = prefetchCache.get(cacheKey)
      if (!updatedState?.[mode].isReady || !updatedState[mode].blobUrl) {
        console.error('TTS audio not ready after prefetch')
        return
      }
      setState(updatedState)
    }

    // Get blob URL from current state or cache
    const finalState = prefetchCache.get(cacheKey) || state
    const blobUrl = finalState[mode].blobUrl
    if (!blobUrl) {
      console.error('TTS audio blob URL not available')
      return
    }

    try {
      const audio = new Audio(blobUrl)
      
      // Set playback rate based on mode
      // Normal: faster (1.20-1.30x), Slow & Clear: slower (0.90-0.95x)
      if (mode === 'normal') {
        audio.playbackRate = 1.25
      } else {
        audio.playbackRate = 0.92
      }

      audio.onended = () => {
        setIsPlaying(false)
        setCurrentMode(null)
        currentAudioRef.current = null
      }

      audio.onerror = () => {
        setIsPlaying(false)
        setCurrentMode(null)
        currentAudioRef.current = null
      }

      currentAudioRef.current = audio
      setIsPlaying(true)
      setCurrentMode(mode)
      await audio.play()
    } catch (error) {
      console.error('TTS play error:', error)
      setIsPlaying(false)
      setCurrentMode(null)
    }
  }, [state, prefetch, cacheKey])

  const isReady = useCallback((mode: 'normal' | 'slow_clear') => {
    return state[mode].isReady
  }, [state])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause()
        currentAudioRef.current = null
      }
    }
  }, [])

  return {
    play,
    prefetch,
    isReady,
    isPlaying,
    currentMode,
    isLoading,
  }
}
