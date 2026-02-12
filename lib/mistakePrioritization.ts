import type { AlignmentEvent } from './alignmentEngine'

/**
 * Detect if text contains a phrasal verb
 */
function isPhrasalVerb(text: string): boolean {
  const phrasalVerbs = [
    // Very common
    'check out', 'figure out', 'pick up', 'hang out',
    'catch up', 'caught up', 'get up', 'wake up',
    'give up', 'look up', 'come back', 'go out',
    'stay up', 'turn on', 'turn off', 'put on',
    'take off', 'break down', 'call off', 'carry on',
    'find out', 'get along', 'get over', 'give in',
    'hold on', 'look after', 'look for', 'make up',
    'run into', 'set up', 'show up', 'take care',
    'work out', 'bring up', 'cut off', 'fill out',
    
    // With prepositions (3-word phrasal verbs)
    'caught up with', 'catch up with', 'keep up with',
    'come up with', 'get along with', 'put up with',
    'look forward to', 'run out of', 'get rid of',
    'look down on', 'get away with', 'hang out with',
    
    // Casual/Modern
    'binge watch', 'chill out', 'hang around',
    'hook up', 'mess around', 'freak out'
  ]
  
  const lowerText = text.toLowerCase().trim()
  return phrasalVerbs.some(pv => 
    lowerText === pv || lowerText.includes(pv)
  )
}

/**
 * Detect if text contains an idiom or common expression
 */
function isIdiom(text: string): boolean {
  const idioms = [
    'kind of', 'sort of', 'a lot of', 'piece of cake',
    'break a leg', 'hit the nail', 'under the weather',
    'on the same page', 'beat around the bush', 'break the ice',
    'call it a day', 'cut corners', 'get the ball rolling',
    'hit the sack', 'pull yourself together', 'so far so good',
    'the best of both worlds', 'time flies', 'when pigs fly',
    'you can say that again', 'by the way', 'for the time being',
    'in the long run', 'make ends meet', 'no pain no gain',
    'once in a blue moon', 'rain or shine', 'see eye to eye'
  ]
  
  const lowerText = text.toLowerCase()
  return idioms.some(idiom => lowerText.includes(idiom))
}

/**
 * Detect if this is a common reduction pattern
 */
function isReduction(expected: string, actual: string): boolean {
  const reductions: Record<string, string[]> = {
    'gonna': ['going to'],
    'wanna': ['want to', 'wanna'],
    'kinda': ['kind of'],
    'sorta': ['sort of'],
    'gotta': ['got to', 'have to'],
    'dunno': ['don\'t know'],
    'gimme': ['give me'],
    'lemme': ['let me'],
    'coulda': ['could have'],
    'shoulda': ['should have'],
    'woulda': ['would have'],
    'hafta': ['have to'],
    'oughta': ['ought to'],
    'ya': ['you'],
    'em': ['them'],
    'cause': ['because']
  }
  
  const expectedLower = expected.toLowerCase().trim()
  const actualLower = actual.toLowerCase().trim()
  
  return Object.entries(reductions).some(([reduced, fulls]) => 
    (expectedLower === reduced && fulls.some(f => actualLower.includes(f))) ||
    (fulls.some(f => expectedLower.includes(f)) && actualLower === reduced)
  )
}

/**
 * Check if mistake is related to a focus area
 */
function isRelatedToFocus(event: AlignmentEvent, focusArea: string): boolean {
  const expectedSpan = event.expectedSpan || ''
  const focusLower = focusArea.toLowerCase()
  const spanLower = expectedSpan.toLowerCase()
  
  // Simple keyword matching for now
  // Could be expanded with more sophisticated matching
  if (focusLower.includes('reduction') || focusLower.includes('contract')) {
    return isReduction(expectedSpan, event.actualSpan || '')
  }
  
  if (focusLower.includes('phrasal') || focusLower.includes('verb')) {
    return isPhrasalVerb(expectedSpan)
  }
  
  if (focusLower.includes('idiom') || focusLower.includes('expression')) {
    return isIdiom(expectedSpan)
  }
  
  // Direct text match
  return spanLower.includes(focusLower) || focusLower.includes(spanLower)
}

/**
 * Meaning-critical words that change sentence meaning significantly
 * These should be prioritized even if they're short function words
 */
const MEANING_CRITICAL_WORDS = new Set([
  'if', 'not', 'no', "can't", "don't", "doesn't", "didn't", "won't", "wouldn't", "couldn't", "shouldn't",
  'do', 'did', 'does', 'can', 'could', 'should', 'would', 'will', 'must',
  'before', 'after', 'until', 'unless', 'without', 'with',
  'all', 'none', 'some', 'any', 'every', 'each',
  'only', 'just', 'even', 'still', 'already', 'yet'
])

/**
 * Reduction-critical words that are crucial for listening (weak forms, linking, chunk boundaries)
 * These are prepositions, articles, infinitive markers, and common reduced forms
 * NOTE: These are NOT always shown - they must meet eligibility conditions
 */
const REDUCTION_CRITICAL_WORDS = new Set([
  'to', 'a', 'an', 'the', 'of', 'at', 'for', 'in', 'on', 'and', 'are', 'you', 'we', 'they', 'we\'re', 'you\'re', 'they\'re'
])

