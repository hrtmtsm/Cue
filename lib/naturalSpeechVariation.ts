/**
 * Natural Speech Variation Utility
 * 
 * Adds variation to TTS generation to make clips sound like real, imperfect native speech
 * rather than perfect AI-generated audio.
 */

type Difficulty = 'easy' | 'medium' | 'hard'

/**
 * Subtle speech instructions to avoid over-emphasis
 * Simple, natural instructions that don't make OpenAI overcompensate
 */
const SUBTLE_INSTRUCTIONS = [
  "Speak naturally.",
  "Use a relaxed, conversational tone.",
  "Speak at a comfortable pace.",
  "Talk casually and smoothly.",
]

/**
 * Get natural speech instructions with subtle approach
 * 50% chance: No instructions (let model be natural)
 * 50% chance: Simple, subtle instruction
 * This prevents over-emphasis and makes it sound genuinely natural
 */
export function getNaturalSpeechInstructions(): string {
  // 50% chance: No instructions at all (let the model be natural)
  if (Math.random() < 0.5) {
    return ""
  }
  
  // 50% chance: Simple, subtle instruction
  const instruction = SUBTLE_INSTRUCTIONS[Math.floor(Math.random() * SUBTLE_INSTRUCTIONS.length)]
  return instruction
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
