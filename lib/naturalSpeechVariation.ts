/**
 * Natural Speech Variation Utility
 * 
 * Adds variation to TTS generation to make clips sound like real, imperfect native speech
 * rather than perfect AI-generated audio.
 */

type Difficulty = 'easy' | 'medium' | 'hard'

/**
 * Speech style variations for natural, imperfect speech
 * Each clip gets a random style to avoid sounding identical
 */
const SPEECH_STYLES = [
  "Speak quickly with words blending together naturally, like real fast speech. Don't enunciate every syllable perfectly - let words run together.",
  "Speak casually, don't enunciate every syllable perfectly. Let contractions and common words blur together naturally.",
  "Speak with natural rhythm, some words can be mumbled slightly. Not every word needs to be crystal clear - be natural.",
  "Speak conversationally, let words run together naturally like native speakers do. Don't articulate every syllable clearly.",
  "Speak like you're in a real conversation - words can blend, some syllables can be softer. Be natural, not perfect.",
  "Speak quickly and casually. Let words flow together - don't make every boundary clear. Sound like real speech, not reading.",
]

/**
 * Get random speech style instruction for natural variation
 */
export function getRandomSpeechStyle(): string {
  return SPEECH_STYLES[Math.floor(Math.random() * SPEECH_STYLES.length)]
}

/**
 * Get natural, imperfect speech instructions
 * Emphasizes that speech should NOT be perfect
 */
export function getNaturalSpeechInstructions(): string {
  const style = getRandomSpeechStyle()
  return `${style} Speak like real conversation - NOT perfectly enunciated reading. Let words run together naturally like native speakers do. Don't articulate every syllable clearly - be natural and casual.`
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
  const speedRanges: Record<Difficulty, { min: number; max: number }> = {
    easy: { min: 1.0, max: 1.2 },   // Slower, clearer for easier listening
    medium: { min: 1.2, max: 1.4 }, // Normal conversation pace
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
  if (variantKey === 'clean_slow') {
    return 1.0 + (Math.random() * 0.2) // 1.0-1.2
  } else if (variantKey === 'clean_fast') {
    return 1.4 + (Math.random() * 0.3) // 1.4-1.7
  } else {
    // Use difficulty-based variation
    return getVariedSpeed(difficulty, variantKey)
  }
}
