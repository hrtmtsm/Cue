'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

export default function ProfilePage() {
  const router = useRouter()
  const [firstName, setFirstName] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

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
      router.push('/onboarding/diagnosis')
    }, 500)
  }

  return (
    <main className="flex min-h-screen flex-col px-6 py-12">
      <div className="mb-8">
        <Link
          href="/auth"
          className="text-blue-600 font-medium text-lg py-2 px-1 -ml-1 inline-flex items-center gap-1"
        >
          <ChevronLeft className="w-5 h-5" />
          Back
        </Link>
      </div>

      <div className="flex flex-col justify-center flex-1 space-y-8">
        <div className="space-y-4">
          <h1 className="text-3xl font-bold text-gray-900 leading-tight">
            Tell us your name
          </h1>
          <p className="text-lg text-gray-600">
            We'll use this to personalize your experience
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-2">
              First name
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
            {isLoading ? 'Saving...' : 'Continue'}
          </button>
        </form>
      </div>
    </main>
  )
}

