'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { getSupabaseClient } from '@/lib/supabase/auth-helpers'
import { Heading, Body, Label, Caption } from '@/components/ui/Typography'
import { useSubscription } from '@/lib/useSubscription'

const isDevelopment = process.env.NODE_ENV === 'development'

export default function ProfilePage() {
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations()
  const [firstName, setFirstName] = useState<string>('')
  const [email, setEmail] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [isSessionReady, setIsSessionReady] = useState(false)
  const { isPro, subscription, loading: subscriptionLoading } = useSubscription()
  const [isManagingSubscription, setIsManagingSubscription] = useState(false)

  const handleManageSubscription = async () => {
    if (isManagingSubscription) return

    try {
      setIsManagingSubscription(true)

      const response = await fetch('/api/stripe/create-portal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          returnUrl: `${window.location.origin}/${locale}/profile`,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to create billing portal session')
      }

      const { url } = await response.json()
      window.location.href = url
    } catch (error) {
      console.error('Error opening billing portal:', error)
      alert('Failed to open billing portal. Please try again.')
      setIsManagingSubscription(false)
    }
  }

  useEffect(() => {
    async function loadUserData() {
      if (typeof window === 'undefined') return

      const supabase = getSupabaseClient()

      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()
        
        // Set session ready state
        setIsSessionReady(!!session)
        
        if (sessionError) {
          console.error('Error getting session:', sessionError)
          setIsLoading(false)
          return
        }

        if (session?.user) {
          // Load email from user
          setEmail(session.user.email || '')
          
          // Load name from user_metadata (source of truth)
          const userMetadata = session.user.user_metadata || {}
          const nameFromMetadata = 
            userMetadata.preferred_name ||
            userMetadata.first_name ||
            userMetadata.full_name?.split(' ')[0] ||
            userMetadata.name?.split(' ')[0] ||
            null
          
          if (nameFromMetadata) {
            setFirstName(nameFromMetadata)
            // Sync to localStorage for cache
            localStorage.setItem('userFirstName', nameFromMetadata)
          } else {
            // Fallback to localStorage
            const cachedName = localStorage.getItem('userFirstName')
            if (cachedName) {
              setFirstName(cachedName)
            }
          }

          // Dev-only logging
          if (isDevelopment) {
            console.log('🔍 [Profile] Loaded user data:', {
              email: session.user.email,
              userMetadataKeys: Object.keys(userMetadata),
              nameFromMetadata,
              resolvedName: nameFromMetadata || localStorage.getItem('userFirstName'),
              source: nameFromMetadata ? 'Supabase user_metadata' : 'localStorage cache'
            })
          }
        } else {
          // No session - fallback to localStorage
          const cachedName = localStorage.getItem('userFirstName')
          if (cachedName) {
            setFirstName(cachedName)
          }
        }
      } catch (err) {
        console.error('Error loading user data:', err)
        // Fallback to localStorage
        const cachedName = localStorage.getItem('userFirstName')
        if (cachedName) {
          setFirstName(cachedName)
        }
      } finally {
        setIsLoading(false)
      }
    }

    loadUserData()

    // Listen for auth state changes to update session ready state
    const supabase = getSupabaseClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsSessionReady(!!session)
      if (isDevelopment) {
        console.log('🔍 [Profile] Auth state changed, session ready:', !!session)
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const handleSaveName = async () => {
    setError('')

    // Check if session is ready
    if (!isSessionReady) {
      setError('Please wait for the page to fully load before saving.')
      return
    }

    if (!firstName.trim()) {
      setError('Name is required')
      return
    }

    setIsSaving(true)

    try {
      const supabase = getSupabaseClient()
      const trimmedName = firstName.trim()
      
      // Try to refresh session before saving
      const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession()
      
      // If refresh fails, try getting current session
      let session = refreshedSession
      if (refreshError || !session) {
        const { data: { session: currentSession }, error: sessionError } = await supabase.auth.getSession()
        session = currentSession
        
        if (sessionError || !session) {
          console.warn('Cannot update name: no active session', sessionError?.message || refreshError?.message)
          setError('Your session has expired. Please refresh the page and try again.')
          setIsSaving(false)
          return
        }
      }
      
      // Save to Supabase user_metadata (source of truth)
      const { error: updateError } = await supabase.auth.updateUser({
        data: {
          preferred_name: trimmedName,
          first_name: trimmedName,
        }
      })

      if (updateError) {
        console.error('Error updating user metadata:', updateError)
        setError('Failed to save name. Please try again.')
        setIsSaving(false)
        return
      }

      // Sync to localStorage for cache consistency
      localStorage.setItem('userFirstName', trimmedName)

      // Dev-only logging
      if (isDevelopment) {
        console.log('✅ [Profile] Saved name to Supabase:', {
          name: trimmedName,
          keysUpdated: ['preferred_name', 'first_name']
        })
      }

      setIsEditing(false)
    } catch (err) {
      console.error('Error saving name:', err)
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleSignOut = async () => {
    // Sign out from Supabase
    try {
      const supabase = getSupabaseClient()
      await supabase.auth.signOut()
    } catch (error) {
      console.error('Error signing out:', error)
    }

    // Clear all user data from localStorage
    if (typeof window !== 'undefined') {
      localStorage.removeItem('userFirstName')
      localStorage.removeItem('onboardingData')
      localStorage.removeItem('userStories')
      localStorage.removeItem('userClips')
    }
    
    // Redirect to landing page
    router.push(`/${locale}`)
    router.refresh()
  }

  return (
    <main className="flex flex-col px-6 py-6">
      <div className="space-y-8">
        <div className="space-y-2">
          <Heading as="h1" size="page">{t('profile.title')}</Heading>
        </div>

        {/* Account Section */}
        <div className="space-y-4">
          <Heading as="h2" size="section">{t('profile.account')}</Heading>
          <div className="space-y-3">
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
              <Label size="label" tone="sub" className="mb-1">{t('profile.name')}</Label>
              {isEditing ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => {
                      setFirstName(e.target.value)
                      setError('')
                    }}
                    className="w-full px-3 py-2 border-2 border-gray-300 rounded-xl focus:outline-none focus:border-blue-600 text-base"
                    placeholder="Enter your name"
                    disabled={isSaving}
                    autoFocus
                  />
                  {error && (
                    <Caption className="text-red-600">{error}</Caption>
                  )}
                  {!isSessionReady && (
                    <Caption className="text-gray-500 mb-2">
                      Loading session...
                    </Caption>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveName}
                      disabled={!isSessionReady || isSaving || !firstName.trim()}
                      className="px-4 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 active:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isSaving ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      onClick={() => {
                        setIsEditing(false)
                        setError('')
                        // Reload original name
                        const supabase = getSupabaseClient()
                        supabase.auth.getSession().then(({ data: { session } }) => {
                          if (session?.user) {
                            const userMetadata = session.user.user_metadata || {}
                            const nameFromMetadata = 
                              userMetadata.preferred_name ||
                              userMetadata.first_name ||
                              userMetadata.full_name?.split(' ')[0] ||
                              userMetadata.name?.split(' ')[0] ||
                              localStorage.getItem('userFirstName') ||
                              ''
                            setFirstName(nameFromMetadata)
                          }
                        })
                      }}
                      disabled={isSaving}
                      className="px-4 py-2.5 bg-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-300 active:bg-gray-300 disabled:opacity-50 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <Body size="bodyStrong">{firstName || 'Not set'}</Body>
                  <button
                    onClick={() => setIsEditing(true)}
                    className="text-blue-600 font-medium text-sm hover:text-blue-700 transition-colors"
                  >
                    Edit
                  </button>
                </div>
              )}
            </div>
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
              <Label size="label" tone="sub" className="mb-1">{t('profile.email')}</Label>
              <Body size="bodyStrong">{email || 'Not set'}</Body>
            </div>
          </div>
        </div>

        {/* Preferences Section */}
        <div className="space-y-4">
          <Heading as="h2" size="section">{t('profile.preferences')}</Heading>
          <div className="space-y-3">
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
              <Body size="bodyStrong" className="mb-3">{t('profile.language')}</Body>
              <LanguageSwitcher />
            </div>
          </div>
        </div>

        {/* Subscription Section */}
        <div className="space-y-4">
          <Heading as="h2" size="section">{t('profile.subscription.title')}</Heading>
          <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
            {subscriptionLoading ? (
              <Body size="bodyStrong" className="text-gray-600">{t('profile.subscription.loading')}</Body>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <Body size="bodyStrong" className="mb-1">
                    {isPro ? t('profile.subscription.proPlan') : t('profile.subscription.freePlan')}
                  </Body>
                  {isPro && subscription && (
                    <Caption tone="muted">
                      {subscription.cancelAtPeriodEnd 
                        ? t('profile.subscription.proUntil', { date: new Date(subscription.currentPeriodEnd).toLocaleDateString() })
                        : `Renews on ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}`
                      }
                    </Caption>
                  )}
                  {!isPro && (
                    <Caption tone="muted">Upgrade to unlock unlimited sessions</Caption>
                  )}
                </div>
                {isPro ? (
                  <button
                    onClick={handleManageSubscription}
                    disabled={isManagingSubscription}
                    className="text-blue-600 font-medium text-sm hover:text-blue-700 transition-colors disabled:opacity-50"
                  >
                    {isManagingSubscription ? t('profile.subscription.loading') : t('profile.subscription.manage')}
                  </button>
                ) : (
                  <button
                    onClick={() => router.push(`/${locale}/pro`)}
                    className="text-blue-600 font-medium text-sm hover:text-blue-700 transition-colors"
                  >
                    {t('profile.subscription.upgrade')}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Sign out */}
        <div className="pt-4">
          <button 
            onClick={handleSignOut}
            className="w-full md:w-auto md:min-w-[200px] py-2.5 px-6 rounded-xl font-medium text-base border-2 border-red-200 text-red-600 hover:bg-red-50 active:bg-red-100 transition-colors"
          >
            {t('profile.signOut')}
          </button>
        </div>
      </div>
    </main>
  )
}

