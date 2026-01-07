import { Clip } from './clipTypes'
import { Story, StoryClip } from './storyTypes'

/**
 * Convert user-generated clips into stories
 * Groups clips logically by situation/theme or creates stories from sequential clips
 */
export function convertClipsToStories(clips: Clip[]): Story[] {
  if (!clips || clips.length === 0) {
    return []
  }

  console.log('📚 [convertClipsToStories] Starting conversion:', {
    totalClips: clips.length,
    situations: Array.from(new Set(clips.map(c => c.situation || 'Daily Life'))),
  })

  const stories: Story[] = []
  
  // Strategy: Group clips by situation, then create stories from groups
  // If situation doesn't exist or we have few clips, create stories from sequential clips
  
  // Group by situation
  const clipsBySituation = new Map<string, Clip[]>()
  for (const clip of clips) {
    const situation = clip.situation || 'Daily Life'
    if (!clipsBySituation.has(situation)) {
      clipsBySituation.set(situation, [])
    }
    clipsBySituation.get(situation)!.push(clip)
  }
  
  console.log('📚 [convertClipsToStories] Grouped by situation:', {
    situationCount: clipsBySituation.size,
    clipsPerSituation: Array.from(clipsBySituation.entries()).map(([sit, clips]) => ({
      situation: sit,
      count: clips.length,
    })),
  })
  
  let storyIndex = 1
  
  // Create stories from grouped clips
  for (const [situation, situationClips] of Array.from(clipsBySituation.entries())) {
    // Split situation clips into groups of 3 clips per story (changed from 5 for better distribution)
    const clipsPerStory = 3
    console.log(`📚 [convertClipsToStories] Processing situation "${situation}":`, {
      clipsInSituation: situationClips.length,
      clipsPerStory,
      expectedStories: Math.ceil(situationClips.length / clipsPerStory),
    })
    for (let i = 0; i < situationClips.length; i += clipsPerStory) {
      const storyClips = situationClips.slice(i, i + clipsPerStory)
      
      // Convert clips to StoryClip format
      const storyClipsConverted: StoryClip[] = storyClips.map((clip, index) => {
        // Calculate approximate time ranges (assuming average speaking rate)
        const startMs = index * 15000 // ~15 seconds per clip
        const endMs = startMs + (clip.lengthSec * 1000)
        
        return {
          id: clip.id,
          startMs,
          endMs,
          transcript: clip.text,
          audioUrl: clip.audioUrl,
          audioStatus: clip.audioUrl ? 'ready' : 'needs_generation',
          focusSkill: clip.focus?.[0] || 'connected_speech',
        }
      })
      
      // Calculate total duration
      const durationSec = storyClips.reduce((sum, clip) => sum + clip.lengthSec, 0)
      
      // Determine difficulty (most common in clips, or medium)
      const difficulties = storyClips.map(c => c.difficulty || 'medium')
      const difficultyCounts = difficulties.reduce((acc, d) => {
        acc[d] = (acc[d] || 0) + 1
        return acc
      }, {} as Record<string, number>)
      const mostCommonDifficulty = Object.entries(difficultyCounts)
        .sort((a, b) => b[1] - a[1])[0]?.[0] as 'easy' | 'medium' | 'hard' || 'medium'
      
      // Generate story title from situation and first clip
      const storyTitle = generateStoryTitle(situation, storyClips[0])
      
      // Generate context from situation
      const context = generateStoryContext(situation, storyClips.length)
      
      // Generate tags from situation and focus skills
      const tags = [situation]
      const focusSkills = new Set(storyClips.map(c => c.focus?.[0]).filter(Boolean))
      focusSkills.forEach(skill => {
        if (skill === 'connected_speech') tags.push('Connected Speech')
        if (skill === 'speed') tags.push('Speed')
        if (skill === 'vocab') tags.push('Vocabulary')
      })
      
      stories.push({
        id: `user-story-${storyIndex}`,
        title: storyTitle,
        context,
        tags,
        difficulty: mostCommonDifficulty,
        durationSec,
        clips: storyClipsConverted,
        situation: situation as any,
      })
      
      console.log(`📚 [convertClipsToStories] Created story ${storyIndex}:`, {
        id: `user-story-${storyIndex}`,
        title: storyTitle,
        clipCount: storyClipsConverted.length,
        situation,
      })
      
      storyIndex++
    }
  }
  
  console.log('📚 [convertClipsToStories] Total stories created:', stories.length)
  
  // If no clips were grouped, create a single story from all clips
  if (stories.length === 0 && clips.length > 0) {
    const storyClipsConverted: StoryClip[] = clips.map((clip, index) => {
      const startMs = index * 15000
      const endMs = startMs + (clip.lengthSec * 1000)
      
      return {
        id: clip.id,
        startMs,
        endMs,
        transcript: clip.text,
        audioUrl: clip.audioUrl,
        audioStatus: clip.audioUrl ? 'ready' : 'needs_generation',
        focusSkill: clip.focus?.[0] || 'connected_speech',
      }
    })
    
    const durationSec = clips.reduce((sum, clip) => sum + clip.lengthSec, 0)
    const difficulties = clips.map(c => c.difficulty || 'medium')
    const difficultyCounts = difficulties.reduce((acc, d) => {
      acc[d] = (acc[d] || 0) + 1
      return acc
    }, {} as Record<string, number>)
    const mostCommonDifficulty = Object.entries(difficultyCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0] as 'easy' | 'medium' | 'hard' || 'medium'
    
    stories.push({
      id: 'user-story-1',
      title: 'Your Practice Story',
      context: `Practice with ${clips.length} personalized clips based on your preferences.`,
      tags: [clips[0]?.situation || 'Daily Life'],
      difficulty: mostCommonDifficulty,
      durationSec,
      clips: storyClipsConverted,
      situation: clips[0]?.situation || 'Daily Life',
    })
  }
  
  return stories
}

function generateStoryTitle(situation: string, firstClip: Clip): string {
  const situationTitles: Record<string, string> = {
    'Work': 'Work Conversation',
    'Daily Life': 'Daily Conversation',
    'Social': 'Social Chat',
    'Travel': 'Travel Talk',
    'Media': 'Media Discussion',
  }
  
  return situationTitles[situation] || 'Practice Conversation'
}

function generateStoryContext(situation: string, clipCount: number): string {
  const situationContexts: Record<string, string> = {
    'Work': `Practice with ${clipCount} clips from work conversations. These clips focus on professional communication and common workplace phrases.`,
    'Daily Life': `Practice with ${clipCount} clips from everyday conversations. These clips help you understand natural speech in daily situations.`,
    'Social': `Practice with ${clipCount} clips from social interactions. These clips focus on casual conversations and friendly exchanges.`,
    'Travel': `Practice with ${clipCount} clips from travel situations. These clips help you navigate conversations while traveling.`,
    'Media': `Practice with ${clipCount} clips from media discussions. These clips focus on conversations about entertainment and media.`,
  }
  
  return situationContexts[situation] || `Practice with ${clipCount} personalized clips based on your preferences.`
}

