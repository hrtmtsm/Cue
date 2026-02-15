/**
 * Story Rotation Module
 * 
 * Handles tracking which stories are completed and selecting the next uncompleted story
 * for daily practice sessions.
 */

import { Story } from './storyTypes'
import { ListeningProfile, UserPreferences } from './userPreferences'
import { selectNextClipDifficulty } from './clipProfileMapper'

const COMPLETED_STORIES_KEY = 'completedStories'

/**
 * Get list of completed story IDs
 */
export function getCompletedStories(): string[] {
  if (typeof window === 'undefined') return []
  
  try {
    const stored = localStorage.getItem(COMPLETED_STORIES_KEY)
    return stored ? JSON.parse(stored) : []
  } catch (error) {
    console.error('❌ Error loading completed stories:', error)
    return []
  }
}

/**
 * Mark a story as completed
 */
export function markStoryCompleted(storyId: string): void {
  if (typeof window === 'undefined') {
    console.warn('⚠️ [StoryRotation] markStoryCompleted called on server - skipping')
    return
  }
  
  if (!storyId || typeof storyId !== 'string' || storyId.trim() === '') {
    console.error('❌ [StoryRotation] Invalid storyId provided to markStoryCompleted:', storyId)
    return
  }
  
  try {
    const completed = getCompletedStories()
    
    // Validate storyId format
    const trimmedStoryId = storyId.trim()
    
    if (!completed.includes(trimmedStoryId)) {
      completed.push(trimmedStoryId)
      localStorage.setItem(COMPLETED_STORIES_KEY, JSON.stringify(completed))
      
      // Verify it was saved correctly
      const verify = getCompletedStories()
      const wasSaved = verify.includes(trimmedStoryId)
      
      console.log('✅ [StoryRotation] Story marked completed:', {
        storyId: trimmedStoryId,
        totalCompleted: completed.length,
        saved: wasSaved,
        allCompleted: verify,
      })
      
      if (!wasSaved) {
        console.error('❌ [StoryRotation] Story ID was not saved correctly!', {
          attempted: trimmedStoryId,
          saved: verify,
        })
      }
    } else {
      console.log('ℹ️ [StoryRotation] Story already marked as completed:', trimmedStoryId)
    }
  } catch (error) {
    console.error('❌ [StoryRotation] Error marking story completed:', error, {
      storyId,
      errorMessage: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * Clear all completed stories (start fresh cycle)
 */
export function clearCompletedStories(): void {
  if (typeof window === 'undefined') return
  
  try {
    localStorage.removeItem(COMPLETED_STORIES_KEY)
    console.log('🔄 Completed stories cleared - starting fresh cycle')
  } catch (error) {
    console.error('❌ Error clearing completed stories:', error)
  }
}

export interface NextStoryResult {
  story: Story | null
  cycleCompleted: boolean // True if all stories were completed and cycle was reset
}

/**
 * Get the next uncompleted story from the list
 * 
 * Phase 1: Smart Story Selection
 * - Filters stories by recommended difficulty based on user's listening profile
 * - Falls back to next available if no matching difficulty found
 * - Auto-cycles when all stories are completed
 * 
 * @param allStories - Array of all available stories
 * @param profile - Optional listening profile for adaptive difficulty selection
 * @param preferences - Optional user preferences for fallback logic
 * @returns Object with story and cycleCompleted flag
 */
export function getNextUncompletedStory(
  allStories: Story[],
  profile?: ListeningProfile,
  preferences?: UserPreferences
): NextStoryResult {
  if (!allStories || allStories.length === 0) {
    console.warn('⚠️ No stories available')
    return { story: null, cycleCompleted: false }
  }
  
  const completedRaw = getCompletedStories()
  
  // ✅ NEW: Clean up stale completion IDs that don't match current stories
  const currentStoryIds = allStories.map(s => s.id)
  const completed = completedRaw.filter(id => currentStoryIds.includes(id))
  
  // If we cleaned up stale IDs, update localStorage
  if (completed.length !== completedRaw.length) {
    const staleIds = completedRaw.filter(id => !currentStoryIds.includes(id))
    console.warn('🧹 [StoryRotation] Cleaned up stale completion IDs:', {
      before: completedRaw.length,
      after: completed.length,
      removed: staleIds.length,
      staleIds: staleIds,
    })
    
    if (typeof window !== 'undefined') {
      localStorage.setItem(COMPLETED_STORIES_KEY, JSON.stringify(completed))
    }
  }
  
  // Filter out completed stories
  const remaining = allStories.filter(story => !completed.includes(story.id))
  
  // Enhanced logging with story ID validation
  console.log('📊 [StoryRotation] Story rotation status:', {
    totalStories: allStories.length,
    completedCount: completed.length,
    remainingCount: remaining.length,
    completedIds: completed.slice(-5), // Last 5 completed
    allStoryIds: allStories.map(s => s.id).slice(0, 5), // First 5 story IDs
    remainingStoryIds: remaining.map(s => s.id).slice(0, 5), // First 5 remaining
  })
  
  // Validate story ID consistency
  const storyIdMismatches = allStories.filter(story => {
    const isCompleted = completed.includes(story.id)
    const isRemaining = remaining.includes(story)
    return isCompleted && isRemaining // Should never happen
  })
  
  if (storyIdMismatches.length > 0) {
    console.error('❌ [StoryRotation] Story ID consistency issue detected:', {
      mismatches: storyIdMismatches.map(s => s.id),
    })
  }
  
  // If all completed, clear completed stories and start a new cycle
  if (remaining.length === 0 && completed.length > 0) {
    console.log('🎉 All stories completed! Starting new cycle...')
    clearCompletedStories()
    
    // Return first story with cycleCompleted flag for UI celebration
    return {
      story: allStories[0] || null,
      cycleCompleted: true
    }
  }
  
  // Phase 1: Adaptive difficulty filtering
  if (profile) {
    const recommendedDifficulty = selectNextClipDifficulty(profile, preferences)
    console.log('🎯 [AdaptiveSelection] Recommended difficulty:', recommendedDifficulty)
    
    // Filter remaining stories by recommended difficulty
    const matchingStories = remaining.filter(
      story => story.difficulty === recommendedDifficulty
    )
    
    console.log('📚 [AdaptiveSelection] Matching stories:', matchingStories.length, {
      recommended: recommendedDifficulty,
      total: remaining.length,
    })
    
    // If we found a matching story, return it
    if (matchingStories.length > 0) {
      console.log('✅ Selected adaptive story:', {
        storyId: matchingStories[0].id,
        title: matchingStories[0].title,
        difficulty: matchingStories[0].difficulty,
        position: allStories.indexOf(matchingStories[0]) + 1,
        totalStories: allStories.length,
      })
      return { story: matchingStories[0], cycleCompleted: false }
    }
    
    // No matching difficulty, fall through to next available
    console.log('⚠️ [AdaptiveSelection] No stories match recommended difficulty, using next available')
  }
  
  // Fallback: Return first uncompleted story
  if (remaining.length > 0) {
    console.log('✅ Selected next story:', {
      storyId: remaining[0].id,
      title: remaining[0].title,
      difficulty: remaining[0].difficulty,
      position: allStories.indexOf(remaining[0]) + 1,
      totalStories: allStories.length,
    })
    return { story: remaining[0], cycleCompleted: false }
  }
  
  // Final fallback: return first story
  return { story: allStories[0], cycleCompleted: false }
}

/**
 * Get progress statistics
 */
export function getStoryProgress(allStories: Story[]) {
  const completedRaw = getCompletedStories()
  
  // Clean up stale completion IDs
  const currentStoryIds = allStories.map(s => s.id)
  const completed = completedRaw.filter(id => currentStoryIds.includes(id))
  
  const remaining = allStories.filter(story => !completed.includes(story.id))
  
  return {
    total: allStories.length,
    completed: completed.length,
    remaining: remaining.length,
    percentComplete: allStories.length > 0 
      ? Math.round((completed.length / allStories.length) * 100)
      : 0
  }
}

