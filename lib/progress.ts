/**
 * Progress tracking with hybrid local/DB storage
 * - Local storage as cache for fast access
 * - Database as source of truth for persistence & cross-device sync
 */

export interface UserProgress {
  streak: number
  last_practice_date: string | null
  total_sessions: number
  total_listening_minutes: number
  completed_stories: string[]
}

const CACHE_KEY = 'user_progress_cache'
const CACHE_TIMESTAMP_KEY = 'user_progress_cache_timestamp'
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

// ============================================================================
// Cache Management
// ============================================================================

function getCachedProgress(): UserProgress | null {
  if (typeof window === 'undefined') return null

  try {
    const cached = localStorage.getItem(CACHE_KEY)
    const timestamp = localStorage.getItem(CACHE_TIMESTAMP_KEY)

    if (!cached || !timestamp) return null

    const age = Date.now() - parseInt(timestamp, 10)
    if (age > CACHE_DURATION) {
      console.log('📊 [progress] Cache expired')
      return null
    }

    console.log('📊 [progress] Using cached progress')
    return JSON.parse(cached)
  } catch (error) {
    console.error('❌ [progress] Error reading cache:', error)
    return null
  }
}

function setCachedProgress(progress: UserProgress): void {
  if (typeof window === 'undefined') return

  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(progress))
    localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString())
    console.log('📊 [progress] Cached progress:', progress)
  } catch (error) {
    console.error('❌ [progress] Error caching progress:', error)
  }
}

function clearCache(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(CACHE_KEY)
  localStorage.removeItem(CACHE_TIMESTAMP_KEY)
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Get user's progress (from cache or DB)
 */
export async function getProgress(forceRefresh = false): Promise<{
  success: boolean
  progress?: UserProgress
  error?: string
}> {
  // Try cache first (unless force refresh)
  if (!forceRefresh) {
    const cached = getCachedProgress()
    if (cached) {
      console.log('📊 [getProgress] Using cached progress')
      return { success: true, progress: cached }
    }
  } else {
    clearCache()
  }

  // Fetch from DB
  try {
    console.log('📊 [getProgress] Fetching from DB...', { forceRefresh })
    const response = await fetch('/api/progress', {
      cache: forceRefresh ? 'no-store' : 'default',
    })
    
    console.log('📊 [getProgress] API response:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('❌ [getProgress] API error:', {
        status: response.status,
        error: data.error,
        response: data,
      })
      return { success: false, error: data.error || 'Failed to fetch progress' }
    }

    // Validate response structure
    if (!data.progress) {
      console.error('❌ [getProgress] Invalid response structure:', data)
      return { success: false, error: 'Invalid response from server' }
    }

    const progress = data.progress
    console.log('✅ [getProgress] Progress fetched:', {
      streak: progress.streak,
      totalSessions: progress.total_sessions,
      totalMinutes: progress.total_listening_minutes,
      completedStories: progress.completed_stories?.length || 0,
    })
    
    setCachedProgress(progress)
    return { success: true, progress }
  } catch (error: any) {
    console.error('❌ [getProgress] Network error:', {
      error: error.message,
      errorStack: error.stack,
    })
    return { success: false, error: error.message || 'Network error' }
  }
}

/**
 * Update user's progress (updates both cache and DB)
 */
export async function updateProgress(
  progress: Partial<UserProgress>
): Promise<{ success: boolean; progress?: UserProgress; error?: string }> {
  try {
    console.log('📊 [updateProgress] Updating progress:', progress)
    const response = await fetch('/api/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(progress),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('❌ [updateProgress] API error:', data.error)
      return { success: false, error: data.error || 'Failed to update progress' }
    }

    const updatedProgress = data.progress
    setCachedProgress(updatedProgress)
    return { success: true, progress: updatedProgress }
  } catch (error: any) {
    console.error('❌ [updateProgress] Network error:', error)
    return { success: false, error: error.message || 'Network error' }
  }
}

/**
 * Increment session count and/or listening time
 */
