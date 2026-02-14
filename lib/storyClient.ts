import { Story, StoryClip } from './storyTypes'
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
 * 2) mockStories fallback (for onboarding/dev only)
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

  // 2) Fallback to mock stories (for onboarding/dev only)
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

/**
 * DB-only story lookup for practice/review flows.
 * Returns ONLY user stories (DB-backed), never mock stories.
 * Use this for /practice and /practice/review pages.
 */
export function getStoryByIdClientDbOnly(storyId: string): { story: Story | null; source: 'user' | 'none' } {
  if (!storyId) return { story: null, source: 'none' }

  // Only return user stories (DB-backed)
  const userStories = loadUserStories()
  if (userStories.length > 0) {
    const fromUser = userStories.find(s => s.id === storyId) || null
    if (fromUser) {
      console.log('✅ [StoryClient] getStoryByIdClientDbOnly -> USER stories', {
        storyId,
        title: fromUser.title,
        clipCount: fromUser.clips.length,
      })
      return { story: fromUser, source: 'user' }
    }
  }

  console.warn('⚠️ [StoryClient] getStoryByIdClientDbOnly -> NOT FOUND in user stories (DB-backed only)', { storyId })
  return { story: null, source: 'none' }
}

/**
 * Lookup DB clip ID by transcript from curated_clips
 * Used to enrich mock story clips with dbClipId for chunk lookup
 */
export async function lookupClipIdByTranscript(transcript: string): Promise<string | null> {
  if (!transcript || !transcript.trim()) return null

  try {
    const response = await fetch('/api/clips/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript: transcript.trim() }),
    })

    if (!response.ok) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('⚠️ [StoryClient] lookupClipIdByTranscript failed:', response.status)
      }
      return null
    }

    const data = await response.json()
    return data.clipId || null
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('⚠️ [StoryClient] lookupClipIdByTranscript error:', error)
    }
    return null
  }
}

/**
 * Enrich mock story clips with dbClipId by looking up transcripts in curated_clips
 * Only enriches clips that don't already have dbClipId set
 */
export async function enrichStoryClipsWithDbClipId(story: Story): Promise<Story> {
  if (!story || !story.clips || story.clips.length === 0) return story

  // Check if any clips need enrichment
  const needsEnrichment = story.clips.some(clip => !clip.dbClipId && clip.transcript)
  if (!needsEnrichment) return story

  // Enrich clips in parallel (with rate limiting)
  const enrichedClips: StoryClip[] = await Promise.all(
    story.clips.map(async (clip) => {
      // If already has dbClipId, keep it
      if (clip.dbClipId) return clip

      // Lookup dbClipId by transcript
      const dbClipId = await lookupClipIdByTranscript(clip.transcript)
      if (dbClipId) {
        if (process.env.NODE_ENV === 'development') {
          console.log('✅ [StoryClient] Enriched clip with dbClipId:', {
            clipId: clip.id,
            dbClipId,
            transcript: clip.transcript.substring(0, 30) + '...',
          })
        }
        return { ...clip, dbClipId }
      }

      // If not found, keep original clip (will show warning later)
      if (process.env.NODE_ENV === 'development') {
        console.warn('⚠️ [StoryClient] Could not find dbClipId for clip:', {
          clipId: clip.id,
          transcript: clip.transcript.substring(0, 30) + '...',
        })
      }
      return clip
    })
  )

  return { ...story, clips: enrichedClips }
}



