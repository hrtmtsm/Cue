'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { getOnboardingData, setOnboardingData } from '@/lib/onboardingStore'

const difficulties = [
  'I miss parts when people speak naturally',
  'Speech feels too fast to keep up',
  'Words sound different from what I expect',
  'I understand individual words, but not full sentences',
  'Sentences feel long or confusing',
]

export default function DiagnosisPage() {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    // Load existing selections if any
    const data = getOnboardingData()
    if (data.listeningDifficulties.length > 0) {
      setSelected(new Set(data.listeningDifficulties))
    }
  }, [])

  const toggleDifficulty = (difficulty: string) => {
    const newSelected = new Set(selected)
    if (newSelected.has(difficulty)) {
      newSelected.delete(difficulty)
    } else {
      newSelected.add(difficulty)
    }
    setSelected(newSelected)
  }

  const handleContinue = () => {
    if (selected.size === 0) return
    
    setOnboardingData({
      listeningDifficulties: Array.from(selected),
    })
    router.push('/onboarding/genre')
  }

  return (
    <main className="flex min-h-screen flex-col px-6 py-6">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/auth/profile"
          className="text-blue-600 font-medium text-lg py-2 px-1 -ml-1 inline-flex items-center gap-1"
        >
          <ChevronLeft className="w-5 h-5" />
          Back
        </Link>
      </div>

      {/* Content */}
      <div className="flex-1 space-y-8">
        <div className="space-y-3">
          <h1 className="text-2xl font-bold text-gray-900">
            What usually makes it hard to understand spoken English?
          </h1>
          <p className="text-lg text-gray-600">
            Select all that apply.
          </p>
        </div>

        <div className="space-y-3">
          {difficulties.map((difficulty) => {
            const isSelected = selected.has(difficulty)
            return (
              <button
                key={difficulty}
                onClick={() => toggleDifficulty(difficulty)}
                className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                  isSelected
                    ? 'border-blue-600 bg-blue-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`font-medium ${isSelected ? 'text-blue-900' : 'text-gray-900'}`}>
                    {difficulty}
                  </span>
                  {isSelected && (
                    <svg className="w-6 h-6 text-blue-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
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
          disabled={selected.size === 0}
          className={`w-full py-4 px-6 rounded-xl font-semibold text-lg transition-colors ${
            selected.size === 0
              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
              : 'bg-blue-600 text-white active:bg-blue-700 shadow-lg'
          }`}
        >
          Continue
        </button>
      </div>
    </main>
  )
}

