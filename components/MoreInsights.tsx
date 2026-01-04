'use client'

import { useState } from 'react'
import { Insight } from '@/lib/sessionTypes'
import ReviewInsightCard from './ReviewInsightCard'

interface MoreInsightsProps {
  insights: Insight[]
  onInsightTap?: (insightId: string) => void
  activeInsightId?: string | null
}

export default function MoreInsights({ insights, onInsightTap, activeInsightId }: MoreInsightsProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  if (insights.length === 0) {
    return null
  }

  return (
    <div className="space-y-3">
      {/* Toggle button */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full text-left px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl hover:bg-gray-100 active:bg-gray-200 transition-colors"
      >
        <div className="flex items-center justify-between">
          <span className="font-medium text-gray-900">
            More insights ({insights.length})
          </span>
          <svg
            className={`w-5 h-5 text-gray-600 transition-transform ${
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
        </div>
      </button>

      {/* Expanded insights */}
      {isExpanded && (
        <div className="space-y-3">
          {insights.map((insight) => (
            <div
              key={insight.id}
              className={activeInsightId === insight.id ? 'ring-2 ring-blue-400 rounded-xl' : ''}
            >
              <ReviewInsightCard
                insight={insight}
                defaultExpanded={false}
                onTap={() => onInsightTap?.(insight.id)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

