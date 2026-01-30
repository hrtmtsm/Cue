'use client'

import { useEffect, useState } from 'react'

export default function ProgressPage() {
  const [streak, setStreak] = useState(0)
  const [totalSessions, setTotalSessions] = useState(0)
  const [listeningMinutes, setListeningMinutes] = useState(0)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (typeof window === 'undefined') return

    try {
      // Load streak
      const storedStreak = localStorage.getItem('streak')
      const streakValue = storedStreak ? parseInt(storedStreak, 10) : 0
      setStreak(streakValue)

      // Calculate total sessions from completed stories
      const completedStoriesStr = localStorage.getItem('completedStories')
      const completedStories = completedStoriesStr ? JSON.parse(completedStoriesStr) : []
      const sessionsCount = completedStories.length
      setTotalSessions(sessionsCount)

      // Estimate listening time (3 clips per story, ~10 seconds each)
      const totalClips = sessionsCount * 3
      const totalSeconds = totalClips * 10
      const totalMinutes = Math.floor(totalSeconds / 60)
      setListeningMinutes(totalMinutes)

      console.log('📊 [PROGRESS PAGE] Progress loaded:', {
        streak: streakValue,
        sessions: sessionsCount,
        minutes: totalMinutes,
        clips: totalClips,
        completedStories: completedStories.length
      })
    } catch (error) {
      console.error('❌ [PROGRESS PAGE] Error loading progress:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  if (isLoading) {
    return (
      <main className="flex flex-col px-6 py-6">
        <div className="text-gray-600">Loading progress...</div>
      </main>
    )
  }

  return (
    <main className="flex flex-col px-6 py-6">
      <div className="space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-gray-900">Progress</h1>
          <p className="text-gray-600">Track your listening improvement</p>
        </div>

        {/* Main Stats */}
        <div className="grid grid-cols-3 gap-4">
          <StatCard 
            value={listeningMinutes}
            label="Minutes"
            suffix=" min"
            icon="⏱️"
          />
          <StatCard 
            value={totalSessions}
            label="Sessions"
            icon="📚"
          />
          <StatCard 
            value={streak}
            label="Day Streak"
            icon="🔥"
          />
        </div>

        {/* Additional Stats */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">All Time</h2>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
              <div className="text-sm text-gray-600 mb-1">Total Clips</div>
              <div className="text-2xl font-bold text-gray-900">
                {totalSessions * 3}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                ~{totalSessions * 3 * 10} seconds
              </div>
            </div>
            
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
              <div className="text-sm text-gray-600 mb-1">Stories Completed</div>
              <div className="text-2xl font-bold text-gray-900">
                {totalSessions}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {totalSessions > 0 ? 'Keep going!' : 'Start your first session'}
              </div>
            </div>
          </div>
        </div>

        {/* Motivational Messages */}
        {totalSessions === 0 && (
          <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
            <div className="text-sm text-blue-900">
              🎯 Complete your first practice session to start tracking your progress!
            </div>
          </div>
        )}

        {streak >= 3 && (
          <div className="p-4 bg-orange-50 rounded-xl border border-orange-200">
            <div className="text-sm text-orange-900">
              🔥 {streak} day streak! You're on fire! Keep it up!
            </div>
          </div>
        )}

        {/* Saved Section (Placeholder for Phase 2) */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">Saved</h2>
          
          <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
            <div className="text-sm font-medium text-gray-900 mb-1">Words</div>
            <div className="text-sm text-gray-500">
              No saved words yet
            </div>
          </div>
          
          <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
            <div className="text-sm font-medium text-gray-900 mb-1">Phrases</div>
            <div className="text-sm text-gray-500">
              No saved phrases yet
            </div>
          </div>
          
          <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
            <div className="text-sm font-medium text-gray-900 mb-1">Tips</div>
            <div className="text-sm text-gray-500">
              No saved tips yet
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}

function StatCard({ 
  value, 
  label, 
  suffix = '', 
  icon = '' 
}: { 
  value: number
  label: string
  suffix?: string
  icon?: string
}) {
  return (
    <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
      <div className="text-2xl font-bold text-gray-900">
        {icon && <span className="mr-1">{icon}</span>}
        {value}{suffix}
      </div>
      <div className="text-sm text-gray-600 mt-1">{label}</div>
    </div>
  )
}
