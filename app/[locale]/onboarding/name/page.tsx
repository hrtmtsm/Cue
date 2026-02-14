'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { getSupabaseClient } from '@/lib/supabase/auth-helpers'
import { Heading, Label, Caption } from '@/components/ui/Typography'

export default function NamePage() {
  const router = useRouter()
  const locale = useLocale()
  const searchParams = useSearchParams()
  const t = useTranslations('onboarding.name')
  const isGoogleAuth = searchParams.get('googleAuth') === 'true'
  
  const [name, setName] = useState('')
  const [isLoading, setIsLoading] = useState(isGoogleAuth) // Loading if from Google
  const [error, setError] = useState('')
  const [hasUserInteracted, setHasUserInteracted] = useState(false)
  
  // Ref to prevent autoFocus from triggering interaction state
  const isInitialMount = useRef(true)

  // Pre-fill name from Google if OAuth
  useEffect(() => {
    if (isGoogleAuth) {
      const loadGoogleName = async () => {
        try {
          const supabase = getSupabaseClient()
          const { data: { user }, error: userError } = await supabase.auth.getUser()
          
          if (userError) {
            console.error('Failed to get user:', userError)
            setIsLoading(false)
            return
          }
          
          if (user) {
            // Try to get name from Google metadata
            const userMetadata = user.user_metadata || {}
            const googleName = 
              userMetadata.full_name || 
              userMetadata.name || 
              userMetadata.first_name ||
              user.email?.split('@')[0] || 
              ''
            
            if (googleName) {
              // Extract first name if it's a full name
              const firstName = googleName.split(' ')[0]
              console.log('📝 [Onboarding Name] Pre-filling Google name:', firstName)
              setName(firstName)
            }
          }
        } catch (error) {
          console.error('Failed to load Google name:', error)
        } finally {
          setIsLoading(false)
        }
      }
      
      loadGoogleName()
    } else {
      // Check localStorage for existing name
      const existingName = localStorage.getItem('userFirstName')
      if (existingName) {
        setName(existingName)
      }
      setIsLoading(false)
    }
  }, [isGoogleAuth])

  // Disable initial mount flag after component has fully mounted
  // This prevents autoFocus from triggering hasUserInteracted
  useEffect(() => {
    if (isInitialMount.current) {
      const timer = setTimeout(() => {
        isInitialMount.current = false
        console.log('🔓 [Onboarding Name] Initial mount complete - user interaction now allowed')
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [])

  async function handleContinue(e?: React.FormEvent) {
    // Prevent any default form submission
    if (e) {
      e.preventDefault()
    }
    
    // CRITICAL: Only allow navigation if user has explicitly interacted
    // This prevents auto-navigation when name is pre-filled from Google
    if (isGoogleAuth && !hasUserInteracted) {
      console.log('🚫 [Onboarding Name] Blocking auto-navigation - user has not interacted')
      return
    }
    
    if (!name.trim()) {
      setError('Name is required')
      return
    }
    
    const trimmedName = name.trim()
    
    // Save name to Supabase user_metadata (source of truth)
    try {
      const supabase = getSupabaseClient()
      
      // Check if session exists first
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      
      if (sessionError || !session) {
        console.warn('Cannot update name: no active session', sessionError?.message)
        // Continue anyway - save to localStorage as fallback
      } else {
        const { error: updateError } = await supabase.auth.updateUser({
          data: {
            preferred_name: trimmedName,
            first_name: trimmedName,
            full_name: trimmedName, // Store full name as well for consistency
          }
        })
        
        if (updateError) {
          console.error('Failed to save name to Supabase:', updateError)
          // Continue anyway - save to localStorage as fallback
        } else {
          console.log('✅ [Onboarding Name] Name saved to Supabase:', trimmedName)
        }
      }
    } catch (err) {
      console.error('Error saving name to Supabase:', err)
      // Continue anyway - save to localStorage as fallback
    }
    
    // Sync to localStorage for immediate UI reflection (cache)
    localStorage.setItem('userFirstName', trimmedName)
    
    // Also save to onboarding data
    const existingData = localStorage.getItem('onboardingData')
    const data = existingData ? JSON.parse(existingData) : {}
    data.name = trimmedName
    localStorage.setItem('onboardingData', JSON.stringify(data))
    
    // Navigate to welcome page
    router.push(`/${locale}/onboarding/welcome`)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin text-4xl mb-4">⏳</div>
          <p className="text-gray-600">{t('loading')}</p>
        </div>
      </div>
    )
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-12 bg-gray-50">
      <div className="max-w-md md:max-w-lg w-full space-y-6">
        <div className="text-center space-y-2">
          <Heading as="h1" size="page" className="text-gray-900">
            {t('title')}
          </Heading>
          <Caption tone="muted" className="text-base">
            {t('subtitle')}
          </Caption>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">
            {error}
          </div>
        )}

        <form 
          onSubmit={(e) => {
            e.preventDefault()
            // Only submit on explicit button click, not on Enter key
            // This prevents auto-submission when name is pre-filled
          }}
          className="space-y-4"
        >
          <div>
            <Label size="label" tone="sub" className="block mb-2">
              {t('label')}
            </Label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setError('')
                setHasUserInteracted(true) // Mark as interacted when user types
              }}
              onFocus={() => {
                // Only set hasUserInteracted if initial mount is complete
                // This prevents autoFocus from enabling the button immediately
                if (!isInitialMount.current) {
                  setHasUserInteracted(true)
                  console.log('✅ [Onboarding Name] User focused input - interaction registered')
                } else {
                  console.log('🚫 [Onboarding Name] autoFocus triggered - ignoring interaction')
                }
              }}
              onKeyDown={(e) => {
                // Prevent Enter key from auto-submitting
                // User must explicitly click the Continue button
                if (e.key === 'Enter') {
                  e.preventDefault()
                  // Do NOT call handleContinue - user must click button
                }
              }}
              placeholder={t('placeholder')}
              className={`w-full px-4 py-3 border-2 rounded-xl focus:outline-none focus:border-blue-600 text-base ${
                error ? 'border-red-300' : 'border-gray-200'
              }`}
              autoFocus
            />
            {error && (
              <Caption className="mt-1 text-red-600">{error}</Caption>
            )}
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              // Clicking the button IS user interaction - set it immediately
              setHasUserInteracted(true)
              handleContinue()
            }}
            disabled={!name.trim()}
            className="w-full bg-blue-600 text-white text-center font-semibold h-12 flex items-center justify-center px-6 rounded-xl hover:bg-blue-700 active:bg-blue-700 shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed text-base"
          >
            {t('continue')}
          </button>
        </form>
      </div>
    </main>
  )
}


