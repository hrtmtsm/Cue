'use client'

import posthog from 'posthog-js'

export function usePostHog() {
  return posthog
}

export function trackEvent(eventName: string, properties?: Record<string, any>) {
  try {
    if (typeof window === 'undefined') return

    // Check if PostHog is initialized
    const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY
    if (!apiKey || apiKey.includes('your-posthog-api-key')) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`[PostHog] Would track: ${eventName}`, properties)
      }
      return
    }

    posthog.capture(eventName, properties)

    if (process.env.NODE_ENV === 'development') {
      console.log(`[PostHog] Tracked: ${eventName}`, properties)
    }
  } catch (error) {
    console.error('[PostHog] Error tracking event:', error)
  }
}
