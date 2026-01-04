'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'

const topics = [
  { id: 'work', name: 'Work & meetings' },
  { id: 'casual', name: 'Casual conversations' },
  { id: 'tech', name: 'Tech & startups' },
  { id: 'travel', name: 'Travel & daily life' },
  { id: 'culture', name: 'Culture & interviews' },
]

export default function TopicsPage() {
  const [selectedTopics, setSelectedTopics] = useState<Set<string>>(new Set())
  const router = useRouter()

  const toggleTopic = (topicId: string) => {
    const newSelected = new Set(selectedTopics)
    if (newSelected.has(topicId)) {
      newSelected.delete(topicId)
    } else {
      newSelected.add(topicId)
    }
    setSelectedTopics(newSelected)
  }

  const handleContinue = () => {
    router.push('/onboarding/level')
  }

  return (
    <main className="flex min-h-screen flex-col px-6 py-6">
      {/* Header with progress bar */}
      <div className="space-y-4 mb-8">
        <div className="flex items-center justify-between">
          <Link 
            href="/"
            className="text-blue-600 font-medium text-lg py-2 px-1 -ml-1 inline-flex items-center gap-1"
          >
            <ChevronLeft className="w-5 h-5" />
            Back
          </Link>
          <span className="text-sm text-gray-500">Step 1 of 3</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-1">
          <div className="bg-blue-600 h-1 rounded-full" style={{ width: '33.33%' }} />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">
          What do you want to listen to?
        </h1>

        <div className="space-y-3">
          {topics.map((topic) => {
            const isSelected = selectedTopics.has(topic.id)
            return (
              <button
                key={topic.id}
                onClick={() => toggleTopic(topic.id)}
                className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                  isSelected
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{topic.name}</span>
                  {isSelected && (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Sticky bottom button */}
      <div className="pt-6 pb-6">
        <button
          onClick={handleContinue}
          className="w-full py-4 px-6 rounded-xl font-semibold text-lg bg-blue-600 text-white active:bg-blue-700 shadow-lg transition-colors"
        >
          Continue
        </button>
      </div>
    </main>
  )
}

