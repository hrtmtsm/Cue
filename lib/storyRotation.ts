/**
 * Story Rotation Module
 * 
 * Handles tracking which stories are completed and selecting the next uncompleted story
 * for daily practice sessions.
 */

import { Story } from './storyTypes'

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
  if (typeof window === 'undefined') return
  
  try {
    const completed = getCompletedStories()
    
    if (!completed.includes(storyId)) {
      completed.push(storyId)
      localStorage.setItem(COMPLETED_STORIES_KEY, JSON.stringify(completed))
      
      console.log('✅ Story marked completed:', {
        storyId,
        totalCompleted: completed.length
      })
    } else {
      console.log('ℹ️ Story already marked as completed:', storyId)
    }
  } catch (error) {
    console.error('❌ Error marking story completed:', error)
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

/**
 * Get the next uncompleted story from the list
 * 
 * @param allStories - Array of all available stories
 * @returns Next uncompleted story, or null if no stories available
 */
export function getNextUncompletedStory(allStories: Story[]): Story | null {
  if (!allStories || allStories.length === 0) {
    console.warn('⚠️ No stories available')
    return null
  }
  
  const completed = getCompletedStories()
  
  // Filter out completed stories
  const remaining = allStories.filter(story => !completed.includes(story.id))
  
  console.log('📊 Story rotation status:', {
    totalStories: allStories.length,
    completedCount: completed.length,
    remainingCount: remaining.length,
    completedIds: completed.slice(-3), // Last 3 completed
  })
  
  // If all completed, clear and start over
  if (remaining.length === 0 && completed.length > 0) {
    console.log('🎉 All stories completed! Starting fresh cycle...')
    clearCompletedStories()
    return allStories[0]
  }
  
  // Return first uncompleted story
  if (remaining.length > 0) {
    console.log('✅ Selected next story:', {
      storyId: remaining[0].id,
      title: remaining[0].title,
      position: allStories.indexOf(remaining[0]) + 1,
      totalStories: allStories.length,
    })
    return remaining[0]
  }
  
  // Fallback: return first story
  return allStories[0]
}

/**
 * Get progress statistics
 */
export function getStoryProgress(allStories: Story[]) {
  const completed = getCompletedStories()
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

