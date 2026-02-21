'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { loadStripe } from '@stripe/stripe-js'
import { useSubscription } from '@/lib/useSubscription'

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
)

function ProPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const returnTo = searchParams.get('returnTo') || ''
  const { isPro, loading: subscriptionLoading } = useSubscription()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleUpgrade() {
    try {
      setLoading(true)
      setError(null)

      const priceId = process.env.NEXT_PUBLIC_STRIPE_PRICE_ID
      if (!priceId) {
        throw new Error('Stripe price ID not configured')
      }

      // Create checkout session
      const res = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ priceId, returnTo }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create checkout session')
      }

      const data = await res.json()

      // If server returns a direct URL (reactivation or already active), redirect there
      if (data.url) {
        window.location.href = data.url
        return
      }

      // Otherwise, redirect to Stripe Checkout using sessionId
      const { sessionId } = data
      if (!sessionId) {
        throw new Error('No session ID returned from server')
      }

      const stripe = await stripePromise
      if (!stripe) {
        throw new Error('Failed to load Stripe')
      }

      const { error: stripeError } = await stripe.redirectToCheckout({
        sessionId,
      })

      if (stripeError) {
        throw new Error(stripeError.message)
      }
    } catch (err: any) {
      console.error('[Pro Page] Error:', err)
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  if (subscriptionLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="text-gray-500">Loading...</div>
      </div>
    )
  }

  if (isPro) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6">
        <div className="max-w-md text-center space-y-6">
          <div className="text-5xl">✨</div>
          <h1 className="text-3xl font-bold text-gray-900">
            You're already a Pro member!
          </h1>
          <p className="text-gray-600">
            Enjoy unlimited sessions and full access to listening tips.
          </p>
          <button
            onClick={() => router.push('/practice/select')}
            className="w-full py-3 px-6 rounded-xl text-body-large font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors"
          >
            Start Practicing →
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white py-12 px-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Upgrade to Pro
          </h1>
          <p className="text-xl text-gray-600">
            Unlimited practice. Full learning access.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-2 gap-8 mb-12">
          {/* Free Plan */}
          <div className="bg-white border-2 border-gray-200 rounded-2xl p-8 shadow-sm">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Free</h2>
              <div className="flex items-baseline">
                <span className="text-4xl font-bold text-gray-900">¥0</span>
              </div>
            </div>

            <ul className="space-y-4 mb-8">
              <li className="flex items-start">
                <span className="text-green-600 mr-3 mt-1">✓</span>
                <span className="text-gray-600">1 session per day</span>
              </li>
              <li className="flex items-start">
                <span className="text-red-500 mr-3 mt-1">✗</span>
                <span className="text-gray-400">Listening tips locked</span>
              </li>
              <li className="flex items-start">
                <span className="text-red-500 mr-3 mt-1">✗</span>
                <span className="text-gray-400">Limited daily practice</span>
              </li>
            </ul>

            <div className="text-center text-sm text-gray-500">
              Current Plan
            </div>
          </div>

          {/* Pro Plan */}
          <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-8 shadow-lg relative">
            <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 bg-amber-400 text-amber-900 px-4 py-1 rounded-full text-sm font-bold shadow-md">
              RECOMMENDED
            </div>

            <div className="mb-6">
              <h2 className="text-2xl font-bold text-white mb-2">Pro</h2>
              <div className="flex items-baseline">
                <span className="text-4xl font-bold text-white">¥980</span>
                <span className="text-blue-100 ml-2">/month</span>
              </div>
            </div>

            <ul className="space-y-4 mb-8">
              <li className="flex items-start">
                <span className="text-green-300 mr-3 mt-1">✓</span>
                <span className="text-white font-medium">
                  Unlimited daily sessions
                </span>
              </li>
              <li className="flex items-start">
                <span className="text-green-300 mr-3 mt-1">✓</span>
                <span className="text-white font-medium">
                  Full listening tips access
                </span>
              </li>
              <li className="flex items-start">
                <span className="text-green-300 mr-3 mt-1">✓</span>
                <span className="text-white font-medium">
                  Practice anytime, anywhere
                </span>
              </li>
            </ul>

            <button
              onClick={handleUpgrade}
              disabled={loading}
              className="w-full bg-white text-blue-600 py-4 rounded-xl font-bold text-lg hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
            >
              {loading ? 'Processing...' : 'Upgrade Now'}
            </button>

            {error && (
              <div className="mt-4 p-3 bg-red-100 border border-red-300 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}
          </div>
        </div>

        {/* Features Comparison */}
        <div className="bg-white rounded-2xl p-8 shadow-sm">
          <h3 className="text-2xl font-bold text-gray-900 mb-6 text-center">
            What you get with Pro
          </h3>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="text-4xl mb-4">🚀</div>
              <h4 className="font-bold text-gray-900 mb-2">Unlimited Practice</h4>
              <p className="text-gray-600 text-sm">
                Practice as many sessions as you want, every single day
              </p>
            </div>

            <div className="text-center">
              <div className="text-4xl mb-4">💡</div>
              <h4 className="font-bold text-gray-900 mb-2">Listening Tips</h4>
              <p className="text-gray-600 text-sm">
                Unlock expert explanations for every pattern you miss
              </p>
            </div>

            <div className="text-center">
              <div className="text-4xl mb-4">⚡</div>
              <h4 className="font-bold text-gray-900 mb-2">Faster Progress</h4>
              <p className="text-gray-600 text-sm">
                More practice means faster improvement in your listening skills
              </p>
            </div>
          </div>
        </div>

        {/* FAQ */}
        <div className="mt-12 text-center">
          <p className="text-gray-600 text-sm">
            Cancel anytime. No questions asked.
          </p>
        </div>
      </div>
    </div>
  )
}

export default function ProPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    }>
      <ProPageContent />
    </Suspense>
  )
}
