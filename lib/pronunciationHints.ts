/**
 * Pronunciation hint generator for "Why this was hard" cards
 * Deterministic, token-specific (no LLM required)
 */

/**
 * Weak form mappings for function words
 * These words often reduce in fast speech
 */
const WEAK_FORMS: Record<string, { weak: string; ipa?: string; hint: string }> = {
  'to': { weak: 'tuh', ipa: '/tə/', hint: 'This word often reduces to "tuh" in fast speech.' },
  'a': { weak: 'uh', ipa: '/ə/', hint: 'This word often reduces to "uh" in fast speech.' }, // Correct: "a" -> "uh" (schwa), not "A"
  'an': { weak: 'uhn', ipa: '/ən/', hint: 'This word often reduces to "uhn" in fast speech.' },
  'the': { weak: 'thuh', ipa: '/ðə/', hint: 'This word often reduces to "thuh" before consonants.' },
  'thee': { weak: 'thee', ipa: '/ði/', hint: 'This word sounds like "thee" before vowels.' },
  'of': { weak: 'uhv', ipa: '/əv/', hint: 'This word often reduces to "uhv" in fast speech.' },
  'for': { weak: 'fer', ipa: '/fər/', hint: 'This word often reduces to "fer" in fast speech.' },
  'at': { weak: 'uht', ipa: '/ət/', hint: 'This word often reduces to "uht" in fast speech.' },
  'in': { weak: 'in', ipa: '/ɪn/', hint: 'This word can sound weak in fast speech.' },
  'on': { weak: 'uhn', ipa: '/ən/', hint: 'This word often reduces to "uhn" in fast speech.' },
  'and': { weak: 'n', ipa: '/n/', hint: 'This word often reduces to just "n" in fast speech.' },
  'or': { weak: 'er', ipa: '/ər/', hint: 'This word often reduces to "er" in fast speech.' },
  'but': { weak: 'buht', ipa: '/bət/', hint: 'This word often reduces to "buht" in fast speech.' },
  'it': { weak: 'it', ipa: '/ɪt/', hint: 'This word can sound weak in fast speech.' },
  'is': { weak: 'iz', ipa: '/ɪz/', hint: 'This word often reduces to "iz" in fast speech.' },
  'are': { weak: 'er', ipa: '/ər/', hint: 'This word often reduces to "er" in fast speech.' },
  'was': { weak: 'wuz', ipa: '/wəz/', hint: 'This word often reduces to "wuz" in fast speech.' },
  'were': { weak: 'wer', ipa: '/wər/', hint: 'This word often reduces to "wer" in fast speech.' },
  'have': { weak: 'uhv', ipa: '/əv/', hint: 'This word often reduces to "uhv" in fast speech.' },
  'has': { weak: 'huz', ipa: '/həz/', hint: 'This word often reduces to "huz" in fast speech.' },
  'had': { weak: 'hud', ipa: '/həd/', hint: 'This word often reduces to "hud" in fast speech.' },
  'can': { weak: 'kuhn', ipa: '/kən/', hint: 'This word often reduces to "kuhn" in fast speech.' },
  'could': { weak: 'kud', ipa: '/kʊd/', hint: 'This word often reduces to "kud" in fast speech.' },
  'should': { weak: 'shud', ipa: '/ʃʊd/', hint: 'This word often reduces to "shud" in fast speech.' },
  'would': { weak: 'wud', ipa: '/wʊd/', hint: 'This word often reduces to "wud" in fast speech.' },
  'will': { weak: 'ul', ipa: '/əl/', hint: 'This word often reduces to "ul" in fast speech.' },
  'do': { weak: 'duh', ipa: '/də/', hint: 'This word often reduces to "duh" in fast speech.' },
  'does': { weak: 'duz', ipa: '/dəz/', hint: 'This word often reduces to "duz" in fast speech.' },
  'did': { weak: 'did', ipa: '/dɪd/', hint: 'This word can sound weak in fast speech.' },
}

/**
 * Stress patterns for content words
 * Maps word to stress-based representation
 */
const STRESS_HINTS: Record<string, { stress: string; ipa?: string; hint: string }> = {
  'tonight': { stress: 'tuh-NIGHT', ipa: '/təˈnaɪt/', hint: 'Stress is on NIGHT.' },
  'today': { stress: 'tuh-DAY', ipa: '/təˈdeɪ/', hint: 'Stress is on DAY.' },
  'tomorrow': { stress: 'tuh-MOR-row', ipa: '/təˈmɑːroʊ/', hint: 'Stress is on MOR.' },
  'together': { stress: 'tuh-GETH-er', ipa: '/təˈɡeðər/', hint: 'Stress is on GETH.' },
  'reservation': { stress: 're-ZER-vation', ipa: '/ˌrezərˈveɪʃən/', hint: 'Stress is on ZER.' },
  'station': { stress: 'STAY-shun', ipa: '/ˈsteɪʃən/', hint: 'Stress is on STAY.' },
  'train': { stress: 'TRAIN', ipa: '/treɪn/', hint: 'Stress is on TRAIN.' },
  'light': { stress: 'LIGHT', ipa: '/laɪt/', hint: 'Stress is on LIGHT.' },
  'right': { stress: 'RIGHT', ipa: '/raɪt/', hint: 'Stress is on RIGHT.' },
  'night': { stress: 'NIGHT', ipa: '/naɪt/', hint: 'Stress is on NIGHT.' },
  'might': { stress: 'MIGHT', ipa: '/maɪt/', hint: 'Stress is on MIGHT.' },
  'get': { stress: 'GET', ipa: '/ɡet/', hint: 'Stress is on GET.' },
  'make': { stress: 'MAKE', ipa: '/meɪk/', hint: 'Stress is on MAKE.' },
  'take': { stress: 'TAKE', ipa: '/teɪk/', hint: 'Stress is on TAKE.' },
  'break': { stress: 'BREAK', ipa: '/breɪk/', hint: 'Stress is on BREAK.' },
}

