'use client'

import { useState, useEffect, useCallback } from 'react'
import { Play, Pause, X, Check } from '@phosphor-icons/react'
import { formatHowItSounds } from '@/lib/formatHowItSounds'
import { type SaveTipData } from '@/lib/savedTips'

interface InsightCardProps {
  insight: any
  voiceId: string
  cardId?: string // Stable card identifier (phraseId:mistakeId)
  onSave?: (tipData: SaveTipData) => Promise<boolean>
  onUnsave?: (phrase: string) => Promise<boolean>
  isSaved?: boolean
}

interface AudioCacheEntry {
  blobUrl: string | null
  isReady: boolean
  isLoading: boolean
  error: string | null
}

export default function InsightCard({ insight, voiceId, cardId, onSave, onUnsave, isSaved = false }: InsightCardProps) {
  // Audio state management with cache
  const [audioCache, setAudioCache] = useState<Record<string, AudioCacheEntry>>({})
  const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)
  
  // Save tip state
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  
  // Get data from insight schema
  const missedText = insight.missed_text || insight.display_chunk || insight.what_it_was || ''
  const heardText = insight.heard_text
  const contextChunk = insight.context_chunk || null
  const eventType = insight.eventType
  
  // Determine if missing/not heard
  const isNotHeard = eventType === 'missing' || 
                    heardText === null || 
                    !heardText ||
                    (typeof heardText === 'string' && (
                      heardText.trim() === '' ||
                      heardText === '(not heard)' ||
                      heardText.toLowerCase().includes('not heard')
                    ))
  
  // Get actual chunk text (for display only)
  const actualChunkText = missedText
  
  const howItSounds = insight.how_it_sounds
  const example = insight.example
  const soundHint = insight.sound_hint
  
  // Format "How it sounds" using stress-based format
  const howItSoundsFormatted = formatHowItSounds(actualChunkText)
  
  // Get explicit speak text fields
  const howSpeak = insight.howSpeak || insight.howItSoundsSpeakText || insight.missed_text || ''
  const exampleSpeak = insight.exampleSpeak || insight.exampleSpeakText || example?.text || ''
  
  // Clear cache when cardId changes (new card = new audio)
  useEffect(() => {
    console.log('🔄 [Audio] Card changed, clearing cache for cardId:', cardId)
    setAudioCache({})
    setPlayingId(null)
    if (currentAudio) {
      currentAudio.pause()
      setCurrentAudio(null)
    }
  }, [cardId])
  
  // Preload single audio file with cardId in cache key
  const preloadAudio = useCallback(async (text: string, id: string) => {
    if (!text || !text.trim()) {
      console.warn(`⚠️ [Audio] No text for ${id}`)
      return
    }
    
    // Create unique cache key per card
    const cacheKey = `${cardId}:${id}`
    
    // Check if already loaded or loading
    if (audioCache[cacheKey]?.isReady || audioCache[cacheKey]?.isLoading) {
      return
    }
    
    console.log(`🔄 [Audio] Preloading ${cacheKey}:`, text.substring(0, 50))
    
    // Mark as loading
    setAudioCache(prev => ({
      ...prev,
      [cacheKey]: { blobUrl: null, isReady: false, isLoading: true, error: null }
    }))
    
    try {
      // POST to TTS API
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text.trim(),
          mode: 'normal',
          voiceSeed: voiceId,
          cacheKey: `${voiceId}:${cacheKey}:normal`
        })
      })
      
      if (!response.ok) {
        throw new Error(`TTS API failed: ${response.status}`)
      }
      
      // Get blob and create URL
      const blob = await response.blob()
      const blobUrl = URL.createObjectURL(blob)
      
      console.log(`✅ [Audio] Loaded ${cacheKey}`)
      
      // Update cache with ready audio
      setAudioCache(prev => ({
        ...prev,
        [cacheKey]: { blobUrl, isReady: true, isLoading: false, error: null }
      }))
      
    } catch (error) {
      console.error(`❌ [Audio] Failed to preload ${cacheKey}:`, error)
      setAudioCache(prev => ({
        ...prev,
        [cacheKey]: { 
          blobUrl: null, 
          isReady: false, 
          isLoading: false, 
          error: error instanceof Error ? error.message : 'Failed to load audio'
        }
      }))
    }
  }, [voiceId, cardId, audioCache])
  
  // Preload ALL audio upfront when component mounts
  useEffect(() => {
    console.log('🎯 [Audio] Starting upfront preload for cardId:', cardId)
    
    const audioItems = [
      { id: 'how-it-sounds', text: howSpeak },
      { id: 'phrase', text: contextChunk },
      { id: 'example', text: exampleSpeak }
    ].filter(item => item.text && item.text.trim())
    
    console.log(`📦 [Audio] Preloading ${audioItems.length} audio files`)
    
    // Preload all in parallel
    Promise.allSettled(
      audioItems.map(item => preloadAudio(item.text, item.id))
    ).then(() => {
      console.log('✅ [Audio] All audio preloaded for cardId:', cardId)
    })
    
    // Cleanup blob URLs on unmount
    return () => {
      Object.values(audioCache).forEach(entry => {
        if (entry.blobUrl) {
          URL.revokeObjectURL(entry.blobUrl)
        }
      })
      if (currentAudio) {
        currentAudio.pause()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insight, voiceId, cardId]) // Re-preload if insight, voiceId, or cardId changes
  
  // Play audio from cache with cardId in key
  const handlePlaySound = async (id: string, e?: React.MouseEvent) => {
    // Stop ALL propagation immediately
    if (e) {
      e.stopPropagation()
      e.preventDefault()
      if (e.nativeEvent) {
        e.nativeEvent.stopImmediatePropagation()
      }
    }
    
    const cacheKey = `${cardId}:${id}`
    console.log(`🔊 [Audio] Play requested for ${cacheKey}`)
    
    // If already playing this, pause
    if (playingId === id && currentAudio) {
      console.log(`⏸️ [Audio] Pausing ${cacheKey}`)
      currentAudio.pause()
      setCurrentAudio(null)
      setPlayingId(null)
      return
    }
    
    // Stop current audio if playing something else
    if (currentAudio) {
      currentAudio.pause()
      setCurrentAudio(null)
      setPlayingId(null)
    }
    
    // Check if audio is ready in cache
    const cached = audioCache[cacheKey]
    
    if (!cached || !cached.isReady || !cached.blobUrl) {
      console.warn(`⚠️ [Audio] ${cacheKey} not ready yet`)
      return
    }
    
    try {
      console.log(`▶️ [Audio] Playing ${cacheKey}`)
      
      // Create audio from cached blob URL
      const audio = new Audio(cached.blobUrl)
      
      audio.onended = () => {
        console.log(`🏁 [Audio] Finished ${cacheKey}`)
        setCurrentAudio(null)
        setPlayingId(null)
      }
      
      audio.onerror = (err) => {
        console.error(`❌ [Audio] Playback error for ${cacheKey}:`, err)
        setCurrentAudio(null)
        setPlayingId(null)
      }
      
      setCurrentAudio(audio)
      setPlayingId(id)
      
      await audio.play()
      
    } catch (error) {
      console.error(`❌ [Audio] Failed to play ${cacheKey}:`, error)
      setCurrentAudio(null)
      setPlayingId(null)
    }
  }
  
  // Helper function to render context with bold missed text
  const renderContextWithBold = (context: string, missedText: string) => {
    if (!context || !missedText) return context
    
    // Escape special regex characters
    const escapeRegex = (str: string) => {
      return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    }
    
    // Split by the missed text (case insensitive)
    const parts = context.split(new RegExp(`(${escapeRegex(missedText)})`, 'i'))
    
    return (
      <>
        {parts.map((part, i) =>
          part.toLowerCase() === missedText.toLowerCase() ? (
            <span key={i} style={{ fontWeight: 600 }}>
              {part}
            </span>
          ) : (
            <span key={i}>{part}</span>
          )
        )}
      </>
    )
  }

  const handleSaveToggle = async (e: React.MouseEvent) => {
    // Stop event propagation to prevent carousel navigation
    e.stopPropagation()
    e.preventDefault()
    if (e.nativeEvent) {
      e.nativeEvent.stopImmediatePropagation()
    }

    if (isSaving) return

    setIsSaving(true)
    setSaveSuccess(false)

    // If already saved, unsave it
    if (isSaved && onUnsave) {
      const phrase = missedText || actualChunkText
      const success = await onUnsave(phrase)
      setIsSaving(false)
      return
    }

    // Otherwise, save it
    if (!onSave) {
      setIsSaving(false)
      return
    }

    const tipData: SaveTipData = {
      phrase: missedText || actualChunkText,
      meaning_in_context: null,
      sound_rule: howItSounds ? `"${actualChunkText}" → ${howItSounds?.phonetic || howItSounds?.simplified || howItSounds?.compact || howItSoundsFormatted}` : soundHint,
      in_sentence_original: contextChunk,
      in_sentence_highlighted: actualChunkText,
      in_sentence_heard_as: heardText || null,
      chunk_display: null,
      extra_example_sentence: example?.text || null,
      extra_example_heard_as: null,
      category: eventType || null,
      tip: soundHint || null,
    }

    const success = await onSave(tipData)
    
    setIsSaving(false)
    if (success) {
      setSaveSuccess(true)
      // Reset success message after 2 seconds
      setTimeout(() => setSaveSuccess(false), 2000)
    }
  }

  return (
    <div className="px-6 py-6">
      
      {/* 1. COMPARISON SECTION - Compact cards with Phosphor icons */}
      <div className="mb-8">
        {isNotHeard ? (
          // MISSING: Show only red card with the missed word
          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
            <div className="flex items-center gap-1.5 mb-1">
              <X weight="bold" className="w-4 h-4 text-red-600" />
              <span className="text-xs font-semibold text-red-700 uppercase tracking-wide" style={{ fontFamily: "'SF Pro Rounded', -apple-system, system-ui, sans-serif" }}>
                You missed
              </span>
            </div>
            <div className="text-xl font-medium text-red-900 break-words" style={{ fontFamily: "'Inter', -apple-system, system-ui, sans-serif" }}>
              {actualChunkText}
            </div>
          </div>
        ) : (
          // SUBSTITUTION: Show both red (what you heard) and green (correct) cards
          <>
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 mb-2.5">
              <div className="flex items-center gap-1.5 mb-1">
                <X weight="bold" className="w-4 h-4 text-red-600" />
                <span className="text-xs font-semibold text-red-700 uppercase tracking-wide" style={{ fontFamily: "'SF Pro Rounded', -apple-system, system-ui, sans-serif" }}>
                  You heard
                </span>
              </div>
              <div className="text-xl font-medium text-red-900 break-words" style={{ fontFamily: "'Inter', -apple-system, system-ui, sans-serif" }}>
                {heardText || '—'}
              </div>
            </div>
            
            <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2.5">
              <div className="flex items-center gap-1.5 mb-1">
                <Check weight="bold" className="w-4 h-4 text-green-600" />
                <span className="text-xs font-semibold text-green-700 uppercase tracking-wide" style={{ fontFamily: "'SF Pro Rounded', -apple-system, system-ui, sans-serif" }}>
                  Correct
                </span>
              </div>
              <div className="text-xl font-medium text-green-900 break-words" style={{ fontFamily: "'Inter', -apple-system, system-ui, sans-serif" }}>
                {actualChunkText}
              </div>
            </div>
          </>
        )}
      </div>
      
      {/* 2. LISTENING TIP SECTION - No skeleton on icon */}
      {howItSounds && (
        <div className="mb-10">
          <div className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-2" style={{ fontFamily: "'SF Pro Rounded', -apple-system, system-ui, sans-serif" }}>
            How it sounds
          </div>
          
          {/* Sound hint text (if exists) */}
          {soundHint && (
            <div className="text-base text-gray-700 mb-3" style={{ fontFamily: "'Inter', -apple-system, system-ui, sans-serif" }}>
              {soundHint}
            </div>
          )}
          
          {/* How it sounds - simple Play/Pause, no skeleton */}
          <div 
            className="bg-gray-50 rounded-lg px-3 py-2.5 md:px-4 md:py-3 flex items-center justify-center gap-2 md:gap-3 pointer-events-auto"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={(e) => handlePlaySound('how-it-sounds', e)}
              onMouseDown={(e) => {
                e.stopPropagation()
                e.preventDefault()
              }}
              disabled={!audioCache[`${cardId}:how-it-sounds`]?.isReady}
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-gray-600 hover:text-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-1"
              aria-label="Play audio"
            >
              {playingId === 'how-it-sounds' ? (
                <Pause weight="fill" className="w-4 h-4" />
              ) : (
                <Play weight="fill" className="w-4 h-4" />
              )}
            </button>
            
            <div className="text-base text-gray-900 font-mono flex-1 pt-2" style={{ fontFamily: "'Inter', -apple-system, system-ui, sans-serif" }}>
              <span className="text-gray-700">"{actualChunkText}"</span>
              <span className="text-gray-300 mx-2">→</span>
              <span className="font-medium">{howItSounds?.phonetic || howItSounds?.simplified || howItSounds?.compact || howItSoundsFormatted}</span>
            </div>
          </div>
          
          {/* Error message if audio failed */}
          {audioCache[`${cardId}:how-it-sounds`]?.error && (
            <div className="text-xs text-red-600 mt-1 ml-11">
              Audio failed to load
            </div>
          )}
        </div>
      )}
      
      {/* 3. IN THIS PHRASE SECTION - No skeleton on icon */}
      {contextChunk && contextChunk !== actualChunkText && (
        <div className="mb-10">
          <div className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-2" style={{ fontFamily: "'SF Pro Rounded', -apple-system, system-ui, sans-serif" }}>
            In this phrase
          </div>
          
          <div 
            className="bg-gray-50 rounded-lg px-3 py-2.5 md:px-4 md:py-3 flex items-start justify-center gap-2 md:gap-3 pointer-events-auto"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={(e) => {
                console.log('🖱️ Phrase button clicked:', contextChunk)
                handlePlaySound('phrase', e)
              }}
              onMouseDown={(e) => {
                e.stopPropagation()
                e.preventDefault()
              }}
              disabled={!audioCache[`${cardId}:phrase`]?.isReady}
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-gray-600 hover:text-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-1.5"
              aria-label="Play phrase audio"
            >
              {playingId === 'phrase' ? (
                <Pause weight="fill" className="w-4 h-4" />
              ) : (
                <Play weight="fill" className="w-4 h-4" />
              )}
            </button>
            
            <div className="text-lg text-gray-900 flex-1 leading-relaxed pt-2" style={{ fontFamily: "'Inter', -apple-system, system-ui, sans-serif" }}>
              {renderContextWithBold(contextChunk, actualChunkText)}
            </div>
          </div>
          
          {/* Error message if audio failed */}
          {audioCache[`${cardId}:phrase`]?.error && (
            <div className="text-xs text-red-600 mt-1 ml-11">
              Audio failed to load
            </div>
          )}
        </div>
      )}
      
      {/* 4. ONE EXAMPLE SECTION - No skeleton on icon */}
      {example && (
        <div className="mb-6">
          <div className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-2" style={{ fontFamily: "'SF Pro Rounded', -apple-system, system-ui, sans-serif" }}>
            Example
          </div>
          
          <div 
            className="bg-gray-50 rounded-lg px-3 py-2.5 md:px-4 md:py-3 flex items-start justify-center gap-2 md:gap-3 pointer-events-auto"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={(e) => handlePlaySound('example', e)}
              onMouseDown={(e) => {
                e.stopPropagation()
                e.preventDefault()
              }}
              disabled={!audioCache[`${cardId}:example`]?.isReady}
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-gray-600 hover:text-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-1.5"
              aria-label="Play example audio"
            >
              {playingId === 'example' ? (
                <Pause weight="fill" className="w-4 h-4" />
              ) : (
                <Play weight="fill" className="w-4 h-4" />
              )}
            </button>
            
            <div className="text-base text-gray-800 flex-1 leading-relaxed pt-2" style={{ fontFamily: "'Inter', -apple-system, system-ui, sans-serif" }}>
              {example?.text}
            </div>
          </div>
          
          {/* Error message if audio failed */}
          {audioCache[`${cardId}:example`]?.error && (
            <div className="text-xs text-red-600 mt-1 ml-11">
              Audio failed to load
            </div>
          )}
        </div>
      )}
      
      {/* Save tip button */}
      {onSave && (
        <div 
          className="mt-6 pt-6 border-t border-gray-200 pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
        >
          <button
            onClick={handleSaveToggle}
            onMouseDown={(e) => {
              e.stopPropagation()
              e.preventDefault()
            }}
            disabled={isSaving}
            className={`w-full py-3 px-4 rounded-lg font-medium text-sm transition-colors ${
              isSaving
                ? 'bg-gray-100 text-gray-500 border-2 border-gray-200 cursor-wait'
                : isSaved || saveSuccess
                ? 'bg-gray-100 text-gray-600 border-2 border-gray-200 hover:bg-gray-200 active:bg-gray-300'
                : 'bg-blue-50 text-blue-700 border-2 border-blue-200 hover:bg-blue-100 active:bg-blue-200'
            }`}
            style={{ fontFamily: "'SF Pro Rounded', -apple-system, system-ui, sans-serif" }}
          >
            {isSaving ? (
              'Saving...'
            ) : isSaved || saveSuccess ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Saved
              </span>
            ) : (
              'Save tip'
            )}
          </button>
        </div>
      )}
      
    </div>
  )
}
