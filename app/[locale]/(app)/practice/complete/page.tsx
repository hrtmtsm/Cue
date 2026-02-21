'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { Suspense, useEffect, useState } from 'react'
import { markStoryCompleted, getNextUncompletedStory, getCompletedStories } from '@/lib/storyRotation'
import { useSubscription } from '@/lib/useSubscription'
import { getSupabaseClient } from '@/lib/supabase/auth-helpers'
import { loadUserStories } from '@/lib/storyClient'
import { getListeningProfile, getUserPreferences } from '@/lib/userPreferences'
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
  const locale = useLocale()
  const t = useTranslations()
  const searchParams = useSearchParams()
  const storyId = searchParams.get('storyId') || undefined
  const { isPro, loading, refetch } = useSubscription()

  const [streak, setStreak] = useState(0)
  const [isStartingSession, setIsStartingSession] = useState(false)
  const [sessionRecorded, setSessionRecorded] = useState(false)

  // Handler: Start next practice session (for Pro users)
  const handleStartNextSession = async () => {
    if (isStartingSession) return
    
    try {
      setIsStartingSession(true)
      
      // Safety: ensure current story is marked as completed before selecting next
      if (storyId) {
        markStoryCompleted(storyId)
      }
      
      // Load all stories
      const stories = await loadUserStories()
      
      if (!stories || stories.length === 0) {
        console.warn('⚠️ No stories available')
        router.push(`/${locale}/practice/select`)
        return
      }
      
      // Get listening profile and preferences for adaptive selection
      const profile = getListeningProfile()
      const preferences = getUserPreferences()
      
      // Select next uncompleted story
      const result = getNextUncompletedStory(stories, profile || undefined, preferences || undefined)
      
      if (result.story) {
        console.log('✅ Starting next session with story:', result.story.id)
        // Navigate directly to the story practice page
        router.push(`/${locale}/practice/story/${result.story.id}?clipIndex=0`)
      } else {
        console.warn('⚠️ No story found, redirecting to select page')
        router.push(`/${locale}/practice/select`)
      }
    } catch (error) {
      console.error('❌ Error starting next session:', error)
      router.push(`/${locale}/practice/select`)
    } finally {
      setIsStartingSession(false)
    }
  }

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

  // Record session completion in database (enforces free tier daily limit)
  useEffect(() => {
    if (typeof window === 'undefined' || sessionRecorded) return

    // Always set localStorage immediately (client-side limit check)
    const today = new Date().toDateString()
    localStorage.setItem('lastSessionCompleted', today)
    setSessionRecorded(true)

    // Also store the user ID so we can detect cross-account stale state on the select page
    getSupabaseClient().auth.getUser().then(({ data: { user } }) => {
      if (user?.id) localStorage.setItem('lastSessionUserId', user.id)
    })

    // Call server-side to record in practice_sessions table
    // Records for ALL users (free and Pro) so cancellation mid-day is handled correctly
    fetch('/api/session/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ storyId: storyId || null }),
    })
      .then(res => {
        if (res.ok) {
          console.log('[Practice Complete] Session recorded in database')
        } else {
          console.warn('[Practice Complete] Failed to record session in DB, status:', res.status)
        }
      })
      .catch(err => {
        console.warn('[Practice Complete] Error recording session:', err)
      })
  }, [sessionRecorded, storyId])

  // On mount: mark today's session as complete and update streak + progress
  useEffect(() => {
    if (typeof window === 'undefined') return

    // ✅ IMMEDIATELY mark story as completed in localStorage (BEFORE any async work)
    // This is critical: if user clicks "Done" quickly, async API calls might not finish,
    // but story rotation needs to know this story is done RIGHT NOW.
    if (storyId) {
      console.log('📚 [COMPLETE PAGE] Immediately marking story as completed:', storyId)
      markStoryCompleted(storyId)
      
      // Verify it was saved
      const completed = getCompletedStories()
      const isMarked = completed.includes(storyId)
      console.log('✅ [COMPLETE PAGE] Story completion status (immediate):', {
        storyId,
        marked: isMarked,
        allCompleted: completed,
      })
      
      if (!isMarked) {
        console.error('❌ [COMPLETE PAGE] Story was NOT marked as completed!', {
          storyId,
          completedStories: completed,
        })
      }
    } else {
      console.warn('⚠️ [COMPLETE PAGE] No storyId in URL params - story not marked as completed', {
        searchParams: window.location.search,
      })
    }

    // Now do async progress updates (can complete in background)
    const updateProgressData = async () => {
      try {
        console.log('📊 [COMPLETE PAGE] Starting progress update...', {
          storyId,
          urlParams: window.location.search,
        })

        const todayKey = new Date().toISOString().split('T')[0]

        // Get current progress from DB
        console.log('📊 [COMPLETE PAGE] Fetching current progress from DB...')
        const result = await getProgress()
        if (!result.success || !result.progress) {
          console.error('❌ [COMPLETE PAGE] Failed to get progress:', {
            success: result.success,
            error: result.error,
            progress: result.progress,
          })
          return
        }

        const progress = result.progress
        const lastPracticeDate = progress.last_practice_date
        const currentStreak = progress.streak

        console.log('📊 [COMPLETE PAGE] Current progress:', {
          streak: currentStreak,
          lastPracticeDate,
          totalSessions: progress.total_sessions,
          totalMinutes: progress.total_listening_minutes,
          completedStories: progress.completed_stories?.length || 0,
        })

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

        console.log('📊 [COMPLETE PAGE] Updating progress with:', {
          sessions: 1,
          minutes: 1,
          story: storyId,
          streak: nextStreak,
          lastPracticeDate: todayKey,
        })

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
          console.log('✅ [COMPLETE PAGE] Progress updated successfully:', {
            streak: updateResult.progress.streak,
            totalSessions: updateResult.progress.total_sessions,
            totalMinutes: updateResult.progress.total_listening_minutes,
            completedStories: updateResult.progress.completed_stories?.length || 0,
          })
        } else {
          console.error('❌ [COMPLETE PAGE] Failed to update progress:', {
            success: updateResult.success,
            error: updateResult.error,
            progress: updateResult.progress,
          })
        }
      } catch (error) {
        console.error('❌ [COMPLETE PAGE] Error updating progress:', error, {
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
          storyId,
        })
      }
    }

    updateProgressData()
  }, [storyId])

  const timeUntilMidnight = getTimeUntilMidnight()

  return (
    <main className="flex min-h-screen flex-col bg-gradient-to-b from-blue-50 to-white">
      <div className="flex-1 flex flex-col items-center justify-center text-center space-y-8 px-6 py-10">
        {/* Celebration + core message */}
        <div className="space-y-4">
          <div className="text-5xl">🎉</div>
          <h1 className="text-heading-1 text-gray-900">
            {t('practice.complete.greatWorkToday')}
          </h1>
          {streak > 0 && (
            <div className="text-body-small font-semibold text-orange-900 flex items-center justify-center gap-2">
              <span>🔥</span>
              <span>
                {t(streak === 1 ? 'practice.complete.dayInARow' : 'practice.complete.daysInARow', { count: streak })}
              </span>
            </div>
          )}
          {!isPro && !loading && (
            <p className="text-body-small text-gray-500">
              {t('practice.complete.comeBackIn', { time: timeUntilMidnight })}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="w-full max-w-xs space-y-5">
          <button
            onClick={() => router.push(`/${locale}/practice/select`)}
            className="w-full py-3.5 px-6 rounded-xl text-body-large font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-md"
          >
            {t('practice.complete.done')}
          </button>

          {!isPro && !loading && (
            <div className="space-y-2">
              <p className="text-body-small text-gray-600">
                {t('practice.complete.wantMorePractice')}
              </p>
              <button
                onClick={() => router.push(`/${locale}/pro`)}
                className="w-full py-3 px-6 rounded-xl text-body-small font-semibold text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition-colors"
              >
                {t('practice.complete.upgradeToPro')}
              </button>
            </div>
          )}

          {isPro && !loading && (
            <button
              onClick={handleStartNextSession}
              disabled={isStartingSession}
              className="w-full py-3 px-6 rounded-xl text-body-small font-semibold text-blue-900 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isStartingSession ? 'Starting...' : 'Start next session →'}
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
        <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-blue-50 to-white">
          <div className="text-gray-500">Loading...</div>
        </main>
      }
    >
      <PracticeCompletePageContent />
    </Suspense>
  )
}


