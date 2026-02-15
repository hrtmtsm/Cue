'use client'

import { useEffect } from 'react'
import posthog from 'posthog-js'
import { createClient } from '@/lib/supabase/client'

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Only initialize on client
    if (typeof window === 'undefined') return

    const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY
    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST

    // Don't initialize if no API key (allows development without PostHog)
    if (!apiKey || apiKey.includes('your-posthog-api-key')) {
      console.log('[PostHog] API key not configured, skipping initialization')
      return
    }

    // Initialize PostHog
    posthog.init(apiKey, {
      api_host: host || 'https://us.i.posthog.com',
      loaded: (posthog) => {
        if (process.env.NODE_ENV === 'development') {
          console.log('[PostHog] Initialized successfully')
        }
      },
      capture_pageview: true, // Auto-capture pageviews
      capture_pageleave: true, // Track when users leave
    })

    // Auto-identify authenticated users
    const identifyUser = async () => {
      try {
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()
        
        if (session?.user) {
          posthog.identify(session.user.id, {
            email: session.user.email,
          })
          
          if (process.env.NODE_ENV === 'development') {
            console.log('[PostHog] User identified:', session.user.id)
          }
        }
      } catch (error) {
        console.error('[PostHog] Error identifying user:', error)
      }
    }

    identifyUser()
  }, [])

  return <>{children}</>
}