/**
 * @deprecated Use REDUCTION_CRITICAL_WORDS instead
 * Kept for backward compatibility
 */
const GRAMMAR_CRITICAL_WORDS = REDUCTION_CRITICAL_WORDS

/**
 * @deprecated Use GRAMMAR_CRITICAL_WORDS instead
 * Kept for backward compatibility
 */
const LISTENING_CRITICAL_SHORT_WORDS = GRAMMAR_CRITICAL_WORDS

/**
 * Known reduction patterns that include reduction-critical words
 * Used for eligibility: show reduction-critical words when they're part of these patterns
 */
const REDUCTION_PATTERNS = [
  // "to" patterns (reduced forms)
  'want to', 'going to', 'have to', 'need to', 'try to', 'used to', 'supposed to', 'gotta', 'wanna',
  'to get to', 'to do', 'to be', 'to have', 'to go', 'to make', 'to take', 'to see', 'to know',
  // Article + noun patterns (linking)
  'a reservation', 'a coffee', 'a train', 'a meeting', 'a ticket', 'a table',
  'the train', 'the station', 'the meeting', 'the ticket', 'the table', 'the restaurant',
  'an appointment', 'an hour', 'an example',
  // Preposition patterns
  'of course', 'at least', 'for example', 'for now', 'for sure',
  // Conjunction patterns
  'and then', 'and also', 'or not', 'but also'
]

/**
 * @deprecated Use REDUCTION_PATTERNS instead
 * Kept for backward compatibility
 */
const LISTENING_PATTERNS = REDUCTION_PATTERNS

/**
 * Check if a word is a meaning-critical word
 */
function isMeaningCritical(word: string): boolean {
  const lowerWord = word.toLowerCase().trim()
  return MEANING_CRITICAL_WORDS.has(lowerWord)
}

/**
 * Check if a word is a reduction-critical word (prepositions, articles, infinitive markers)
 */
function isReductionCritical(word: string): boolean {
  const lowerWord = word.toLowerCase().trim()
  return REDUCTION_CRITICAL_WORDS.has(lowerWord)
}

/**
 * @deprecated Use isReductionCritical instead
 * Kept for backward compatibility
 */
function isGrammarCritical(word: string): boolean {
  return isReductionCritical(word)
}

/**
 * @deprecated Use isGrammarCritical instead
 * Kept for backward compatibility
 */
function isListeningCritical(word: string): boolean {
  return isGrammarCritical(word)
}

/**
 * Check if a span matches a known reduction pattern
 */
function matchesReductionPattern(span: string, context?: string): boolean {
  const lowerSpan = span.toLowerCase().trim()
  const lowerContext = context?.toLowerCase() || ''
  const combined = `${lowerContext} ${lowerSpan}`.trim()
  
  return REDUCTION_PATTERNS.some(pattern => {
    const lowerPattern = pattern.toLowerCase()
    return lowerSpan.includes(lowerPattern) || 
           lowerPattern.includes(lowerSpan) ||
           combined.includes(lowerPattern)
  })
}

/**
 * @deprecated Use matchesReductionPattern instead
 * Kept for backward compatibility
 */
function matchesListeningPattern(span: string, context?: string): boolean {
  return matchesReductionPattern(span, context)
}

/**
 * Get word category for debugging and prioritization
 */
function getWordCategory(word: string): 'meaning-critical' | 'reduction-critical' | 'content' {
  const normalized = word.toLowerCase().trim()
  if (isMeaningCritical(normalized)) return 'meaning-critical'
  if (isReductionCritical(normalized)) return 'reduction-critical'
  return 'content'
}

/**
 * Check if a word is a function word (article, pronoun, preposition, etc.)
 * Function words are less valuable for learning feedback
 */
function isFunctionWord(word: string): boolean {
  const lowerWord = word.toLowerCase().trim()
  const functionWords = new Set([
    // Articles
    'a', 'an', 'the',
    // Pronouns
    'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
    // Prepositions
    'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'up', 'about', 'into', 'onto',
    // Conjunctions
    'and', 'or', 'but', 'so', 'yet', 'nor',
    // Auxiliary verbs
    'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
    // Other common function words
    'as', 'if', 'than', 'that', 'this', 'these', 'those', 'what', 'which', 'who', 'when', 'where', 'why', 'how'
  ])
  return functionWords.has(lowerWord)
}

/**
 * Score and prioritize mistakes based on learning value
 */
