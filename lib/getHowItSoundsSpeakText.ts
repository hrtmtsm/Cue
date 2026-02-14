/**
 * Generate the text to speak for "How it sounds" section
 * This must be card-specific and never use parent context
 */

interface InsightCard {
  missed_text: string
  heard_text?: string | null
  sound_hint?: string // DISPLAY ONLY - never used for TTS
  how_it_sounds?: {
    compact?: string
    tts_text?: string
    speaking_rate?: number
  }
  example?: {
    text?: string
    tts_text?: string
    speaking_rate?: number
  }
  howItSoundsSpeakText?: string // Explicit speak text (card-scoped only) - HIGHEST PRIORITY
  exampleSpeakText?: string // Explicit example speak text (card-scoped only) - HIGHEST PRIORITY
  display_chunk?: string
  missed_token?: string // Original token (not expanded chunk)
  eventType?: string
}

/**
 * Get the text to speak for "How it sounds" section
 * 
 * HARD REQUIREMENT: Must speak ONLY card-scoped text.
 * - NEVER prepend stressLine, phrase context, or template explanations
 * - NEVER include words from other cards (e.g., "reservation" when card is for "a")
 * - NEVER use sound_hint (tipLine) as it may reference other words
 * 
 * Rules:
 * - PRIORITY 1: If howItSoundsSpeakText is explicitly set, use it (highest priority)
 * - PRIORITY 2: For single weak-form words (to, a, the): Use simple descriptive sentence
 * - PRIORITY 3: For other words: Use missed_text + howItSoundsDisplay ONLY (NO tipLine)
 * - Fallback: Use the missed_text itself
 */
export function getHowItSoundsSpeakText(card: InsightCard): string {
  // PRIORITY 1: Use explicitly set speak text (card-scoped, no mixing)
  if (card.howItSoundsSpeakText) {
    return card.howItSoundsSpeakText
  }
  
  // CRITICAL: Use missed_token (original token) if available, otherwise missed_text
  // This ensures we use "a" not "a reservation" for TTS
  const missedText = card.missed_token || card.missed_text || card.display_chunk || ''
  const normalized = missedText.toLowerCase().trim()
  
  // PRIORITY 2: Single weak-form words - speak just the word naturally
  // These will be pronounced as their reduced forms naturally by TTS
  if (normalized === 'to') {
    return 'to'  // Will be spoken naturally as "tuh"
  }
  
  if (normalized === 'a') {
    return 'a'  // Will be spoken naturally as "uh"
  }
  
  if (normalized === 'an') {
    return 'an'  // Will be spoken naturally as "uhn"
  }
  
  if (normalized === 'the') {
    return 'the'  // Will be spoken naturally as "thuh"
  }
  
  if (normalized === 'of') {
    return 'of'  // Will be spoken naturally as "uhv"
  }
  
  if (normalized === 'for') {
    return 'for'  // Will be spoken naturally as "fer"
  }
  
  // PRIORITY 3: For other words, use missed_text + howItSoundsDisplay ONLY
  // DO NOT use sound_hint (tipLine) as it may reference other words like "reservation"
  const howItSoundsDisplay = card.how_it_sounds?.compact || ''
  
  if (howItSoundsDisplay && howItSoundsDisplay !== normalized && howItSoundsDisplay !== missedText.toLowerCase()) {
    // Only combine if display is different from missed text
    return `${missedText} sounds like "${howItSoundsDisplay}".`
  }
  
  // Fallback: just the missed text (card-scoped)
  return missedText
}

/**
 * Get the text to speak for "One example" section
 * 
 * HARD REQUIREMENT: Must speak ONLY card.exampleSpeakText if set.
 */
export function getExampleSpeakText(card: InsightCard): string {
  // PRIORITY 1: Use explicitly set speak text
  if (card.exampleSpeakText) {
    return card.exampleSpeakText
  }
  
  // PRIORITY 2: Use example.tts_text if available
  if (card.example?.tts_text) {
    return card.example.tts_text
  }
  
  // PRIORITY 3: Use example.text
  if (card.example?.text) {
    return card.example.text
  }
  
  return ''
}
