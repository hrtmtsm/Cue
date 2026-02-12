'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

export default function ProfilePage() {
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations()
  const [firstName, setFirstName] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  // Check if user already has a name from OAuth or localStorage
  useEffect(() => {
    const checkExistingName = async () => {
      try {
        const { getSupabaseClient } = await import('@/lib/supabase/auth-helpers')
        const supabase = getSupabaseClient()
        const { data: { session } } = await supabase.auth.getSession()
        
        // Check Supabase user metadata first (from OAuth)
        const userMetadata = session?.user?.user_metadata || {}
        const oauthName = userMetadata.full_name || userMetadata.name || userMetadata.first_name
        
        // Then check localStorage
        const localName = localStorage.getItem('userFirstName')
        
        // Get the name to use
        const nameToUse = oauthName ? oauthName.split(' ')[0] : localName
        
        if (nameToUse) {
          setFirstName(nameToUse)
          console.log('👤 [Profile] Pre-filled name from OAuth/localStorage:', nameToUse)
          // Do NOT auto-submit - user must explicitly click Continue
        }
      } catch (err) {
        // Ignore errors - user can still enter name manually
        console.log('Could not load existing name:', err)
      }
    }
    
    checkExistingName()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!firstName.trim()) {
      setError('First name is required')
      return
    }
    
    setIsLoading(true)
    setError('')
    
    // TODO: Store firstName in user profile (Supabase)
    // For now, just store in localStorage for demo
    if (typeof window !== 'undefined') {
      localStorage.setItem('userFirstName', firstName.trim())
    }
    
    setTimeout(() => {
      setIsLoading(false)
      router.push(`/${locale}/onboarding/welcome`)
    }, 500)
  }

  return (
    <main className="flex min-h-screen flex-col px-6 py-12">
      <div className="max-w-2xl w-full mx-auto">
        <div className="mb-8">
          <Link
            href="/auth"
            className="text-blue-600 font-medium text-lg py-2 px-1 -ml-1 inline-flex items-center gap-1"
          >
            <ChevronLeft className="w-5 h-5" />
            {t('common.back')}
          </Link>
        </div>

        <div className="space-y-8">
        <div className="space-y-4">
          <h1 className="text-3xl font-bold text-gray-900 leading-tight">
            {t('onboarding.name.title')}
          </h1>
          <p className="text-lg text-gray-600">
            {t('auth.tellUsAboutYourself')}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-2">
              {t('profile.name')}
            </label>
            <input
              id="firstName"
              type="text"
              value={firstName}
              onChange={(e) => {
                setFirstName(e.target.value)
                setError('')
              }}
              className={`w-full p-4 border-2 rounded-xl focus:outline-none focus:border-blue-600 text-lg ${
                error ? 'border-red-300' : 'border-gray-200'
              }`}
              placeholder="John"
              disabled={isLoading}
              autoFocus
            />
            {error && (
              <p className="mt-1 text-sm text-red-600">{error}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading || !firstName.trim()}
            className={`w-full py-4 px-6 rounded-xl font-semibold text-lg text-white shadow-lg transition-colors ${
              isLoading || !firstName.trim()
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 active:bg-blue-700'
            }`}
          >
            {isLoading ? t('common.loading') : t('common.continue')}
          </button>
        </form>
        </div>
      </div>
    </main>
  )
}

