'use client'

import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { generateWordFeedback } from '@/lib/wordFeedback'

interface WordPopoverProps {
  isOpen: boolean
  onClose: () => void
  token: {
    type: 'wrong' | 'missing' | 'extra'
    expected?: string
    actual?: string
    confidenceLevel?: 'HIGH' | 'MED' | 'LOW'
    startMs?: number | null
    endMs?: number | null
    previousWord?: string | null
    nextWord?: string | null
    originalSentence?: string
    userInput?: string
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

  // Map token type to wordType for feedback generator
  const wordType = token.type === 'missing' ? 'grey' : token.type === 'extra' ? 'grey-slash' : 'red'
  
  // Generate context-specific feedback
  const feedback = generateWordFeedback({
    originalSentence: token.originalSentence || '',
    userInput: token.userInput || '',
    word: token.expected || token.actual || '',
    wordType,
    previousWord: token.previousWord || null,
    nextWord: token.nextWord || null,
    userTypedWord: token.actual || null,
  })

  const canReplaySegment = !!onReplay && token.startMs != null && token.endMs != null
  const confidenceText = token.confidenceLevel || 'MED'

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
            Listening feedback
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
          {feedback.type === 'missing' && (
            <>
              {/* What you might have heard */}
              <div>
                <div className="text-sm font-medium text-gray-500 mb-1">What you might have heard</div>
                <div className="text-lg text-gray-900">
                  <span className="text-gray-400 italic">{feedback.feedback.whatUserMightHaveHeard}</span>
                </div>
              </div>

              {/* What it was */}
              <div>
                <div className="text-sm font-medium text-gray-500 mb-1">What it was</div>
                <div className="text-lg text-gray-900">
                  <span className="font-semibold">{feedback.feedback.whatItWas}</span>
                </div>
              </div>

              {/* Why this was hard */}
              <div>
                <div className="text-sm font-medium text-gray-500 mb-1">Why this was hard</div>
                <div className="text-base text-gray-700 leading-relaxed">
                  {feedback.feedback.whyThisWasHard}
                </div>
              </div>
            </>
          )}

          {feedback.type === 'extra' && (
            <>
              {/* What you heard */}
              <div>
                <div className="text-sm font-medium text-gray-500 mb-1">What you heard</div>
                <div className="text-lg text-gray-900">
                  <span className="font-semibold">{feedback.feedback.whatUserHeard}</span>
                </div>
              </div>

              {/* What was actually said */}
              <div>
                <div className="text-sm font-medium text-gray-500 mb-1">What was actually said</div>
                <div className="text-lg text-gray-900">
                  <span className="font-semibold">{feedback.feedback.whatWasActuallySaid}</span>
                </div>
              </div>

              {/* Why this happened */}
              <div>
                <div className="text-sm font-medium text-gray-500 mb-1">Why this happened</div>
                <div className="text-base text-gray-700 leading-relaxed">
                  {feedback.feedback.whyThisHappened}
                </div>
              </div>
            </>
          )}

          {feedback.type === 'substitution' && (
            <>
              {/* What you heard */}
              <div>
                <div className="text-sm font-medium text-gray-500 mb-1">What you heard</div>
                <div className="text-lg text-gray-900">
                  <span className="font-semibold">{feedback.feedback.whatUserHeard}</span>
                </div>
              </div>

              {/* What it was */}
              <div>
                <div className="text-sm font-medium text-gray-500 mb-1">What it was</div>
                <div className="text-lg text-gray-900">
                  <span className="font-semibold">{feedback.feedback.whatItWas}</span>
                </div>
              </div>

              {/* Why they sounded similar here */}
              <div>
                <div className="text-sm font-medium text-gray-500 mb-1">Why they sounded similar here</div>
                <div className="text-base text-gray-700 leading-relaxed">
                  {feedback.feedback.whyTheySoundedSimilarHere}
                </div>
              </div>
            </>
          )}

          {/* Confidence */}
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-gray-500">Confidence</div>
            <div className="text-sm font-semibold text-gray-800">{confidenceText}</div>
          </div>

          {/* CTA */}
          {onReplay && (
            <button
              onClick={() => {
                if (!canReplaySegment) return
                onReplay()
                onClose()
              }}
              className={`w-full py-3 px-4 rounded-lg font-medium transition-colors ${
                canReplaySegment
                  ? 'bg-blue-600 text-white active:bg-blue-700'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
              title={canReplaySegment ? 'Replay segment' : 'Segment timing unavailable'}
            >
              Replay segment
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

