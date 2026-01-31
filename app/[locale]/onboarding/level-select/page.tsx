'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { setUserPreferences, getUserPreferences, UserLevel } from '@/lib/userPreferences'

const levels: { id: UserLevel; name: string }[] = [
  { id: 'Beginner', name: 'Beginner' },
  { id: 'Intermediate', name: 'Intermediate' },
  { id: 'Advanced', name: 'Advanced' },
  { id: 'Not sure', name: 'Not sure' },
]

export default function LevelSelectPage() {
  const router = useRouter()
  const [selected, setSelected] = useState<UserLevel | null>(null)

  useEffect(() => {
    // Load existing selection if any
    const prefs = getUserPreferences()
    if (prefs?.userLevel) {
      setSelected(prefs.userLevel)
    }
  }, [])

  const handleLevelSelect = (level: UserLevel) => {
    setSelected(level)
  }

  const handleContinue = () => {
    const prefs = getUserPreferences()
    if (prefs) {
      setUserPreferences({
        ...prefs,
        userLevel: selected || undefined,
      })
    }
    router.push('/onboarding/ready')
  }

  const handleSkip = () => {
    router.push('/onboarding/ready')
  }

  return (
    <main className="flex min-h-screen flex-col px-6 py-6">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/onboarding/genre"
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
            About your level
          </h1>
          <p className="text-lg text-gray-400">
            Optional — we'll adjust based on your practice.
          </p>
        </div>

        <div className="space-y-3">
          {levels.map((level) => {
            const isSelected = selected === level.id
            return (
              <button
                key={level.id}
                onClick={() => handleLevelSelect(level.id)}
                className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                  isSelected
                    ? 'border-blue-600 bg-blue-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`font-medium ${isSelected ? 'text-blue-900' : 'text-gray-900'}`}>
                    {level.name}
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

      {/* Sticky bottom buttons */}
      <div className="pt-6 pb-6 space-y-3">
        <button
          onClick={handleContinue}
          className="w-full py-4 px-6 rounded-xl font-semibold text-lg bg-blue-600 text-white active:bg-blue-700 shadow-lg transition-colors"
        >
          Continue
        </button>
        <button
          onClick={handleSkip}
          className="w-full py-3 px-6 rounded-xl font-medium text-lg text-gray-600 hover:text-gray-900 transition-colors"
        >
          Skip for now
        </button>
      </div>
    </main>
  )
}

