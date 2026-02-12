'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Heading, Body, Label, Caption } from '@/components/ui/Typography'

export default function ProfilePage() {
  const [firstName, setFirstName] = useState<string>('Not set')
  const router = useRouter()

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setFirstName(localStorage.getItem('userFirstName') || 'Not set')
    }
  }, [])

  const handleSignOut = async () => {
    // Sign out from Supabase
    try {
      const { getSupabaseClient } = await import('@/lib/supabase/auth-helpers')
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
    router.push('/')
    router.refresh()
  }

  return (
    <main className="flex min-h-screen flex-col px-6 py-6">
      <div className="flex-1 space-y-8">
        <div className="space-y-2">
          <Heading as="h1" className="text-gray-900">
            Profile
          </Heading>
        </div>

        {/* Account Section */}
        <div className="space-y-4">
          <Heading as="h2" className="text-gray-900 text-lg">Account</Heading>
          <div className="space-y-3">
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
              <Label className="text-gray-600 mb-1">Name</Label>
              <Body className="text-gray-900">{firstName}</Body>
            </div>
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
              <Label className="text-gray-600 mb-1">Email</Label>
              <Body className="text-gray-900">user@example.com</Body>
            </div>
          </div>
        </div>

        {/* Preferences Section */}
        <div className="space-y-4">
          <Heading as="h2" className="text-gray-900 text-lg">Preferences</Heading>
          <div className="space-y-3">
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 flex items-center justify-between">
              <div>
                <Label className="text-gray-900 mb-1">Playback speed</Label>
                <Caption className="text-gray-600">Default: 1.0x</Caption>
              </div>
              <button className="text-blue-600"><Label>Change</Label></button>
            </div>
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 flex items-center justify-between">
              <div>
                <Label className="text-gray-900 mb-1">Captions</Label>
                <Caption className="text-gray-600">Show subtitles</Caption>
              </div>
              <button className="text-blue-600"><Label>Toggle</Label></button>
            </div>
          </div>
        </div>

        {/* Sign out */}
        <div className="pt-4">
          <button 
            onClick={handleSignOut}
            className="w-full md:w-auto md:min-w-[200px] py-3 px-6 rounded-xl border-2 border-red-200 text-red-600 hover:bg-red-50 active:bg-red-100 transition-colors"
          >
            <Label className="text-red-600">Sign out</Label>
          </button>
        </div>
      </div>
    </main>
  )
}

