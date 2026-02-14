/**
 * Situations configuration for onboarding
 * Defines the UI labels and keys for situation selection
 */

import type { SituationKey } from './onboardingStore'

export interface SituationOption {
  key: SituationKey
  emoji: string
  label: string
  description: string
}

/**
 * Available situations for user selection during onboarding
 * Ordered list of situation options with emojis, labels, and descriptions
 * Focus: WHERE do you want to use English?
 */
export const SITUATION_OPTIONS: SituationOption[] = [
  {
    key: 'work_meetings',
    emoji: '💼',
    label: 'At work',
    description: 'Business meetings, office conversations, professional settings',
  },
  {
    key: 'daily',
    emoji: '💬',
    label: 'With friends & family',
    description: 'Casual hangouts, everyday life, social situations',
  },
  {
    key: 'travel',
    emoji: '✈️',
    label: 'While traveling',
    description: 'Hotels, restaurants, airports, asking for help',
  },
  {
    key: 'videos_shows',
    emoji: '🎬',
    label: 'In movies & shows',
    description: 'TV series, YouTube, podcasts, entertainment',
  },
  {
    key: 'interviews_presentations',
    emoji: '🎤',
    label: 'In formal settings',
    description: 'Interviews, presentations, academic discussions',
  },
  {
    key: 'general',
    emoji: '🌍',
    label: 'Everywhere',
    description: 'I want to practice all situations',
  },
]

/**
 * Maximum number of situations a user can select
 */
export const MAX_SITUATION_SELECTIONS = 3

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

