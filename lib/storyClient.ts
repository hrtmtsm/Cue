import { Story } from './storyTypes'
import { mockStories } from './mockStoryData'

/**
 * Client-side helpers for loading and saving user stories.
 * These use localStorage for caching only – correctness comes from the
 * underlying clip/audio pipeline.
 */

const USER_STORIES_KEY = 'userStories'

export function loadUserStories(): Story[] {
  if (typeof window === 'undefined') return []

  try {
    const stored = window.localStorage.getItem(USER_STORIES_KEY)
    if (!stored) return []

    const parsed = JSON.parse(stored)
    if (!Array.isArray(parsed)) return []

    return parsed as Story[]
  } catch (error) {
    console.error('❌ [StoryClient] Error loading userStories from localStorage:', error)
    return []
  }
}

export function saveUserStories(stories: Story[]): void {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(USER_STORIES_KEY, JSON.stringify(stories))
    console.log('✅ [StoryClient] Saved userStories to localStorage:', {
      storyCount: stories.length,
      storyIds: stories.map(s => s.id),
    })
  } catch (error) {
    console.error('❌ [StoryClient] Error saving userStories to localStorage:', error)
  }
}

/**
 * Unified story lookup used by story detail and respond pages.
 * Priority:
 * 1) userStories from localStorage (personalized stories)
 * 2) mockStories fallback
 */
export function getStoryByIdClient(storyId: string): { story: Story | null; source: 'user' | 'mock' | 'none' } {
  if (!storyId) return { story: null, source: 'none' }

  // 1) Try user stories (personalized)
  const userStories = loadUserStories()
  if (userStories.length > 0) {
    const fromUser = userStories.find(s => s.id === storyId) || null
    if (fromUser) {
      console.log('✅ [StoryClient] getStoryById -> USER stories', {
        storyId,
        title: fromUser.title,
        clipCount: fromUser.clips.length,
      })
      return { story: fromUser, source: 'user' }
    }
  }

  // 2) Fallback to mock stories
  const fromMock = mockStories.find(s => s.id === storyId) || null
  if (fromMock) {
    console.log('✅ [StoryClient] getStoryById -> MOCK stories', {
      storyId,
      title: fromMock.title,
      clipCount: fromMock.clips.length,
    })
    return { story: fromMock, source: 'mock' }
  }

  console.warn('⚠️ [StoryClient] getStoryById -> NOT FOUND in user or mock stories', { storyId })
  return { story: null, source: 'none' }
}



