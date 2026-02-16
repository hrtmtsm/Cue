/**
 * Natural Speech Variation Utility
 * 
 * Adds variation to TTS generation to make clips sound like real, imperfect native speech
 * rather than perfect AI-generated audio.
 */

type Difficulty = 'easy' | 'medium' | 'hard'

/**
 * Speech style variations for intimate, soft, mumbled speech
 * Each clip gets a random style to sound like thinking out loud, not clear conversation
 */
const SPEECH_STYLES = [
  "Speak very softly and casually, almost mumbling to yourself. Like you're thinking out loud, not talking to anyone.",
  "Speak in a quiet, intimate voice. Sound like you're whispering your thoughts, not performing for an audience.",
  "Talk softly and quickly, like you're muttering under your breath. Let words blur together naturally.",
  "Speak in a hushed, casual tone. Sound like someone overhearing your private thoughts.",
  "Use a soft, mumbled delivery. Sound like you're talking to yourself while doing something else.",
  "Speak quietly and naturally, like internal monologue spoken aloud. Not trying to be clear or understood.",
  "Speak in a relaxed, soft voice. Like you're half-talking to yourself, half-thinking. Words can run together.",
  "Use a gentle, mumbly tone. Sound like casual self-talk, not prepared speech.",
]

/**
 * Get random speech style instruction for natural variation
 */
export function getRandomSpeechStyle(): string {
  return SPEECH_STYLES[Math.floor(Math.random() * SPEECH_STYLES.length)]
}

/**
 * Get natural, imperfect speech instructions
 * Emphasizes intimate, soft, mumbled speech like thinking out loud
 */
export function getNaturalSpeechInstructions(): string {
  const style = getRandomSpeechStyle()
  return `${style} Don't try to be clearly understood - sound like private thoughts, not public speech. Let words blur and mumble together naturally.`
}

/**
 * Get varied speed based on difficulty
 * Adds randomness to avoid all clips sounding the same
 * 
 * @param difficulty - Clip difficulty level
 * @param variantKey - Optional variant key for additional variation
 * @returns Speed value with natural variation
 */
export function getVariedSpeed(difficulty?: Difficulty, variantKey?: string): number {
  // Base speed ranges by difficulty
  // Faster speeds (1.3-1.5x) help words blur together for mumbled, intimate speech
  const speedRanges: Record<Difficulty, { min: number; max: number }> = {
    easy: { min: 1.1, max: 1.3 },   // Slightly faster for natural blur
    medium: { min: 1.3, max: 1.5 }, // Faster pace to blur words (thinking out loud)
    hard: { min: 1.4, max: 1.7 },   // Fast, blurred speech for advanced
  }
  
  // Default to medium if no difficulty specified
  const range = speedRanges[difficulty || 'medium']
  
  // Add randomness within the range for natural variation
  const baseSpeed = range.min + (Math.random() * (range.max - range.min))
  
  // Round to 2 decimal places for consistency
  return Math.round(baseSpeed * 100) / 100
}

/**
 * Get speed with variant key override (for backward compatibility)
 */
export function getVariedSpeedWithVariant(variantKey: string, difficulty?: Difficulty): number {
  // If variant key specifies speed, use it as base but still add variation
  // Faster speeds help create mumbled, intimate speech
  if (variantKey === 'clean_slow') {
    return 1.1 + (Math.random() * 0.2) // 1.1-1.3 (slightly faster for natural blur)
  } else if (variantKey === 'clean_fast') {
    return 1.4 + (Math.random() * 0.3) // 1.4-1.7
  } else {
    // Use difficulty-based variation
    return getVariedSpeed(difficulty, variantKey)
  }
}

/**
 * Get preferred voices for intimate, soft speech
 * Prefers softer voices like 'shimmer' and 'nova' over clearer ones
 */
export function getIntimateVoice(): string {
  // Weighted selection: prefer softer voices (shimmer, nova) 70% of the time
  const softVoices = ['shimmer', 'nova']
  const otherVoices = ['echo', 'fable']
  
  if (Math.random() < 0.7) {
    // 70% chance: use soft, intimate voices
    return softVoices[Math.floor(Math.random() * softVoices.length)]
  } else {
    // 30% chance: use other voices for variety
    return otherVoices[Math.floor(Math.random() * otherVoices.length)]
  }
}
