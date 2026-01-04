'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

const levels = [
  { id: 'starting', name: 'Just starting', description: null },
  { id: 'comfortable', name: 'Getting comfortable', description: null },
  { id: 'confident', name: 'Pretty confident', description: null },
  { id: 'not-sure', name: 'Not sure', description: 'We\'ll pick clips that match your pace' },
]

export default function LevelPage() {
  const [selectedLevel, setSelectedLevel] = useState<string | null>(null)
  const router = useRouter()

  const handleContinue = () => {
    router.push('/onboarding/ready')
  }

  const handleSkip = () => {
    router.push('/onboarding/ready')
  }

  return (
    <main className="flex min-h-screen flex-col px-6 py-6">
      {/* Header with progress bar */}
      <div className="space-y-4 mb-8">
        <div className="flex items-center justify-between">
          <Link 
            href="/onboarding/topics"
            className="text-blue-600 font-medium text-lg py-2 px-1 -ml-1"
          >
            Back
          </Link>
          <span className="text-sm text-gray-500">Step 2 of 3</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-1">
          <div className="bg-blue-600 h-1 rounded-full" style={{ width: '66.66%' }} />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">
          How's your listening?
        </h1>

        <div className="space-y-3">
          {levels.map((level) => {
            const isSelected = selectedLevel === level.id
            return (
              <button
                key={level.id}
                onClick={() => setSelectedLevel(level.id)}
                className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                  isSelected
                    ? 'border-blue-600 bg-blue-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="space-y-1">
                  <div className="font-medium text-gray-900">{level.name}</div>
                  {level.description && (
                    <div className="text-sm text-gray-600">{level.description}</div>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        <div className="pt-4">
          <button
            onClick={handleSkip}
            className="text-blue-600 font-medium text-lg"
          >
            Skip for now
          </button>
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

