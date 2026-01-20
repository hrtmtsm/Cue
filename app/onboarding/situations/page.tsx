'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { getOnboardingData, setOnboardingData, type SituationKey } from '@/lib/onboardingStore'
import { SITUATION_OPTIONS, MAX_SITUATION_SELECTIONS, DEFAULT_SITUATION } from '@/lib/situations'

const MAX_SELECTIONS = MAX_SITUATION_SELECTIONS

export default function SituationsPage() {
  const [selectedSituations, setSelectedSituations] = useState<Set<SituationKey>>(new Set())
  const router = useRouter()

  useEffect(() => {
    // Load existing selections if any
    const data = getOnboardingData()
    if (data.situations && data.situations.length > 0) {
      setSelectedSituations(new Set(data.situations))
    }
  }, [])

  const toggleSituation = (situationKey: SituationKey) => {
    const newSelected = new Set(selectedSituations)
    if (newSelected.has(situationKey)) {
      newSelected.delete(situationKey)
    } else {
      // Enforce max 2 selections
      if (newSelected.size < MAX_SELECTIONS) {
        newSelected.add(situationKey)
      }
    }
    setSelectedSituations(newSelected)
  }

  const handleContinue = () => {
    // Save selected situations as ordered array
    setOnboardingData({
      situations: Array.from(selectedSituations) as SituationKey[],
    })
    // Navigate to practice select (will show ready modal)
    router.push('/practice/select')
  }

  const handleSkip = () => {
    // "Not now" - save with default general situation
    setOnboardingData({
      situations: [DEFAULT_SITUATION],
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
          {SITUATION_OPTIONS.map((situation) => {
            const isSelected = selectedSituations.has(situation.key)
            const isDisabled = !isSelected && !canSelectMore
            return (
              <button
                key={situation.key}
                onClick={() => toggleSituation(situation.key)}
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
                  <span className="font-medium">{situation.label}</span>
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

