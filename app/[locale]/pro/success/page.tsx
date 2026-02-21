'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'

function SuccessPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session_id')
  const returnTo = searchParams.get('returnTo')
  const [countdown, setCountdown] = useState(5)

  // Immediately sync subscription from Stripe on mount
  // This ensures the DB is updated even without webhooks
  useEffect(() => {
    fetch('/api/subscription/sync', {
      method: 'POST',
      credentials: 'include',
    })
      .then(res => res.json())
      .then(data => console.log('[Success] Subscription synced:', data.isPro ? 'Pro ✅' : 'Free'))
      .catch(err => console.warn('[Success] Sync failed:', err))
  }, [])

  useEffect(() => {
    // Countdown timer
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000)
      return () => clearTimeout(timer)
    } else {
      // Redirect after countdown
      if (returnTo) {
        // Return to original page with upgraded flag
        const separator = returnTo.includes('?') ? '&' : '?'
        router.push(`${returnTo}${separator}upgraded=true`)
      } else {
        // Default: redirect to practice select with upgraded flag
        router.push('/en/practice/select?upgraded=true')
      }
    }
  }, [countdown, router, returnTo])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-gradient-to-b from-green-50 to-white">
      <div className="max-w-md text-center space-y-6">
        {/* Success Icon */}
        <div className="text-7xl animate-bounce">🎉</div>

        {/* Heading */}
        <h1 className="text-4xl font-bold text-gray-900">
          Welcome to Pro!
        </h1>

        {/* Description */}
        <div className="space-y-3 text-gray-600">
          <p className="text-lg">
            Your subscription is now active.
          </p>
          <p>
            You now have unlimited access to:
          </p>
          <ul className="text-left inline-block space-y-2">
            <li className="flex items-center">
              <span className="text-green-600 mr-2">✓</span>
              Unlimited daily sessions
            </li>
            <li className="flex items-center">
              <span className="text-green-600 mr-2">✓</span>
              Full listening tips access
            </li>
          </ul>
        </div>

        {/* Action Button */}
        <div className="pt-6 space-y-4">
          <button
            onClick={() => {
              if (returnTo) {
                const separator = returnTo.includes('?') ? '&' : '?'
                router.push(`${returnTo}${separator}upgraded=true`)
              } else {
                router.push('/practice/select?upgraded=true')
              }
            }}
            className="w-full py-4 px-6 rounded-xl text-lg font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-lg"
          >
            {returnTo ? 'Continue →' : 'Start Practicing Now →'}
          </button>

          <p className="text-sm text-gray-500">
            Redirecting in {countdown} seconds...
          </p>
        </div>

        {/* Session ID for reference */}
        {sessionId && (
          <p className="text-xs text-gray-400 pt-6">
            Order ID: {sessionId.substring(0, 24)}...
          </p>
        )}
      </div>
    </div>
  )
}

export default function SuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-gray-500">Loading...</div>
        </div>
      }
    >
      <SuccessPageContent />
    </Suspense>
  )
}