function scoreMistake(
  event: AlignmentEvent,
  clip?: { focusAreas?: string[] }
): number {
  let score = 0
  const expectedSpan = event.expectedSpan || ''
  const actualSpan = event.actualSpan || ''
  const position = event.refStart || 0
  
  // Count words
  const wordCount = expectedSpan.split(/\s+/).filter(w => w.trim()).length
  const normalizedSpan = expectedSpan.toLowerCase().trim()
  
  // BOOST: Meaning-critical words (HIGHEST PRIORITY - overrides penalties)
  // These words change sentence meaning significantly and should always surface
  if (wordCount === 1 && isMeaningCritical(normalizedSpan)) {
    score += 150  // Strong boost to compete with content words like "o'clock"
  }
  
  // BOOST: Reduction-critical words (with conditional eligibility - only if they matter for listening)
  // These words are crucial for listening (weak forms, linking, chunk boundaries)
  // BUT: They are NOT always shown - eligibility is checked in selection phase
  const isReductionCriticalWord = wordCount === 1 && isReductionCritical(normalizedSpan)
  if (isReductionCriticalWord) {
    // Base boost (smaller than meaning-critical)
    // Eligibility will be checked in selection phase
    score += 60  // Moderate boost (less than meaning-critical +150, but enough to compete)
    
    // Extra boost if part of known reduction pattern
    const context = '' // Will be checked in selection phase
    if (matchesReductionPattern(expectedSpan, context)) {
      score += 40  // Additional boost for reduction patterns (total +100)
    }
  }
  
  // STRONG PENALTY: Single-letter words (almost never worth showing)
  // BUT: Skip penalty if it's meaning-critical or reduction-critical
  if (wordCount === 1 && expectedSpan.length === 1 && !isMeaningCritical(normalizedSpan) && !isReductionCriticalWord) {
    score -= 200  // Heavily deprioritize single letters like "I", "a"
  }
  
  // PENALTY: Single function words (less valuable for learning)
  // BUT: Skip penalty if it's meaning-critical
  // BUT: Reduce penalty if it's reduction-critical (0.25x)
  if (wordCount === 1 && isFunctionWord(expectedSpan) && !isMeaningCritical(normalizedSpan)) {
    if (isReductionCriticalWord) {
      score -= 25  // Reduced penalty (0.25x of -100) for reduction-critical words
    } else {
      score -= 100  // Full penalty for other function words
    }
  }
  
  // PENALTY: Single short words (least valuable for learning)
  // BUT: Skip penalty if it's meaning-critical
  // BUT: Reduce penalty if it's reduction-critical (0.25x)
  if (wordCount === 1 && expectedSpan.length <= 3 && expectedSpan.length > 1 && !isMeaningCritical(normalizedSpan)) {
    if (isReductionCriticalWord) {
      score -= 12.5  // Reduced penalty (0.25x of -50) for reduction-critical words
    } else if (!isFunctionWord(expectedSpan)) {
      score -= 50  // Full penalty for other short words
    }
  }
  
  // Priority 1: Multi-word phrases (HIGHEST - most valuable for learning)
  if (wordCount >= 3) {
    score += 100  // "caught up with", "get along with"
  } else if (wordCount === 2) {
    score += 90   // "binge watching", "kind of"
  }
  
  // Priority 2: Phrasal verbs (very important for natural speech)
  if (isPhrasalVerb(expectedSpan)) {
    score += 85
  }
  
  // Priority 3: Focus areas (clip-specific learning goals)
  if (clip?.focusAreas && clip.focusAreas.length > 0) {
    const matchesFocus = clip.focusAreas.some(f => isRelatedToFocus(event, f))
    if (matchesFocus) {
      score += 80
    }
  }
  
  // Priority 4: Idioms/expressions (culturally important)
  if (isIdiom(expectedSpan)) {
    score += 70
  }
  
  // Priority 5: Reductions (common but useful)
  if (isReduction(expectedSpan, actualSpan)) {
    score += 60
  }
  
  // Priority 6: Contractions (casual speech patterns)
  if (expectedSpan.startsWith("'") || expectedSpan.includes("'")) {
    score += 40
  }
  
  // Minor: Earlier in sentence (slightly more noticeable)
  score -= position * 0.5
  
  return score
}

/**
 * Get all known phrases (phrasal verbs and idioms) for grouping
 */
function getAllKnownPhrases(): string[] {
  const phrasalVerbs = [
    // Very common
    'check out', 'figure out', 'pick up', 'hang out',
    'catch up', 'caught up', 'get up', 'wake up',
    'give up', 'look up', 'come back', 'go out',
    'stay up', 'turn on', 'turn off', 'put on',
    'take off', 'break down', 'call off', 'carry on',
    'find out', 'get along', 'get over', 'give in',
    'hold on', 'look after', 'look for', 'make up',
    'run into', 'set up', 'show up', 'take care',
    'work out', 'bring up', 'cut off', 'fill out',
    
    // With prepositions (3-word phrasal verbs)
    'caught up with', 'catch up with', 'keep up with',
    'come up with', 'get along with', 'put up with',
    'look forward to', 'run out of', 'get rid of',
    'look down on', 'get away with', 'hang out with',
    
    // Casual/Modern
    'binge watch', 'chill out', 'hang around',
    'hook up', 'mess around', 'freak out'
  ]
  
  const idioms = [
    'kind of', 'sort of', 'a lot of', 'piece of cake',
    'break a leg', 'hit the nail', 'under the weather',
    'on the same page', 'beat around the bush', 'break the ice',
    'call it a day', 'cut corners', 'get the ball rolling',
    'hit the sack', 'pull yourself together', 'so far so good',
    'the best of both worlds', 'time flies', 'when pigs fly',
    'you can say that again', 'by the way', 'for the time being',
    'in the long run', 'make ends meet', 'no pain no gain',
    'once in a blue moon', 'rain or shine', 'see eye to eye'
  ]
  
  // Sort by length (longest first) to match longer phrases first
  return [...phrasalVerbs, ...idioms].sort((a, b) => b.length - a.length)
}

