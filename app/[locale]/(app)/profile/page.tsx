'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'

export default function ProfilePage() {
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations()
  const [firstName, setFirstName] = useState<string>('Not set')

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setFirstName(localStorage.getItem('userFirstName') || 'Not set')
    }
  }, [])

  const handleSignOut = () => {
    // Clear all user data from localStorage
    if (typeof window !== 'undefined') {
      localStorage.removeItem('userFirstName')
      localStorage.removeItem('onboardingData')
      // TODO: When Supabase is implemented, also sign out from Supabase
      // await supabase.auth.signOut()
    }
    // Redirect to landing page
    router.push(`/${locale}`)
  }

  return (
    <main className="flex min-h-screen flex-col px-6 py-6">
      <div className="flex-1 space-y-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-gray-900">
            {t('profile.title')}
          </h1>
        </div>

        {/* Account Section */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">{t('profile.account')}</h2>
          <div className="space-y-3">
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
              <div className="text-sm text-gray-600 mb-1">{t('profile.name')}</div>
              <div className="font-medium text-gray-900">{firstName}</div>
            </div>
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
              <div className="text-sm text-gray-600 mb-1">{t('profile.email')}</div>
              <div className="font-medium text-gray-900">user@example.com</div>
            </div>
          </div>
        </div>

        {/* Preferences Section */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">{t('profile.preferences')}</h2>
          <div className="space-y-3">
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
              <div className="font-medium text-gray-900 mb-3">{t('profile.language')}</div>
              <LanguageSwitcher />
            </div>
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 flex items-center justify-between">
              <div>
                <div className="font-medium text-gray-900 mb-1">{t('profile.playbackSpeed')}</div>
                <div className="text-sm text-gray-600">{t('profile.defaultSpeed')}</div>
              </div>
              <button className="text-blue-600 font-medium text-sm">{t('profile.change')}</button>
            </div>
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 flex items-center justify-between">
              <div>
                <div className="font-medium text-gray-900 mb-1">{t('profile.captions')}</div>
                <div className="text-sm text-gray-600">{t('profile.showSubtitles')}</div>
              </div>
              <button className="text-blue-600 font-medium text-sm">{t('profile.toggle')}</button>
            </div>
          </div>
        </div>

        {/* Sign out */}
        <div className="pt-4">
          <button 
            onClick={handleSignOut}
            className="w-full md:w-auto md:min-w-[200px] py-3 px-6 rounded-xl font-medium text-lg border-2 border-red-200 text-red-600 hover:bg-red-50 active:bg-red-100 transition-colors"
          >
            {t('profile.signOut')}
          </button>
        </div>
      </div>
    </main>
  )
}

