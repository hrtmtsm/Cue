import { OnboardingData } from './onboardingStore'
import { ClipProfile } from './clipTypes'

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
 * Creates clip profiles for easy, medium, and hard clips based on onboarding data
 */
export function createClipProfiles(
  onboardingData: OnboardingData
): ClipProfile[] {
  const focus = mapOnboardingToFocus(onboardingData.listeningDifficulties)
  const targetStyle = onboardingData.preferredGenre || 'Everyday conversations'
  
  return [
    {
      focus,
      targetStyle,
      lengthSec: 10,
      difficulty: 'easy',
    },
    {
      focus,
      targetStyle,
      lengthSec: 15,
      difficulty: 'medium',
    },
    {
      focus,
      targetStyle,
      lengthSec: 18,
      difficulty: 'hard',
    },
  ]
}

