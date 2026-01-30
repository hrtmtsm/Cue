/**
 * Situation Mapping Utility
 * Maps between onboarding SituationKey and database clip situation values
 */

import { type SituationKey } from './onboardingStore'

/**
 * Map onboarding SituationKey to database clip situation
 * 
 * Onboarding uses: work_meetings, daily, travel, videos_shows, interviews_presentations, general
 * Database uses: work, daily, travel, media, formal
 */
export function mapSituationKeyToClipSituation(situationKey: SituationKey): string {
  const mapping: Record<SituationKey, string> = {
    'work_meetings': 'work',
    'daily': 'daily',
    'travel': 'travel',
    'videos_shows': 'media',
    'interviews_presentations': 'formal',
    'general': 'daily', // Default to daily for general
  }
  
  return mapping[situationKey] || 'daily'
}

/**
 * Map database clip situation to onboarding SituationKey
 * (Reverse mapping for backward compatibility)
 */
export function mapClipSituationToSituationKey(clipSituation: string): SituationKey {
  const reverseMapping: Record<string, SituationKey> = {
    'work': 'work_meetings',
    'daily': 'daily',
    'travel': 'travel',
    'media': 'videos_shows',
    'formal': 'interviews_presentations',
  }
  
  return reverseMapping[clipSituation] || 'daily'
}

/**
 * Map database clip situation to user-friendly display name
 */
export function mapClipSituationToDisplayName(clipSituation: string): string {
  const displayNames: Record<string, string> = {
    'work': 'Work',
    'daily': 'Daily Life',
    'travel': 'Travel',
    'media': 'Videos & Shows',
    'formal': 'Formal Settings',
  }
  
  return displayNames[clipSituation] || 'Daily Life'
}

/**
 * Get all valid clip situation values
 */
export const VALID_CLIP_SITUATIONS = ['work', 'daily', 'travel', 'media', 'formal'] as const

export type ClipSituation = typeof VALID_CLIP_SITUATIONS[number]