/**
 * Find which known phrase a mistake belongs to (if any)
 * Returns the phrase if found, null otherwise
 */
function findPhraseForMistake(expectedSpan: string): string | null {
  const lowerSpan = expectedSpan.toLowerCase().trim()
  const knownPhrases = getAllKnownPhrases()
  
  // Check if the mistake span is part of any known phrase
  for (const phrase of knownPhrases) {
    const lowerPhrase = phrase.toLowerCase()
    
    // Check if mistake is exactly the phrase
    if (lowerSpan === lowerPhrase) {
      return phrase
    }
    
    // Check if mistake is a substring of the phrase (e.g., "looking" is part of "looking forward to")
    if (lowerPhrase.includes(lowerSpan) && lowerSpan.length >= 3) {
      return phrase
    }
    
    // Check if the phrase is a substring of the mistake (e.g., mistake is "looking forward" and phrase is "looking forward to")
    if (lowerSpan.includes(lowerPhrase)) {
      return phrase
    }
  }
  
  return null
}

/**
 * Check if a reduction-critical word should be surfaced (conditional eligibility)
 * Returns true if any of the following conditions are met:
 * (Rule 1) The word is part of a known reduction pattern (e.g., "want to", "going to", "gotta", "wanna")
 * (Rule 2) The word is adjacent to another mistake within N tokens (N=1 or 2)
 * (Rule 3) The word is one of the "high-value" reduction set: to, a, an, the, of, for
 */
function shouldSurfaceReductionCritical(
  event: AlignmentEvent,
  allEvents: AlignmentEvent[],
  refTokens?: string[]
): boolean {
  const expectedSpan = event.expectedSpan || ''
  const normalized = expectedSpan.toLowerCase().trim()
  
  if (!isReductionCritical(normalized)) {
    return false
  }
  
  // Rule 1: Part of known reduction pattern
  if (refTokens) {
    const position = event.refStart || 0
    // Check if this word is part of a reduction pattern in context
    const context = refTokens.slice(Math.max(0, position - 2), Math.min(refTokens.length, position + 3)).join(' ')
    if (matchesReductionPattern(expectedSpan, context)) {
      return true
    }
  }
  
  // Rule 3: High-value reduction set (to, a, an, the, of, for)
  // These are the most pedagogically valuable weak forms
  const highValueReductions = ['to', 'a', 'an', 'the', 'of', 'for']
  if (highValueReductions.includes(normalized)) {
    return true
  }
  
  // Rule 2: Adjacent to another mistake within +/-2 tokens
  // This suggests linking/reduction caused the miss
  const eventPosition = event.refStart || 0
  const hasAdjacentMistake = allEvents.some(e => {
    if (e === event) return false
    const ePosition = e.refStart || 0
    const distance = Math.abs(ePosition - eventPosition)
    
    // Check if within +/-2 tokens
    if (distance <= 2) {
      return true
    }
    return false
  })
  
  if (hasAdjacentMistake) {
    return true
  }
  
  // Default: don't surface (not pedagogically valuable without context)
  return false
}

/**
 * @deprecated Use shouldSurfaceReductionCritical instead
 * Kept for backward compatibility
 */
function shouldSurfaceGrammarCritical(
  event: AlignmentEvent,
  allEvents: AlignmentEvent[],
  refTokens?: string[]
): boolean {
  return shouldSurfaceReductionCritical(event, allEvents, refTokens)
}

/**
 * Expand reduction-critical word into a chunk (e.g., "to" → "to get to", "a" → "a reservation")
 * Returns the expanded chunk if found, otherwise returns the original span
 */
function expandListeningCriticalChunk(
  event: AlignmentEvent,
  refTokens?: string[]
): string {
  const expectedSpan = event.expectedSpan || ''
  const normalized = expectedSpan.toLowerCase().trim()
  
  if (!isReductionCritical(normalized) || !refTokens || refTokens.length === 0) {
    return expectedSpan
  }
  
  const position = event.refStart || 0
  
  // Pattern 1: "to" + verb patterns ("to get to", "want to", "going to")
  if (normalized === 'to') {
    // Look ahead for verb patterns
    if (position + 1 < refTokens.length) {
      const nextToken = refTokens[position + 1]?.toLowerCase() || ''
      // Check if next token is a verb or part of a pattern
      if (['get', 'go', 'be', 'have', 'do', 'make', 'take', 'see', 'know'].includes(nextToken)) {
        // Check if there's a "to" after (e.g., "to get to")
        if (position + 2 < refTokens.length && refTokens[position + 2]?.toLowerCase() === 'to') {
          return refTokens.slice(position, position + 3).join(' ')
        }
        // Otherwise, return "to + verb"
        return refTokens.slice(position, position + 2).join(' ')
      }
    }
    // Look behind for "want to", "going to", etc.
    if (position >= 1) {
      const prevToken = refTokens[position - 1]?.toLowerCase() || ''
      if (['want', 'going', 'have', 'need', 'try', 'used', 'supposed'].includes(prevToken)) {
        return refTokens.slice(position - 1, position + 1).join(' ')
      }
    }
  }
  
  // Pattern 2: "a/an/the" + noun patterns ("a reservation", "the train")
  if (['a', 'an', 'the'].includes(normalized)) {
    if (position + 1 < refTokens.length) {
      const nextToken = refTokens[position + 1] || ''
      // Check if next token is likely a noun (not a function word)
      if (nextToken.length > 2 && !isFunctionWord(nextToken.toLowerCase())) {
        return refTokens.slice(position, position + 2).join(' ')
      }
    }
  }
  
  return expectedSpan
}

