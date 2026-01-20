// Simple store for onboarding state
// Can be replaced with Zustand or Context later if needed

export interface OnboardingData {
  listeningDifficulties: string[]
  preferredGenre?: string
  topics?: string[] // Legacy: kept for backward compatibility
  level?: string
  purpose?: string // Legacy: kept for backward compatibility
  tasteTopics?: string[] // Legacy: kept for backward compatibility
  situations?: string[] // New: merged purpose + topics, max 2 selections (work | daily | travel | media | general)
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
  const situations: string[] = []

  // Map tasteTopics first (most recent format)
  if (data.tasteTopics && data.tasteTopics.length > 0) {
    // Map old IDs to new unified IDs
    const idMap: Record<string, string> = {
      'work': 'work',
      'casual': 'daily',
      'travel': 'travel',
      'tech': 'work', // Map tech to work
      'culture': 'general', // Map culture to general
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
    const purposeMap: Record<string, string> = {
      'work': 'work',
      'travel': 'travel',
      'daily': 'daily',
      'videos': 'media',
      'better': 'general',
    }
    const mapped = purposeMap[data.purpose] || 'general'
    situations.push(mapped)
  }

  // Map topics if exists and situations still empty
  if (situations.length === 0 && data.topics && data.topics.length > 0) {
    const topicMap: Record<string, string> = {
      'work': 'work',
      'casual': 'daily',
      'tech': 'work',
      'travel': 'travel',
      'culture': 'general',
    }
    for (const topic of data.topics.slice(0, 2)) {
      const mapped = topicMap[topic] || 'general'
      if (!situations.includes(mapped)) {
        situations.push(mapped)
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