export async function incrementProgress(options: {
  sessions?: number
  minutes?: number
  story?: string
  streak?: { streak: number; last_practice_date: string }
}): Promise<{ success: boolean; progress?: UserProgress; error?: string }> {
  const maxRetries = 2
  let lastError: string | undefined

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`🔄 [incrementProgress] Retry attempt ${attempt}/${maxRetries}...`)
        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
      }

      console.log('📊 [incrementProgress] Incrementing:', {
        ...options,
        attempt: attempt + 1,
        maxRetries: maxRetries + 1,
      })

      const response = await fetch('/api/progress', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          increment_sessions: options.sessions,
          increment_minutes: options.minutes,
          add_story: options.story,
          update_streak: options.streak,
        }),
      })

      console.log('📊 [incrementProgress] API response:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
      })

      const data = await response.json()

      if (!response.ok) {
        const errorMsg = data.error || `HTTP ${response.status}: ${response.statusText}`
        console.error('❌ [incrementProgress] API error:', {
          status: response.status,
          error: errorMsg,
          response: data,
          attempt: attempt + 1,
        })
        
        lastError = errorMsg
        
        // Don't retry on 401 (auth error) or 400 (bad request)
        if (response.status === 401 || response.status === 400) {
          return { success: false, error: errorMsg }
        }
        
        // Retry on 500 or network errors
        if (attempt < maxRetries) {
          continue
        }
        
        return { success: false, error: errorMsg }
      }

      // Success - verify response structure
      if (!data.progress) {
        console.error('❌ [incrementProgress] Invalid response structure:', data)
        return { success: false, error: 'Invalid response from server' }
      }

      const updatedProgress = data.progress
      
      console.log('✅ [incrementProgress] Progress updated successfully:', {
        streak: updatedProgress.streak,
        totalSessions: updatedProgress.total_sessions,
        totalMinutes: updatedProgress.total_listening_minutes,
        completedStories: updatedProgress.completed_stories?.length || 0,
      })

      // Clear cache and set new progress
      clearCache()
      setCachedProgress(updatedProgress)
      
      return { success: true, progress: updatedProgress }
    } catch (error: any) {
      const errorMsg = error.message || 'Network error'
      console.error('❌ [incrementProgress] Network error:', {
        error: errorMsg,
        attempt: attempt + 1,
        errorStack: error.stack,
      })
      
      lastError = errorMsg
      
      // Retry on network errors
      if (attempt < maxRetries) {
        continue
      }
    }
  }

  // All retries failed
  return { success: false, error: lastError || 'Failed to increment progress after retries' }
}

// ============================================================================
// Migration Helper (for existing local storage data)
// ============================================================================

/**
 * Migrate old localStorage data to DB (one-time operation)
 */
export async function migrateLocalStorageToDb(): Promise<boolean> {
  if (typeof window === 'undefined') return false

  try {
    // Check if we already migrated
    const migrated = localStorage.getItem('progress_migrated')
    if (migrated === 'true') {
      console.log('📊 [migrate] Already migrated')
      return true
    }

    // Get old localStorage data
    const streak = parseInt(localStorage.getItem('streak') || '0', 10)
    const lastPracticeDate = localStorage.getItem('lastPracticeDate')
    const completedStoriesStr = localStorage.getItem('completedStories')
    const completedStories = completedStoriesStr ? JSON.parse(completedStoriesStr) : []

    // Only migrate if there's data
    if (streak > 0 || lastPracticeDate || completedStories.length > 0) {
      console.log('📊 [migrate] Migrating old data to DB:', {
        streak,
        lastPracticeDate,
        completedStories,
      })

      const result = await updateProgress({
        streak,
        last_practice_date: lastPracticeDate,
        total_sessions: 0, // We don't have this in old data
        total_listening_minutes: 0, // We don't have this in old data
        completed_stories: completedStories,
      })

      if (result.success) {
        console.log('✅ [migrate] Migration successful')
        // Clean up old keys (but NOT completedStories - still used by storyRotation.ts)
        localStorage.removeItem('streak')
        localStorage.removeItem('lastPracticeDate')
        localStorage.removeItem('lastSessionCompleted')
        // NOTE: Do NOT remove 'completedStories' - storyRotation.ts reads from localStorage
        // to track which stories the user has completed for the rotation system.
        // Removing it would cause the same story to be shown again.
        localStorage.setItem('progress_migrated', 'true')
        return true
      } else {
        console.error('❌ [migrate] Migration failed:', result.error)
        return false
      }
    } else {
      console.log('📊 [migrate] No old data to migrate')
      localStorage.setItem('progress_migrated', 'true')
      return true
    }
  } catch (error) {
    console.error('❌ [migrate] Error during migration:', error)
    return false
  }
}

// ============================================================================
// Streak Calculation Helper
// ============================================================================

/**
 * Calculate new streak based on last practice date
 */
export function calculateStreak(lastPracticeDate: string | null): number {
  if (!lastPracticeDate) return 1 // First time

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const lastDate = new Date(lastPracticeDate)
  lastDate.setHours(0, 0, 0, 0)

  const diffTime = today.getTime() - lastDate.getTime()
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))

  if (diffDays === 0) {
    // Same day, keep current streak (will be handled by caller)
    return -1 // Signal to keep current streak
  } else if (diffDays === 1) {
    // Next day, increment streak (will be handled by caller)
    return -2 // Signal to increment streak
  } else {
    // Gap in practice, reset to 1
    return 1
  }
}
