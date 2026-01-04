import { Situation } from './clipTypes'

/**
 * Maps targetStyle (from onboarding/clip profile) to Situation badge.
 * This mapping ensures situation badges are categorical and don't leak content.
 * 
 * Mapping rules:
 * - "Work & meetings" -> "Work"
 * - "Everyday conversations" -> "Daily Life"
 * - "Social conversations" -> "Social"
 * - "Travel & daily interactions" -> "Travel"
 * - "Videos & shows" -> "Media"
 */
export function mapTargetStyleToSituation(targetStyle: string): Situation {
  const normalized = targetStyle.toLowerCase().trim()
  
  // Map common targetStyle values to situation categories
  if (normalized.includes('work') || normalized.includes('meeting')) {
    return 'Work'
  }
  
  if (normalized.includes('social') || normalized.includes('casual')) {
    return 'Social'
  }
  
  if (normalized.includes('travel')) {
    return 'Travel'
  }
  
  if (normalized.includes('video') || normalized.includes('show') || normalized.includes('media')) {
    return 'Media'
  }
  
  // Default to "Daily Life" for "Everyday conversations" and other general cases
  return 'Daily Life'
}

