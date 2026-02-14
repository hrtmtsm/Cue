'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale } from 'next-intl'
import { Heading, Body, Caption } from '@/components/ui/Typography'
import { storeQuickStartSummary } from '@/lib/quickStartSummary'

type OnboardingChoice = 'diagnosis' | 'skip' | null

export default function WelcomePage() {
  const router = useRouter()
  const locale = useLocale()
  const [firstName, setFirstName] = useState('')
  const [selectedChoice, setSelectedChoice] = useState<OnboardingChoice>(null)

  useEffect(() => {
    // Get user's name from localStorage
    const name = localStorage.getItem('userFirstName')
    if (!name) {
      // If no name, redirect back to name page
      router.push(`/${locale}/onboarding/name`)
      return
    }
    setFirstName(name)
  }, [router, locale])

  const handleContinue = () => {
    if (selectedChoice === 'diagnosis') {
      // Navigate directly to diagnosis (audio is pre-generated)
      router.push(`/${locale}/onboarding/diagnosis`)
    } else if (selectedChoice === 'skip') {
      // Create default QuickStartSummary for users who skip diagnosis
      const defaultSummary = {
        version: 1 as const,
        createdAt: Date.now(),
        missedRate: 0.5,
        attemptAccuracy: 50,
        startingDifficulty: 25 as 15 | 25 | 35 | 55,
      }
      
      storeQuickStartSummary(defaultSummary)
      console.log('✅ [Welcome] Stored default QuickStartSummary for diagnosis skip:', defaultSummary)
      
      // Navigate to situations
      router.push(`/${locale}/onboarding/situations`)
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-12 bg-gray-50">
      <div className="max-w-md md:max-w-2xl w-full space-y-8 text-center">
        {/* Greeting */}
        <div className="space-y-4">
          <Heading as="h1" size="page" className="text-gray-900">
            Hello, {firstName}! 👋
          </Heading>
          <Body className="text-xl text-gray-600">
            To get to know you better, choose how you'd like to start:
          </Body>
        </div>

        {/* Two-option cards stacked vertically */}
        <div className="flex flex-col gap-4">
          {/* Option A: Take diagnosis */}
          <button
            onClick={() => setSelectedChoice('diagnosis')}
            className={`p-6 border-2 rounded-xl transition-all text-left ${
              selectedChoice === 'diagnosis'
                ? 'border-blue-600 bg-blue-50'
                : 'border-gray-300 bg-white hover:border-gray-400'
            }`}
          >
            <div className="flex items-start gap-4">
              <div className="text-3xl flex-shrink-0">🎯</div>
              <div className="flex-1">
                <Heading as="h3" size="card" className="mb-2 text-gray-900">
                  Find my level
                </Heading>
                <Caption className="text-sm text-gray-600 mb-2">
                  Recommended • 3 quick clips • ~2 minutes
                </Caption>
                <Body className="text-sm text-gray-700">
                  Start with perfect difficulty for you
                </Body>
              </div>
            </div>
          </button>

          {/* Option B: Skip diagnosis */}
          <button
            onClick={() => setSelectedChoice('skip')}
            className={`p-6 border-2 rounded-xl transition-all text-left ${
              selectedChoice === 'skip'
                ? 'border-blue-600 bg-blue-50'
                : 'border-gray-300 bg-white hover:border-gray-400'
            }`}
          >
            <div className="flex items-start gap-4">
              <div className="text-3xl flex-shrink-0">🚀</div>
              <div className="flex-1">
                <Heading as="h3" size="card" className="mb-2 text-gray-900">
                  Start now
                </Heading>
                <Caption className="text-sm text-gray-600 mb-2">
                  Skip the test
                </Caption>
                <Body className="text-sm text-gray-700">
                  We'll adapt as you practice
                </Body>
              </div>
            </div>
          </button>
        </div>

        {/* Continue button at bottom */}
        <div className="flex justify-end">
          <button
            onClick={handleContinue}
            disabled={!selectedChoice}
            className={`bg-blue-600 text-white text-center font-semibold h-12 flex items-center justify-center px-8 rounded-xl transition-all text-base ${
              selectedChoice
                ? 'hover:bg-blue-700 active:bg-blue-700 shadow-md hover:shadow-lg'
                : 'opacity-50 cursor-not-allowed'
            }`}
          >
            Continue
          </button>
        </div>

        <Caption tone="muted" className="text-sm">
          Both paths help us personalize your learning experience
        </Caption>
      </div>
    </main>
  )
}

