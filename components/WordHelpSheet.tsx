'use client'

import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { generateWordFeedback } from '@/lib/wordFeedback'

interface WordHelpSheetProps {
  open: boolean
  onClose: () => void
  word: string
  previousWord?: string | null
  nextWord?: string | null
  originalSentence?: string
  userInput?: string
}

export default function WordHelpSheet({
  open,
  onClose,
  word,
  previousWord,
  nextWord,
  originalSentence,
  userInput,
}: WordHelpSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null)

  // Close on outside click / escape
  useEffect(() => {
    if (!open) return

    const handleClickOutside = (event: MouseEvent) => {
      if (sheetRef.current && !sheetRef.current.contains(event.target as Node)) {
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
  }, [open, onClose])

  if (!open) return null

  const displayWord = word || 'this word'

  // Generate context-specific feedback for correct word
  const feedback = generateWordFeedback({
    originalSentence: originalSentence || '',
    userInput: userInput || '',
    word: displayWord,
    wordType: 'black',
    previousWord: previousWord || null,
    nextWord: nextWord || null,
  })

  const wordFeedback = feedback.type === 'correct' ? feedback.feedback : null

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

      {/* Sheet */}
      <div
        ref={sheetRef}
        className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-h-[80vh] overflow-y-auto z-10"
        role="dialog"
        aria-modal="true"
        aria-labelledby="word-help-title"
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <h3 id="word-help-title" className="text-lg font-semibold text-gray-900">
            Word help
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-gray-100 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-6 space-y-4">
          <div>
            <div className="text-sm font-medium text-gray-500 mb-1">Word</div>
            <div className="text-xl font-semibold text-gray-900">{displayWord}</div>
          </div>

          {wordFeedback && (
            <>
              <div>
                <div className="text-sm font-medium text-gray-500 mb-1">Meaning</div>
                <div className="text-base text-gray-800">
                  {wordFeedback.meaning}
                </div>
              </div>

              <div>
                <div className="text-sm font-medium text-gray-500 mb-1">Pronunciation tip</div>
                <div className="text-base text-gray-800">
                  {wordFeedback.pronunciationTip}
                </div>
              </div>

              {wordFeedback.reductionOrLinking && (
                <div>
                  <div className="text-sm font-medium text-gray-500 mb-1">Reduction or linking</div>
                  <div className="text-base text-gray-800">
                    {wordFeedback.reductionOrLinking}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Replay word CTA */}
          <button
            onClick={() => {
              // TODO: Implement word-level replay when timing is available
              onClose()
            }}
            className="w-full py-3 px-4 bg-blue-600 text-white rounded-lg font-medium active:bg-blue-700 transition-colors"
          >
            Replay this word
          </button>
        </div>
      </div>
    </div>
  )
}


