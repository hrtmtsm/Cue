'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

export interface SubscriptionInfo {
  isPro: boolean
  subscription: {
    status: string
    currentPeriodEnd: string
    cancelAtPeriodEnd: boolean
  } | null
}

/**
 * Hook to check user's subscription status
 * Fetches from /api/subscription/status
 * 
 * Features:
 * - Initial fetch on mount
 * - Manual refetch via returned function
 * - Auto-polling for 30 seconds after mount (catches delayed webhooks)
 */
export function useSubscription() {
  const [isPro, setIsPro] = useState(false)
  const [subscription, setSubscription] = useState<SubscriptionInfo['subscription']>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refetching, setRefetching] = useState(false)
  const mountedRef = useRef(true)
  const pollTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const fetchStatus = useCallback(async (isRefetch = false, syncFromStripe = false) => {
    try {
      if (isRefetch) {
        setRefetching(true)
      }

      // syncFromStripe=true: fetch live from Stripe and update DB (used for manual refresh)
      // Otherwise: read from DB cache (fast, used for initial load and auto-polling)
      const url = syncFromStripe ? '/api/subscription/sync' : '/api/subscription/status'
      const method = syncFromStripe ? 'POST' : 'GET'

      const res = await fetch(url, {
        method,
        credentials: 'include',
        cache: 'no-store',
      })

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }

      const data: SubscriptionInfo = await res.json()

      if (mountedRef.current) {
        setIsPro(data.isPro)
        setSubscription(data.subscription)
        setError(null)
        
        console.log('[useSubscription] Status fetched:', {
          isPro: data.isPro,
          isRefetch,
        })
      }
    } catch (err) {
      console.error('[useSubscription] Failed to fetch subscription status:', err)
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to load')
        // Don't clear isPro on refetch errors - keep existing state
        if (!isRefetch) {
          setIsPro(false)
          setSubscription(null)
        }
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false)
        if (isRefetch) {
          setRefetching(false)
        }
      }
    }
  }, [])

  // Manual refetch function — syncs directly from Stripe for accurate data
  const refetch = useCallback(async () => {
    console.log('[useSubscription] Manual refetch requested (syncing from Stripe)')
    await fetchStatus(true, true)
  }, [fetchStatus])

  useEffect(() => {
    mountedRef.current = true

    // Initial fetch
    fetchStatus(false)

    // Auto-polling: Check every 3 seconds for 60 seconds after mount
    // This catches delayed Stripe webhooks after checkout
    let pollCount = 0
    const maxPolls = 20 // 20 polls × 3 seconds = 60 seconds
    
    const startPolling = () => {
      pollTimeoutRef.current = setTimeout(() => {
        pollCount++
        
        if (pollCount < maxPolls && mountedRef.current) {
          console.log(`[useSubscription] Auto-poll ${pollCount}/${maxPolls}`)
          fetchStatus(true)
          startPolling() // Schedule next poll
        } else {
          console.log('[useSubscription] Auto-polling completed')
        }
      }, 3000)
    }

    // Start polling after 3 seconds (give initial fetch time to complete)
    const initialDelay = setTimeout(startPolling, 3000)

    // Refetch on window focus (catches subscription updates when user returns to tab)
    const handleFocus = () => {
      if (mountedRef.current) {
        console.log('[useSubscription] Window focused, refetching...')
        fetchStatus(true)
      }
    }
    window.addEventListener('focus', handleFocus)

    return () => {
      mountedRef.current = false
      clearTimeout(initialDelay)
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current)
      }
      window.removeEventListener('focus', handleFocus)
    }
  }, [fetchStatus])

  return {
    isPro,
    subscription,
    loading,
    error,
    refetching,
    refetch, // Export refetch function
  }
}
