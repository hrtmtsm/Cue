import { OnboardingData } from './onboardingStore'
import { ClipProfile } from './clipTypes'
import { ListeningProfile, UserPreferences } from './userPreferences'
import { getNextGenerationParams } from './clipGenerationParams'

/**
 * Maps onboarding data to clip focus types
 */
export function mapOnboardingToFocus(difficulties: string[]): string[] {
  const focus: string[] = []
  
  if (difficulties.includes('I miss parts when people speak naturally')) {
    focus.push('connected_speech')
  }
  
  if (difficulties.includes('Speech feels too fast to keep up')) {
    focus.push('speed')
  }
  
  if (difficulties.includes('Words sound different from what I expect')) {
    focus.push('connected_speech')
    focus.push('vocab')
  }
  
  if (difficulties.includes('I understand individual words, but not full sentences')) {
    focus.push('parsing')
    focus.push('syntax_load')
  }
  
  if (difficulties.includes('Sentences feel long or confusing')) {
    focus.push('syntax_load')
    focus.push('parsing')
  }
  
  // Default to connected_speech if nothing matches
  if (focus.length === 0) {
    focus.push('connected_speech')
  }
  
  return focus
}

/**
 * Maps topic IDs to target styles (which map to situations)
 */
function mapTopicToTargetStyles(topicId: string): string[] {
  const topicMap: Record<string, string[]> = {
    'work': ['Work & meetings'],
    'casual': ['Everyday conversations', 'Social conversations'],
    'tech': ['Work & meetings', 'Videos & shows'],
    'travel': ['Travel & daily interactions'],
    'culture': ['Videos & shows', 'Social conversations'],
  }
  return topicMap[topicId] || ['Everyday conversations']
}

/**
 * Gets difficulties based on user level
 */
function getDifficultiesForLevel(level?: string): ('easy' | 'medium' | 'hard')[] {
  const levelMap: Record<string, ('easy' | 'medium' | 'hard')[]> = {
    'starting': ['easy'],
    'comfortable': ['easy', 'medium'],
    'confident': ['medium', 'hard'],
    'not-sure': ['easy', 'medium'],
  }
  return levelMap[level || ''] || ['easy', 'medium']
}

/**
 * Creates clip profiles for multiple clips with varied situations
 * Generates 15-24 clips across 3-4 situations to create 5-8 stories
 */
export function createClipProfiles(
  onboardingData: OnboardingData
): ClipProfile[] {
  const focus = mapOnboardingToFocus(onboardingData.listeningDifficulties)
  const profiles: ClipProfile[] = []
  
  // Get user topics (default to casual if none selected)
  const userTopics = onboardingData.topics || ['casual']
  
  // Get all unique target styles from selected topics
  const allTargetStyles = Array.from(new Set(
    userTopics.flatMap(topic => mapTopicToTargetStyles(topic))
  ))
  
  // If preferredGenre is set, prioritize it and add variety
  const baseStyle = onboardingData.preferredGenre
  const targetStyles: string[] = []
  
  if (baseStyle) {
    targetStyles.push(baseStyle)
    // Add 2-3 more styles for variety (excluding the base)
    const otherStyles = allTargetStyles.filter(s => s !== baseStyle)
    targetStyles.push(...otherStyles.slice(0, 3))
  } else {
    // Use styles from topics, ensure at least 3 for variety
    targetStyles.push(...allTargetStyles)
  }
  
  // Ensure at least 3 situations for variety
  const uniqueStyles = Array.from(new Set(targetStyles))
  if (uniqueStyles.length < 3) {
    const allAvailableStyles = [
      'Everyday conversations',
      'Work & meetings',
      'Social conversations',
      'Travel & daily interactions',
      'Videos & shows',
    ]
    const missingStyles = allAvailableStyles.filter(s => !uniqueStyles.includes(s))
    uniqueStyles.push(...missingStyles.slice(0, 3 - uniqueStyles.length))
  }
  
  // Use first 4 styles to generate clips
  const stylesToUse = uniqueStyles.slice(0, 4)
  
  // Get difficulties based on level
  const difficulties = getDifficultiesForLevel(onboardingData.level)
  
  // Generate 2 clips per difficulty per situation = 2 × 2-3 difficulties × 3-4 situations = 12-24 clips
  stylesToUse.forEach((targetStyle) => {
    difficulties.forEach((difficulty) => {
      // Create 2 variations per difficulty per situation
      for (let variation = 1; variation <= 2; variation++) {
        const lengthSec = difficulty === 'easy' ? 10 : difficulty === 'medium' ? 15 : 18
        profiles.push({
          focus,
          targetStyle,
          lengthSec,
          difficulty,
        })
      }
    })
  })
  
  console.log('📋 [createClipProfiles] Created clip profiles:', {
    total: profiles.length,
    situations: Array.from(new Set(profiles.map(p => p.targetStyle))),
    difficulties: Array.from(new Set(profiles.map(p => p.difficulty))),
    clipsPerSituation: stylesToUse.map(style => ({
      style,
      count: profiles.filter(p => p.targetStyle === style).length,
    })),
  })
  
  return profiles
}

