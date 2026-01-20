'use client'

import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import type { CoachingInsight } from '@/lib/coachingInsights'

interface WordPopoverProps {
  isOpen: boolean
  onClose: () => void
  token: {
    insight?: CoachingInsight
    event?: any
  }
  onReplay?: () => void
}

export default function WordPopover({ 
  isOpen, 
  onClose, 
  token, 
  onReplay 
}: WordPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return

    // Lock background scroll while popover is open
    const previousBodyOverflow = document.body.style.overflow
    const previousHtmlOverflow = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'

    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    // Close on escape key
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

       // Restore previous scroll behavior
       document.body.style.overflow = previousBodyOverflow
       document.documentElement.style.overflow = previousHtmlOverflow
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const insight = token.insight
  const replayText = insight?.replay_target?.text || token.event?.phraseHint?.spanText || token.event?.expectedSpan || ''

  return (
    <div 
      className="fixed z-50 flex items-end justify-center sm:items-center sm:p-4"
      style={{
        top: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        width: '100%',
        maxWidth: '420px',
        height: '100vh',
        overflow: 'hidden',
      }}
    >
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/20"
        onClick={onClose}
        style={{
          width: '100%',
          height: '100%',
        }}
      />

      {/* Popover */}
      <div
        ref={popoverRef}
        className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-h-[80vh] z-10"
        role="dialog"
        aria-modal="true"
        aria-labelledby="popover-title"
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <h3 id="popover-title" className="text-lg font-semibold text-gray-900">
            {insight?.title || 'Listening feedback'}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-gray-100 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content (scrollable area) */}
        <div className="px-6 py-6 space-y-4 max-h-[60vh] overflow-y-auto">
          {insight ? (
            <>
              <div>
                <div className="text-sm font-medium text-gray-500 mb-1">What you might have heard</div>
                <div className="text-base text-gray-900">{insight.what_you_might_have_heard}</div>
              </div>
              <div>
                <div className="text-sm font-medium text-gray-500 mb-1">What it was</div>
                <div className="text-base text-gray-900">{insight.what_it_was}</div>
              </div>
              <div>
                <div className="text-sm font-medium text-gray-500 mb-1">Why this happened here</div>
                <div className="text-base text-gray-900">{insight.why_this_happens_here}</div>
              </div>
              <div>
                <div className="text-sm font-medium text-gray-500 mb-1">Try this</div>
                <div className="text-base text-gray-900">{insight.try_this}</div>
              </div>
            </>
          ) : (
            <div className="text-sm text-gray-600">Loading…</div>
          )}

          {/* CTA */}
          <button
            onClick={() => {
              onReplay?.()
              onClose()
            }}
            className="w-full py-3 px-4 bg-blue-600 text-white rounded-lg font-medium active:bg-blue-700 transition-colors"
            title={replayText ? `Replay: ${replayText}` : 'Replay'}
          >
            Replay this part
          </button>
        </div>
      </div>
    </div>
  )
}