/**
 * R/L confusion hints
 */
const RL_HINTS: Record<string, string> = {
  'light': 'R and L can sound similar—listen for the tongue.',
  'right': 'R and L can sound similar—listen for the tongue.',
  'night': 'R and L can sound similar—listen for the tongue.',
  'might': 'R and L can sound similar—listen for the tongue.',
}

/**
 * Generate tip line (one short sentence, max 60 chars)
 */
export function generateTipLine(
  missedToken: string,
  actualToken: string | null = null,
  prevToken?: string,
  nextToken?: string
): string {
  const normalized = missedToken.toLowerCase().trim()
  
  // Check for weak forms first (most specific)
  if (WEAK_FORMS[normalized]) {
    return WEAK_FORMS[normalized].hint
  }
  
  // Check for R/L confusion
  if (RL_HINTS[normalized]) {
    return RL_HINTS[normalized]
  }
  
  // Check for stress patterns
  if (STRESS_HINTS[normalized]) {
    return STRESS_HINTS[normalized].hint
  }
  
  // Multi-word: check if first word is weak form
  const words = normalized.split(/\s+/)
  if (words.length > 1) {
    const firstWord = words[0]
    if (WEAK_FORMS[firstWord]) {
      return `The first word "${firstWord}" often reduces in fast speech.`
    }
    // Check if any word has stress pattern
    for (const word of words) {
      if (STRESS_HINTS[word]) {
        return STRESS_HINTS[word].hint
      }
    }
  }
  
  // Fallback: generic but still useful
  if (words.length === 1 && words[0].length <= 3) {
    return 'Small words often blend with nearby sounds.'
  }
  
  return 'Listen for the stressed syllable.'
}

/**
 * Generate "How it sounds" line
 * Returns: { display: string, ipa?: string }
 */
export function generateHowItSounds(
  missedToken: string,
  prevToken?: string,
  nextToken?: string
): { display: string; ipa?: string } {
  const normalized = missedToken.toLowerCase().trim()
  
  // Check for weak forms first
  if (WEAK_FORMS[normalized]) {
    const weak = WEAK_FORMS[normalized]
    // Special case: "the" before vowel sounds like "thee"
    if (normalized === 'the' && nextToken && /^[aeiou]/.test(nextToken.toLowerCase())) {
      return { display: 'thee', ipa: '/ði/' }
    }
    return { display: weak.weak, ipa: weak.ipa }
  }
  
  // Check for stress patterns
  if (STRESS_HINTS[normalized]) {
    const stress = STRESS_HINTS[normalized]
    return { display: stress.stress, ipa: stress.ipa }
  }
  
  // Multi-word: combine weak forms and stress
  const words = normalized.split(/\s+/)
  if (words.length > 1) {
    const formatted = words.map((w, i) => {
      // Function words get reduced
      if (WEAK_FORMS[w]) {
        // Special case: "the" before vowel
        if (w === 'the' && i + 1 < words.length && /^[aeiou]/.test(words[i + 1].toLowerCase())) {
          return 'thee'
        }
        return WEAK_FORMS[w].weak
      }
      // Content words get stressed
      if (STRESS_HINTS[w]) {
        return STRESS_HINTS[w].stress
      }
      // Last word or first content word gets uppercase
      const isLastWord = i === words.length - 1
      const isFirstContentWord = i > 0 && WEAK_FORMS[words[i - 1]]
      if (isLastWord || isFirstContentWord) {
        return w.toUpperCase()
      }
      return w
    })
    return { display: formatted.join('-') }
  }
  
  // Single word fallback: uppercase if short, otherwise as-is
  if (normalized.length <= 3) {
    return { display: normalized.toUpperCase() }
  }
  
  return { display: normalized }
}

/**
 * Check if a token is a weak-form high-value word
 * These are the most pedagogically valuable weak forms
 */
export function isWeakFormHighValue(token: string): boolean {
  const normalized = token.toLowerCase().trim()
  return ['to', 'a', 'the', 'of', 'for'].includes(normalized)
}

/**
 * Check if a token is a weak form (any function word that reduces)
 */
export function isWeakForm(token: string): boolean {
  const normalized = token.toLowerCase().trim()
  return normalized in WEAK_FORMS
}
