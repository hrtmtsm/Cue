'use client'

import { useState } from 'react'
import { FeedbackInsight } from '@/lib/feedbackTypes'

interface InsightCardProps {
  insight: FeedbackInsight
  isExpanded?: boolean
  defaultExpanded?: boolean
}

export default function InsightCard({
  insight,
  isExpanded: controlledExpanded,
  defaultExpanded = false,
}: InsightCardProps) {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded)
  const isExpanded = controlledExpanded !== undefined ? controlledExpanded : internalExpanded
  const setExpanded = controlledExpanded !== undefined ? () => {} : setInternalExpanded

  const hasDetail = insight.detail && insight.detail.trim().length > 0

  return (
    <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
      <div className="space-y-2">
        {/* Header with label and expand button */}
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-blue-900 uppercase tracking-wide">
            {insight.title}
          </div>
          {hasDetail && (
            <button
              onClick={() => setExpanded(!isExpanded)}
              className="text-sm text-blue-600 font-medium hover:text-blue-700 transition-colors"
            >
              {isExpanded ? 'Hide' : 'Learn more'}
            </button>
          )}
        </div>

        {/* Summary (always visible) */}
        <div className="text-base text-blue-900">
          {insight.summary}
        </div>

        {/* Detail (expandable) */}
        {hasDetail && isExpanded && (
          <div className="pt-2 text-sm text-blue-800">
            {insight.detail}
          </div>
        )}
      </div>
    </div>
  )
}

