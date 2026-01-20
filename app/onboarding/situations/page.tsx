'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { getOnboardingData, setOnboardingData } from '@/lib/onboardingStore'

const situations = [
  { id: 'work', name: 'Work & professional conversations' },
  { id: 'daily', name: 'Daily conversations' },
  { id: 'travel', name: 'Travel & daily life' },
  { id: 'media', name: 'Movies, videos & shows' },
  { id: 'general', name: 'Just want to get better' },
]

const MAX_SELECTIONS = 2

export default function SituationsPage() {
  const [selectedSituations, setSelectedSituations] = useState<Set<string>>(new Set())
  const router = useRouter()

  useEffect(() => {
    // Load existing selections if any
    const data = getOnboardingData()
    if (data.situations && data.situations.length > 0) {
      setSelectedSituations(new Set(data.situations))
    }
  }, [])

  const toggleSituation = (situationId: string) => {
    const newSelected = new Set(selectedSituations)
    if (newSelected.has(situationId)) {
      newSelected.delete(situationId)
    } else {
      // Enforce max 2 selections
      if (newSelected.size < MAX_SELECTIONS) {
        newSelected.add(situationId)
      }
    }
    setSelectedSituations(newSelected)
  }

  const handleContinue = () => {
    // Save selected situations
    setOnboardingData({
      situations: Array.from(selectedSituations),
    })
    // Navigate to practice select (will show ready modal)
    router.push('/practice/select')
  }

  const handleSkip = () => {
    // "Not now" - save with default general situation
    setOnboardingData({
      situations: ['general'],
    })
    // Navigate to practice select
    router.push('/practice/select')
  }

  const canSelectMore = selectedSituations.size < MAX_SELECTIONS
  const hasSelection = selectedSituations.size > 0

  return (
    <main className="flex min-h-screen flex-col px-6 py-6">
      {/* Header */}
      <div className="mb-8">
        <Link 
          href="/onboarding/diagnosis"
          className="text-blue-600 font-medium text-lg py-2 px-1 -ml-1 inline-flex items-center gap-1"
        >
          <ChevronLeft className="w-5 h-5" />
          Back
        </Link>
      </div>

      {/* Content */}
      <div className="flex-1 space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-gray-900">
            What do you want to understand better first?
          </h1>
          <p className="text-sm text-gray-600">
            Choose up to {MAX_SELECTIONS}
          </p>
        </div>

        <div className="space-y-3">
          {situations.map((situation) => {
            const isSelected = selectedSituations.has(situation.id)
            const isDisabled = !isSelected && !canSelectMore
            return (
              <button
                key={situation.id}
                onClick={() => toggleSituation(situation.id)}
                disabled={isDisabled}
                className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                  isSelected
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : isDisabled
                    ? 'border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{situation.name}</span>
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

      {/* Sticky bottom buttons */}
      <div className="pt-6 pb-6 space-y-3">
        <button
          onClick={handleContinue}
          disabled={!hasSelection}
          className={`w-full py-4 px-6 rounded-xl font-semibold text-lg transition-colors ${
            hasSelection
              ? 'bg-blue-600 text-white active:bg-blue-700 shadow-lg'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          Continue
        </button>
        <button
          onClick={handleSkip}
          className="w-full py-3 px-6 text-center font-medium text-lg text-gray-600 hover:text-gray-900 transition-colors"
        >
          Not now
        </button>
      </div>
    </main>
  )
}

