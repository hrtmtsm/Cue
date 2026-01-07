/**
 * Perceptual error causes for listening comprehension
 */
export type ErrorCause =
  | 'CONNECTED_SPEECH'
  | 'WORD_REDUCTION'
  | 'FUNCTION_WORD_DROP'
  | 'VOWEL_REDUCTION'
  | 'BOUNDARY_MISALIGNMENT'
  | 'CONTENT_WORD_MISS'

/**
 * Common function words that are often dropped or reduced
 */
const FUNCTION_WORDS = new Set([
  'a', 'an', 'the',
  'is', 'are', 'was', 'were', 'be', 'been',
  'have', 'has', 'had',
  'do', 'does', 'did',
  'will', 'would', 'could', 'should',
  'to', 'for', 'of', 'in', 'on', 'at', 'by', 'with',
  'and', 'or', 'but',
  'this', 'that', 'these', 'those',
  'i', 'you', 'he', 'she', 'it', 'we', 'they',
  'my', 'your', 'his', 'her', 'its', 'our', 'their',
  'please', 'thanks', 'thank', 'you',
])

/**
 * Common contractions and reductions
 */
const CONTRACTIONS = new Set([
  "i'm", "you're", "he's", "she's", "it's", "we're", "they're",
  "i've", "you've", "we've", "they've",
  "i'll", "you'll", "he'll", "she'll", "we'll", "they'll",
  "i'd", "you'd", "he'd", "she'd", "we'd", "they'd",
  "isn't", "aren't", "wasn't", "weren't",
  "don't", "doesn't", "didn't",
  "won't", "wouldn't", "couldn't", "shouldn't",
  "can't", "couldn't",
  "haven't", "hasn't", "hadn't",
])

/**
 * Common reduced forms
 */
const REDUCED_FORMS: Record<string, string> = {
  'going to': 'gonna',
  'want to': 'wanna',
  'got to': 'gotta',
  'kind of': 'kinda',
  'sort of': 'sorta',
  'give me': 'gimme',
  'let me': 'lemme',
  'what are': "what're",
  'you are': "you're",
  'we are': "we're",
  'they are': "they're",
}

/**
 * Check if a word is a function word
 */
function isFunctionWord(word: string): boolean {
  return FUNCTION_WORDS.has(word.toLowerCase())
}

/**
 * Check if a word is a contraction
 */
function isContraction(word: string): boolean {
  return CONTRACTIONS.has(word.toLowerCase())
}

/**
 * Check if expected word is a reduced form
 */
function isReducedForm(expected: string, actual: string): boolean {
  const expectedLower = expected.toLowerCase()
  const actualLower = actual.toLowerCase()
  
  // Check direct mapping
  if (REDUCED_FORMS[expectedLower] === actualLower) {
    return true
  }
  if (REDUCED_FORMS[actualLower] === expectedLower) {
    return true
  }
  
  // Check if expected is a reduced form
  return Object.values(REDUCED_FORMS).includes(expectedLower)
}

/**
 * Check if words sound similar (simple heuristic)
 */
function soundsSimilar(word1: string, word2: string): boolean {
  const w1 = word1.toLowerCase()
  const w2 = word2.toLowerCase()
  
  // Same first letter and similar length
  if (w1[0] === w2[0] && Math.abs(w1.length - w2.length) <= 2) {
    return true
  }
  
  // Common sound-alike pairs
  const similarPairs = [
    ['a', 'the'],
    ['an', 'a'],
    ['is', "it's"],
    ['are', 'our'],
    ['your', "you're"],
    ['their', 'there'],
    ['to', 'too', 'two'],
    ['hear', 'here'],
    ['know', 'no'],
  ]
  
  return similarPairs.some(pair => pair.includes(w1) && pair.includes(w2))
}

/**
 * Classify a single error token by perceptual cause
 * Supports both new alignment format (ref/hyp) and old format (expected/actual)
 */
export function classifyError(
  token: { type: string; ref?: string; hyp?: string; expected?: string; actual?: string; word?: string },
  context: { prevToken?: { ref?: string; expected?: string; word?: string }; nextToken?: { ref?: string; expected?: string; word?: string } }
): ErrorCause[] {
  const causes: ErrorCause[] = []
  
  if (token.type === 'missing') {
    // Support both new format (ref) and old format (expected)
    const expected = ((token.ref || token.expected) || '').toLowerCase()
    
    // Function word drop
    if (isFunctionWord(expected)) {
      causes.push('FUNCTION_WORD_DROP')
    }
    
    // Word reduction (contractions, reduced forms)
    if (isContraction(expected) || Object.values(REDUCED_FORMS).includes(expected)) {
      causes.push('WORD_REDUCTION')
    }
    
    // Content word miss
    if (!isFunctionWord(expected) && !isContraction(expected)) {
      causes.push('CONTENT_WORD_MISS')
    }
    
    // Connected speech (if missing word is between two words)
    if (context.prevToken && context.nextToken) {
      causes.push('CONNECTED_SPEECH')
    }
  }
  
  if (token.type === 'wrong') {
    // Support both new format (ref/hyp) and old format (expected/actual)
    const expected = ((token.ref || token.expected) || '').toLowerCase()
    const actual = ((token.hyp || token.actual) || '').toLowerCase()
    
    // Word reduction (user heard reduced form)
    if (isReducedForm(expected, actual)) {
      causes.push('WORD_REDUCTION')
    }
    
    // Vowel reduction (similar sounding words)
    if (soundsSimilar(expected, actual)) {
      causes.push('VOWEL_REDUCTION')
    }
    
    // Boundary misalignment (wrong word in sequence)
    causes.push('BOUNDARY_MISALIGNMENT')
  }
  
  if (token.type === 'extra') {
    // Extra words often indicate boundary misalignment
    causes.push('BOUNDARY_MISALIGNMENT')
  }
  
  // Default to connected speech if no specific cause
  if (causes.length === 0 && token.type !== 'correct') {
    causes.push('CONNECTED_SPEECH')
  }
  
  return causes
}

/**
 * Analyze all tokens and classify errors by cause
 * Supports both new alignment format (ref/hyp) and old format (expected/actual)
 */
export function analyzeErrors(tokens: Array<{ type: string; ref?: string; hyp?: string; expected?: string; actual?: string; word?: string }>): Map<ErrorCause, number> {
  const errorCounts = new Map<ErrorCause, number>()
  
  tokens.forEach((token, idx) => {
    if (token.type === 'correct') return
    
    const prevToken = idx > 0 ? tokens[idx - 1] : undefined
    const nextToken = idx < tokens.length - 1 ? tokens[idx + 1] : undefined
    
    const causes = classifyError(token, {
      prevToken,
      nextToken,
    })
    
    causes.forEach(cause => {
      errorCounts.set(cause, (errorCounts.get(cause) || 0) + 1)
    })
  })
  
  return errorCounts
}

/**
 * Get ranked error causes (highest frequency first)
 */
export function getRankedCauses(errorCounts: Map<ErrorCause, number>): Array<{ cause: ErrorCause; count: number }> {
  return Array.from(errorCounts.entries())
    .map(([cause, count]) => ({ cause, count }))
    .sort((a, b) => b.count - a.count)
}

