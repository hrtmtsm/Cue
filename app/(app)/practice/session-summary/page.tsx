'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense } from 'react'

function SessionSummaryPageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const sessionId = searchParams.get('session') || ''

  return (
    <main className="flex min-h-screen flex-col px-6 py-6">
      <div className="flex-1 flex flex-col items-center justify-center space-y-6 text-center">
        <h1 className="text-3xl font-bold text-gray-900">
          Session complete!
        </h1>
        <p className="text-lg text-gray-600">
          Great work practicing your listening skills.
        </p>
        <div className="pt-8 space-y-4 w-full max-w-sm">
          <button
            onClick={() => router.push('/practice')}
            className="w-full py-4 px-6 rounded-xl font-semibold text-lg bg-blue-600 text-white active:bg-blue-700 shadow-lg transition-colors"
          >
            Practice another clip
          </button>
        </div>
      </div>
    </main>
  )
}

export default function SessionSummaryPage() {
  return (
    <Suspense fallback={
      <main className="flex min-h-screen flex-col items-center justify-center px-6">
        <div className="text-gray-500">Loading...</div>
      </main>
    }>
      <SessionSummaryPageContent />
    </Suspense>
  )
}

