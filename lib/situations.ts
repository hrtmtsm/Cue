/**
 * Situations configuration for onboarding
 * Defines the UI labels and keys for situation selection
 */

import type { SituationKey } from './onboardingStore'

export interface SituationOption {
  key: SituationKey
  label: string
  description?: string
}

/**
 * Available situations for user selection during onboarding
 * Ordered list of situation options with labels and optional descriptions
 */
export const SITUATION_OPTIONS: SituationOption[] = [
  {
    key: 'work_meetings',
    label: 'Work & meetings',
  },
  {
    key: 'daily',
    label: 'Daily conversations',
  },
  {
    key: 'travel',
    label: 'Travel',
  },
  {
    key: 'videos_shows',
    label: 'Videos & shows',
  },
  {
    key: 'general',
    label: 'Just getting better',
  },
]

/**
 * Maximum number of situations a user can select
 */
export const MAX_SITUATION_SELECTIONS = 2

/**
 * Default situation to use when none is selected
 */
export const DEFAULT_SITUATION: SituationKey = 'general'

/**
 * Get situation option by key
 */
export function getSituationOption(key: SituationKey): SituationOption | undefined {
  return SITUATION_OPTIONS.find(opt => opt.key === key)
}

/**
 * Get situation label by key
 */
export function getSituationLabel(key: SituationKey): string {
  return getSituationOption(key)?.label || key
}