/**
 * Group mistakes by phrase membership
 * Mistakes that belong to the same phrase are grouped together
 * Also groups listening-critical words with their adjacent content words
 */
function groupMistakesByPhrase(
  scored: Array<{ event: AlignmentEvent; score: number; isReductionCritical?: boolean; shouldSurface?: boolean; category?: string }>,
  refTokens?: string[]
): Map<string, Array<{ event: AlignmentEvent; score: number; isReductionCritical?: boolean; shouldSurface?: boolean; category?: string }>> {
  const phraseGroups = new Map<string, Array<{ event: AlignmentEvent; score: number; isReductionCritical?: boolean; shouldSurface?: boolean; category?: string }>>()
  const ungrouped: Array<{ event: AlignmentEvent; score: number; isReductionCritical?: boolean; shouldSurface?: boolean; category?: string }> = []
  
  for (const item of scored) {
    const expectedSpan = item.event.expectedSpan || ''
    const normalized = expectedSpan.toLowerCase().trim()
    
    // First, try to find known phrase
    const phrase = findPhraseForMistake(expectedSpan)
    
    if (phrase) {
      if (!phraseGroups.has(phrase)) {
        phraseGroups.set(phrase, [])
      }
      phraseGroups.get(phrase)!.push(item)
    } else if (item.isReductionCritical && item.shouldSurface && refTokens) {
      // For reduction-critical words, try to expand into chunk
      const expanded = expandListeningCriticalChunk(item.event, refTokens)
      if (expanded !== expectedSpan) {
        // Use expanded chunk as group key
        const chunkKey = `chunk_${expanded}`
        if (!phraseGroups.has(chunkKey)) {
          phraseGroups.set(chunkKey, [])
        }
        phraseGroups.get(chunkKey)!.push(item)
      } else {
        // No expansion possible, use as individual group
        ungrouped.push(item)
      }
    } else {
      // Mistakes not part of any known phrase get their own "group" (using their span as key)
      ungrouped.push(item)
    }
  }
  
  // Add ungrouped mistakes as individual groups
  for (const item of ungrouped) {
    const key = item.event.expectedSpan || `ungrouped_${item.event.eventId}`
    phraseGroups.set(key, [item])
  }
  
  return phraseGroups
}

/**
 * Prioritize and select top 3 mistakes by learning value
 * Groups mistakes by phrase to avoid duplicate feedback for the same phrase
 * 
 * @param events - Array of alignment events (mistakes)
 * @param clip - Optional clip metadata with focusAreas
 * @param refTokens - Optional reference tokens for context (used for chunking and gating)
 * @returns Array of up to 3 prioritized events
 */
