/**
 * Adaptive Story Generator Module
 * 
 * Phase 2: On-Demand Clip Generation
 * Generates new stories with adaptive difficulty when existing stories are exhausted
 * 
 * Phase 3: Weakness-Targeted Generation
 * Optionally targets specific linguistic weaknesses in generated clips
 */

import { Story } from './storyTypes'
import { Clip, ClipProfile } from './clipTypes'
import { ListeningProfile, UserPreferences } from './userPreferences'
import { OnboardingData } from './onboardingStore'
import { selectNextClipDifficulty } from './clipProfileMapper'
import { mapOnboardingToFocus } from './clipProfileMapper'
import { convertClipsToStories } from './clipToStoryConverter'
import { loadUserStories, saveUserStories } from './storyClient'

/**
 * Generate 4-5 ClipProfiles with the target difficulty for a single story
 * 
 * @param onboardingData - User's onboarding data (may be incomplete)
 * @param difficulty - Target difficulty level
 * @returns Array of ClipProfiles
 */
function createSingleStoryProfiles(
  onboardingData: OnboardingData,
  difficulty: 'easy' | 'medium' | 'hard'
): ClipProfile[] {
  // Handle missing or incomplete onboarding data with sensible defaults
  const listeningDifficulties = onboardingData.listeningDifficulties || ['I miss parts when people speak naturally']
  const focus = mapOnboardingToFocus(listeningDifficulties)
  
  // Get target style from onboarding (preferredGenre or default)
  const targetStyle = onboardingData.preferredGenre || 'Everyday conversations'
  
  // Randomly select 4 or 5 clips per story (matching clipToStoryConverter logic)
  const clipsPerStory = Math.random() < 0.5 ? 4 : 5
  
  // Determine lengthSec based on difficulty
  const lengthSec = difficulty === 'easy' ? 10 : difficulty === 'medium' ? 15 : 18
  
  const profiles: ClipProfile[] = []
  
  for (let i = 0; i < clipsPerStory; i++) {
    profiles.push({
      focus,
      targetStyle,
      lengthSec,
      difficulty,
    })
  }
  
  console.log('📋 [createSingleStoryProfiles] Created profiles:', {
    count: profiles.length,
    difficulty,
    lengthSec,
    targetStyle,
    focus,
  })
  
  return profiles
}

/**
 * Extract relevant patterns from profile.patternMastery based on weakness type
 * 
 * @param weakness - The identified weakness
 * @param profile - User's listening profile
 * @returns Array of pattern keys with low mastery, or undefined
 */
function extractPatternsForWeakness(
  weakness: { type: string; severity: number },
  profile: ListeningProfile
): string[] | undefined {
  // Only extract patterns for phonological weaknesses
  if (weakness.type !== 'phonological') return undefined
  
  // Get patterns with low mastery (< 0.5)
  const lowMasteryPatterns = Object.entries(profile.patternMastery || {})
    .filter(([_, mastery]) => mastery < 0.5)
    .map(([pattern, _]) => pattern)
    .slice(0, 3) // Top 3
  
  console.log('🎯 [extractPatternsForWeakness] Low mastery patterns:', {
    weaknessType: weakness.type,
    severity: weakness.severity,
    patterns: lowMasteryPatterns,
  })
  
  return lowMasteryPatterns.length > 0 ? lowMasteryPatterns : undefined
}

/**
 * Generate a new story with adaptive difficulty
 * 
 * Phase 2: Generates clips based on recommended difficulty
 * Phase 3: Optionally targets specific linguistic weaknesses
 * 
 * @param profile - User's listening profile (can be null for new users)
 * @param preferences - User preferences
 * @param onboardingData - Original onboarding data
 * @param enableWeaknessTargeting - Enable Phase 3 weakness targeting
 * @returns Newly generated story
 */
export async function generateAdaptiveStory(
  profile: ListeningProfile | null,
  preferences: UserPreferences,
  onboardingData: OnboardingData,
  enableWeaknessTargeting: boolean = false
): Promise<Story> {
  console.log('🎬 [generateAdaptiveStory] Starting adaptive story generation...', {
    enableWeaknessTargeting,
    hasProfile: !!profile,
    hasWeaknesses: profile?.weaknesses && profile.weaknesses.length > 0,
  })
  
  // Phase 1: Determine recommended difficulty
  const targetDifficulty = profile 
    ? selectNextClipDifficulty(profile, preferences)
    : 'medium' // Default to medium for new users
  console.log('🎯 [generateAdaptiveStory] Target difficulty:', targetDifficulty)
  
  // Phase 2: Create clip profiles with target difficulty
  const profiles = createSingleStoryProfiles(onboardingData, targetDifficulty)
  
  // Phase 3: Weakness targeting (optional, only if profile exists)
  let targetWeakness = null
  if (enableWeaknessTargeting && profile && profile.weaknesses && profile.weaknesses.length > 0) {
    const topWeakness = profile.weaknesses[0]
    targetWeakness = {
      type: topWeakness.type,
      description: topWeakness.description,
      patterns: extractPatternsForWeakness(topWeakness, profile),
    }
    console.log('🎯 [WeaknessTargeting] Generating clips for:', targetWeakness)
  } else if (enableWeaknessTargeting && !profile) {
    console.log('⚠️ [WeaknessTargeting] Skipped - no profile available (new user)')
  }
  
  // Call /api/clips/generate
  try {
    const response = await fetch('/api/clips/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        onboardingData,
        profiles,
        targetWeakness, // Phase 3: Include weakness targeting
      }),
    })
    
    if (!response.ok) {
      throw new Error(`API returned ${response.status}: ${response.statusText}`)
    }
    
    const clips: Clip[] = await response.json()
    console.log('✅ [generateAdaptiveStory] Generated clips:', {
      count: clips.length,
      clipIds: clips.map(c => c.id),
    })
    
    // Convert clips to stories
    const stories = convertClipsToStories(clips)
    
    if (stories.length === 0) {
      throw new Error('No stories generated from clips')
    }
    
    // Save to localStorage (append to existing stories)
    const existingStories = loadUserStories()
    const updatedStories = [...existingStories, ...stories]
    saveUserStories(updatedStories)
    
    console.log('✅ [generateAdaptiveStory] Story generated and saved:', {
      storyId: stories[0].id,
      title: stories[0].title,
      difficulty: stories[0].difficulty,
      clipCount: stories[0].clips.length,
      totalStoriesNow: updatedStories.length,
    })
    
    return stories[0]
  } catch (error) {
    console.error('❌ [generateAdaptiveStory] Generation failed:', error)
    throw error
  }
}
