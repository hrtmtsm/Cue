import type { AlignmentToken, AlignmentEvent } from './alignmentEngine'

export type IssueCategory = 
  | 'words_blended' 
  | 'casual_shortcuts'
  | 'brain_filled_in'
  | 'key_words_hard'
  | 'speed_fast'

export interface ReviewSummary {
  categoryId: IssueCategory
  title: string // summary sentence (1-2 lines max)
  examplePhrase: string // 2-4 words from refText
  phrasesToPractice: string[] // 3-6 phrases extracted from error spans
}

// Common casual reductions
const CASUAL_REDUCTIONS = new Set([
  'wanna', 'gonna', 'kinda', 'lemme', 'gimme', 'dunno', 'gotta',
  'ya', 'yeah', 'yep', 'nope', 'cause', 'cos', "'til", "em",
  "i'm", "i'll", "it's", "it'll", "you're", "you'll", "we're", "we'll",
  "that's", "there's", "here's", "what's", "who's", "where's",
  "don't", "doesn't", "didn't", "won't", "wouldn't", "can't", "couldn't",
  "haven't", "hasn't", "hadn't", "would've", "could've", "should've"
])

// Content words are typically nouns/verbs/adjectives (longer than 3 chars)
function isContentWord(word: string): boolean {
  const normalized = word.toLowerCase().replace(/[.,!?;:'"]/g, '')
  return normalized.length > 3 && !CASUAL_REDUCTIONS.has(normalized)
}

/**
 * Extract a 2-5 word phrase from refTokens around an error span
 */
function extractPhrase(
  refTokens: string[],
  startIdx: number,
  endIdx: number,
  targetLength: number = 3
): string {
  if (refTokens.length === 0) return ''
  
  // Expand to include context to make it a phrase (2-5 words)
  const phraseStart = Math.max(0, startIdx - 1)
  const phraseEnd = Math.min(refTokens.length, endIdx + 1)
  
  // Ensure we have 2-5 words
  let phraseTokens = refTokens.slice(phraseStart, phraseEnd)
  if (phraseTokens.length < 2) {
    // Too short, expand
    phraseTokens = refTokens.slice(
      Math.max(0, phraseStart - 1),
      Math.min(refTokens.length, phraseEnd + 1)
    )
  }
  if (phraseTokens.length > 5) {
    // If too long, take centered chunk around the error
    const center = Math.floor((startIdx - phraseStart) / 2)
    phraseTokens = phraseTokens.slice(Math.max(0, center - 2), center + 3)
  }
  
  return phraseTokens.join(' ')
}

/**
 * Check if phrase1 contains phrase2 or vice versa (for deduplication)
 */
function isPhraseContained(phrase1: string, phrase2: string): boolean {
  const p1 = phrase1.toLowerCase().trim()
  const p2 = phrase2.toLowerCase().trim()
  return p1.includes(p2) || p2.includes(p1)
}

/**
 * Deduplicate phrases by removing contained duplicates
 * Keeps the shorter phrase if one contains the other
 */
function deduplicatePhrases(phrases: string[]): string[] {
  const deduped: string[] = []
  
  for (const phrase of phrases) {
    let shouldAdd = true
    const normalized = phrase.toLowerCase().trim()
    
    // Check if this phrase is contained in any existing phrase
    for (let i = 0; i < deduped.length; i++) {
      const existing = deduped[i].toLowerCase().trim()
      
      if (isPhraseContained(normalized, existing)) {
        // If new phrase is shorter, replace the longer one
        if (phrase.length < deduped[i].length) {
          deduped[i] = phrase
        }
        shouldAdd = false
        break
      }
    }
    
    if (shouldAdd) {
      deduped.push(phrase)
    }
  }
  
  return deduped
}

/**
 * Pick the top issue from alignment tokens/events and extract practice phrases
 */
export function pickTopIssue(
  tokens: AlignmentToken[],
  events: AlignmentEvent[],
  refTokens: string[],
  refText: string,
  userText: string,
  accuracyPercent: number
): ReviewSummary {
  // Count error types
  let missingCount = 0
  let extraCount = 0
  let substitutionCount = 0
  let missingClustered = 0
  let casualReductionCount = 0
  let contentWordErrors = 0
  let uniqueWrongGuesses = new Set<string>()
  
  // Track error spans for phrase extraction
  const errorSpans: Array<{ start: number; end: number; type: string }> = []
  
  // Analyze tokens
  for (const token of tokens) {
    if (token.type === 'missing') {
      missingCount++
      if (token.refIndex !== undefined) {
        errorSpans.push({ 
          start: token.refIndex, 
          end: (token.refIndex || 0) + 1, 
          type: 'missing' 
        })
        const word = (token.expected || '').toLowerCase().replace(/[.,!?;:'"]/g, '')
        if (isContentWord(token.expected || '')) {
          contentWordErrors++
        }
      }
    } else if (token.type === 'extra') {
      extraCount++
      if (token.userIndex !== undefined) {
        uniqueWrongGuesses.add((token.actual || '').toLowerCase())
      }
    } else if (token.type === 'substitution') {
      substitutionCount++
      if (token.refIndex !== undefined) {
        errorSpans.push({ 
          start: token.refIndex, 
          end: (token.refIndex || 0) + 1, 
          type: 'substitution' 
        })
        const actual = (token.actual || '').toLowerCase().replace(/[.,!?;:'"]/g, '')
        const expected = (token.expected || '').toLowerCase().replace(/[.,!?;:'"]/g, '')
        uniqueWrongGuesses.add(actual)
        
        // Check if substitution looks like a casual reduction
        if (CASUAL_REDUCTIONS.has(actual) || CASUAL_REDUCTIONS.has(expected)) {
          casualReductionCount++
        }
        
        if (isContentWord(token.expected || '')) {
          contentWordErrors++
        }
      }
    }
  }
  
  // Check for clustered missing tokens (adjacent)
  for (let i = 0; i < tokens.length - 1; i++) {
    const curr = tokens[i]
    const next = tokens[i + 1]
    if (curr.type === 'missing' && next.type === 'missing' &&
        curr.refIndex !== undefined && next.refIndex !== undefined &&
        Math.abs((curr.refIndex || 0) - (next.refIndex || 0)) <= 1) {
      missingClustered++
    }
  }
  
  // Check events for phrase hints (blended phrases)
  for (const event of events) {
    if (event.phraseHint && (event.type === 'missing' || event.type === 'substitution')) {
      errorSpans.push({
        start: event.phraseHint.spanRefStart,
        end: event.phraseHint.spanRefEnd,
        type: event.type
      })
      missingClustered += 2 // Weight phrase hints heavily
    }
  }
  
  // Extract practice phrases from error spans (prioritize phrase hints)
  const practicePhrases: string[] = []
  
  // First, extract from events with phrase hints (these are best)
  for (const event of events) {
    if (event.phraseHint && (event.type === 'missing' || event.type === 'substitution')) {
      const phrase = extractPhrase(
        refTokens,
        event.phraseHint.spanRefStart,
        event.phraseHint.spanRefEnd,
        3
      )
      if (phrase && phrase.trim().length > 0) {
        practicePhrases.push(phrase.trim())
      }
    }
  }
  
  // Then, extract from error spans that weren't covered by phrase hints
  const sortedSpans = [...errorSpans].sort((a, b) => a.start - b.start)
  for (const span of sortedSpans) {
    // Skip if already covered by phrase hint
    const alreadyCovered = events.some(e => 
      e.phraseHint && 
      e.phraseHint.spanRefStart <= span.start && 
      span.end <= e.phraseHint.spanRefEnd
    )
    if (alreadyCovered) continue
    
    const phrase = extractPhrase(refTokens, span.start, span.end, 3)
    if (phrase && phrase.trim().length > 0) {
      practicePhrases.push(phrase.trim())
    }
  }
  
  // If still not enough, get from events directly
  if (practicePhrases.length < 3) {
    for (const event of events.slice(0, 5)) {
      if (event.type === 'missing' || event.type === 'substitution') {
        const phrase = extractPhrase(refTokens, event.refStart, event.refEnd, 3)
        if (phrase && phrase.trim().length > 0 && !practicePhrases.includes(phrase.trim())) {
          practicePhrases.push(phrase.trim())
        }
      }
    }
  }
  
  // Deduplicate phrases (remove contained duplicates)
  let phrasesArray = deduplicatePhrases(practicePhrases)
  
  // Limit to top 5 phrases (sorted by appearance order)
  phrasesArray = phrasesArray.slice(0, 5)
  
  // Determine category (pick strongest signal)
  let categoryId: IssueCategory = 'words_blended'
  let title = ''
  let examplePhrase = ''
  
  // 1. Words blended together (clustered missing)
  if (missingClustered >= 2) {
    categoryId = 'words_blended'
    title = 'You tended to miss phrases when words were spoken together.'
    const firstClustered = events.find(e => e.phraseHint || 
      (e.type === 'missing' && tokens.find(t => 
        t.type === 'missing' && t.refIndex === e.refStart - 1
      ))
    )
    if (firstClustered && refTokens.length > 0) {
      examplePhrase = extractPhrase(refTokens, firstClustered.refStart, firstClustered.refEnd)
    }
  }
  // 2. Casual shortcuts (reductions like wanna/gonna)
  else if (casualReductionCount >= 2) {
    categoryId = 'casual_shortcuts'
    title = 'It was hardest when casual shortcuts were used in fast speech.'
    const casualEvent = events.find(e => {
      if (e.type !== 'substitution') return false
      const actual = (e.actualSpan || '').toLowerCase()
      const expected = (e.expectedSpan || '').toLowerCase()
      return CASUAL_REDUCTIONS.has(actual) || CASUAL_REDUCTIONS.has(expected)
    })
    if (casualEvent && refTokens.length > 0) {
      examplePhrase = extractPhrase(refTokens, casualEvent.refStart, casualEvent.refEnd)
    }
  }
  // 3. Brain filled in extra words
  else if (extraCount >= 2 && extraCount >= substitutionCount) {
    categoryId = 'brain_filled_in'
    title = 'Your brain often filled in extra words when the audio was unclear.'
    const extraEvent = events.find(e => e.type === 'extra')
    if (extraEvent && refTokens.length > 0) {
      // Get surrounding context
      const contextIdx = Math.min(extraEvent.refStart, refTokens.length - 1)
      examplePhrase = extractPhrase(refTokens, contextIdx, contextIdx + 1)
    }
  }
  // 4. Key words were hard to catch
  else if (contentWordErrors >= 2) {
    categoryId = 'key_words_hard'
    title = 'Some key words were hard to catch in fast speech.'
    const contentEvent = events.find(e => {
      if (e.type === 'missing' || e.type === 'substitution') {
        return isContentWord(e.expectedSpan || '')
      }
      return false
    })
    if (contentEvent && refTokens.length > 0) {
      examplePhrase = extractPhrase(refTokens, contentEvent.refStart, contentEvent.refEnd)
    }
  }
  // 5. Speed felt fast (low accuracy + many wrong guesses)
  else if (accuracyPercent < 40 && uniqueWrongGuesses.size >= 3) {
    categoryId = 'speed_fast'
    title = 'The speed felt fast, making it harder to catch every word.'
    const firstEvent = events[0]
    if (firstEvent && refTokens.length > 0) {
      examplePhrase = extractPhrase(refTokens, firstEvent.refStart, firstEvent.refEnd)
    }
  }
  // Default: words blended
  else {
    categoryId = 'words_blended'
    title = 'You tended to miss phrases when words were spoken together.'
    const firstMissing = events.find(e => e.type === 'missing')
    if (firstMissing && refTokens.length > 0) {
      examplePhrase = extractPhrase(refTokens, firstMissing.refStart, firstMissing.refEnd)
    }
  }
  
  // Fallback example phrase
  if (!examplePhrase && refTokens.length > 0) {
    const firstEvent = events[0]
    if (firstEvent) {
      examplePhrase = extractPhrase(refTokens, firstEvent.refStart, firstEvent.refEnd)
    } else {
      examplePhrase = refTokens.slice(0, Math.min(3, refTokens.length)).join(' ')
    }
  }
  
  // Ensure we have at least one practice phrase
  if (phrasesArray.length === 0 && examplePhrase) {
    phrasesArray.push(examplePhrase)
  }
  
  return {
    categoryId,
    title,
    examplePhrase: examplePhrase || refTokens.slice(0, Math.min(3, refTokens.length)).join(' '),
    phrasesToPractice: phrasesArray.length > 0 ? phrasesArray : [
      refTokens.slice(0, Math.min(3, refTokens.length)).join(' ')
    ],
  }
}

