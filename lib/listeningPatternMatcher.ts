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
  reducedForm?: string // Optional phonetic reduction (e.g., "wanna" for "want to")
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
 * Match listening pattern from patterns array (or local fallback)
 * Returns best match based on focus word and context tokens
 * Priority: longer patterns > shorter patterns > fallback
 * @param patterns - Optional array of patterns. If not provided or empty, uses local fallback.
 */
export function matchListeningPattern(
  focus: string,
  tokens: string[],
  targetIndex: number,
  patterns?: ListeningPattern[]
): PatternMatchResult | null {
  const focusLower = focus.toLowerCase()
  
  // Use provided patterns or fallback to local patterns
  const patternsToUse = (patterns && patterns.length > 0) ? patterns : LISTENING_PATTERNS
  
  // DEBUG: Log pattern matching attempt
  if (process.env.NODE_ENV === 'development') {
    console.log('🔍 [PatternMatch] Attempting to match:', {
      focus: focusLower,
      targetIndex,
      tokensAtTarget: tokens.slice(Math.max(0, targetIndex - 1), targetIndex + 3),
      patternsCount: patternsToUse.length,
      patternsSample: patternsToUse.slice(0, 5).map(p => ({
        id: p.id,
        patternKey: (p as any).patternKey || '(none)',
        words: p.words,
        firstWord: p.words[0]?.toLowerCase() || '(none)',
      })),
    })
  }
  
  // Find all patterns that start with the focus word
  // Also check pattern_key and variants for matching
  const candidatePatterns = patternsToUse.filter(pattern => {
    // Primary: match by first word in words array
    if (pattern.words.length > 0 && pattern.words[0].toLowerCase() === focusLower) {
      return true
    }
    // Fallback: match by pattern_key
    const patternKey = (pattern as any).patternKey || pattern.id
    if (patternKey && patternKey.toLowerCase() === focusLower) {
      return true
    }
    // Fallback: match by variants' spoken_form
    const variants = (pattern as any).variants
    if (variants && Array.isArray(variants)) {
      return variants.some((v: any) => v.spoken_form?.toLowerCase() === focusLower)
    }
    return false
  })
  
  // DEBUG: Log candidate patterns
  if (process.env.NODE_ENV === 'development') {
    console.log('🔍 [PatternMatch] Candidate patterns found:', {
      focus: focusLower,
      candidateCount: candidatePatterns.length,
      candidates: candidatePatterns.map(p => ({
        id: p.id,
        patternKey: (p as any).patternKey || '(none)',
        words: p.words,
        variants: (p as any).variants?.map((v: any) => v.spoken_form) || [],
      })),
    })
  }
  
  if (candidatePatterns.length === 0) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('⚠️ [PatternMatch] No candidate patterns found for:', {
        focus: focusLower,
        patternsChecked: patternsToUse.length,
      })
    }
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
      // Dev-only logging for pattern matching
      if (process.env.NODE_ENV === 'development') {
        console.log('🔍 [PatternMatch] Matched pattern:', {
          pattern_key: pattern.id,
          focus: focusLower,
          chunkDisplay: pattern.chunkDisplay,
          reducedForm: pattern.reducedForm || '(none)',
          words: pattern.words,
          parentPatternKey: pattern.parentPatternKey || '(none)',
          parentChunkDisplay: pattern.parentChunkDisplay || '(none)',
          howItSounds: pattern.howItSounds || '(none)',
          tip: pattern.tip || '(none)',
          category: pattern.category || '(none)',
        })
      }
      
      return {
        pattern,
        soundRule: pattern.howItSounds,
        tip: pattern.tip || undefined, // Ensure tip is undefined if null
        chunkDisplay: pattern.chunkDisplay,
        reducedForm: pattern.reducedForm || undefined,
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
 * @param patterns - Optional array of patterns. If not provided or empty, uses local fallback.
 */
export function matchListeningPatternBackward(
  target: string,
  tokens: string[],
  targetIndex: number,
  patterns?: ListeningPattern[]
): PatternMatchResult | null {
  const targetLower = target.toLowerCase()
  
  // Use provided patterns or fallback to local patterns
  const patternsToUse = (patterns && patterns.length > 0) ? patterns : LISTENING_PATTERNS
  
  // Find all patterns that END with the target word
  const candidatePatterns = patternsToUse.filter(pattern => {
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
      // Dev-only logging for backward pattern matching
      if (process.env.NODE_ENV === 'development') {
        console.log('🔍 [PatternMatch] Matched backward pattern:', {
          pattern_key: pattern.id,
          focus: targetLower,
          chunkDisplay: pattern.chunkDisplay,
          words: pattern.words,
        })
      }
      
      return {
        pattern,
        soundRule: pattern.howItSounds,
        tip: pattern.tip || undefined,
        chunkDisplay: pattern.chunkDisplay,
        reducedForm: pattern.reducedForm || undefined,
      }
    }
  }
  
  // No match found
  return null
}

/**
 * Check if a word is eligible for pattern matching
 * Checks multiple fields: words[0], patternKey/id, and variants' spoken_form
 * @param patterns - Optional array of patterns. If not provided or empty, uses local fallback.
 */
export function isEligibleForPatternMatching(word: string, patterns?: ListeningPattern[]): boolean {
  const lowerWord = word.toLowerCase()
  const patternsToUse = (patterns && patterns.length > 0) ? patterns : LISTENING_PATTERNS
  return patternsToUse.some(pattern => {
    // Primary: match by first word in words array
    if (pattern.words.length > 0 && pattern.words[0].toLowerCase() === lowerWord) {
      return true
    }
    // Fallback: match by pattern_key
    const patternKey = (pattern as any).patternKey || pattern.id
    if (patternKey && patternKey.toLowerCase() === lowerWord) {
      return true
    }
    // Fallback: match by variants' spoken_form
    const variants = (pattern as any).variants
    if (variants && Array.isArray(variants)) {
      return variants.some((v: any) => v.spoken_form?.toLowerCase() === lowerWord)
    }
    return false
  })
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
