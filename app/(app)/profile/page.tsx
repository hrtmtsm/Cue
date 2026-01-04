'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function ProfilePage() {
  const [firstName, setFirstName] = useState<string>('Not set')
  const router = useRouter()

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
    router.push('/')
  }

  return (
    <main className="flex min-h-screen flex-col px-6 py-6">
      <div className="flex-1 space-y-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-gray-900">
            Profile
          </h1>
        </div>

        {/* Account Section */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Account</h2>
          <div className="space-y-3">
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
              <div className="text-sm text-gray-600 mb-1">Name</div>
              <div className="font-medium text-gray-900">{firstName}</div>
            </div>
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
              <div className="text-sm text-gray-600 mb-1">Email</div>
              <div className="font-medium text-gray-900">user@example.com</div>
            </div>
          </div>
        </div>

        {/* Preferences Section */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Preferences</h2>
          <div className="space-y-3">
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 flex items-center justify-between">
              <div>
                <div className="font-medium text-gray-900 mb-1">Playback speed</div>
                <div className="text-sm text-gray-600">Default: 1.0x</div>
              </div>
              <button className="text-blue-600 font-medium text-sm">Change</button>
            </div>
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 flex items-center justify-between">
              <div>
                <div className="font-medium text-gray-900 mb-1">Captions</div>
                <div className="text-sm text-gray-600">Show subtitles</div>
              </div>
              <button className="text-blue-600 font-medium text-sm">Toggle</button>
            </div>
          </div>
        </div>

        {/* Sign out */}
        <div className="pt-4">
          <button 
            onClick={handleSignOut}
            className="w-full py-3 px-6 rounded-xl font-medium text-lg border-2 border-red-200 text-red-600 hover:bg-red-50 active:bg-red-100 transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </main>
  )
}

