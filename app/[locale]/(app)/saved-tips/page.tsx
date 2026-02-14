'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronUp, ArrowLeft } from 'lucide-react'
import { Play, Pause, BookmarkSimple } from '@phosphor-icons/react'
import { getSavedTips, unsaveTip, type SavedTip } from '@/lib/savedTips'
import { Heading, Body, Label, Caption } from '@/components/ui/Typography'
import { Icon } from '@/components/ui/Icon'

interface AudioState {
  [key: string]: {
    audio: HTMLAudioElement | null
    isPlaying: boolean
    isLoading: boolean
  }
}

export default function SavedTipsPage() {
  const router = useRouter()
  const [savedTips, setSavedTips] = useState<SavedTip[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [expandedTipId, setExpandedTipId] = useState<string | null>(null)
  const [deletingTipId, setDeletingTipId] = useState<string | null>(null)
  const [audioStates, setAudioStates] = useState<AudioState>({})

  useEffect(() => {
    const fetchTips = async () => {
      setIsLoading(true)
      const result = await getSavedTips()
      if (result.success && result.tips) {
        setSavedTips(result.tips)
      }
      setIsLoading(false)
    }
    
    fetchTips()
  }, [])

  const handleDeleteTip = async (tipId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    
    setDeletingTipId(tipId)
    const result = await unsaveTip(tipId)
    
    if (result.success) {
      setSavedTips(tips => tips.filter(t => t.id !== tipId))
      if (expandedTipId === tipId) {
        setExpandedTipId(null)
      }
      // Clean up audio state for this tip
      setAudioStates(prev => {
        const next = { ...prev }
        Object.keys(next).forEach(key => {
          if (key.startsWith(`${tipId}:`)) {
            next[key].audio?.pause()
            delete next[key]
          }
        })
        return next
      })
    } else {
      alert('Failed to unsave tip. Please try again.')
    }
    
    setDeletingTipId(null)
  }

  const handlePlayAudio = useCallback(async (audioKey: string, text: string, e: React.MouseEvent) => {
    e.stopPropagation()
    
    const currentState = audioStates[audioKey]
    
    // If already playing, pause it
    if (currentState?.isPlaying && currentState.audio) {
      currentState.audio.pause()
      setAudioStates(prev => ({
        ...prev,
        [audioKey]: { ...currentState, isPlaying: false }
      }))
      return
    }
    
    // If audio exists and is paused, resume it
    if (currentState?.audio && !currentState.isPlaying) {
      currentState.audio.playbackRate = 1.15
      currentState.audio.play()
      setAudioStates(prev => ({
        ...prev,
        [audioKey]: { ...currentState, isPlaying: true }
      }))
      return
    }
    
    // Otherwise, load and play new audio
    setAudioStates(prev => ({
      ...prev,
      [audioKey]: { audio: null, isPlaying: false, isLoading: true }
    }))
    
    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voiceId: 'alloy' })
      })
      
      if (!response.ok) {
        throw new Error('Failed to generate audio')
      }
      
      const blob = await response.blob()
      const audioUrl = URL.createObjectURL(blob)
      const audio = new Audio(audioUrl)
      
      // Set playback rate to be faster, like native speakers
      audio.playbackRate = 1.15
      
      audio.onended = () => {
        setAudioStates(prev => ({
          ...prev,
          [audioKey]: { ...prev[audioKey], isPlaying: false }
        }))
      }
      
      audio.onerror = () => {
        console.error('Audio playback error')
        setAudioStates(prev => ({
          ...prev,
          [audioKey]: { audio: null, isPlaying: false, isLoading: false }
        }))
      }
      
      await audio.play()
      
      setAudioStates(prev => ({
        ...prev,
        [audioKey]: { audio, isPlaying: true, isLoading: false }
      }))
    } catch (error) {
      console.error('Error playing audio:', error)
      setAudioStates(prev => ({
        ...prev,
        [audioKey]: { audio: null, isPlaying: false, isLoading: false }
      }))
    }
  }, [audioStates])

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      Object.values(audioStates).forEach(state => {
        state.audio?.pause()
      })
    }
  }, [])

  if (isLoading) {
    return (
      <main className="flex flex-col px-6 py-6">
        <div className="text-gray-600">Loading tips...</div>
      </main>
    )
  }

  return (
    <main className="flex flex-col px-6 py-6">
      <div className="space-y-6">
        {/* Header */}
        <div className="space-y-4">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <Body>Back</Body>
          </button>
          
          <div className="space-y-2">
            <Heading as="h1" size="page">Saved Tips</Heading>
            <Body tone="sub">
              {savedTips.length === 0
                ? 'No saved tips yet'
                : `${savedTips.length} ${savedTips.length === 1 ? 'tip' : 'tips'} saved`}
            </Body>
          </div>
        </div>

        {/* Empty State */}
        {savedTips.length === 0 && (
          <div className="p-8 bg-gray-50 rounded-xl border border-gray-200 text-center">
            <div className="text-4xl mb-3">💡</div>
            <Heading as="h3" className="mb-2">No tips saved yet</Heading>
            <Body tone="sub" className="mb-4">
              Save listening tips during practice to review them later
            </Body>
            <button
              onClick={() => router.push('/practice/select')}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              Start practicing
            </button>
          </div>
        )}

        {/* Tips List */}
        {savedTips.length > 0 && (
          <div className="space-y-3">
            {savedTips.map((tip) => {
              return (
                <div
                  key={tip.id}
                  className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:border-gray-300 transition-colors"
                >
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <button
                        onClick={() => setExpandedTipId(expandedTipId === tip.id ? null : tip.id)}
                        className="flex-1 text-left"
                      >
                        <Heading as="h3" className="mb-1">{tip.phrase}</Heading>
                        {tip.category && (
                          <Label className="inline-block px-2 py-0.5 bg-gray-100 text-gray-700 rounded-full text-xs mb-2">
                            {tip.category.replace('_', ' ')}
                          </Label>
                        )}
                        {tip.meaning_in_context && (
                          <Body className="text-gray-600 line-clamp-2">
                            {tip.meaning_in_context}
                          </Body>
                        )}
                      </button>
                      
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setExpandedTipId(expandedTipId === tip.id ? null : tip.id)}
                          className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                          aria-label={expandedTipId === tip.id ? "Collapse" : "Expand"}
                        >
                          {expandedTipId === tip.id ? (
                            <ChevronUp className="w-5 h-5" />
                          ) : (
                            <ChevronDown className="w-5 h-5" />
                          )}
                        </button>
                        <button
                          onClick={(e) => handleDeleteTip(tip.id, e)}
                          disabled={deletingTipId === tip.id}
                          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-50"
                          aria-label="Unsave tip"
                        >
                          <Icon 
                            icon={BookmarkSimple} 
                            size={20}
                            weight="fill"
                            className="text-current"
                          />
                        </button>
                      </div>
                    </div>

                  {/* Expanded Content */}
                  {expandedTipId === tip.id && (
                    <div className="mt-4 pt-4 border-t border-gray-200 space-y-4">
                      {tip.sound_rule && (() => {
                        const soundRuleAudioKey = `${tip.id}:soundrule`
                        const soundRuleAudioState = audioStates[soundRuleAudioKey]
                        // Extract the phrase from sound_rule if it contains arrow notation like "particular" → par-TIK-yuh-ler
                        const soundRuleText = tip.phrase
                        
                        return (
                          <div>
                            <Label className="text-gray-500 mb-1 block">How it sounds</Label>
                            <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                              <div className="flex items-start gap-2">
                                <button
                                  onClick={(e) => handlePlayAudio(soundRuleAudioKey, soundRuleText, e)}
                                  disabled={soundRuleAudioState?.isLoading}
                                  className="p-1 rounded-lg text-blue-600 hover:bg-blue-100 transition-colors disabled:opacity-50 flex-shrink-0 mt-0.5"
                                  aria-label={soundRuleAudioState?.isPlaying ? "Pause" : "Play"}
                                >
                                  <Icon 
                                    icon={soundRuleAudioState?.isPlaying ? Pause : Play} 
                                    size={16}
                                    weight="fill"
                                    className="text-current"
                                  />
                                </button>
                                <Body className="text-gray-900 flex-1">{tip.sound_rule}</Body>
                              </div>
                            </div>
                          </div>
                        )
                      })()}
                      
                      {tip.in_sentence_original && (() => {
                        const sentenceAudioKey = `${tip.id}:sentence`
                        const sentenceAudioState = audioStates[sentenceAudioKey]
                        
                        return (
                          <div>
                            <Label className="text-gray-500 mb-1 block">In this phrase</Label>
                            <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                              <div className="flex items-start gap-2">
                                <button
                                  onClick={(e) => handlePlayAudio(sentenceAudioKey, tip.in_sentence_original!, e)}
                                  disabled={sentenceAudioState?.isLoading}
                                  className="p-1 rounded-lg text-blue-600 hover:bg-blue-100 transition-colors disabled:opacity-50 flex-shrink-0 mt-0.5"
                                  aria-label={sentenceAudioState?.isPlaying ? "Pause" : "Play"}
                                >
                                  <Icon 
                                    icon={sentenceAudioState?.isPlaying ? Pause : Play} 
                                    size={16}
                                    weight="fill"
                                    className="text-current"
                                  />
                                </button>
                                <Body className="text-gray-900 italic flex-1">"{tip.in_sentence_original}"</Body>
                              </div>
                            </div>
                            {tip.chunk_display && (
                              <Caption className="text-gray-600 mt-2">
                                Links together: "{tip.chunk_display}"
                              </Caption>
                            )}
                            {tip.in_sentence_highlighted && tip.in_sentence_heard_as && !tip.chunk_display && (
                              <Caption className="text-gray-600 mt-2">
                                "{tip.in_sentence_highlighted}" → "{tip.in_sentence_heard_as}"
                              </Caption>
                            )}
                          </div>
                        )
                      })()}
                      
                      {tip.extra_example_sentence && (() => {
                        const exampleAudioKey = `${tip.id}:example`
                        const exampleAudioState = audioStates[exampleAudioKey]
                        
                        return (
                          <div>
                            <Label className="text-gray-500 mb-1 block">Example</Label>
                            <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                              <div className="flex items-start gap-2">
                                <button
                                  onClick={(e) => handlePlayAudio(exampleAudioKey, tip.extra_example_sentence!, e)}
                                  disabled={exampleAudioState?.isLoading}
                                  className="p-1 rounded-lg text-blue-600 hover:bg-blue-100 transition-colors disabled:opacity-50 flex-shrink-0 mt-0.5"
                                  aria-label={exampleAudioState?.isPlaying ? "Pause" : "Play"}
                                >
                                  <Icon 
                                    icon={exampleAudioState?.isPlaying ? Pause : Play} 
                                    size={16}
                                    weight="fill"
                                    className="text-current"
                                  />
                                </button>
                                <div className="flex-1">
                                  <Body className="text-gray-900 italic">"{tip.extra_example_sentence}"</Body>
                                  {tip.extra_example_heard_as && (
                                    <Caption className="text-gray-600 mt-2">
                                      (sounds like "{tip.extra_example_heard_as}")
                                    </Caption>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })()}
                      
                      {tip.tip && (
                        <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                          <Label className="text-blue-700 mb-1 block flex items-center gap-1">
                            <span>💡</span>
                            Listening tip
                          </Label>
                          <Body className="text-blue-900 text-sm">{tip.tip}</Body>
                        </div>
                      )}
                      
                      <Caption tone="muted" className="pt-2">
                        Saved {new Date(tip.created_at).toLocaleDateString()}
                      </Caption>
                    </div>
                  )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