/**
 * Select next clip difficulty based on linguistic metrics and profile
 * 
 * Uses linguistic metrics to adaptively adjust difficulty:
 * - If user has severe weaknesses (severity >= 7): select easier clips
 * - If user has moderate weaknesses (severity >= 4): maintain current difficulty
 * - If user is performing well: increase difficulty
 * 
 * Falls back to tolerance-based logic if metrics not available.
 * 
 * @param profile - User's listening profile with metrics
 * @param preferences - User preferences (for fallback logic)
 * @returns Recommended difficulty level
 */
export function selectNextClipDifficulty(
  profile: ListeningProfile,
  preferences?: UserPreferences
): 'easy' | 'medium' | 'hard' {
  // If linguistic metrics available, use weakness-based adaptation
  if (profile.linguisticMetrics && profile.weaknesses && profile.weaknesses.length > 0) {
    const topWeakness = profile.weaknesses[0]
    const eventsAnalyzed = profile.linguisticMetrics.eventsAnalyzed
    
    console.log('📊 [AdaptiveDifficulty] Using linguistic metrics:', {
      topWeakness: topWeakness.type,
      severity: topWeakness.severity,
      eventsAnalyzed,
      description: topWeakness.description,
    })
    
    // Need sufficient data before adjusting difficulty (at least 5 events)
    if (eventsAnalyzed < 5) {
      console.log('📊 [AdaptiveDifficulty] Insufficient data, using fallback')
      return fallbackDifficultySelection(profile, preferences)
    }
    
    // Adaptive logic based on top weakness severity
    if (topWeakness.severity >= 7) {
      // Struggling significantly - recommend easier content
      console.log('📊 [AdaptiveDifficulty] High severity weakness detected → EASY')
      return 'easy'
    } else if (topWeakness.severity >= 4) {
      // Moderate challenges - maintain medium difficulty
      console.log('📊 [AdaptiveDifficulty] Moderate weakness detected → MEDIUM')
      return 'medium'
    } else {
      // Performing well - increase challenge
      console.log('📊 [AdaptiveDifficulty] Low weakness, performing well → HARD')
      return 'hard'
    }
  }
  
  // Fallback to tolerance-based logic if no metrics available
  console.log('📊 [AdaptiveDifficulty] No linguistic metrics, using tolerance-based fallback')
  return fallbackDifficultySelection(profile, preferences)
}

/**
 * Fallback difficulty selection based on tolerance values
 * (existing logic from clipGenerationParams.ts)
 */
function fallbackDifficultySelection(
  profile: ListeningProfile,
  preferences?: UserPreferences
): 'easy' | 'medium' | 'hard' {
  // If we have clipGenerationParams available, use it
  if (preferences) {
    try {
      const params = getNextGenerationParams(preferences, profile)
      return params.difficulty
    } catch (error) {
      console.warn('📊 [AdaptiveDifficulty] Error using getNextGenerationParams:', error)
    }
  }
  
  // Final fallback: use average tolerance
  const avgTolerance = (
    profile.speedTolerance +
    profile.reductionTolerance +
    profile.vocabTolerance +
    profile.memoryLoadTolerance
  ) / 4
  
  if (avgTolerance < 40) {
    return 'easy'
  } else if (avgTolerance < 70) {
    return 'medium'
  } else {
    return 'hard'
  }
}


