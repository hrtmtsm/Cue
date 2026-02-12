/**
 * Formats text to stress-based representation for "How it sounds" display.
 * Uses readable stress cues over fake phonetics.
 * 
 * Examples:
 * - "tonight" -> "tuh-NIGHT"
 * - "the train" -> "thuh-TRAIN"
 * - "to get to" -> "tuh-GET-tuh"
 * 
 * @param expectedText The expected text to format
 * @returns Formatted string with stress markers
 */
export function formatHowItSounds(expectedText: string): string {
  if (!expectedText || !expectedText.trim()) {
    return expectedText
  }

  const text = expectedText.trim().toLowerCase()
  const words = text.split(/\s+/)

  // Stress patterns for common words
  const stressPatterns: Record<string, string> = {
    'tonight': 'tuh-NIGHT',
    'today': 'tuh-DAY',
    'tomorrow': 'tuh-MOR-row',
    'together': 'tuh-GETH-er',
    'the': 'thuh',
    'to': 'tuh',
    'get': 'GET',
    'train': 'TRAIN',
    'station': 'STAY-shun',
    'light': 'LIGHT',
    'right': 'RIGHT',
    'night': 'NIGHT',
    'might': 'MIGHT',
  }

  // Check if entire text matches a pattern
  if (stressPatterns[text]) {
    return stressPatterns[text]
  }

  // Multi-word: reduce function words, stress content words
  if (words.length > 1) {
    const formatted = words.map((w, i) => {
      // Function words get reduced
      if (w === 'the') return 'thuh'
      if (w === 'to') return 'tuh'
      if (w === 'of') return 'uhv'
      if (w === 'a') return 'uh'
      if (w === 'an') return 'uhn'
      if (w === 'and') return 'n'
      if (w === 'at') return 'uht'
      if (w === 'for') return 'fer'
      if (w === 'but') return 'buht'
      
      // Content words get stressed (usually last word or first content word)
      const isLastWord = i === words.length - 1
      const isFirstContentWord = i > 0 && ['the', 'to', 'of', 'a', 'an', 'and'].includes(words[i - 1])
      
      if (isLastWord || isFirstContentWord) {
        return stressPatterns[w] || w.toUpperCase()
      }
      
      return stressPatterns[w] || w
    })
    
    return formatted.join('-')
  }

  // Single word: use pattern or uppercase
  return stressPatterns[words[0]] || words[0].toUpperCase()
}

/**
 * Generates a short guiding sentence (max 8 words) about the sound pattern.
 * 
 * @deprecated Use generateTipLine from @/lib/pronunciationHints instead
 * This function is kept for backward compatibility but delegates to the new generator
 * 
 * @param expectedText The expected text
 * @param heardText What the user heard (if any)
 * @returns Short guiding sentence
 */
export function generateSoundHint(expectedText: string, heardText: string | null): string {
  // Delegate to the new token-specific generator
  const { generateTipLine } = require('@/lib/pronunciationHints')
  return generateTipLine(expectedText, heardText || null)
}
