/**
 * Audio Processing Utility
 * 
 * Applies natural audio processing to TTS output to make it sound more conversational.
 * 
 * **Current Implementation:**
 * - Speed adjustment via OpenAI's built-in `speed` parameter (1.25-1.5x for natural pace)
 * 
 * **Advanced Effects (require ffmpeg):**
 * - Subtle background noise (~2% volume)
 * - Smooth clip boundaries (crossfade)
 * - EQ adjustment (reduce high frequencies)
 * - Light compression
 * 
 * Note: Advanced effects require ffmpeg binary. For Vercel deployment, consider:
 * - Using a separate audio processing service
 * - Or processing audio client-side using Web Audio API
 * - Or using a serverless function with ffmpeg layer
 */

interface AudioProcessingOptions {
  speed?: number // 1.0 = normal, 1.25-1.5 = natural conversation pace
  variantKey?: string // Used to determine speed if not explicitly set
}

/**
 * Get natural audio processing speed for TTS generation
 * 
 * Returns speed value optimized for natural conversation (1.25-1.5x)
 * This makes TTS sound more like real conversation rather than robotic TOEIC-level speech
 * 
 * @param variantKey - Audio variant key (clean_normal, clean_slow, clean_fast)
 * @returns Speed multiplier (1.0 = normal, 1.25-1.5 = natural conversation)
 */
export function getNaturalConversationSpeed(variantKey: string = 'clean_normal'): number {
  // Speed adjustment optimized for natural conversation
  // OpenAI TTS supports speed parameter directly (0.25x to 4.0x)
  const speedMap: Record<string, number> = {
    'clean_slow': 0.9, // Slightly slower for easier listening
    'clean_fast': 1.35, // Faster for advanced learners
    'clean_normal': 1.25, // Natural conversation pace (faster than TOEIC 1.0)
  }
  
  return speedMap[variantKey] || 1.25
}
