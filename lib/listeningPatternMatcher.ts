/**
 * Pattern-based feedback matcher for listening patterns
 * Synchronous local matching (no Supabase)
 */

import { LISTENING_PATTERNS, type ListeningPattern } from './listeningPatterns'

export interface PatternMatchResult {
  pattern: ListeningPattern // The matched pattern object
  soundRule: string
  tip?: string
  chunkDisplay: string
}

/**
 * Extract context tokens (left1, right1, right2) from sentence tokens and target index
 */
function extractContext(
  tokens: string[], // Full sentence tokens
  targetIndex: number // Index of the first word of the target phrase
): { left1: string | null; right1: string | null; right2: string | null; targetWord: string | null } {
  const targetWord = tokens[targetIndex] || null
  const left1 = targetIndex > 0 ? tokens[targetIndex - 1] : null
  const right1 = targetIndex < tokens.length - 1 ? tokens[targetIndex + 1] : null
  const right2 = targetIndex < tokens.length - 2 ? tokens[targetIndex + 2] : null

  return { left1, right1, right2, targetWord }
}

/**
 * Match listening pattern from local patterns array
 * Returns best match based on focus word and context tokens
 * Priority: longer patterns > shorter patterns > fallback
 */
export function matchListeningPattern(
  focus: string,
  tokens: string[],
  targetIndex: number
): PatternMatchResult | null {
  const focusLower = focus.toLowerCase()
  
  // Find all patterns that start with the focus word
  const candidatePatterns = LISTENING_PATTERNS.filter(pattern => 
    pattern.words.length > 0 && pattern.words[0].toLowerCase() === focusLower
  )
  
  if (candidatePatterns.length === 0) {
    return null
  }
  
  // Sort by pattern length (longer = better) and priority
  const sortedPatterns = [...candidatePatterns].sort((a, b) => {
    // First sort by length (longer patterns win)
    if (b.words.length !== a.words.length) {
      return b.words.length - a.words.length
    }
    // Then by priority (higher priority wins)
    return b.priority - a.priority
  })
  
  // Try to match each pattern starting from targetIndex
  for (const pattern of sortedPatterns) {
    // Check if pattern matches starting at targetIndex
    let matches = true
    for (let i = 0; i < pattern.words.length; i++) {
      const tokenIndex = targetIndex + i
      if (tokenIndex >= tokens.length) {
        matches = false
        break
      }
      const token = tokens[tokenIndex]?.toLowerCase()
      const patternWord = pattern.words[i].toLowerCase()
      if (token !== patternWord) {
        matches = false
        break
      }
    }
    
    if (matches) {
      // Found a match!
      return {
        pattern,
        soundRule: pattern.howItSounds,
        tip: pattern.tip || undefined, // Ensure tip is undefined if null
        chunkDisplay: pattern.chunkDisplay,
      }
    }
  }
  
  // No match found
  return null
}

/**
 * Match listening pattern that ENDS with the target word (backward matching)
 * Used for verb chunks like "gonna go", "going to go", "want to go"
 * Returns best match based on target word and left context
 */
export function matchListeningPatternBackward(
  target: string,
  tokens: string[],
  targetIndex: number
): PatternMatchResult | null {
  const targetLower = target.toLowerCase()
  
  // Find all patterns that END with the target word
  const candidatePatterns = LISTENING_PATTERNS.filter(pattern => {
    if (pattern.words.length === 0) return false
    const lastWord = pattern.words[pattern.words.length - 1]?.toLowerCase()
    return lastWord === targetLower
  })
  
  if (candidatePatterns.length === 0) {
    return null
  }
  
  // Sort by pattern length (longer = better) and priority
  const sortedPatterns = [...candidatePatterns].sort((a, b) => {
    // First sort by length (longer patterns win)
    if (b.words.length !== a.words.length) {
      return b.words.length - a.words.length
    }
    // Then by priority (higher priority wins)
    return b.priority - a.priority
  })
  
  // Try to match each pattern ending at targetIndex
  for (const pattern of sortedPatterns) {
    // Check if pattern matches ending at targetIndex
    // Pattern words: ["gonna", "go"]
    // targetIndex: 3 (position of "go")
    // We need to check: tokens[2] === "gonna" && tokens[3] === "go"
    const patternLength = pattern.words.length
    const startIndex = targetIndex - (patternLength - 1)
    
    if (startIndex < 0) {
      continue // Pattern extends before sentence start
    }
    
    let matches = true
    for (let i = 0; i < patternLength; i++) {
      const tokenIndex = startIndex + i
      if (tokenIndex >= tokens.length) {
        matches = false
        break
      }
      const token = tokens[tokenIndex]?.toLowerCase()
      const patternWord = pattern.words[i].toLowerCase()
      if (token !== patternWord) {
        matches = false
        break
      }
    }
    
    if (matches) {
      // Found a match!
      return {
        pattern,
        soundRule: pattern.howItSounds,
        tip: pattern.tip || undefined,
        chunkDisplay: pattern.chunkDisplay,
      }
    }
  }
  
  // No match found
  return null
}

/**
 * Check if a word is eligible for pattern matching
 * Currently: any word that is the start of a pattern in LISTENING_PATTERNS
 */
export function isEligibleForPatternMatching(word: string): boolean {
  const lowerWord = word.toLowerCase()
  return LISTENING_PATTERNS.some(pattern => 
    pattern.words.length > 0 && pattern.words[0].toLowerCase() === lowerWord
  )
}

/**
 * Check if a word is eligible for backward pattern matching (verb chunks)
 * Currently: verbs like "go", "get", "take", "make"
 */
export function isEligibleForBackwardPatternMatching(word: string): boolean {
  const lowerWord = word.toLowerCase()
  const verbs = ['go', 'get', 'take', 'make']
  return verbs.includes(lowerWord)
}
