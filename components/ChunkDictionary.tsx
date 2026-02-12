'use client'

import { useEffect, useRef, useLayoutEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { ChunkHit } from '@/lib/chunkApi'
import Snackbar from './Snackbar'
import { Heading, Body, Label, Caption } from '@/components/ui/Typography'

interface ChunkDictionaryProps {
  isOpen: boolean
  onClose: () => void
  hit: ChunkHit | null
  anchorRect: DOMRect | null
}

/**
 * Parse meaning and example from the gloss field.
 * New format: "MEANING:\n<text>\n\nEXAMPLE:\n<text>"
 * Old format: just plain text (backward compatibility)
 */
function parseMeaningAndExample(
  text: string | null | undefined
): { meaning: string | null; example: string | null } {
  if (!text) return { meaning: null, example: null }

  const raw = text.trim()

  // New format: contains MEANING: or EXAMPLE: labels
  if (/MEANING:/i.test(raw) || /EXAMPLE:/i.test(raw)) {
    const meaningMatch = raw.match(/MEANING:\s*([\s\S]*?)(?:\n+EXAMPLE:|$)/i)
    const exampleMatch = raw.match(/EXAMPLE:\s*([\s\S]*)$/i)

    const meaning = meaningMatch?.[1]?.trim() || null
    const example = exampleMatch?.[1]?.trim() || null

    return { meaning, example }
  }

  // Old format: whole string is the meaning (backward compatibility)
  return { meaning: raw, example: null }
}

export default function ChunkDictionary({
  isOpen,
  onClose,
  hit,
  anchorRect,
}: ChunkDictionaryProps) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const [isCheckingSaved, setIsCheckingSaved] = useState(false)
  const [exampleSentence, setExampleSentence] = useState<string | null>(null)
  const [isGeneratingExample, setIsGeneratingExample] = useState(false)
  const [toast, setToast] = useState<{ open: boolean; message: string; variant: 'error' | 'info' }>({
    open: false,
    message: '',
    variant: 'error',
  })

  // Measure popover height and calculate position
  useLayoutEffect(() => {
    if (!isOpen || !hit) {
      setPosition(null)
      return
    }

    // If ref isn't ready yet, use estimated height (will recalculate when ref is ready)
    const estimatedHeight = 120
    const popoverHeight = popoverRef.current?.offsetHeight || estimatedHeight
    const viewportW = window.innerWidth
    const viewportH = window.innerHeight
    const padding = 12
    const gap = 8

    // Calculate width
    const width = Math.min(420, viewportW - padding * 2)

    // If anchorRect exists, position relative to it; otherwise center
    if (anchorRect) {
      // Calculate left position (clamp within viewport)
      let left = anchorRect.left
      left = Math.max(padding, Math.min(left, viewportW - width - padding))

      // Calculate top position (prefer below, flip above if needed)
      let preferredTop = anchorRect.bottom + gap
      let top = preferredTop

      // Check if popover would overflow bottom
      if (preferredTop + popoverHeight + padding > viewportH) {
        // Place above anchor
        top = anchorRect.top - gap - popoverHeight
        // Clamp to minimum top padding
        if (top < padding) {
          top = padding
        }
      }

      setPosition({ top, left })
    } else {
      // No anchorRect - center the modal
      const left = (viewportW - width) / 2
      const top = Math.max(padding, (viewportH - popoverHeight) / 2)
      setPosition({ top, left })
    }

    // Recalculate when ref becomes available (if it wasn't before)
    if (!popoverRef.current) {
      // Trigger recalculation on next frame
      requestAnimationFrame(() => {
        if (popoverRef.current && isOpen && hit) {
          const actualHeight = popoverRef.current.offsetHeight
          const width = Math.min(420, window.innerWidth - 24)
          
          if (anchorRect) {
            const left = Math.max(12, Math.min(anchorRect.left, window.innerWidth - width - 12))
            let top = anchorRect.bottom + 8
            if (top + actualHeight + 12 > window.innerHeight) {
              top = anchorRect.top - 8 - actualHeight
              if (top < 12) top = 12
            }
            setPosition({ top, left })
          } else {
            const left = (window.innerWidth - width) / 2
            const top = Math.max(12, (window.innerHeight - actualHeight) / 2)
            setPosition({ top, left })
          }
        }
      })
    }
  }, [isOpen, hit, anchorRect])

  // Check if chunk is saved when modal opens and chunk_id is available
  useEffect(() => {
    if (!isOpen || !hit) {
      setIsSaved(false)
      setIsSaving(false)
      setIsCheckingSaved(false)
      setExampleSentence(null)
      return
    }

    // Only check if we have a chunk_id (not during initial "Looking up..." state)
    if (!hit.chunk_id || hit.chunk_display === 'Looking up...') {
      setIsSaved(false)
      setIsCheckingSaved(false)
      setExampleSentence(null)
      return
    }

    // Check saved status and load example sentence if saved
    const checkSaved = async () => {
      setIsCheckingSaved(true)
      try {
        console.log('🔍 [ChunkDictionary] Checking saved status', { chunk_id: hit.chunk_id })
        const response = await fetch(`/api/saved?clipChunkSpanId=${hit.chunk_id}`)
        if (response.ok) {
          const data = await response.json()
          const saved = data.saved || false
          console.log('✅ [ChunkDictionary] Saved status:', saved)
          setIsSaved(saved)
          
          // If saved, fetch the item to get example sentence
          if (saved) {
            const allItemsResponse = await fetch('/api/saved')
            if (allItemsResponse.ok) {
              const allData = await allItemsResponse.json()
              const savedItem = allData.items?.find((item: any) => item.clip_chunk_span_id === hit.chunk_id)
              if (savedItem?.example_sentence) {
                setExampleSentence(savedItem.example_sentence)
              }
            }
          }
        }
      } catch (error) {
        console.error('❌ [ChunkDictionary] Error checking saved status:', error)
      } finally {
        setIsCheckingSaved(false)
      }
    }

    checkSaved()
  }, [isOpen, hit?.chunk_id, hit?.chunk_display])

  // Close on outside click and Escape key
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, onClose])

  // Handle save/unsave chunk (idempotent)
  const handleSaveToggle = async () => {
    if (!hit || !hit.chunk_id || isSaving) return

    const newSavedState = !isSaved
    console.log('💾 [ChunkDictionary] Toggling save', { 
      chunk_id: hit.chunk_id, 
      currentState: isSaved, 
      newState: newSavedState 
    })

    // Optimistic update
    setIsSaved(newSavedState)
    setIsSaving(true)
    
    // If saving (not unsaving), show loading for example sentence
    if (newSavedState) {
      setIsGeneratingExample(true)
    } else {
      setExampleSentence(null)
    }

    try {
      const response = await fetch('/api/saved/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clipId: hit.clip_id,
          clipChunkSpanId: hit.chunk_id,
          chunkDisplay: hit.chunk_display || '',
          meaning: hit.gloss || null,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        console.error('❌ [ChunkDictionary] Failed to toggle save:', error)
        // Revert optimistic update on error
        setIsSaved(!newSavedState)
        setExampleSentence(null)
        setIsGeneratingExample(false)
        // Show error toast
        setToast({
          open: true,
          message: error.message || 'Failed to save. Please try again.',
          variant: 'error',
        })
        setTimeout(() => setToast({ open: false, message: '', variant: 'error' }), 3000)
        return
      }

      const data = await response.json()
      console.log('✅ [ChunkDictionary] Save toggled successfully', { saved: data.saved, item: data.item })
      setIsSaved(data.saved || false)
      
      // Update example sentence if provided
      if (data.item?.example_sentence) {
        setExampleSentence(data.item.example_sentence)
        setIsGeneratingExample(false)
      } else if (!data.saved) {
        // Unsaved - clear example
        setExampleSentence(null)
        setIsGeneratingExample(false)
      } else if (data.saved) {
        // Saved but no example in response - try to fetch from saved items
        // This handles the case where example was generated but not returned
        const allItemsResponse = await fetch('/api/saved')
        if (allItemsResponse.ok) {
          const allData = await allItemsResponse.json()
          const savedItem = allData.items?.find((item: any) => item.clip_chunk_span_id === hit.chunk_id)
          if (savedItem?.example_sentence) {
            setExampleSentence(savedItem.example_sentence)
          }
        }
        setIsGeneratingExample(false)
      } else {
        setIsGeneratingExample(false)
      }
    } catch (error: any) {
      console.error('❌ [ChunkDictionary] Save toggle error:', error)
      // Revert optimistic update on error
      setIsSaved(!newSavedState)
      setExampleSentence(null)
      setIsGeneratingExample(false)
      // Show error toast
      setToast({
        open: true,
        message: error.message || 'Failed to save. Please try again.',
        variant: 'error',
      })
      setTimeout(() => setToast({ open: false, message: '', variant: 'error' }), 3000)
    } finally {
      setIsSaving(false)
    }
  }

  // Debug logging
  if (process.env.NODE_ENV === 'development') {
    if (isOpen && hit && !position) {
      console.warn('⚠️ [ChunkDictionary] isOpen and hit exist but position is null', {
        isOpen,
        hasHit: !!hit,
        hasPosition: !!position,
        hasAnchorRect: !!anchorRect,
      })
    }
  }

  if (!isOpen || !hit || !position) return null

  return (
    <>
      <style>{`
        @keyframes chunkPopoverEnter {
          from {
            opacity: 0;
            transform: translateY(-4px) scale(0.96);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>

      {/* Optional very light backdrop */}
      <div
        className="fixed inset-0 bg-black/5 z-40"
        onClick={onClose}
        style={{
          animation: 'chunkPopoverEnter 150ms ease-out',
        }}
      />

      {/* Anchored popover */}
      <div
        ref={popoverRef}
        className="fixed z-50 bg-white rounded-2xl shadow-2xl border border-gray-200 w-[min(420px,calc(100vw-24px))]"
        style={{
          top: `${position.top}px`,
          left: `${position.left}px`,
          animation: 'chunkPopoverEnter 200ms ease-out',
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="chunk-title"
      >
        <div className="px-4 py-3 space-y-3">
          {/* Header row: title left, X right */}
          <div className="flex items-center justify-between">
            <Heading as="h3" id="chunk-title" className="text-base font-semibold text-gray-900">
              {hit.chunk_display === 'Looking up...' ? (
                <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
              ) : (
                hit.chunk_display
              )}
            </Heading>
            <button
              onClick={onClose}
              className="p-1 rounded-full hover:bg-gray-100 transition-colors flex-shrink-0 -mr-1"
              aria-label="Close"
            >
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>

          {/* Body: Meaning and Example with labels */}
          <div className="space-y-3">
            {/* Show skeleton if meaning is loading */}
            {!hit.gloss ? (
              <>
                {/* Skeleton for Meaning section */}
                <div className="space-y-1.5">
                  <div className="h-3 w-16 bg-gray-200 rounded animate-pulse" />
                  <div className="h-5 bg-gray-200 rounded animate-pulse" style={{ width: '90%' }} />
                  <div className="h-5 bg-gray-200 rounded animate-pulse" style={{ width: '75%' }} />
                </div>
                {/* Skeleton for Example section */}
                <div className="space-y-1.5">
                  <div className="h-3 w-20 bg-gray-200 rounded animate-pulse" />
                  <div className="h-5 bg-gray-200 rounded animate-pulse" style={{ width: '85%' }} />
                </div>
              </>
            ) : (
              <>
                {(() => {
                  // Parse meaning and example from hit.gloss
                  const { meaning, example } = parseMeaningAndExample(hit.gloss)
                  const meaningToShow = meaning ?? (hit.gloss?.trim() ?? '')
                  
                  return (
                    <>
                      {/* Meaning section */}
                      <div className="space-y-1.5">
                        <Caption className="text-[11px] uppercase tracking-wide text-gray-500 font-medium">
                          MEANING
                        </Caption>
                        <Body className="text-sm leading-relaxed text-gray-800 whitespace-pre-line">
                          {meaningToShow}
                        </Body>
                      </div>

                      {/* Example section - only show if example exists */}
                      {example ? (
                        <div className="space-y-1.5">
                          <Caption className="text-[11px] uppercase tracking-wide text-gray-500 font-medium">
                            EXAMPLE
                          </Caption>
                          <Body className="text-sm leading-relaxed text-gray-800 whitespace-pre-line">
                            {example}
                          </Body>
                        </div>
                      ) : null}
                    </>
                  )
                })()}
              </>
            )}
          </div>

          {/* Divider */}
          <div className="border-t border-gray-200 my-3" />

          {/* Footer: Save/Unsave and Close buttons side-by-side */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleSaveToggle}
              disabled={isSaving || isCheckingSaved || !hit.chunk_id}
              className={`flex-1 py-2.5 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                isSaved 
                  ? 'bg-gray-100 active:bg-gray-200 hover:bg-gray-200' 
                  : 'bg-blue-600 active:bg-blue-700'
              }`}
            >
              <Label className={`text-xs ${isSaved ? 'text-gray-700' : 'text-white'}`}>
                {isCheckingSaved ? '...' : isSaving ? (isSaved ? 'Unsaving...' : 'Saving...') : isSaved ? 'Saved' : 'Save'}
              </Label>
            </button>
            <button
              onClick={onClose}
              className="flex-1 py-2.5 px-4 bg-gray-100 rounded-lg active:bg-gray-200 transition-colors"
            >
              <Label className="text-gray-700 text-xs">Close</Label>
            </button>
          </div>
        </div>
      </div>

      {/* Toast notification */}
      <Snackbar
        open={toast.open}
        variant={toast.variant}
        title={toast.message}
        onClose={() => setToast({ open: false, message: '', variant: 'error' })}
      />
    </>
  )
}
