'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { useLocale } from 'next-intl'
import { Suspense, useEffect, useState } from 'react'
import { useSubscription } from '@/lib/useSubscription'

function SessionSummaryPageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const locale = useLocale()
  const sessionId = searchParams.get('session') || ''
  const storyId = searchParams.get('storyId') || ''
  const { isPro } = useSubscription()
  const [sessionRecorded, setSessionRecorded] = useState(false)

  // Record session completion in database (for free tier daily limit)
  // Pro users have unlimited sessions, so don't record for them
  useEffect(() => {
    if (typeof window === 'undefined' || sessionRecorded) return
    
    // Only record for free users (Pro users have unlimited sessions)
    if (!isPro) {
      const recordSession = async () => {
        try {
          // Record in database (server-side validation)
          const response = await fetch('/api/session/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              storyId: storyId || null,
            }),
          })

          if (response.ok) {
            console.log('[Session Summary] Session recorded in database')
            setSessionRecorded(true)
            
            // Also update localStorage for backward compatibility (client-side checks)
            const today = new Date().toDateString()
            localStorage.setItem('lastSessionCompleted', today)
          } else {
            console.error('[Session Summary] Failed to record session:', response.statusText)
            // Fallback: still set localStorage for graceful degradation
            const today = new Date().toDateString()
            localStorage.setItem('lastSessionCompleted', today)
          }
        } catch (error) {
          console.error('[Session Summary] Error recording session:', error)
          // Fallback: still set localStorage for graceful degradation
          const today = new Date().toDateString()
          localStorage.setItem('lastSessionCompleted', today)
        }
      }

      recordSession()
    }
  }, [isPro, sessionRecorded, storyId])

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

