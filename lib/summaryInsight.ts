import type { AlignmentToken, AlignmentEvent } from './alignmentEngine'

export type SummaryCategory = 
  | 'phrases_blended' 
  | 'function_words' 
  | 'similar_sounds' 
  | 'missing_key_words' 
  | 'extra_words' 
  | 'speed_too_fast'

export interface SummaryInsight {
  title: string
  example: string
  category: SummaryCategory
}

// Short function words that often get reduced or missed
const FUNCTION_WORDS = new Set([
  'i', 'you', 'we', 'to', 'a', 'the', 'of', 'in', 'on', 'it', 
  'and', 'but', 'or', 'at', 'as', 'is', 'was', 'are', 'were',
  'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did',
  'will', 'would', 'can', 'could', 'should', 'may', 'might',
  "i'm", "i'll", "it's", "it'll", "you're", "you'll", "we're", "we'll",
  "that's", "there's", "here's", "what's", "who's", "where's",
  "don't", "doesn't", "didn't", "won't", "wouldn't", "can't", "couldn't"
])

// Content words are typically longer nouns/verbs/adjectives (not in function words set)
function isContentWord(word: string): boolean {
  const normalized = word.toLowerCase().replace(/[.,!?;:'"]/g, '')
  return normalized.length > 4 && !FUNCTION_WORDS.has(normalized)
}

/**
 * Generate a lightweight summary insight for the first review screen
 * Analyzes alignment tokens/events to identify the dominant error pattern
 */
export function generateSummaryInsight(
  tokens: AlignmentToken[],
  events: AlignmentEvent[],
  refTokens: string[],
  refText: string,
  accuracyPercent: number
): SummaryInsight {
  // Count error types
  let missingCount = 0
  let extraCount = 0
  let substitutionCount = 0
  let missingFunctionWords = 0
  let missingContentWords = 0
  let adjacentMissing = 0
  let phraseBlendedIndices = new Set<number>()
  
  // Analyze tokens
  for (const token of tokens) {
    if (token.type === 'missing') {
      missingCount++
      const word = (token.expected || '').toLowerCase().replace(/[.,!?;:'"]/g, '')
      if (FUNCTION_WORDS.has(word)) {
        missingFunctionWords++
      } else if (isContentWord(token.expected || '')) {
        missingContentWords++
      }
    } else if (token.type === 'extra') {
      extraCount++
    } else if (token.type === 'substitution') {
      substitutionCount++
    }
  }
  
  // Check for adjacent missing tokens (phrase blending signal)
  for (let i = 0; i < tokens.length - 1; i++) {
    const curr = tokens[i]
    const next = tokens[i + 1]
    if (curr.type === 'missing' && next.type === 'missing' && 
        curr.refIndex !== undefined && next.refIndex !== undefined &&
        Math.abs((curr.refIndex || 0) - (next.refIndex || 0)) <= 1) {
      adjacentMissing++
      phraseBlendedIndices.add(curr.refIndex || 0)
      phraseBlendedIndices.add(next.refIndex || 0)
    }
  }
  
  // Check events for phrase hints (blended phrases)
  for (const event of events) {
    if (event.phraseHint && (event.type === 'missing' || event.type === 'substitution')) {
      for (let idx = event.refStart; idx < event.refEnd; idx++) {
        phraseBlendedIndices.add(idx)
      }
    }
  }
  
  const totalErrors = missingCount + extraCount + substitutionCount
  
  // Heuristic: Pick the strongest signal
  let category: SummaryCategory = 'similar_sounds' // default
  let title = 'Good listening! Most parts came through clearly.'
  let exampleSnippet = ''
  
  // 1. Speed too fast (very low accuracy with many misses)
  if (accuracyPercent < 40 && missingCount >= 3) {
    category = 'speed_too_fast'
    title = 'The speech was quite fast, which made it harder to catch everything.'
    // Find a snippet with missing words
    const firstMissingEvent = events.find(e => e.type === 'missing')
    if (firstMissingEvent && refTokens.length > 0) {
      const start = Math.max(0, firstMissingEvent.refStart - 1)
      const end = Math.min(refTokens.length, firstMissingEvent.refEnd + 2)
      exampleSnippet = refTokens.slice(start, end).join(' ')
    } else {
      exampleSnippet = refTokens.slice(0, Math.min(4, refTokens.length)).join(' ')
    }
  }
  // 2. Phrases blended (adjacent misses or phrase hints)
  else if (adjacentMissing >= 2 || phraseBlendedIndices.size >= 2) {
    category = 'phrases_blended'
    title = 'You often missed phrases when words were spoken together.'
    // Find the biggest blended phrase
    const blendedEvent = events.find(e => e.phraseHint && (e.type === 'missing' || e.type === 'substitution'))
    if (blendedEvent && refTokens.length > 0) {
      const start = Math.max(0, blendedEvent.refStart - 1)
      const end = Math.min(refTokens.length, blendedEvent.refEnd + 2)
      exampleSnippet = refTokens.slice(start, end).join(' ')
    } else if (phraseBlendedIndices.size > 0) {
      const indices = Array.from(phraseBlendedIndices).sort((a, b) => a - b)
      const start = Math.max(0, indices[0] - 1)
      const end = Math.min(refTokens.length, indices[indices.length - 1] + 2)
      exampleSnippet = refTokens.slice(start, end).join(' ')
    }
  }
  // 3. Function words missing
  else if (missingFunctionWords >= 2 && missingFunctionWords >= missingContentWords) {
    category = 'function_words'
    title = 'Short function words often disappear in fast speech.'
    // Find a snippet with missing function words
    const functionWordEvent = events.find(e => {
      if (e.type !== 'missing') return false
      const word = (e.expectedSpan || '').toLowerCase().replace(/[.,!?;:'"]/g, '')
      return FUNCTION_WORDS.has(word)
    })
    if (functionWordEvent && refTokens.length > 0) {
      const start = Math.max(0, functionWordEvent.refStart - 1)
      const end = Math.min(refTokens.length, functionWordEvent.refEnd + 2)
      exampleSnippet = refTokens.slice(start, end).join(' ')
    }
  }
  // 4. Content words missing
  else if (missingContentWords >= 2) {
    category = 'missing_key_words'
    title = 'Some key words were hard to catch.'
    const contentWordEvent = events.find(e => {
      if (e.type !== 'missing') return false
      return isContentWord(e.expectedSpan || '')
    })
    if (contentWordEvent && refTokens.length > 0) {
      const start = Math.max(0, contentWordEvent.refStart - 1)
      const end = Math.min(refTokens.length, contentWordEvent.refEnd + 2)
      exampleSnippet = refTokens.slice(start, end).join(' ')
    }
  }
  // 5. Extra words
  else if (extraCount >= 2 && extraCount >= substitutionCount) {
    category = 'extra_words'
    title = 'It\'s common to fill gaps using context when audio is unclear.'
    // Find an extra word event
    const extraEvent = events.find(e => e.type === 'extra')
    if (extraEvent && refTokens.length > 0 && extraEvent.userStart !== undefined) {
      // Get surrounding context from reference
      const contextIdx = Math.min(extraEvent.refStart, refTokens.length - 1)
      const start = Math.max(0, contextIdx - 1)
      const end = Math.min(refTokens.length, contextIdx + 3)
      exampleSnippet = refTokens.slice(start, end).join(' ')
    }
  }
  // 6. Similar sounds (substitutions dominate)
  else if (substitutionCount >= 2) {
    category = 'similar_sounds'
    title = 'Word boundaries can shift when sounds connect.'
    const subEvent = events.find(e => e.type === 'substitution')
    if (subEvent && refTokens.length > 0) {
      const start = Math.max(0, subEvent.refStart - 1)
      const end = Math.min(refTokens.length, subEvent.refEnd + 2)
      exampleSnippet = refTokens.slice(start, end).join(' ')
    }
  }
  
  // Fallback if no example found or no errors
  if (!exampleSnippet) {
    if (totalErrors === 0 && refTokens.length > 0) {
      // No errors - show a general snippet from the sentence
      exampleSnippet = refTokens.slice(0, Math.min(5, refTokens.length)).join(' ')
      title = 'Great job! You caught most of this sentence.'
    } else if (refTokens.length > 0) {
      // Find first error event
      const firstEvent = events[0]
      if (firstEvent) {
        const start = Math.max(0, firstEvent.refStart - 1)
        const end = Math.min(refTokens.length, firstEvent.refEnd + 2)
        exampleSnippet = refTokens.slice(start, end).join(' ')
      } else {
        exampleSnippet = refTokens.slice(0, Math.min(4, refTokens.length)).join(' ')
      }
    }
  }
  
  // Format example: "For example, "<snippet>" ..."
  const example = exampleSnippet 
    ? `For example, "${exampleSnippet}"${exampleSnippet.length > 30 ? '...' : ''}`
    : 'Keep practicing to improve your listening skills.'
  
  return {
    title,
    example,
    category,
  }
}

