'use client'

import { useState } from 'react'
import { Insight, getCategoryLabel } from '@/lib/sessionTypes'

interface ReviewInsightCardProps {
  insight: Insight
  defaultExpanded?: boolean
  onTap?: () => void
}

export default function ReviewInsightCard({
  insight,
  defaultExpanded = false,
  onTap,
}: ReviewInsightCardProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)

  const handleHeaderClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsExpanded(!isExpanded)
  }

  const handleCardClick = () => {
    onTap?.()
  }

  return (
    <div 
      className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 space-y-3 cursor-pointer hover:bg-blue-100 transition-colors"
      onClick={handleCardClick}
    >
      {/* Header with title and chevron */}
      <button
        onClick={handleHeaderClick}
        className="w-full flex items-center justify-between text-left"
      >
        <div className="text-sm font-semibold text-blue-900 uppercase tracking-wide">
          {getCategoryLabel(insight.category)}
        </div>
        <svg
          className={`w-5 h-5 text-blue-700 transition-transform ${
            isExpanded ? 'rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* What happened - always visible */}
      <div>
        <div className="text-sm font-medium text-blue-700 mb-1">What happened</div>
        <div className="text-base text-blue-900">{insight.whatHappened}</div>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="space-y-3 pt-2 border-t border-blue-200">
          {/* Why it sounded hard */}
          <div>
            <div className="text-sm font-medium text-blue-700 mb-1">Why it sounded hard</div>
            <div className="text-base text-blue-900">{insight.whyHard}</div>
          </div>

          {/* Focus tip (if available) */}
          {insight.focusTip && (
            <div>
              <div className="text-sm font-medium text-blue-700 mb-1">Focus tip</div>
              <div className="text-sm text-blue-900">{insight.focusTip}</div>
            </div>
          )}

          {/* Examples (if available) */}
          {insight.examples && insight.examples.length > 0 && (
            <div>
              <div className="text-sm font-medium text-blue-700 mb-1">Example</div>
              <div className="text-sm text-blue-900">
                {insight.examples.map((example, idx) => (
                  <div key={idx}>{example}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

