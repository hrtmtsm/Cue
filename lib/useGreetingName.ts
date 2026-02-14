'use client'

import { useState, useEffect } from 'react'
import { getSupabaseClient } from '@/lib/supabase/auth-helpers'
import { getOnboardingData } from '@/lib/onboardingStore'

const isDevelopment = process.env.NODE_ENV === 'development'

/**
 * Hook to get the user's greeting name
 * 
 * Priority:
 * 1. Supabase user_metadata (source of truth)
 * 2. localStorage userFirstName (cache)
 * 3. localStorage userName (legacy)
 * 4. onboardingData.name (last resort)
 * 
 * Returns { name: string | null, loading: boolean }
 */
export function useGreetingName() {
  console.log('✨ [useGreetingName] Hook initialized - NEW CODE LOADED')
  const [name, setName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Only run on client
    if (typeof window === 'undefined') {
      setLoading(false)
      return
    }

    const supabase = getSupabaseClient()

    async function loadNameWithRetry(retryCount = 0, maxRetries = 3) {
      console.log('🔍 [useGreetingName] loadName() called', { retryCount, maxRetries })
      
      // Step 1: Read from localStorage immediately (optimistic)
      const cachedName = localStorage.getItem('userFirstName') || 
                        localStorage.getItem('userName')
      
      if (cachedName) {
        console.log('🔍 [useGreetingName] Using cached name:', cachedName)
        setName(cachedName)
      }

      // Step 2: Try to refresh session first (especially important after login)
      try {
        // Add small delay on first attempt to allow cookies to be set
        if (retryCount === 0) {
          await new Promise(resolve => setTimeout(resolve, 100))
        }

        // Get current session (don't use refreshSession - it causes rate limit issues)
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()
        
        if (sessionError) {
          console.log('🔍 [useGreetingName] getSession error:', sessionError.message)
        }

        const user = session?.user || null
        
        if (!user) {
          // No user found - check if we should retry
          if (retryCount < maxRetries) {
            const delay = Math.min(200 * Math.pow(2, retryCount), 1000) // Exponential backoff, max 1s
            console.log(`⏳ [useGreetingName] No session yet, retrying in ${delay}ms (attempt ${retryCount + 1}/${maxRetries})`)
            setTimeout(() => {
              loadNameWithRetry(retryCount + 1, maxRetries)
            }, delay)
            return // Don't set loading to false yet
          } else {
            console.log('🔍 [useGreetingName] No user after retries:', retryCount)
            setLoading(false)
            return
          }
        }

        // User found - load metadata
        const userMetadata = user.user_metadata || {}
        console.log('🔍 [useGreetingName] User metadata keys:', Object.keys(userMetadata))
        
        const nameFromMetadata = 
          userMetadata.preferred_name ||
          userMetadata.first_name ||
          userMetadata.full_name?.split(' ')[0] ||
          userMetadata.name?.split(' ')[0] ||
          null
        
        if (nameFromMetadata) {
          console.log('🔄 [useGreetingName] UPDATING STATE with name:', nameFromMetadata)
          setName(nameFromMetadata)
          localStorage.setItem('userFirstName', nameFromMetadata)
          console.log('✅ [useGreetingName] Name from Supabase:', nameFromMetadata)
        } else {
          console.log('⚠️ [useGreetingName] User has no name in metadata')
        }
        
        setLoading(false)
      } catch (err: any) {
        // Handle AuthSessionMissingError gracefully
        if (err?.message?.includes('Auth session missing') || err?.name === 'AuthSessionMissingError') {
          console.log('🔍 [useGreetingName] No auth session (expected for guests)')
          // Fallback to localStorage is already handled above
          setLoading(false)
        } else {
          console.log('❌ [useGreetingName] Error:', err)
          // Retry on unexpected errors
          if (retryCount < maxRetries) {
            const delay = Math.min(200 * Math.pow(2, retryCount), 1000)
            console.log(`⏳ [useGreetingName] Error occurred, retrying in ${delay}ms (attempt ${retryCount + 1}/${maxRetries})`)
            setTimeout(() => {
              loadNameWithRetry(retryCount + 1, maxRetries)
            }, delay)
            return
          }
          setLoading(false)
        }
      }
    }

    // Initial load with retry logic
    loadNameWithRetry()

    // Subscribe to auth state changes to update name immediately after login
    // Only react to meaningful events, NOT token refreshes (prevents infinite loop)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (isDevelopment) {
        console.log('🔍 [useGreetingName] Auth state changed:', event, {
          hasSession: !!session,
          hasUser: !!session?.user
        })
      }
      
      // Only reload on specific events - ignore TOKEN_REFRESHED to prevent loop
      const shouldReload = event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'INITIAL_SESSION'
      
      if (shouldReload && session?.user) {
        // Reload name when auth state changes (e.g., after login)
        // Reset retry count for auth state changes
        loadNameWithRetry(0, 3)
      } else if (event === 'SIGNED_OUT') {
        // User signed out - clear name
        setName(null)
        setLoading(false)
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  return { name, loading }
}
