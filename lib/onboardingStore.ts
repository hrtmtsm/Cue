// Simple store for onboarding state
// Can be replaced with Zustand or Context later if needed

/**
 * SituationKey: Valid situation identifiers for onboarding
 * Ordered array (max 2 selections) represents user's preferred practice contexts
 */
export type SituationKey = 
  | 'work_meetings'
  | 'daily'
  | 'travel'
  | 'videos_shows'
  | 'interviews_presentations'
  | 'general'

export interface OnboardingData {
  listeningDifficulties: string[]
  preferredGenre?: string // Legacy: kept for backward compatibility
  topics?: string[] // Legacy: kept for backward compatibility
  level?: string
  purpose?: string // Legacy: kept for backward compatibility
  tasteTopics?: string[] // Legacy: kept for backward compatibility
  situations?: SituationKey[] // New: max 2 selections, ordered
  version?: number // Optional version field for future migrations
}

let onboardingData: OnboardingData = {
  listeningDifficulties: [],
}

/**
 * Normalize onboarding data: migrate legacy fields to situations
 * Backward compatibility: map purpose/topics/tasteTopics to situations if situations doesn't exist
 */
function normalizeOnboardingData(data: OnboardingData): OnboardingData {
  // If situations already exists, return as-is
  if (data.situations && data.situations.length > 0) {
    return data
  }

  // Legacy migration: convert purpose/topics/tasteTopics to situations
  const situations: SituationKey[] = []

  // Map tasteTopics first (most recent format)
  if (data.tasteTopics && data.tasteTopics.length > 0) {
    // Map old IDs to new SituationKey values
    const idMap: Record<string, SituationKey> = {
      'work': 'work_meetings',
      'casual': 'daily',
      'travel': 'travel',
      'tech': 'work_meetings',
      'culture': 'interviews_presentations',
      'media': 'videos_shows',
    }
    for (const topic of data.tasteTopics) {
      const mapped = idMap[topic] || 'general'
      if (!situations.includes(mapped)) {
        situations.push(mapped)
      }
    }
  }

  // Map purpose if exists and situations still empty
  if (situations.length === 0 && data.purpose) {
    const purposeMap: Record<string, SituationKey> = {
      'work': 'work_meetings',
      'travel': 'travel',
      'daily': 'daily',
      'videos': 'videos_shows',
      'better': 'general',
    }
    const mapped = purposeMap[data.purpose] || 'general'
    situations.push(mapped)
  }

  // Map topics if exists and situations still empty
  if (situations.length === 0 && data.topics && data.topics.length > 0) {
    const topicMap: Record<string, SituationKey> = {
      'work': 'work_meetings',
      'casual': 'daily',
      'tech': 'work_meetings',
      'travel': 'travel',
      'culture': 'interviews_presentations',
    }
    for (const topic of data.topics.slice(0, 2)) {
      const mapped = topicMap[topic] || 'general'
      if (!situations.includes(mapped)) {
        situations.push(mapped)
      }
    }
  }

  // Also handle legacy situations array with old string values (if any)
  if (situations.length === 0 && data.situations && Array.isArray(data.situations)) {
    const legacyMap: Record<string, SituationKey> = {
      'work': 'work_meetings',
      'daily': 'daily',
      'travel': 'travel',
      'media': 'videos_shows',
      'general': 'general',
    }
    for (const legacy of data.situations.slice(0, 2)) {
      const mapped = legacyMap[legacy] || (legacy as SituationKey)
      // Validate it's a valid SituationKey
      if (['work_meetings', 'daily', 'travel', 'videos_shows', 'interviews_presentations', 'general'].includes(mapped)) {
        if (!situations.includes(mapped)) {
          situations.push(mapped)
        }
      }
    }
  }

  // If still empty, return data as-is
  if (situations.length === 0) {
    return data
  }

  // Return normalized data with situations
  return {
    ...data,
    situations: situations.slice(0, 2), // Max 2
  }
}

export const getOnboardingData = (): OnboardingData => {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('onboardingData')
    if (stored) {
      onboardingData = JSON.parse(stored)
      // Normalize legacy data to situations
      onboardingData = normalizeOnboardingData(onboardingData)
    }
  }
  return onboardingData
}

export const setOnboardingData = (data: Partial<OnboardingData>) => {
  onboardingData = { ...onboardingData, ...data }
  if (typeof window !== 'undefined') {
    localStorage.setItem('onboardingData', JSON.stringify(onboardingData))
  }
}

export const clearOnboardingData = () => {
  onboardingData = { listeningDifficulties: [] }
  if (typeof window !== 'undefined') {
    localStorage.removeItem('onboardingData')
  }
}


