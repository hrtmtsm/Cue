'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getOnboardingData } from '@/lib/onboardingStore'

export default function ReadyPage() {
  const router = useRouter()

  const handleStart = () => {
    const data = getOnboardingData()
    
    // TODO: Use listeningDifficulties and preferredGenre to select/generate first clip
    // For now, route to practice select screen
    // In production, this would:
    // 1. Use listeningDifficulties as PRIMARY input for clip generation/selection
    // 2. Use preferredGenre only to bias content style
    // 3. Route to first practice clip screen
    
    router.push('/practice')
  }

  return (
    <main className="flex min-h-screen flex-col px-6 py-12">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/onboarding/genre"
          className="text-blue-600 font-medium text-lg py-2 px-1 -ml-1 inline-block"
        >
          Back
        </Link>
      </div>

      {/* Content */}
      <div className="flex flex-col justify-center flex-1 space-y-8">
        <div className="space-y-4 text-center">
          <h1 className="text-3xl font-bold text-gray-900 leading-tight">
            You're all set
          </h1>
          <p className="text-lg text-gray-600">
            We'll start with a short listening clip based on your choices.
          </p>
        </div>
      </div>

      {/* Sticky bottom button */}
      <div className="pt-8 pb-6">
        <button
          onClick={handleStart}
          className="w-full py-4 px-6 rounded-xl font-semibold text-lg bg-blue-600 text-white active:bg-blue-700 shadow-lg transition-colors"
        >
          Start listening
        </button>
      </div>
    </main>
  )
}
