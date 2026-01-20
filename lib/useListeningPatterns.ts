'use client'

import { useState, useEffect } from 'react'
import { LISTENING_PATTERNS, type ListeningPattern } from './listeningPatterns'

interface UseListeningPatternsResult {
  patterns: ListeningPattern[]
  loading: boolean
  error: Error | null
}

/**
 * Hook to fetch listening patterns from API
 * Falls back to local patterns if fetch fails
 * Returns patterns immediately (local fallback) while loading from API
 */
export function useListeningPatterns(): UseListeningPatternsResult {
  const [patterns, setPatterns] = useState<ListeningPattern[]>(LISTENING_PATTERNS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let mounted = true

    async function fetchPatterns() {
      try {
        const response = await fetch('/api/listening-patterns', {
          // Use default fetch cache settings - API route handles cache headers
          cache: 'default',
        })

        if (!response.ok) {
          throw new Error(`Failed to fetch patterns: ${response.status}`)
        }

        const data = await response.json()

        if (!mounted) return

        // Validate that data is an array
        if (Array.isArray(data) && data.length > 0) {
          setPatterns(data)
          setError(null)
        } else {
          // Empty array from API - keep local fallback
          console.warn('⚠️ [useListeningPatterns] Empty array from API, using local fallback')
          setPatterns(LISTENING_PATTERNS)
          setError(null)
        }
      } catch (err) {
        if (!mounted) return

        console.error('❌ [useListeningPatterns] Error fetching patterns:', err)
        setError(err instanceof Error ? err : new Error('Unknown error'))
        // Keep local fallback patterns on error
        setPatterns(LISTENING_PATTERNS)
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    fetchPatterns()

    return () => {
      mounted = false
    }
  }, [])

  return { patterns, loading, error }
}


