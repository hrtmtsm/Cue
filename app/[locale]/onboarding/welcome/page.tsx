'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale } from 'next-intl'

export default function WelcomePage() {
  const router = useRouter()
  const locale = useLocale()
  const [firstName, setFirstName] = useState('')

  useEffect(() => {
    // Get user's name from localStorage
    const name = localStorage.getItem('userFirstName')
    if (!name) {
      // If no name, redirect back to profile
      router.push(`/${locale}/auth/profile`)
      return
    }
    setFirstName(name)
  }, [router])

  const handleContinue = () => {
    router.push(`/${locale}/onboarding/diagnosis`)
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <div className="max-w-2xl w-full mx-auto space-y-8 text-center">
        {/* Greeting */}
        <div className="space-y-4">
          <h1 className="text-4xl font-bold text-gray-900">
            Hello, {firstName}! 👋
          </h1>
          <p className="text-xl text-gray-600">
            To get to know you better, let's start with some quick questions.
          </p>
        </div>

        {/* CTA */}
        <button
          onClick={handleContinue}
          className="w-full md:w-auto md:min-w-[320px] py-4 px-8 bg-blue-600 text-white rounded-xl font-semibold text-lg active:bg-blue-700 transition-colors shadow-lg"
        >
          Let's go →
        </button>

        <p className="text-sm text-gray-500">
          This helps us personalize your learning experience
        </p>
      </div>
    </main>
  )
}

