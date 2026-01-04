export type UserLevel = 'Beginner' | 'Intermediate' | 'Advanced' | 'Not sure'

export interface UserPreferences {
  language?: string
  userLevel?: UserLevel
  listeningDifficulties: string[]
  preferredGenre?: string
}

export interface ListeningProfile {
  speedTolerance: number // 0..100
  reductionTolerance: number // 0..100
  vocabTolerance: number // 0..100
  memoryLoadTolerance: number // 0..100
  confidence: number // 0..100
  lastUpdatedAt: string // ISO timestamp
}

export interface PracticeEvent {
  clipId: string
  timestamp: string // ISO timestamp
  replays: number
  timeToSubmitMs: number
  accuracyScore: number // 0..1
  gaveUp: boolean
  revealedTranscript: boolean
  device?: string
}

const PREFERENCES_KEY = 'userPreferences'
const LISTENING_PROFILE_KEY = 'listeningProfile'
const PRACTICE_EVENTS_KEY = 'practiceEvents'
const MAX_EVENTS = 50

/**
 * Initialize listening profile based on user level
 */
export function initializeListeningProfile(userLevel?: UserLevel): ListeningProfile {
  const now = new Date().toISOString()
  
  switch (userLevel) {
    case 'Beginner':
      return {
        speedTolerance: 30,
        reductionTolerance: 25,
        vocabTolerance: 30,
        memoryLoadTolerance: 35,
        confidence: 40,
        lastUpdatedAt: now,
      }
    case 'Intermediate':
      return {
        speedTolerance: 60,
        reductionTolerance: 55,
        vocabTolerance: 60,
        memoryLoadTolerance: 65,
        confidence: 65,
        lastUpdatedAt: now,
      }
    case 'Advanced':
      return {
        speedTolerance: 85,
        reductionTolerance: 80,
        vocabTolerance: 85,
        memoryLoadTolerance: 90,
        confidence: 85,
        lastUpdatedAt: now,
      }
    case 'Not sure':
    default:
      return {
        speedTolerance: 50,
        reductionTolerance: 50,
        vocabTolerance: 50,
        memoryLoadTolerance: 50,
        confidence: 50,
        lastUpdatedAt: now,
      }
  }
}

/**
 * Get user preferences from localStorage
 */
export function getUserPreferences(): UserPreferences | null {
  if (typeof window === 'undefined') return null
  
  try {
    const stored = localStorage.getItem(PREFERENCES_KEY)
    if (!stored) return null
    return JSON.parse(stored)
  } catch (error) {
    console.error('Error loading user preferences:', error)
    return null
  }
}

/**
 * Save user preferences to localStorage
 */
export function setUserPreferences(preferences: UserPreferences): void {
  if (typeof window === 'undefined') return
  
  try {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences))
    
    // Initialize listening profile if it doesn't exist
    if (!getListeningProfile()) {
      const profile = initializeListeningProfile(preferences.userLevel)
      setListeningProfile(profile)
    }
  } catch (error) {
    console.error('Error saving user preferences:', error)
  }
}

/**
 * Get listening profile from localStorage
 */
export function getListeningProfile(): ListeningProfile | null {
  if (typeof window === 'undefined') return null
  
  try {
    const stored = localStorage.getItem(LISTENING_PROFILE_KEY)
    if (!stored) return null
    return JSON.parse(stored)
  } catch (error) {
    console.error('Error loading listening profile:', error)
    return null
  }
}

/**
 * Get or initialize listening profile
 */
export function getOrInitializeListeningProfile(userLevel?: UserLevel): ListeningProfile {
  const existing = getListeningProfile()
  if (existing) return existing
  
  const profile = initializeListeningProfile(userLevel)
  setListeningProfile(profile)
  return profile
}

/**
 * Save listening profile to localStorage
 */
export function setListeningProfile(profile: ListeningProfile): void {
  if (typeof window === 'undefined') return
  
  try {
    localStorage.setItem(LISTENING_PROFILE_KEY, JSON.stringify(profile))
  } catch (error) {
    console.error('Error saving listening profile:', error)
  }
}

/**
 * Get practice events from localStorage
 */
export function getPracticeEvents(): PracticeEvent[] {
  if (typeof window === 'undefined') return []
  
  try {
    const stored = localStorage.getItem(PRACTICE_EVENTS_KEY)
    if (!stored) return []
    const events = JSON.parse(stored) as PracticeEvent[]
    return events.slice(-MAX_EVENTS) // Keep only last MAX_EVENTS
  } catch (error) {
    console.error('Error loading practice events:', error)
    return []
  }
}

/**
 * Add a practice event to localStorage
 */
export function addPracticeEvent(event: PracticeEvent): void {
  if (typeof window === 'undefined') return
  
  try {
    const events = getPracticeEvents()
    events.push(event)
    
    // Keep only last MAX_EVENTS
    const trimmed = events.slice(-MAX_EVENTS)
    localStorage.setItem(PRACTICE_EVENTS_KEY, JSON.stringify(trimmed))
  } catch (error) {
    console.error('Error saving practice event:', error)
  }
}

