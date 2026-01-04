import { ClipProfile } from './clipTypes'
import { Situation } from './clipTypes'
import { mapTargetStyleToSituation } from './situationMapper'

interface TitleGenerationParams {
  difficulty: 'easy' | 'medium' | 'hard'
  focus: string[]
  targetStyle?: string
  seed: string // clip.id or createdAt for deterministic variation
  usedTitles?: Set<string> // Track used titles to avoid repeats
}

// Situational title pools organized by situation (context/scene labels)
const situationTitlePools: Record<Situation, string[]> = {
  'Work': [
    'Talking with a coworker',
    'Quick chat at work',
    'Catching up after work',
    'In the office',
    'During a meeting',
    'Between meetings',
    'At the water cooler',
    'After the presentation',
    'Before the call',
    'In the hallway',
    'Team standup',
    'Client conversation',
  ],
  'Daily Life': [
    'At the store',
    'Running errands',
    'Around the house',
    'Daily routine',
    'Morning chat',
    'Evening conversation',
    'Neighborhood talk',
    'Casual check-in',
    'Quick exchange',
    'Everyday moment',
    'Regular day',
    'Normal conversation',
  ],
  'Social': [
    'Catching up',
    'Friend conversation',
    'Getting together',
    'Casual hangout',
    'Weekend chat',
    'Social gathering',
    'Friend catch-up',
    'Relaxed conversation',
    'Informal talk',
    'Social moment',
    'With friends',
    'Hanging out',
  ],
  'Travel': [
    'At the airport',
    'Hotel check-in',
    'On the road',
    'Travel conversation',
    'Exploring the city',
    'At a cafe',
    'Tourist moment',
    'Traveling abroad',
    'Local interaction',
    'In a new place',
    'Navigating around',
    'Trip planning',
  ],
  'Media': [
    'Watching together',
    'Show discussion',
    'Video commentary',
    'Media conversation',
    'Content review',
    'Entertainment chat',
    'Watching a show',
    'Video moment',
    'Stream discussion',
    'Media moment',
    'Content talk',
    'Entertainment talk',
  ],
}

/**
 * Generate a situational title for a clip based on situation context.
 * Titles describe the scene/context, not the spoken content.
 */
export function generateSituationalTitle({
  difficulty,
  focus,
  targetStyle,
  seed,
  usedTitles = new Set(),
}: TitleGenerationParams): string {
  // Map targetStyle to situation
  const situation = mapTargetStyleToSituation(targetStyle || 'Everyday conversations')
  
  // Get title pool for this situation
  const titlePool = situationTitlePools[situation] || situationTitlePools['Daily Life']
  
  // Filter out already used titles
  const availableTitles = titlePool.filter(title => !usedTitles.has(title))
  
  // If all titles are used, reset (shouldn't happen with 12 titles per situation)
  const poolToUse = availableTitles.length > 0 ? availableTitles : titlePool
  
  // Use seed to deterministically pick a title
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }
  
  const titleIndex = Math.abs(hash) % poolToUse.length
  const selectedTitle = poolToUse[titleIndex]
  
  // Mark as used
  usedTitles.add(selectedTitle)
  
  return selectedTitle
}

/**
 * Generate titles for multiple clips, ensuring uniqueness across the batch.
 */
export function generateTitlesForClips(
  clips: Array<{ id: string; difficulty?: 'easy' | 'medium' | 'hard'; focus: string[]; targetStyle?: string }>
): Map<string, string> {
  const usedTitles = new Set<string>()
  const titleMap = new Map<string, string>()

  // Sort by difficulty to ensure good distribution
  const sortedClips = [...clips].sort((a, b) => {
    const order = { easy: 0, medium: 1, hard: 2 }
    return (order[a.difficulty || 'medium']) - (order[b.difficulty || 'medium'])
  })

  for (const clip of sortedClips) {
    const title = generateSituationalTitle({
      difficulty: clip.difficulty || 'medium',
      focus: clip.focus || [],
      targetStyle: clip.targetStyle,
      seed: clip.id,
      usedTitles,
    })
    titleMap.set(clip.id, title)
  }

  return titleMap
}