export function prioritizeAndSelectTop3(
  events: AlignmentEvent[],
  clip?: { focusAreas?: string[] },
  refTokens?: string[]
): AlignmentEvent[] {
  if (!events || events.length === 0) {
    return []
  }
  
  // Filter out trivial mistakes before scoring:
  // 1. Single-letter words (like "I", "a")
  // 2. Very short function words that are likely not meaningful
  // BUT: Never filter out meaning-critical words
  // BUT: Never filter out listening-critical words (they'll be gated later)
  const filteredEvents = events.filter(event => {
    const expectedSpan = event.expectedSpan || ''
    const trimmed = expectedSpan.trim()
    const normalized = trimmed.toLowerCase()
    
    // NEVER filter out meaning-critical words
    if (isMeaningCritical(normalized)) {
      return true
    }
    
    // NEVER filter out reduction-critical words (eligibility happens in scoring/selection)
    if (isReductionCritical(normalized)) {
      return true
    }
    
    // Filter out single-letter words
    if (trimmed.length === 1) {
      return false
    }
    
    // Filter out very short function words (1-2 letters) unless they're part of a phrase
    if (trimmed.length <= 2 && isFunctionWord(trimmed)) {
      return false
    }
    
    return true
  })
  
  // If all events were filtered out, return empty array
  if (filteredEvents.length === 0) {
    console.log('⚠️ [Prioritization] All mistakes filtered out as trivial')
    return []
  }
  
  // Score each mistake
  const scored = filteredEvents.map(event => {
    const score = scoreMistake(event, clip)
    const expectedSpan = event.expectedSpan || ''
    const normalized = expectedSpan.toLowerCase().trim()
    const isCritical = isMeaningCritical(normalized)
    const isReductionCriticalWord = isReductionCritical(normalized)
    const shouldSurface = isReductionCriticalWord ? shouldSurfaceReductionCritical(event, filteredEvents, refTokens) : true
    const category = getWordCategory(normalized)
    
    // Debug logging for ranking components
    if (process.env.NODE_ENV === 'development') {
      const wordCount = expectedSpan.split(/\s+/).filter(w => w.trim()).length
      const multiWordScore = wordCount >= 3 ? 100 : wordCount === 2 ? 90 : 0
      const phrasalScore = isPhrasalVerb(expectedSpan) ? 85 : 0
      const idiomScore = isIdiom(expectedSpan) ? 70 : 0
      const reductionScore = isReduction(expectedSpan, event.actualSpan || '') ? 60 : 0
      const contractionScore = (expectedSpan.startsWith("'") || expectedSpan.includes("'")) ? 40 : 0
      const singleLetterPenalty = (wordCount === 1 && expectedSpan.length === 1 && !isCritical && !isReductionCriticalWord) ? -200 : 0
      const functionWordPenalty = (wordCount === 1 && isFunctionWord(expectedSpan) && !isCritical) ? (isReductionCriticalWord ? -25 : -100) : 0
      const shortWordPenalty = (wordCount === 1 && expectedSpan.length <= 3 && expectedSpan.length > 1 && !isFunctionWord(expectedSpan) && !isCritical) ? (isReductionCriticalWord ? -12.5 : -50) : 0
      const meaningCriticalBoost = isCritical ? 150 : 0
      const positionPenalty = -(event.refStart || 0) * 0.5
      
      const reductionCriticalBoost = isReductionCriticalWord ? 60 : 0
      const reductionPatternBoost = (isReductionCriticalWord && matchesReductionPattern(expectedSpan, '')) ? 40 : 0
      
      console.log(`📊 [Prioritization] Scoring "${expectedSpan}":`, {
        token: expectedSpan,
        normalized,
        category,
        type: event.type,
        position: event.refStart || 0,
        wordCount,
        filtered: false, // Never filtered if we reach scoring
        isMeaningCritical: isCritical,
        isReductionCritical: isReductionCriticalWord,
        shouldSurface: shouldSurface,
        isFunctionWord: wordCount === 1 && isFunctionWord(expectedSpan),
        score: score.toFixed(1),
        breakdown: {
          meaningCriticalBoost,
          reductionCriticalBoost,
          reductionPatternBoost,
          multiWord: multiWordScore,
          phrasalVerb: phrasalScore,
          idiom: idiomScore,
          reduction: reductionScore,
          contraction: contractionScore,
          singleLetterPenalty,
          functionWordPenalty,
          shortWordPenalty,
          positionPenalty: positionPenalty.toFixed(1)
        }
      })
    }
    
      return {
        event,
        score,
        isMeaningCritical: isCritical,
        isReductionCritical: isReductionCriticalWord,
        shouldSurface: shouldSurface,
        category
      }
    })
  
  // Separate mistakes by type
  const criticalMistakes = scored.filter(item => item.isMeaningCritical)
  const reductionCriticalMistakes = scored.filter(item => item.isReductionCritical && item.shouldSurface)
  const otherMistakes = scored.filter(item => !item.isMeaningCritical && !item.isReductionCritical)
  
  // Filter out mistakes with negative scores (trivial mistakes)
  // BUT: Always keep meaning-critical mistakes even if they have negative scores
  // BUT: Always keep reduction-critical mistakes that pass eligibility (even if negative scores)
  const meaningfulOtherMistakes = otherMistakes.filter(item => item.score > 0)
  
  // Combine: meaning-critical first, then reduction-critical (gated), then meaningful others
  // If no meaningful mistakes, still show the best ones (even if negative score)
  const mistakesToUse = [
    ...criticalMistakes,  // Always include meaning-critical mistakes
    ...reductionCriticalMistakes,  // Include reduction-critical that pass eligibility
    ...(meaningfulOtherMistakes.length > 0 ? meaningfulOtherMistakes : otherMistakes)
  ]
  
  // Debug logging for multi-card bug
  if (process.env.NODE_ENV === 'development') {
    console.log('🔍 [Prioritization] Mistake counts:', {
      totalDetected: events.length,
      afterFiltering: filteredEvents.length,
      meaningCritical: criticalMistakes.length,
      reductionCritical: reductionCriticalMistakes.length,
      other: otherMistakes.length,
      meaningfulOther: meaningfulOtherMistakes.length,
      finalSelected: mistakesToUse.length
    })
  }
  
  // Log final ranking for debugging
  if (process.env.NODE_ENV === 'development') {
    console.log('📋 [Prioritization] Final ranking:', mistakesToUse.map((item, idx) => ({
      rank: idx + 1,
      token: item.event.expectedSpan,
      category: item.category,
      score: item.score.toFixed(1),
      isMeaningCritical: item.isMeaningCritical,
      isReductionCritical: item.isReductionCritical,
      shouldSurface: item.shouldSurface
    })))
  }
  
  // Group mistakes by phrase membership (with chunking for listening-critical words)
  const phraseGroups = groupMistakesByPhrase(mistakesToUse, refTokens)
  
  // For each phrase group, select the highest-scoring mistake
  const bestFromEachGroup = Array.from(phraseGroups.entries()).map(([phrase, items]) => {
    // Sort by score within the group and take the best one
    const sorted = items.sort((a, b) => {
      // Prioritize meaning-critical mistakes within the group
      if (a.isMeaningCritical && !b.isMeaningCritical) return -1
      if (!a.isMeaningCritical && b.isMeaningCritical) return 1
      return b.score - a.score
    })
    
    const bestItem = sorted[0]
    
    // If this is a listening-critical word that was chunked, update the event's expectedSpan
    // to reflect the chunk (e.g., "a" → "a reservation")
    let eventToReturn = bestItem.event
    if (bestItem.isReductionCritical && bestItem.shouldSurface && phrase.startsWith('chunk_')) {
      const chunkText = phrase.replace('chunk_', '')
      // Create a new event with updated expectedSpan (don't mutate original)
      eventToReturn = {
        ...bestItem.event,
        expectedSpan: chunkText
      }
    }
    
    return {
      phrase,
      bestItem: {
        ...bestItem,
        event: eventToReturn
      },
      score: bestItem.score
    }
  })
  
  // Sort groups by their best mistake's score (highest first)
  // BUT: Prioritize groups containing meaning-critical words
  const sortedGroups = bestFromEachGroup.sort((a, b) => {
    const aIsCritical = a.bestItem.isMeaningCritical || false
    const bIsCritical = b.bestItem.isMeaningCritical || false
    
    // If one is meaning-critical and the other isn't, meaning-critical wins
    if (aIsCritical && !bIsCritical) return -1
    if (!aIsCritical && bIsCritical) return 1
    
    // Otherwise, sort by score
    return b.score - a.score
  })
  
  // Take top 3 (one from each of the top 3 phrase groups)
  // BUT: Ensure at least 1 meaning-critical mistake is included if present
  // BUT: Limit reduction-critical to max 1 unless no other mistakes exist (to reduce noise)
  const MAX_CARDS = 3
  let top3 = sortedGroups.slice(0, MAX_CARDS).map(g => g.bestItem.event)
  
  // Ensure at least 1 meaning-critical appears if present
  const hasMeaningCriticalInTop3 = top3.some(e => {
    const normalized = (e.expectedSpan || '').toLowerCase().trim()
    return isMeaningCritical(normalized)
  })
  
  const allMeaningCritical = mistakesToUse.filter(item => item.isMeaningCritical)
  if (allMeaningCritical.length > 0 && !hasMeaningCriticalInTop3) {
    // Replace lowest-scoring non-meaning-critical with highest-scoring meaning-critical
    const top3WithScores = top3.map(e => ({
      event: e,
      score: scoreMistake(e, clip),
      isMeaningCritical: isMeaningCritical((e.expectedSpan || '').toLowerCase().trim())
    }))
    
    // Find lowest-scoring non-meaning-critical
    const nonCritical = top3WithScores.filter(item => !item.isMeaningCritical)
    if (nonCritical.length > 0) {
      nonCritical.sort((a, b) => a.score - b.score) // Lowest first
      const lowestIndex = top3.findIndex(e => e === nonCritical[0].event)
      
      // Replace with highest-scoring meaning-critical
      const bestMeaningCritical = allMeaningCritical
        .sort((a, b) => b.score - a.score)[0]
        .event
      
      top3[lowestIndex] = bestMeaningCritical
    }
  }
  
  // Limit reduction-critical to max 1 in top 3 (to reduce noise)
  const reductionCriticalInTop3 = top3.filter(e => {
    const normalized = (e.expectedSpan || '').toLowerCase().trim()
    return isReductionCritical(normalized)
  })
  
  // If more than 1 reduction-critical in top3, and we have other mistakes, replace extras
  const maxReductionCritical = 1
  if (reductionCriticalInTop3.length > maxReductionCritical && mistakesToUse.length > reductionCriticalInTop3.length) {
    // Keep the highest-scoring reduction-critical (up to max), replace others
    const top3WithMetadata = top3.map(e => {
      const normalized = (e.expectedSpan || '').toLowerCase().trim()
      return {
        event: e,
        score: scoreMistake(e, clip),
        isReductionCritical: isReductionCritical(normalized),
        isMeaningCritical: isMeaningCritical(normalized)
      }
    })
    
    // Sort by: meaning-critical first, then score
    top3WithMetadata.sort((a, b) => {
      if (a.isMeaningCritical && !b.isMeaningCritical) return -1
      if (!a.isMeaningCritical && b.isMeaningCritical) return 1
      if (a.isReductionCritical && !b.isReductionCritical) return 1  // Prefer non-reduction-critical when equal
      if (!a.isReductionCritical && b.isReductionCritical) return -1
      return b.score - a.score
    })
    
    // Keep first N reduction-critical (up to max), then take best non-reduction-critical
    const keptReductionCritical = top3WithMetadata.filter(item => item.isReductionCritical).slice(0, maxReductionCritical)
    const nonReductionCritical = top3WithMetadata.filter(item => !item.isReductionCritical)
    
    top3 = [
      ...keptReductionCritical.map(item => item.event),
      ...nonReductionCritical.slice(0, MAX_CARDS - keptReductionCritical.length).map(item => item.event)
    ]
  }
  
  // If we have meaning-critical mistakes but none made it to top 3, replace the lowest-scoring one
  const criticalInTop3 = top3.some(e => {
    const normalized = (e.expectedSpan || '').toLowerCase().trim()
    return isMeaningCritical(normalized)
  })
  
  if (!criticalInTop3 && criticalMistakes.length > 0) {
    // Find the highest-scoring meaning-critical mistake
    const bestCritical = criticalMistakes
      .sort((a, b) => b.score - a.score)[0]
    
    // Replace the lowest-scoring item in top3 with the best meaning-critical
    const top3WithScores = top3.map(e => ({
      event: e,
      score: scoreMistake(e, clip)
    }))
    top3WithScores.sort((a, b) => a.score - b.score) // Lowest first
    top3WithScores[0] = { event: bestCritical.event, score: bestCritical.score }
    
    // Re-sort and take top 3
    top3WithScores.sort((a, b) => b.score - a.score)
    top3 = top3WithScores.slice(0, 3).map(item => item.event)
  }
  
  if (process.env.NODE_ENV === 'development') {
    console.log('🎯 [Prioritization] Final ranked mistakes:', 
      mistakesToUse.map(s => {
        const expectedSpan = s.event.expectedSpan || ''
        const normalized = expectedSpan.toLowerCase().trim()
        const wordCount = expectedSpan.split(/\s+/).filter(w => w.trim()).length
        const isPhrasal = isPhrasalVerb(expectedSpan)
        const isIdiomMatch = isIdiom(expectedSpan)
        const isReduct = isReduction(expectedSpan, s.event.actualSpan || '')
        const phrase = findPhraseForMistake(expectedSpan)
        const isFuncWord = wordCount === 1 && isFunctionWord(expectedSpan)
        const isCritical = isMeaningCritical(normalized)
        const isGrammarCriticalWord = isGrammarCritical(normalized)
        
        // Calculate breakdown
        const meaningCriticalBoost = isCritical ? 150 : 0
        const grammarCriticalBoost = isGrammarCriticalWord ? 70 : 0
        const listeningPatternBoost = (isGrammarCriticalWord && matchesListeningPattern(expectedSpan, '')) ? 40 : 0
        const multiWordScore = wordCount >= 3 ? 100 : wordCount === 2 ? 90 : 0
        const phrasalScore = isPhrasal ? 85 : 0
        const idiomScore = isIdiomMatch ? 70 : 0
        const reductionScore = isReduct ? 60 : 0
        const contractionScore = (expectedSpan.startsWith("'") || expectedSpan.includes("'")) ? 40 : 0
        const singleLetterPenalty = (wordCount === 1 && expectedSpan.length === 1 && !isCritical && !isGrammarCriticalWord) ? -200 : 0
        const functionWordPenalty = (isFuncWord && !isCritical) ? (isGrammarCriticalWord ? -25 : -100) : 0
        const shortWordPenalty = (wordCount === 1 && expectedSpan.length <= 3 && expectedSpan.length > 1 && !isFuncWord && !isCritical) ? (isGrammarCriticalWord ? -12.5 : -50) : 0
        
        return {
          expectedSpan: s.event.expectedSpan,
          score: s.score.toFixed(1),
          wordCount,
          type: s.event.type,
          position: s.event.refStart || 0,
          isMeaningCritical: isCritical,
          isGrammarCritical: isGrammarCriticalWord,
          category: s.category || 'content',
          shouldSurface: s.shouldSurface || false,
          phrase: phrase || '(none)',
          breakdown: {
            meaningCriticalBoost,
            grammarCriticalBoost,
            listeningPatternBoost,
            multiWord: multiWordScore,
            phrasalVerb: phrasalScore,
            idiom: idiomScore,
            reduction: reductionScore,
            contraction: contractionScore,
            singleLetterPenalty,
            functionWordPenalty,
            shortWordPenalty
          }
        }
      })
    )
  }
  
  if (process.env.NODE_ENV === 'development') {
    console.log('🔗 [Prioritization] Phrase groups:', 
      Array.from(phraseGroups.entries()).map(([phrase, items]) => ({
        phrase,
        count: items.length,
        items: items.map(i => ({
          expectedSpan: i.event.expectedSpan,
          score: i.score.toFixed(1),
          isMeaningCritical: i.isMeaningCritical || false,
          isGrammarCritical: i.isGrammarCritical || false,
          category: i.category || 'content',
          shouldSurface: i.shouldSurface || false
        }))
      }))
    )
    
    console.log('✅ [Prioritization] Selected top 3 (one per phrase):', 
      top3.map(e => {
        const normalized = (e.expectedSpan || '').toLowerCase().trim()
        return {
          expectedSpan: e.expectedSpan,
          isMeaningCritical: isMeaningCritical(normalized),
          isGrammarCritical: isGrammarCritical(normalized),
          category: getWordCategory(normalized),
          phrase: findPhraseForMistake(e.expectedSpan || '') || '(ungrouped)',
          score: scoreMistake(e, clip).toFixed(1)
        }
      })
    )
  }
  
  return top3
}

// Export helper functions for testing
export { isPhrasalVerb, isIdiom, isReduction, isMeaningCritical, isReductionCritical, getWordCategory, shouldSurfaceReductionCritical }

