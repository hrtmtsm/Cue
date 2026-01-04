'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

export default function IntroPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  useEffect(() => {
    // Check authentication status
    // TODO: Replace with Supabase auth check
    // const { data: { user } } = await supabase.auth.getUser()
    // setIsAuthenticated(!!user)
    
    // Placeholder: for now, default to false (not authenticated)
    setIsAuthenticated(false)
  }, [])

  const ctaText = isAuthenticated ? 'Continue' : 'Get started'
  const ctaHref = isAuthenticated ? '/practice' : '/auth'

  return (
    <main className="flex min-h-screen flex-col px-6 py-12">
      <div className="flex flex-col justify-center flex-1 space-y-8">
        <div className="space-y-4 text-center">
          <div className="mb-8">
            <h2 className="text-5xl font-bold text-blue-600 tracking-tight">
              Cue
            </h2>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 leading-tight">
            Can't catch what native speakers actually say?
          </h1>
          <p className="text-lg text-gray-600">
            Train your ear to hear fast, natural speech — one short clip at a time.
          </p>
        </div>
      </div>

      <div className="pt-8 pb-6 space-y-3">
        <Link
          href={ctaHref}
          className="block w-full bg-blue-600 text-white text-center font-semibold py-4 px-6 rounded-xl shadow-lg active:bg-blue-700 transition-colors"
        >
          {ctaText}
        </Link>
        {!isAuthenticated && (
          <Link
            href="/auth/login"
            className="block w-full text-center font-medium py-3 px-6 text-gray-600 hover:text-gray-900 transition-colors"
          >
            I already have an account
          </Link>
        )}
      </div>
    </main>
  )
}

