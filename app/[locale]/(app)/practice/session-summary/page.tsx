'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { useLocale } from 'next-intl'
import { Suspense, useEffect } from 'react'

function SessionSummaryPageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const locale = useLocale()
  const sessionId = searchParams.get('session') || ''

  // Mark today's session as complete (for free tier daily limit)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const today = new Date().toDateString()
    localStorage.setItem('lastSessionCompleted', today)
  }, [])

  return (
    <main className="flex min-h-screen flex-col px-6 py-6">
      <div className="flex-1 flex flex-col items-center justify-center space-y-6 text-center">
        <h1 className="text-3xl font-bold text-gray-900">
          Session complete!
        </h1>
        <p className="text-lg text-gray-600">
          Great work practicing your listening skills.
        </p>
        {/* Daily limit messaging */}
        <div className="w-full max-w-sm space-y-4">
          <div className="bg-blue-50 rounded-xl p-4 space-y-2">
            <p className="text-sm font-medium text-blue-900">
              ✅ You completed your free practice for today!
            </p>
            <p className="text-xs text-blue-700">
              Come back tomorrow for another session, or upgrade to Pro for unlimited practice.
            </p>
          </div>

          {/* Pro upsell */}
          <button
            onClick={() => router.push(`/${locale}/pro`)}
            className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold py-4 px-6 rounded-xl transition-all"
          >
            Unlock Unlimited Practice with Pro →
          </button>
        </div>
      </div>
    </main>
  )
}

export default function SessionSummaryPage() {
  return (
    <Suspense fallback={
      <main className="flex min-h-screen flex-col items-center justify-center px-6">
        <div className="text-gray-500">Loading...</div>
      </main>
    }>
      <SessionSummaryPageContent />
    </Suspense>
  )
}

