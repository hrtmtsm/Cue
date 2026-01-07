import { UserPreferences, ListeningProfile } from './userPreferences'

export interface GenerationParams {
  difficulty: 'easy' | 'medium' | 'hard'
  speechRate: 'slow' | 'normal' | 'fast'
  naturalness: 'low' | 'medium' | 'high'
  vocabTier: 'simple' | 'standard' | 'advanced'
  sentenceLength: 'short' | 'medium' | 'long'
  focusMix: {
    speed: number
    connected_speech: number
    vocab: number
    parsing: number
  }
}

/**
 * Generate next clip generation parameters based on preferences and profile
 */
export function getNextGenerationParams(
  preferences: UserPreferences,
  profile: ListeningProfile
): GenerationParams {
  // Map tolerance values to difficulty (0-100 -> easy/medium/hard)
  const avgTolerance = (
    profile.speedTolerance +
    profile.reductionTolerance +
    profile.vocabTolerance +
    profile.memoryLoadTolerance
  ) / 4
  
  let difficulty: 'easy' | 'medium' | 'hard'
  if (avgTolerance < 40) {
    difficulty = 'easy'
  } else if (avgTolerance < 70) {
    difficulty = 'medium'
  } else {
    difficulty = 'hard'
  }
  
  // Map speed tolerance to speech rate
  let speechRate: 'slow' | 'normal' | 'fast'
  if (profile.speedTolerance < 40) {
    speechRate = 'slow'
  } else if (profile.speedTolerance < 70) {
    speechRate = 'normal'
  } else {
    speechRate = 'fast'
  }
  
  // Map reduction tolerance to naturalness (more reductions = more natural)
  let naturalness: 'low' | 'medium' | 'high'
  if (profile.reductionTolerance < 40) {
    naturalness = 'low'
  } else if (profile.reductionTolerance < 70) {
    naturalness = 'medium'
  } else {
    naturalness = 'high'
  }
  
  // Map vocab tolerance to vocab tier
  let vocabTier: 'simple' | 'standard' | 'advanced'
  if (profile.vocabTolerance < 40) {
    vocabTier = 'simple'
  } else if (profile.vocabTolerance < 70) {
    vocabTier = 'standard'
  } else {
    vocabTier = 'advanced'
  }
  
  // Map memory load tolerance to sentence length
  let sentenceLength: 'short' | 'medium' | 'long'
  if (profile.memoryLoadTolerance < 40) {
    sentenceLength = 'short'
  } else if (profile.memoryLoadTolerance < 70) {
    sentenceLength = 'medium'
  } else {
    sentenceLength = 'long'
  }
  
  // Generate focus mix based on profile (weights sum to 1.0)
  const focusMix = {
    speed: profile.speedTolerance / 400, // Normalize to 0-0.25 range
    connected_speech: profile.reductionTolerance / 400,
    vocab: profile.vocabTolerance / 400,
    parsing: profile.memoryLoadTolerance / 400,
  }
  
  // Normalize focus mix to sum to 1.0
  const sum = focusMix.speed + focusMix.connected_speech + focusMix.vocab + focusMix.parsing
  if (sum > 0) {
    focusMix.speed /= sum
    focusMix.connected_speech /= sum
    focusMix.vocab /= sum
    focusMix.parsing /= sum
  } else {
    // Default equal weights if all tolerances are 0
    focusMix.speed = 0.25
    focusMix.connected_speech = 0.25
    focusMix.vocab = 0.25
    focusMix.parsing = 0.25
  }
  
  return {
    difficulty,
    speechRate,
    naturalness,
    vocabTier,
    sentenceLength,
    focusMix,
  }
}


