/**
 * Converts a chunk text to a phonetic-like "how it sounds" remap string.
 * 
 * Rules:
 * - Function words get reduced: the -> thuh, to -> tuh, of -> uv, and -> n
 * - Known casual forms: gonna, gotta, kinda, shoulda, woulda, coulda, didja
 * - Otherwise: keep chunk as-is (no weird concatenation)
 * 
 * @param chunkText The chunk text to remap (e.g., "the train", "gonna", "to get to")
 * @returns A phonetic-like remap string (e.g., "thuh train", "gunna", "tuh get tuh")
 */
export function toHowItSoundsRemap(chunkText: string): string {
  if (!chunkText || !chunkText.trim()) {
    return chunkText
  }

  const text = chunkText.trim().toLowerCase()
  const words = text.split(/\s+/)

  // Known casual pronunciations
  const casualForms: Record<string, string> = {
    'gonna': 'gunna',
    'gotta': 'gotta',
    'kinda': 'kinda',
    'shoulda': 'shoulda',
    'woulda': 'woulda',
    'coulda': 'coulda',
    'didja': 'didja',
    'wanna': 'wanna',
    'lemme': 'lemme',
    'gimme': 'gimme',
  }

  // Check if entire chunk is a known casual form
  if (casualForms[text]) {
    return casualForms[text]
  }

  // Map function words to reduced forms with phonetic notation
  const reducedWords = words.map((word, index) => {
    // Check if word is a known casual form
    if (casualForms[word]) {
      return casualForms[word]
    }

    // Function word reductions (phonetic-like notation)
    switch (word) {
      case 'the':
        // Use "thə" (schwa) or "th'" for reduction
        return index === 0 ? 'thə' : "th'"
      case 'to':
        return 'tə'
      case 'of':
        return 'əv'
      case 'and':
        return 'n'
      case 'a':
        return 'ə'
      case 'an':
        return 'ən'
      case 'at':
        return 'ət'
      case 'in':
        return 'in'
      case 'on':
        return 'ən'
      case 'for':
        return "f'r"
      case 'but':
        return "b't"
      default:
        return word
    }
  })

  // Join with hyphens for multi-word chunks to show blending
  // e.g., "the train" → "thə-train" (shows how they connect)
  if (reducedWords.length > 1) {
    return reducedWords.join('-')
  }
  
  return reducedWords.join(' ')
}

/**
 * Formats a remap string for display with arrow notation.
 * 
 * @param original The original chunk text
 * @param remap The remapped phonetic string
 * @returns Formatted string like "the train" → "thuh train"
 */
export function formatHowItSoundsDisplay(original: string, remap: string): string {
  return `"${original}" → "${remap}"`
}
