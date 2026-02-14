'use client'

export const dynamic = 'force-dynamic'

import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import { markStoryCompleted } from '@/lib/storyRotation'
import { useSubscription } from '@/lib/useSubscription'
import { getProgress, incrementProgress } from '@/lib/progress'

// Helper: time remaining until midnight local time
function getTimeUntilMidnight(): string {
  const now = new Date()
  const midnight = new Date()
  midnight.setHours(24, 0, 0, 0)

  const diff = midnight.getTime() - now.getTime()
  const hours = Math.max(0, Math.floor(diff / (1000 * 60 * 60)))
  const minutes = Math.max(
    0,
    Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  )

  return `${hours}h ${minutes}m`
}

function PracticeCompletePageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const storyId = searchParams.get('storyId') || undefined
  const { isPro, loading, refetch } = useSubscription()

  const [streak, setStreak] = useState(0)

  // Debug: Log subscription state on every render
  console.log('🎉 [Practice Complete] Component rendered:', { isPro, loading })

  // Check for ?upgraded=true parameter and refetch subscription status
  useEffect(() => {
    const upgraded = searchParams.get('upgraded')
    if (upgraded === 'true' && refetch) {
      console.log('[Practice Complete] Detected upgrade completion, refetching subscription...')
      refetch()
      
      // Clean up the URL parameter after refetch
      const newUrl = new URL(window.location.href)
      newUrl.searchParams.delete('upgraded')
      router.replace(newUrl.pathname + newUrl.search)
    }
  }, [searchParams, refetch, router])

  // On mount: mark today's session as complete and update streak + progress
  useEffect(() => {
    if (typeof window === 'undefined') return

    const updateProgressData = async () => {
      try {
        const todayKey = new Date().toISOString().split('T')[0]

        // Get current progress from DB
        const result = await getProgress()
        if (!result.success || !result.progress) {
          console.error('❌ [COMPLETE PAGE] Failed to get progress:', result.error)
          return
        }

        const progress = result.progress
        const lastPracticeDate = progress.last_practice_date
        const currentStreak = progress.streak

        // Compute whether this is a new day and if it's consecutive
        const today = new Date()
        const last = lastPracticeDate ? new Date(lastPracticeDate) : null

        let nextStreak = currentStreak || 0

        if (!lastPracticeDate) {
          // First ever session
          nextStreak = 1
        } else if (last) {
          const diffDays = Math.floor(
            (today.setHours(0, 0, 0, 0) - last.setHours(0, 0, 0, 0)) /
              (1000 * 60 * 60 * 24)
          )
          if (diffDays === 0) {
            // Same day: keep streak
            nextStreak = currentStreak || 1
          } else if (diffDays === 1) {
            // Consecutive day: increment streak
            nextStreak = (currentStreak || 0) + 1
          } else if (diffDays > 1) {
            // Break in streak: reset to 1
            nextStreak = 1
          }
        }

        // Update progress in DB: increment session, update streak, add story to completed list
        const updateResult = await incrementProgress({
          sessions: 1,
          minutes: 1, // Rough estimate: 1 session = ~1 minute of active listening
          story: storyId,
          streak: {
            streak: nextStreak,
            last_practice_date: todayKey,
          },
        })

        if (updateResult.success && updateResult.progress) {
          setStreak(updateResult.progress.streak)
          console.log('✅ [COMPLETE PAGE] Progress updated:', updateResult.progress)
        } else {
          console.error('❌ [COMPLETE PAGE] Failed to update progress:', updateResult.error)
        }

        // ✅ Mark story as completed for rotation
        if (storyId) {
          markStoryCompleted(storyId)
          console.log('✅ [COMPLETE PAGE] Story completed and marked:', storyId)
        } else {
          console.warn('⚠️ [COMPLETE PAGE] No storyId in URL params - story not marked as completed')
        }
      } catch (error) {
        console.error('❌ [COMPLETE PAGE] Error updating progress:', error)
      }
    }

    updateProgressData()
  }, [storyId])

  const timeUntilMidnight = getTimeUntilMidnight()

  return (
    <main className="flex min-h-screen flex-col bg-white px-6 py-10">
      <div className="flex-1 flex flex-col items-center justify-center text-center space-y-8">
        {/* Celebration + core message */}
        <div className="space-y-4">
          <div className="text-5xl">🎉</div>
          <h1 className="text-heading-1 text-gray-900">
            Great work today!
          </h1>
          {streak > 0 && (
            <div className="text-body-small font-semibold text-orange-900 flex items-center justify-center gap-2">
              <span>🔥</span>
              <span>
                {streak} day{streak > 1 ? 's' : ''} in a row
              </span>
            </div>
          )}
          <p className="text-body-small text-gray-500">
            Come back in {timeUntilMidnight}
          </p>
        </div>

        {/* Actions */}
        <div className="w-full max-w-xs space-y-5">
          <button
            onClick={() => router.push('/practice/select')}
            className="w-full py-3.5 px-6 rounded-xl text-body-large font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-md"
          >
            Done
          </button>

          {!isPro && !loading && (
            <div className="space-y-2">
              <p className="text-body-small text-gray-600">
                Want more practice?
              </p>
              <button
                onClick={() => router.push('/pro')}
                className="w-full py-3 px-6 rounded-xl text-body-small font-semibold text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition-colors"
              >
                Upgrade to Pro →
              </button>
            </div>
          )}

          {isPro && !loading && (
            <button
              onClick={() => router.push('/practice/select')}
              className="w-full py-3 px-6 rounded-xl text-body-small font-semibold text-blue-900 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-colors"
            >
              Do another session →
            </button>
          )}
        </div>
      </div>
    </main>
  )
}

export default function PracticeCompletePage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen flex-col items-center justify-center px-6">
          <div className="text-gray-500">Loading...</div>
        </main>
      }
    >
      <PracticeCompletePageContent />
    </Suspense>
  )
}


