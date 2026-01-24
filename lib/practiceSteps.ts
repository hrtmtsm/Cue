import type { AlignmentEvent } from './alignmentEngine'
import { expandContraction, isContraction } from './contractionNormalizer'
import { matchListeningPattern, isEligibleForPatternMatching, matchListeningPatternBackward, isEligibleForBackwardPatternMatching } from './listeningPatternMatcher'
import { shouldSynthesizeChunk, isEligibleForChunkSynthesis, synthesizeChunk } from './chunkSynthesizer'
import type { ListeningPattern } from './listeningPatterns'
import type { PatternFeedback } from './types/patternFeedback'

export type FeedbackCategory = 
  | 'weak_form'      // Function words reduced (the, to, and → thuh, ta, n)
  | 'linking'        // Words blend at boundaries (want to → wanna)
  | 'elision'        // Sounds dropped (going to → gonna)
  | 'contraction'    // Contractions (you're → yer, I'm → im)
  | 'similar_words'  // Phonetically similar words (a/the, your/you're)
  | 'spelling'       // Spelling/typo errors (1-char edit distance)
  | 'missed'         // Generic missed content
  | 'speed_chunking' // Fast speech chunking

export interface FeedbackItem {
  // Existing fields
  id: string
  target: string                    // The word/phrase (expectedSpan)
  actualSpan?: string               // What user heard/typed
  refStart: number
  refEnd: number
  type: 'missing' | 'substitution' | 'extra'
  
  // NEW: Categorized feedback
  category: FeedbackCategory
  
  // Trust-first MVP: Eligibility gate for listening explanations
  explainAllowed: boolean           // If false, hide listening explanation UI sections
  
  // NEW: Enhanced feedback fields
  meaningInContext: string          // What this word/phrase means IN THIS sentence (1-2 sentences)
  soundRule: string                 // What happens to the sound in fast speech (phonetic/weak-form/linking)
  inSentence: {                     // How it sounded in the ORIGINAL sentence
    original: string                 // Full original sentence with highlighted target
    highlighted: string              // Just the target phrase
    heardAs: string                  // How it sounds (e.g., "later" → "layder")
    chunkDisplay?: string            // Optional: Pattern-based chunk display (e.g., "went-to-the")
    reducedForm?: string             // Optional: Phonetic reduction (e.g., "wanna" for "want to")
    chunkMeaning?: string            // Optional: Chunk-specific meaning
    parentChunkDisplay?: string      // Optional: Parent's chunk_display (for fallback explanation)
  }
  extraExample?: {                  // Transfer example - another sentence (optional, omit if no real example)
    sentence: string                 // New sentence using same word/phrase
    heardAs?: string                 // Optional: how it sounds in this new context
  }
  tip?: string                      // Optional: Short listening tip
}

// Backward compatibility: PracticeStep extends FeedbackItem
export interface PracticeStep extends FeedbackItem {
  // Legacy fields (deprecated but kept for compatibility)
  expectedSpan: string  // Alias for target
  meaning: string       // Alias for meaningInContext
  howItSounds: string   // Alias for soundRule
}

/**
 * Compute simple edit distance (Levenshtein) for short strings
 * Optimized for length ≤ 6
 */
function computeEditDistance(s1: string, s2: string): number {
  const m = s1.length
  const n = s2.length
  
  // Early exit if length difference > 1 (can't be 1-edit)
  if (Math.abs(m - n) > 1) {
    return Math.max(m, n)
  }
  
  // Simple DP for small strings
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0))
  
  for (let i = 0; i <= m; i++) {
    dp[i][0] = i
  }
  for (let j = 0; j <= n; j++) {
    dp[0][j] = j
  }
  
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1]
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j - 1] + 1, // substitution
          dp[i - 1][j] + 1,     // deletion
          dp[i][j - 1] + 1      // insertion
        )
      }
    }
  }
  
  return dp[m][n]
}

/**
 * Function words that can be reduced/weakened in speech
 * Used to identify when weak-form explanations are safe (no content words present)
 */
const FUNCTION_WORDS = new Set([
  'a', 'an', 'the', 'to', 'of', 'for', 'and', 'or', 'but', 'with', 'at', 'in', 'on',
  'by', 'from', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can',
  'this', 'that', 'these', 'those', 'it', 'its', 'they', 'them', 'we', 'us', 'you',
  'he', 'him', 'she', 'her', 'his', 'hers', 'their', 'our', 'your', 'my', 'me'
])

/**
 * Check if a word is a function word (safe for weak-form explanations)
 */
function isFunctionWord(word: string): boolean {
  return FUNCTION_WORDS.has(word.toLowerCase().trim())
}

/**
 * Check if a phrase contains only function words (no content words)
 */
function containsOnlyFunctionWords(phrase: string): boolean {
  const words = phrase.toLowerCase().trim().split(/\s+/).filter(w => w.length > 0)
  return words.length > 0 && words.every(w => isFunctionWord(w))
}

/**
 * Detect category based on phrase and context
 */
function detectCategory(phrase: string, actualSpan?: string): FeedbackCategory {
  const lower = phrase.toLowerCase().trim()
  const actualLower = actualSpan?.toLowerCase().trim() || ''
  
  // Debug log for spelling detection
  if (lower === 'gonna' || actualLower === 'gona') {
    console.log('🔴 [detectCategory] Checking spelling for gona->gonna:', {
      phrase,
      lower,
      actualSpan: actualSpan || '(none)',
      actualLower: actualLower || '(none)',
      willCheckSpelling: !!actualSpan,
    })
  }
  
  // Contractions
  if (lower.match(/\b(you're|i'm|we're|they're|it's|that's|what's|who's|he's|she's)\b/)) {
    return 'contraction'
  }
  
  // Linking patterns (want to, going to, got to)
  if (lower.match(/\b(want to|going to|got to|have to|need to)\b/)) {
    return 'linking'
  }
  
  // Elision patterns (going to → gonna)
  if (lower.includes('going to') || lower.includes('want to')) {
    return 'elision'
  }
  
  // Weak forms (function words ONLY - must not contain content words)
  const words = lower.split(/\s+/)
  const hasFunctionWord = words.some(w => isFunctionWord(w))
  if (hasFunctionWord && containsOnlyFunctionWords(lower)) {
    return 'weak_form'
  }
  
  // Similar words (if substitution)
  if (actualSpan) {
    const similarPairs = [
      ['a', 'the'], ['an', 'a'], ['is', 'it\'s'], ['are', 'our'],
      ['your', 'you\'re'], ['their', 'there'], ['to', 'too', 'two']
    ]
    for (const pair of similarPairs) {
      if (pair.includes(lower) && pair.includes(actualLower)) {
        return 'similar_words'
      }
    }
    
    // Spelling/typo: 1 character edit distance in short words (≤6 chars)
    if (lower.length <= 6 && actualLower.length <= 6) {
      const editDist = computeEditDistance(lower, actualLower)
      
      // Debug log for spelling check
      if (lower === 'gonna' || actualLower === 'gona') {
        console.log('🔴 [detectCategory] Spelling check result:', {
          lower,
          actualLower,
          editDist,
          lowerLength: lower.length,
          actualLowerLength: actualLower.length,
          willReturnSpelling: editDist === 1,
        })
      }
      
      if (editDist === 1) {
        return 'spelling'
      }
    }
  }
  
  // Multi-word phrases often chunked
  // REMOVED: speed_chunking category mapped to 'missed' (trust-first MVP)
  // if (words.length >= 2) {
  //   return 'speed_chunking'
  // }
  
  return 'missed'
}

/**
 * Generate how phrase sounds phonetically (heardAs)
 */
function generateHeardAs(phrase: string, category: FeedbackCategory): string {
  const lower = phrase.toLowerCase().trim()
  
  // Contractions
  const contractions: Record<string, string> = {
    "you're": "yer",
    "i'm": "im",
    "we're": "wer",
    "they're": "ther",
    "it's": "its",
    "that's": "thats",
    "what's": "whats",
    "who's": "whos",
    "he's": "hes",
    "she's": "shes"
  }
  
  for (const [key, value] of Object.entries(contractions)) {
    if (lower.includes(key)) {
      return value
    }
  }
  
  // Linking patterns
  if (lower.includes('want to')) return "wanna"
  if (lower.includes('going to')) return "gonna"
  if (lower.includes('got to')) return "gotta"
  if (lower.includes('have to')) return "hafta"
  if (lower.includes('need to')) return "needa"
  
  // Weak forms
  if (lower === 'the') return "thuh"
  if (lower === 'to') return "ta"
  if (lower === 'and') return "n"
  if (lower === 'for') return "fer"
  if (lower === 'you') return "ya"
  if (lower === 'they') return "thay"
  
  // Multi-word phrases - approximate blend
  const words = lower.split(/\s+/)
  if (words.length >= 2) {
    // Simple approximation: join first sounds
    return words.map(w => w.charAt(0)).join('') + "..."
  }
  
  return lower // Fallback: return as-is
}

/**
 * Generate sound rule explanation
 */
function generateSoundRule(phrase: string, category: FeedbackCategory, heardAs: string): string {
  const lower = phrase.toLowerCase().trim()
  
  switch (category) {
    case 'contraction':
      return `Contractions blend two words. "${phrase}" often sounds like "${heardAs}" in fast speech.`
    case 'linking':
      return `Words link together at boundaries. "${phrase}" blends into "${heardAs}" when spoken quickly.`
    case 'elision':
      return `Some sounds are dropped in casual speech. "${phrase}" becomes "${heardAs}".`
    case 'weak_form':
      return `Function words like "${phrase}" are often unstressed and reduced to "${heardAs}".`
    case 'similar_words':
      return `"${phrase}" can sound similar to other words when spoken quickly.`
    case 'speed_chunking':
      return `In fast speech, "${phrase}" is spoken as one smooth chunk, making boundaries unclear.`
    default:
      return `"${phrase}" can sound like "${heardAs}" when spoken quickly.`
  }
}

/**
 * Generate extra example sentence using the same word/phrase
 * Returns undefined if no real example exists (no placeholder templates)
 */
function generateExtraExample(phrase: string, category: FeedbackCategory): { sentence: string; heardAs?: string } | undefined {
  const lower = phrase.toLowerCase().trim()
  
  // Template-based examples for common phrases - only real, meaningful examples
  const examples: Record<string, string> = {
    'later': "I'll see you later.",
    'you\'re': "You're doing great!",
    'i\'m': "I'm not sure about that.",
    'we\'re': "We're almost there.",
    'they\'re': "They're coming soon.",
    'it\'s': "It's a beautiful day.",
    'that\'s': "That's exactly right.",
    'don\'t': "Don't worry about it.",
    'can\'t': "I can't believe it.",
    'won\'t': "I won't do that.",
    'the': "The book is on the table.",
    'to': "I need to go now.",
    'and': "Come and see this.",
    'for': "This is for you.",
    'with': "Come with me.",
    'want to': "I want to learn more.",
    'going to': "I'm going to try again.",
    'have you': "Have you seen this before?",
    'in the': "It's in the box.",
    'on the': "Put it on the shelf.",
    'at the': "Meet me at the door.",
  }
  
  // Check for exact or partial match - prioritize exact matches
  // First check exact match (lowercased phrase must match key exactly)
  if (examples[lower]) {
    const heardAs = generateHeardAs(lower, category)
    return { sentence: examples[lower], heardAs }
  }
  
  // Then check if phrase contains any of our example keys
  for (const [key, example] of Object.entries(examples)) {
    if (lower.includes(key) || key.includes(lower)) {
      const heardAs = generateHeardAs(key, category)
      return { sentence: example, heardAs }
    }
  }
  
  // For contractions, try to generate a reasonable example
  if (category === 'contraction') {
    const expanded = expandContraction(phrase)
    // Generate a simple sentence using the expanded form
    // This is still a real example, not a placeholder
    if (expanded !== phrase) {
      // Simple context-based example
      if (phrase.toLowerCase() === "i'm" || phrase.toLowerCase() === "im") {
        return { sentence: "I'm ready to start.", heardAs: generateHeardAs(phrase, category) }
      } else if (phrase.toLowerCase() === "you're" || phrase.toLowerCase() === "youre") {
        return { sentence: "You're doing well.", heardAs: generateHeardAs(phrase, category) }
      } else if (phrase.toLowerCase() === "don't" || phrase.toLowerCase() === "dont") {
        return { sentence: "Don't forget to call.", heardAs: generateHeardAs(phrase, category) }
      }
    }
  }
  
  // For common articles/prepositions, provide simple real examples
  const words = lower.split(/\s+/)
  if (words.length === 1) {
    const word = words[0]
    if (word === 'the') {
      return { sentence: "The book is on the table.", heardAs: generateHeardAs(word, category) }
    } else if (word === 'a') {
      return { sentence: "A cat is here.", heardAs: generateHeardAs(word, category) }
    } else if (word === 'an') {
      return { sentence: "An apple is on the table.", heardAs: generateHeardAs(word, category) }
    }
  }
  
  // If no real example exists, return undefined (omit the section)
  return undefined
}

/**
 * Generate optional listening tip
 */
function generateTip(category: FeedbackCategory, phrase: string, actualSpan?: string): string | undefined {
  switch (category) {
    case 'spelling':
      if (actualSpan) {
        return `You typed "${actualSpan}". "${phrase}" is the correct spelling.`
      }
      return `Check the spelling of "${phrase}".`
    case 'contraction':
      return 'Listen for the apostrophe sound - it blends the words together.'
    case 'linking':
      return 'Pay attention to where one word ends and the next begins - they merge together.'
    case 'weak_form':
      return 'These small words are often quieter - listen for them in the flow of speech.'
    case 'speed_chunking':
      return 'Try to hear the phrase as one unit, not individual words.'
    default:
      return undefined
  }
}

/**
 * Extract practice steps from alignment events (top 3-5 mistakes)
 * Returns FeedbackItem[] with enhanced feedback structure
 * @param patterns - Optional array of listening patterns. If not provided, uses local fallback.
 */
export function extractPracticeSteps(
  events: AlignmentEvent[],
  refTokens: string[],
  userTokens: string[],
  maxSteps: number = 5,
  fullTranscript?: string, // Optional: full sentence for context
  patterns?: ListeningPattern[], // Optional: patterns from Supabase, falls back to local
  patternFeedback?: PatternFeedback[] // Optional: variant-specific feedback from clip_pattern_spans
): PracticeStep[] {
  const steps: PracticeStep[] = []
  const fullSentence = fullTranscript || refTokens.join(' ')
  
  // Prioritize phrase hints (blended phrases are most important)
  const phraseHintEvents = events.filter(e => 
    e.phraseHint && (e.type === 'missing' || e.type === 'substitution')
  )
  
  // Then other important events
  const otherEvents = events.filter(e => 
    !e.phraseHint && (e.type === 'missing' || e.type === 'substitution')
  )
  
  // Process phrase hint events first
  for (const event of phraseHintEvents.slice(0, maxSteps)) {
    const span = event.phraseHint!
    const target = span.spanText || 
      refTokens.slice(span.spanRefStart, span.spanRefEnd).join(' ')
    
    let actualSpan: string | undefined
    // Priority 1: Extract from userTokens (most reliable source of what user actually typed)
    if (event.userStart !== undefined && event.userEnd !== undefined) {
      actualSpan = userTokens.slice(event.userStart, event.userEnd).join(' ')
    } else if (event.type === 'missing') {
      // Missing events have no user input
      actualSpan = undefined
    } else if (event.actualSpan && event.actualSpan !== '(not heard)') {
      // Use event.actualSpan if it's not a placeholder
      actualSpan = event.actualSpan
    } else {
      // Placeholder or no data - treat as undefined
      actualSpan = undefined
    }
    
    // Debug: log actualSpan for tracing
    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 [practiceSteps] actualSpan extraction:', {
        target,
        eventType: event.type,
        eventActualSpan: event.actualSpan || '(none)',
        eventUserStart: event.userStart,
        eventUserEnd: event.userEnd,
        extractedActualSpan: actualSpan || '(undefined)',
        userTokens: userTokens.slice(0, 5),
      })
    }
    
    // PATTERN-FIRST: Try pattern matching FIRST (regardless of category)
    let category: FeedbackCategory
    let heardAs: string
    let extraExample: { sentence: string; heardAs?: string } | undefined
    let tip: string | undefined
    let soundRule: string
    let chunkDisplay: string | undefined = undefined
    let reducedForm: string | undefined = undefined
    let matchedPattern: ListeningPattern | undefined = undefined

    // Find target index in refTokens for pattern matching
      const targetTokens = target.split(' ').filter(t => t.length > 0)
      const firstTargetToken = targetTokens[0]?.toLowerCase()
    let targetIndex = -1
      
        if (firstTargetToken) {
          // Find index of first token in refTokens
          for (let i = span.spanRefStart; i <= span.spanRefEnd && i < refTokens.length; i++) {
            if (refTokens[i]?.toLowerCase() === firstTargetToken) {
              targetIndex = i
              break
        }
      }
    }

    // Try pattern matching FIRST (pattern-first approach)
    // DEBUG: Log pattern matching attempt
    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 [practiceSteps] Pattern matching attempt (phraseHintEvents):', {
        target,
        firstTargetToken: firstTargetToken || '(none)',
        targetIndex,
        patternsAvailable: patterns?.length || 0,
        patternsSample: patterns?.slice(0, 3).map(p => ({
          id: p.id,
          patternKey: (p as any).patternKey || '(none)',
          words: p.words,
          chunkDisplay: p.chunkDisplay,
        })) || [],
        isEligible: isEligibleForPatternMatching(firstTargetToken || target, patterns),
        refTokensSample: refTokens.slice(Math.max(0, targetIndex - 2), targetIndex + 5),
      })
    }
    
    if (targetIndex >= 0 && isEligibleForPatternMatching(firstTargetToken || target, patterns)) {
      const patternMatch = matchListeningPattern(firstTargetToken || target, refTokens, targetIndex, patterns)
      
      // DEBUG: Log match result
      if (process.env.NODE_ENV === 'development') {
        console.log('🔍 [practiceSteps] Pattern match result:', {
          target,
          patternMatchFound: !!patternMatch,
          matchedPatternId: patternMatch?.pattern.id || '(none)',
          matchedPatternKey: patternMatch?.pattern ? ((patternMatch.pattern as any).patternKey || '(none)') : '(none)',
          matchedWords: patternMatch?.pattern.words || '(none)',
        })
      }
      
            if (patternMatch) {
        matchedPattern = patternMatch.pattern
        
        // DEBUG: Log matched pattern details
        if (process.env.NODE_ENV === 'development') {
          console.log('🔍 [practiceSteps] Pattern matched (phraseHintEvents):', {
            target,
            matchedPatternId: matchedPattern.id,
            matchedPatternKey: (matchedPattern as any).patternKey || '(none)',
            matchedChunkDisplay: matchedPattern.chunkDisplay,
            matchedReducedForm: matchedPattern.reducedForm || '(none)',
            matchedWords: matchedPattern.words,
            matchedCategory: matchedPattern.category || '(none)',
            matchedParentPatternKey: matchedPattern.parentPatternKey || '(none)',
            matchedParentChunkDisplay: matchedPattern.parentChunkDisplay || '(none)',
            matchedHowItSounds: matchedPattern.howItSounds || '(none)',
            matchedTip: matchedPattern.tip || '(none)',
            matchedSpokenForm: matchedPattern.spokenForm || '(none)',
            matchedHeardAs: matchedPattern.heardAs || '(none)',
          })
        }
        
        // Use pattern category if available, else fall back to detectCategory
        category = matchedPattern.category || detectCategory(target, actualSpan)
        
        // Check for variant-specific feedback (from clip_pattern_spans)
        const variantFeedback = patternFeedback?.find(f => 
          matchedPattern &&
          f.pattern_key === matchedPattern.id &&
          f.ref_start <= span.spanRefStart &&
          f.ref_end >= span.spanRefEnd
        )
        
        if (variantFeedback) {
          // Use variant's written_form as the canonical form (set FIRST so we can use it in soundRule)
          chunkDisplay = variantFeedback.written_form
          heardAs = variantFeedback.spoken_form
          reducedForm = variantFeedback.spoken_form // Use spoken_form as reduced form
          
          // Use variant-specific explanation (clip-specific, not generic)
          // IMPORTANT: Use chunkDisplay (written_form) instead of target for soundRule generation
          // This prevents tautological text like "gonna can sound like gonna"
          const phraseForSoundRule = chunkDisplay // Use "going to" instead of "gonna"
          soundRule = variantFeedback.explanation_short || variantFeedback.explanation_medium || patternMatch.tip || patternMatch.soundRule || generateSoundRule(phraseForSoundRule, category, heardAs)
          tip = patternMatch.tip || generateTip(category, target, actualSpan)
          
          if (process.env.NODE_ENV === 'development') {
            console.log('✅ [practiceSteps] Using variant-specific feedback:', {
              pattern_key: variantFeedback.pattern_key,
              written_form: variantFeedback.written_form,
              spoken_form: variantFeedback.spoken_form,
            })
          }
        } else {
          // Check if pattern has variants (from listening_pattern_variants)
          const variants = (matchedPattern as any).variants
          const variant = Array.isArray(variants) && variants.length > 0 ? variants[0] : null
          
          // DEBUG: Log variant check
          if (process.env.NODE_ENV === 'development') {
            console.log('🔍 [practiceSteps] Checking for variants:', {
              target,
              patternId: matchedPattern.id,
              hasVariants: !!variants,
              variantsIsArray: Array.isArray(variants),
              variantsLength: Array.isArray(variants) ? variants.length : 0,
              firstVariant: variant ? {
                written_form: variant.written_form,
                spoken_form: variant.spoken_form,
              } : '(none)',
            })
          }
          
          if (variant && variant.written_form && variant.spoken_form) {
            // Use variant's written_form as chunkDisplay and spoken_form as heardAs (set FIRST so we can use it in soundRule)
            chunkDisplay = variant.written_form // e.g., "going to"
            heardAs = variant.spoken_form // e.g., "gonna"
            reducedForm = variant.spoken_form
            
            // Use variant's explanation if available
            // IMPORTANT: Use chunkDisplay (written_form) instead of target for soundRule generation
            // This prevents tautological text like "gonna can sound like gonna"
            const phraseForSoundRule = chunkDisplay // Use "going to" instead of "gonna"
            soundRule = variant.explanation_short || variant.explanation_medium || patternMatch.tip || patternMatch.soundRule || generateSoundRule(phraseForSoundRule, category, heardAs)
            tip = patternMatch.tip || generateTip(category, target, actualSpan)
            
            if (process.env.NODE_ENV === 'development') {
              console.log('✅ [practiceSteps] Using pattern variant:', {
                pattern_key: matchedPattern.id,
                written_form: variant.written_form,
                spoken_form: variant.spoken_form,
                chunkDisplay,
                heardAs,
                highlightedWillBe: chunkDisplay, // This will be used for highlighted
              })
            }
          } else {
            // Fallback to pattern-provided explanation fields (no variants available)
            // soundRule: prefer pattern.tip (short) else pattern.howItSounds
            soundRule = patternMatch.tip || patternMatch.soundRule || generateSoundRule(target, category, '')
            tip = patternMatch.tip || generateTip(category, target, actualSpan)
              chunkDisplay = patternMatch.chunkDisplay
            reducedForm = patternMatch.reducedForm
            
            // heardAs: prefer pattern.spokenForm / reducedForm / pattern.heardAs
            if (matchedPattern.spokenForm) {
              heardAs = matchedPattern.spokenForm
            } else if (matchedPattern.heardAs) {
              heardAs = matchedPattern.heardAs
            } else if (patternMatch.reducedForm) {
              heardAs = patternMatch.reducedForm
            } else {
              heardAs = generateHeardAs(target, category)
            }
          }
        }
        
        // extraExample: use pattern.examples[0] if available
        if (matchedPattern.examples && matchedPattern.examples.length > 0) {
          extraExample = matchedPattern.examples[0]
        } else {
          extraExample = generateExtraExample(target, category)
        }
        
        // DEBUG: Log chosen values for explanation fields
        if (process.env.NODE_ENV === 'development') {
          console.log('🔍 [practiceSteps] Explanation fields chosen:', {
            target,
            phrase: target, // What will be shown as the phrase
            heardAs,
            soundRule,
            tip: tip || '(none)',
            chunkDisplay: chunkDisplay || '(none)',
            reducedForm: reducedForm || '(none)',
            category,
            inSentenceHighlighted: target, // What will be highlighted
            source: 'matchedPattern', // Where values came from
            hasParent: !!matchedPattern.parentPatternKey,
            parentChunkDisplay: matchedPattern.parentChunkDisplay || '(none)',
          })
        }
        
        // SAFETY: If target contains content words and category is 'weak_form', 
        // do NOT apply pattern-based chunk/weak-form explanations
        const targetHasContentWord = !containsOnlyFunctionWords(target)
        if (targetHasContentWord && category === 'weak_form') {
          // Force category to 'missed' to avoid incorrect weak-form explanations
          category = 'missed'
          // Keep pattern data but category is now 'missed'
        }
      } else {
        // No pattern match - fall back to existing behavior
        category = detectCategory(target, actualSpan)
        heardAs = generateHeardAs(target, category)
        extraExample = generateExtraExample(target, category)
        tip = generateTip(category, target, actualSpan)
        soundRule = generateSoundRule(target, category, heardAs)
      }
    } else {
      // Not eligible for pattern matching - fall back to existing behavior
      category = detectCategory(target, actualSpan)
      heardAs = generateHeardAs(target, category)
      extraExample = generateExtraExample(target, category)
      tip = generateTip(category, target, actualSpan)
      soundRule = generateSoundRule(target, category, heardAs)
    }
    
    // For spelling errors: if pattern wasn't matched yet, look up pattern by TARGET word directly
    // This ensures we find patterns even if the misspelled input didn't match
    if (category === 'spelling' && !matchedPattern && patterns && patterns.length > 0) {
      const targetLower = target.toLowerCase().trim()
      
      console.log('🔍 [practiceSteps] Spelling - looking up target pattern:', {
        userTyped: actualSpan || '(none)',
        correctTarget: target,
        normalizedTarget: targetLower,
        patternsAvailable: patterns.length,
        willSearchPatterns: true,
      })
      
      // Try to find pattern by chunkDisplay, words array, patternKey (from API), or id matching target
      // Note: convertSupabasePattern sets id = pattern_key, so p.id should contain the pattern key
      matchedPattern = patterns.find(p => {
        const patternChunkDisplay = p.chunkDisplay?.toLowerCase().trim()
        const patternWords = p.words.join(' ').toLowerCase().trim()
        const patternKey = (p as any).patternKey?.toLowerCase().trim() // patternKey from API (if exists as separate field)
        const patternId = p.id?.toLowerCase().trim() // This should be pattern_key after conversion
        const matches = patternChunkDisplay === targetLower || patternWords === targetLower || patternKey === targetLower || patternId === targetLower
        return matches
      })
      
      if (matchedPattern) {
        // Apply pattern data for spelling case (pattern-first)
        // Use pattern-provided explanation fields
        soundRule = matchedPattern.tip || matchedPattern.howItSounds || soundRule
        tip = matchedPattern.tip || tip
        chunkDisplay = matchedPattern.chunkDisplay
        reducedForm = matchedPattern.reducedForm
        
        // heardAs: prefer pattern.spokenForm / reducedForm / pattern.heardAs
        if (matchedPattern.spokenForm) {
          heardAs = matchedPattern.spokenForm
        } else if (matchedPattern.heardAs) {
          heardAs = matchedPattern.heardAs
        } else if (matchedPattern.reducedForm) {
          heardAs = matchedPattern.reducedForm
        }
        // else: keep existing heardAs from generateHeardAs()
        
        console.log('✅ [practiceSteps] Found pattern for spelling target:', {
          target,
          patternId: matchedPattern.id,
          patternChunkDisplay: matchedPattern.chunkDisplay,
          patternParentChunkDisplay: matchedPattern.parentChunkDisplay || '(none)',
          patternParentPatternKey: matchedPattern.parentPatternKey || '(none)',
        })
      } else {
        console.log('⚠️ [practiceSteps] Pattern NOT found for spelling target:', {
          target,
          normalizedTarget: targetLower,
          samplePatterns: patterns.slice(0, 5).map(p => ({
            id: p.id,
            chunkDisplay: p.chunkDisplay,
            words: p.words,
            parentChunkDisplay: p.parentChunkDisplay || '(none)',
          })),
        })
        }
    }
    
    // Dynamic chunk synthesis for function words
    // SAFETY: Only synthesize chunks if target contains ONLY function words
    // If content words are present, do not synthesize (trust > coverage)
    if (shouldSynthesizeChunk(target, chunkDisplay) && 
        isEligibleForChunkSynthesis(target) && 
        containsOnlyFunctionWords(target) && // SAFETY: Only for function-word-only phrases
        (event.type === 'missing' || category === 'weak_form' || category === 'missed')) {
      const right1 = span.spanRefEnd < refTokens.length ? refTokens[span.spanRefEnd]?.toLowerCase() : null
      const right2 = span.spanRefEnd + 1 < refTokens.length ? refTokens[span.spanRefEnd + 1]?.toLowerCase() : null
      
      const oldChunkDisplay = chunkDisplay
      const synthesized = synthesizeChunk(target, right1, right2)
      if (synthesized) {
        chunkDisplay = synthesized
        
        // Dev mode: log chunk synthesis
        if (process.env.NODE_ENV === 'development') {
          console.log('🔧 [chunkSynthesis] Synthesized chunk:', {
            target,
            right1,
            right2,
            oldChunkDisplay,
            newChunkDisplay: chunkDisplay,
            refTokens: refTokens.slice(Math.max(0, span.spanRefStart - 1), span.spanRefEnd + 3),
          })
        }
      }
    }
    
    // TRUST-FIRST: Extract meaning from pattern (3-layer system with parent fallback)
    // Priority: meaning_approved > meaning_general > parent meaning_general > null
    let meaningText: string | null = null
    let parentChunkDisplay: string | undefined = undefined
    let useParentFallback = false
    
    if (matchedPattern) {
      const status = matchedPattern.meaningStatus || 'none'
      if (status === 'approved' && matchedPattern.meaningApproved) {
        meaningText = matchedPattern.meaningApproved
      } else if (status === 'general' && matchedPattern.meaningGeneral) {
        meaningText = matchedPattern.meaningGeneral
      } else if (matchedPattern.parentPatternKey && matchedPattern.parentMeaningGeneral) {
        // Parent fallback: use parent's meaning_general if current pattern has none
        meaningText = matchedPattern.parentMeaningGeneral
        parentChunkDisplay = matchedPattern.parentChunkDisplay
        useParentFallback = true
      }
      // else: meaningText remains null (Layer 3: no meaning)
    }
    
    // SAFETY: Never show meaning for spelling category
    // BUT allow parent fallback (sound explanation) if parent exists
    if (category === 'spelling') {
      meaningText = null // Suppress semantic meaning
      // For spelling: enable parent fallback if parentChunkDisplay exists (even without parentMeaningGeneral)
      // This allows sound explanations like "gonna is how going to sounds..." for spelling cases
      if (matchedPattern?.parentChunkDisplay) {
        parentChunkDisplay = matchedPattern.parentChunkDisplay
        useParentFallback = true
        // Suppress tautological soundRule when parent fallback is available (e.g., "gonna can sound like gonna")
        if (soundRule) {
          const quotedMatch = soundRule.toLowerCase().match(/"([^"]+)"/)?.[1]?.toLowerCase()
          if (quotedMatch && target.toLowerCase().trim() === quotedMatch) {
            soundRule = '' // Clear tautological soundRule
          }
        }
      } else if (!parentChunkDisplay) {
        useParentFallback = false // No parent, no fallback
      } else {
        useParentFallback = Boolean(parentChunkDisplay) // Use already-set parentChunkDisplay if available
      }
    }
    
    // Debug log for 'gonna' or spelling cases
    if (process.env.NODE_ENV === 'development' && (target.toLowerCase() === 'gonna' || category === 'spelling')) {
      console.log('🔍 [practiceSteps] Pattern processing:', {
        target,
        category,
        actualSpan: actualSpan || '(none)',
        matchedPatternId: matchedPattern?.id || '(none)',
        matchedPatternParentPatternKey: matchedPattern?.parentPatternKey || '(none)',
        matchedPatternParentChunkDisplay: matchedPattern?.parentChunkDisplay || '(none)',
        meaningText: meaningText || '(null)',
        parentChunkDisplay: parentChunkDisplay || '(none)',
        useParentFallback,
      })
    }
    
    // TRUST-FIRST MVP: Compute explainAllowed eligibility gate
    // Determines if listening explanation UI sections should be shown
    let explainAllowed = false
    if (category === 'spelling') {
      explainAllowed = false // Spelling never shows listening explanations
    } else if (containsOnlyFunctionWords(target)) {
      explainAllowed = true // Function-word-only phrases are safe
    } else if (chunkDisplay && reducedForm) {
      // Pattern matched with reducedForm: check if any content words in span are actually missing
      // If event is 'missing' type and target contains content words, content tokens are missing
      const hasMissingContentWord = event.type === 'missing' && !containsOnlyFunctionWords(target)
      explainAllowed = !hasMissingContentWord
    } else {
      explainAllowed = false // Default: don't explain if uncertain
    }
    
    // DEBUG: Log matched pattern for feedback (guarded by NODE_ENV)
    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 [practiceSteps] Matched pattern for feedback (phraseHintEvents):', {
        target,
        category,
        'matchedPattern?.chunkDisplay': matchedPattern?.chunkDisplay || '(none)',
        'matchedPattern?.parentChunkDisplay': matchedPattern?.parentChunkDisplay || '(none)',
        'matchedPattern?.parentPatternKey': matchedPattern?.parentPatternKey || '(none)',
        'matchedPattern exists': !!matchedPattern,
        parentChunkDisplay_var: parentChunkDisplay || '(none)',
      })
    }
    
    if (process.env.NODE_ENV === 'development' && (target.toLowerCase() === 'gonna' || category === 'spelling')) {
      console.log('🔍 [practiceSteps] RIGHT BEFORE step creation:', {
        category,
        target,
        matchedPatternId: matchedPattern?.id || '(none)',
        matchedPatternParentChunkDisplay: matchedPattern?.parentChunkDisplay || '(none)',
        parentChunkDisplay_var: parentChunkDisplay || '(none)',
        meaningText_var: meaningText || '(null)',
        useParentFallback,
      })
    }
    
    // Debug log RIGHT BEFORE creating step (for spelling)
    if (category === 'spelling') {
      console.log('🔍 [practiceSteps] Before step creation (spelling):', {
        target,
        matchedPatternId: matchedPattern?.id || '(none)',
        matchedPatternParentChunkDisplay: matchedPattern?.parentChunkDisplay || '(none)',
        parentChunkDisplay_var: parentChunkDisplay || '(none)',
        willSetInSentenceParentChunkDisplay: !!parentChunkDisplay,
      })
    }
    
    // Determine highlighted text: use chunkDisplay if from variant, otherwise use target
    // When variant is used, chunkDisplay = written_form (e.g., "going to"), so use that for highlighted
    // This ensures we show "going to" → "gonna" instead of "gonna" → "gonna"
    const highlightedText = chunkDisplay && chunkDisplay !== target ? chunkDisplay : target
    
    // DEBUG: Log highlighted text decision
    if (process.env.NODE_ENV === 'development' && (target.toLowerCase() === 'gonna' || chunkDisplay !== target)) {
      console.log('🔍 [practiceSteps] Highlighted text decision:', {
        target,
        chunkDisplay: chunkDisplay || '(none)',
        highlightedText,
        heardAs,
        hasVariant: !!(matchedPattern && (matchedPattern as any).variants?.[0]),
      })
    }
    
    const step: PracticeStep = {
      id: event.eventId,
      target,
      expectedSpan: target, // Legacy compatibility
      actualSpan,
      refStart: span.spanRefStart,
      refEnd: span.spanRefEnd,
      type: event.type,
      category,
      explainAllowed,
      meaningInContext: meaningText || '', // Layer 3: empty string if no meaning (UI will show Action Hint)
      meaning: meaningText || '', // Legacy compatibility
      soundRule,
      howItSounds: soundRule, // Legacy compatibility
      inSentence: {
        original: fullSentence,
        highlighted: highlightedText, // Use chunkDisplay (written_form) when variant is used
        heardAs,
        chunkDisplay,
        reducedForm,
        chunkMeaning: meaningText || undefined, // Legacy field for chunk mode
        parentChunkDisplay: parentChunkDisplay || undefined, // Always pass parentChunkDisplay if available (UI decides display)
      },
      extraExample,
      tip,
    }
    
    // Debug log RIGHT AFTER creating step (for spelling)
    if (category === 'spelling') {
      console.log('🔍 [practiceSteps] After step creation (spelling):', {
        target,
        step_inSentence_parentChunkDisplay: step.inSentence.parentChunkDisplay || '(none)',
        step_meaningInContext: step.meaningInContext || '(empty)',
      })
    }
    
    // Validation: ensure required fields
    // Note: extraExample is optional - if undefined, omit the section entirely (no placeholder)
    // Note: meaningInContext can be empty (Layer 3) - UI will show Action Hint instead
    if (!step.soundRule || !step.inSentence.original) {
      console.warn(`⚠️ FeedbackItem missing required fields for ${target}:`, step)
      // Fill fallbacks if missing (but NEVER create placeholder meaning)
      step.soundRule = step.soundRule || 'This phrase can sound different in fast speech.'
      step.inSentence.original = step.inSentence.original || fullSentence
    }
    // If extraExample exists but has no sentence, remove it entirely (no placeholder)
    if (step.extraExample && !step.extraExample.sentence) {
      step.extraExample = undefined
    }
    
    steps.push(step)
  }
  
  // Process other events if we need more steps
  const remaining = maxSteps - steps.length
  if (remaining > 0) {
    for (const event of otherEvents.slice(0, remaining)) {
      const target = event.expectedSpan || 
        refTokens.slice(event.refStart, event.refEnd).join(' ')
      
      let actualSpan: string | undefined
      // Priority 1: Extract from userTokens (most reliable source of what user actually typed)
      if (event.userStart !== undefined && event.userEnd !== undefined) {
        actualSpan = userTokens.slice(event.userStart, event.userEnd).join(' ')
      } else if (event.type === 'missing') {
        // Missing events have no user input
        actualSpan = undefined
      } else if (event.actualSpan && event.actualSpan !== '(not heard)') {
        // Use event.actualSpan if it's not a placeholder
        actualSpan = event.actualSpan
      } else {
        // Placeholder or no data - treat as undefined
        actualSpan = undefined
      }
      
      // Expand to phrase (2-5 words) if it's a single word
      const tokenCount = event.refEnd - event.refStart
      let phraseStart = event.refStart
      let phraseEnd = event.refEnd
      let expandedTarget = target
      
      if (tokenCount === 1) {
        // Expand to include context
        phraseStart = Math.max(0, event.refStart - 1)
        phraseEnd = Math.min(refTokens.length, event.refEnd + 1)
        expandedTarget = refTokens.slice(phraseStart, phraseEnd).join(' ')
      }
      
      // PATTERN-FIRST: Try pattern matching FIRST (regardless of category)
      let category: FeedbackCategory
      let heardAs: string
      let extraExample: { sentence: string; heardAs?: string } | undefined
      let tip: string | undefined
      let soundRule: string
      let chunkDisplay: string | undefined = undefined
      let reducedForm: string | undefined = undefined
      let matchedPattern: ListeningPattern | undefined = undefined

      // Find target index in refTokens for pattern matching
        const targetTokens = expandedTarget.split(' ').filter(t => t.length > 0)
        const firstTargetToken = targetTokens[0]?.toLowerCase()
        
      // Try pattern matching FIRST (pattern-first approach)
      if (firstTargetToken && phraseStart >= 0 && isEligibleForPatternMatching(firstTargetToken, patterns)) {
          const patternMatch = matchListeningPattern(firstTargetToken, refTokens, phraseStart, patterns)
          if (patternMatch) {
          matchedPattern = patternMatch.pattern
          
          // Use pattern category if available, else fall back to detectCategory
          category = matchedPattern.category || detectCategory(expandedTarget, actualSpan)
          
          // Check for variant-specific feedback (from clip_pattern_spans)
          const variantFeedback = patternFeedback?.find(f => 
            f.pattern_key === matchedPattern.id &&
            f.ref_start <= phraseStart &&
            f.ref_end >= phraseEnd
          )
          
          if (variantFeedback) {
            // Use variant's written_form as the canonical form (set FIRST so we can use it in soundRule)
            chunkDisplay = variantFeedback.written_form
            heardAs = variantFeedback.spoken_form
            reducedForm = variantFeedback.spoken_form // Use spoken_form as reduced form
            
            // Use variant-specific explanation (clip-specific, not generic)
            // IMPORTANT: Use chunkDisplay (written_form) instead of expandedTarget for soundRule generation
            // This prevents tautological text like "gonna can sound like gonna"
            const phraseForSoundRule = chunkDisplay // Use "going to" instead of "gonna"
            soundRule = variantFeedback.explanation_short || variantFeedback.explanation_medium || patternMatch.tip || patternMatch.soundRule || generateSoundRule(phraseForSoundRule, category, heardAs)
            tip = patternMatch.tip || generateTip(category, expandedTarget, actualSpan)
            
            if (process.env.NODE_ENV === 'development') {
              console.log('✅ [practiceSteps] Using variant-specific feedback (otherEvents):', {
                pattern_key: variantFeedback.pattern_key,
                written_form: variantFeedback.written_form,
                spoken_form: variantFeedback.spoken_form,
              })
            }
          } else {
            // Check if pattern has variants (from listening_pattern_variants)
            const variant = (matchedPattern as any).variants?.[0]
            
            if (variant && variant.written_form && variant.spoken_form) {
              // Use variant's written_form as chunkDisplay and spoken_form as heardAs (set FIRST so we can use it in soundRule)
              chunkDisplay = variant.written_form // e.g., "going to"
              heardAs = variant.spoken_form // e.g., "gonna"
              reducedForm = variant.spoken_form
              
              // Use variant's explanation if available
              // IMPORTANT: Use chunkDisplay (written_form) instead of expandedTarget for soundRule generation
              // This prevents tautological text like "gonna can sound like gonna"
              const phraseForSoundRule = chunkDisplay // Use "going to" instead of "gonna"
              soundRule = variant.explanation_short || variant.explanation_medium || patternMatch.tip || patternMatch.soundRule || generateSoundRule(phraseForSoundRule, category, heardAs)
              tip = patternMatch.tip || generateTip(category, expandedTarget, actualSpan)
              
              if (process.env.NODE_ENV === 'development') {
                console.log('✅ [practiceSteps] Using pattern variant (otherEvents):', {
                  pattern_key: matchedPattern.id,
                  written_form: variant.written_form,
                  spoken_form: variant.spoken_form,
                })
              }
            } else {
              // Fallback to pattern-provided explanation fields (no variants available)
              // soundRule: prefer pattern.tip (short) else pattern.howItSounds
              soundRule = patternMatch.tip || patternMatch.soundRule || generateSoundRule(expandedTarget, category, '')
              tip = patternMatch.tip || generateTip(category, expandedTarget, actualSpan)
            chunkDisplay = patternMatch.chunkDisplay
              reducedForm = patternMatch.reducedForm
              
              // heardAs: prefer pattern.spokenForm / reducedForm / pattern.heardAs
              if (matchedPattern.spokenForm) {
                heardAs = matchedPattern.spokenForm
              } else if (matchedPattern.heardAs) {
                heardAs = matchedPattern.heardAs
              } else if (patternMatch.reducedForm) {
                heardAs = patternMatch.reducedForm
              } else {
                heardAs = generateHeardAs(expandedTarget, category)
              }
            }
          }
          
          // extraExample: use pattern.examples[0] if available
          if (matchedPattern.examples && matchedPattern.examples.length > 0) {
            extraExample = matchedPattern.examples[0]
          } else {
            extraExample = generateExtraExample(expandedTarget, category)
          }
          
          // SAFETY: If expandedTarget contains content words and category is 'weak_form',
          // do NOT apply pattern-based chunk/weak-form explanations
          const expandedTargetHasContentWord = !containsOnlyFunctionWords(expandedTarget)
          if (expandedTargetHasContentWord && category === 'weak_form') {
            // Force category to 'missed' to avoid incorrect weak-form explanations
            category = 'missed'
            // Keep pattern data but category is now 'missed'
          }
        } else {
          // No pattern match - fall back to existing behavior
          category = detectCategory(expandedTarget, actualSpan)
          heardAs = generateHeardAs(expandedTarget, category)
          extraExample = generateExtraExample(expandedTarget, category)
          tip = generateTip(category, expandedTarget, actualSpan)
          soundRule = generateSoundRule(expandedTarget, category, heardAs)
        }
        
        // DEBUG: Log matched pattern details (otherEvents)
        if (process.env.NODE_ENV === 'development' && matchedPattern) {
          console.log('🔍 [practiceSteps] Pattern matched (otherEvents):', {
            target: expandedTarget,
            matchedPatternId: matchedPattern.id,
            matchedPatternKey: (matchedPattern as any).patternKey || '(none)',
            matchedChunkDisplay: matchedPattern.chunkDisplay,
            matchedReducedForm: matchedPattern.reducedForm || '(none)',
            matchedWords: matchedPattern.words,
            matchedCategory: matchedPattern.category || '(none)',
            matchedParentPatternKey: matchedPattern.parentPatternKey || '(none)',
            matchedParentChunkDisplay: matchedPattern.parentChunkDisplay || '(none)',
            matchedHowItSounds: matchedPattern.howItSounds || '(none)',
            matchedTip: matchedPattern.tip || '(none)',
            matchedSpokenForm: matchedPattern.spokenForm || '(none)',
            matchedHeardAs: matchedPattern.heardAs || '(none)',
          })
          
          // DEBUG: Log chosen values for explanation fields (otherEvents)
          console.log('🔍 [practiceSteps] Explanation fields chosen (otherEvents):', {
            target: expandedTarget,
            phrase: expandedTarget,
            heardAs,
            soundRule,
            tip: tip || '(none)',
            chunkDisplay: chunkDisplay || '(none)',
            reducedForm: reducedForm || '(none)',
            category,
            inSentenceHighlighted: expandedTarget,
            source: 'matchedPattern',
            hasParent: !!matchedPattern.parentPatternKey,
            parentChunkDisplay: matchedPattern.parentChunkDisplay || '(none)',
          })
        }
      } else {
        // Not eligible for pattern matching - fall back to existing behavior
        category = detectCategory(expandedTarget, actualSpan)
        heardAs = generateHeardAs(expandedTarget, category)
        extraExample = generateExtraExample(expandedTarget, category)
        tip = generateTip(category, expandedTarget, actualSpan)
        soundRule = generateSoundRule(expandedTarget, category, heardAs)
      }
      
      // For spelling errors: if pattern wasn't matched yet, look up pattern by TARGET word directly
      // This ensures we find patterns even if the misspelled input didn't match
      if (category === 'spelling' && !matchedPattern && patterns && patterns.length > 0) {
        const targetLower = expandedTarget.toLowerCase().trim()
        // Try to find pattern by chunkDisplay, words array, patternKey (from API), or id matching target
        matchedPattern = patterns.find(p => {
          const patternChunkDisplay = p.chunkDisplay?.toLowerCase().trim()
          const patternWords = p.words.join(' ').toLowerCase().trim()
          const patternKey = (p as any).patternKey?.toLowerCase().trim() // patternKey from API
          const patternId = p.id?.toLowerCase().trim()
          return patternChunkDisplay === targetLower || patternWords === targetLower || patternKey === targetLower || patternId === targetLower
        })
        
        if (matchedPattern) {
          // Apply pattern data for spelling case (pattern-first)
          // Use pattern-provided explanation fields
          soundRule = matchedPattern.tip || matchedPattern.howItSounds || soundRule
          tip = matchedPattern.tip || tip
          chunkDisplay = matchedPattern.chunkDisplay
          reducedForm = matchedPattern.reducedForm
          
          // heardAs: prefer pattern.spokenForm / reducedForm / pattern.heardAs
          if (matchedPattern.spokenForm) {
            heardAs = matchedPattern.spokenForm
          } else if (matchedPattern.heardAs) {
            heardAs = matchedPattern.heardAs
          } else if (matchedPattern.reducedForm) {
            heardAs = matchedPattern.reducedForm
          }
          // else: keep existing heardAs from generateHeardAs()
          
          console.log('🔍 [practiceSteps] Found pattern for spelling target (otherEvents):', {
            target: expandedTarget,
            patternId: matchedPattern.id,
            patternParentChunkDisplay: matchedPattern.parentChunkDisplay || '(none)',
            patternParentPatternKey: matchedPattern.parentPatternKey || '(none)',
          })
        }
      }
      
      // Dynamic chunk synthesis for function words (in other events loop)
      // SAFETY: Only synthesize chunks if target contains ONLY function words
      // Check the original target (before expansion) - if it has content words, don't synthesize
      if (shouldSynthesizeChunk(target, chunkDisplay) && 
          isEligibleForChunkSynthesis(target) && 
          containsOnlyFunctionWords(target) && // SAFETY: Only for function-word-only phrases
          (event.type === 'missing' || category === 'weak_form' || category === 'missed')) {
        // For single-token events, refEnd is inclusive (same as refStart)
        // So the next token is at refEnd + 1
        const right1 = event.refEnd + 1 < refTokens.length ? refTokens[event.refEnd + 1]?.toLowerCase() : null
        const right2 = event.refEnd + 2 < refTokens.length ? refTokens[event.refEnd + 2]?.toLowerCase() : null
        
        const oldChunkDisplay = chunkDisplay
        const synthesized = synthesizeChunk(target, right1, right2)
        if (synthesized) {
          chunkDisplay = synthesized
          
          // Dev mode: log chunk synthesis
          if (process.env.NODE_ENV === 'development') {
            console.log('🔧 [chunkSynthesis] Synthesized chunk (otherEvents):', {
              target,
              right1,
              right2,
              oldChunkDisplay,
              newChunkDisplay: chunkDisplay,
              refEnd: event.refEnd,
              refTokens: refTokens.slice(Math.max(0, event.refEnd - 1), event.refEnd + 3),
            })
          }
        }
      }
      
      // TRUST-FIRST: Extract meaning from pattern (3-layer system with parent fallback)
      // Priority: meaning_approved > meaning_general > parent meaning_general > null
      let meaningText: string | null = null
      let parentChunkDisplay: string | undefined = undefined
      let useParentFallback = false
      
      if (matchedPattern) {
        const status = matchedPattern.meaningStatus || 'none'
        if (status === 'approved' && matchedPattern.meaningApproved) {
          meaningText = matchedPattern.meaningApproved
        } else if (status === 'general' && matchedPattern.meaningGeneral) {
          meaningText = matchedPattern.meaningGeneral
        } else if (matchedPattern.parentPatternKey && matchedPattern.parentMeaningGeneral) {
          // Parent fallback: use parent's meaning_general if current pattern has none
          meaningText = matchedPattern.parentMeaningGeneral
          parentChunkDisplay = matchedPattern.parentChunkDisplay
          useParentFallback = true
        }
        // else: meaningText remains null (Layer 3: no meaning)
      }
      
      // SAFETY: Never show meaning for spelling category
      // BUT allow parent fallback (sound explanation) if parent exists
      if (category === 'spelling') {
        meaningText = null // Suppress semantic meaning
        // For spelling: enable parent fallback if parentChunkDisplay exists (even without parentMeaningGeneral)
        // This allows sound explanations like "gonna is how going to sounds..." for spelling cases
        if (matchedPattern?.parentChunkDisplay) {
          parentChunkDisplay = matchedPattern.parentChunkDisplay
          useParentFallback = true
          // Suppress tautological soundRule when parent fallback is available (e.g., "gonna can sound like gonna")
          if (soundRule) {
            const quotedMatch = soundRule.toLowerCase().match(/"([^"]+)"/)?.[1]?.toLowerCase()
            if (quotedMatch && expandedTarget.toLowerCase().trim() === quotedMatch) {
              soundRule = '' // Clear tautological soundRule
            }
          }
        } else if (!parentChunkDisplay) {
          useParentFallback = false // No parent, no fallback
        } else {
          useParentFallback = Boolean(parentChunkDisplay) // Use already-set parentChunkDisplay if available
        }
      }
      
      // Debug log for 'gonna' or spelling cases (otherEvents loop)
      if (process.env.NODE_ENV === 'development' && (expandedTarget.toLowerCase() === 'gonna' || category === 'spelling')) {
        console.log('🔍 [practiceSteps] Pattern processing (otherEvents):', {
          target: expandedTarget,
          category,
          actualSpan: actualSpan || '(none)',
          matchedPatternId: matchedPattern?.id || '(none)',
          matchedPatternParentPatternKey: matchedPattern?.parentPatternKey || '(none)',
          matchedPatternParentChunkDisplay: matchedPattern?.parentChunkDisplay || '(none)',
          meaningText: meaningText || '(null)',
          parentChunkDisplay: parentChunkDisplay || '(none)',
          useParentFallback,
        })
      }
      
      // TRUST-FIRST MVP: Compute explainAllowed eligibility gate
      // Determines if listening explanation UI sections should be shown
      let explainAllowed = false
      if (category === 'spelling') {
        explainAllowed = false // Spelling never shows listening explanations
      } else if (containsOnlyFunctionWords(expandedTarget)) {
        explainAllowed = true // Function-word-only phrases are safe
      } else if (chunkDisplay && reducedForm) {
        // Pattern matched with reducedForm: check if any content words in span are actually missing
        // If event is 'missing' type and expandedTarget contains content words, content tokens are missing
        const hasMissingContentWord = event.type === 'missing' && !containsOnlyFunctionWords(expandedTarget)
        explainAllowed = !hasMissingContentWord
      } else {
        explainAllowed = false // Default: don't explain if uncertain
      }
      
      // Determine highlighted text: use chunkDisplay if from variant, otherwise use expandedTarget
      // When variant is used, chunkDisplay = written_form (e.g., "going to"), so use that for highlighted
      // This ensures we show "going to" → "gonna" instead of "gonna" → "gonna"
      const highlightedText = chunkDisplay && chunkDisplay !== expandedTarget ? chunkDisplay : expandedTarget
      
      // DEBUG: Log highlighted text decision
      if (process.env.NODE_ENV === 'development' && (expandedTarget.toLowerCase().includes('gonna') || chunkDisplay !== expandedTarget)) {
        console.log('🔍 [practiceSteps] Highlighted text decision (otherEvents):', {
          expandedTarget,
          chunkDisplay: chunkDisplay || '(none)',
          highlightedText,
          heardAs,
          hasVariant: !!(matchedPattern && (matchedPattern as any).variants?.[0]),
        })
      }
      
      const step: PracticeStep = {
        id: event.eventId,
        target: expandedTarget,
        expectedSpan: expandedTarget, // Legacy compatibility
        actualSpan,
        refStart: phraseStart,
        refEnd: phraseEnd,
        type: event.type,
        category,
        explainAllowed,
        meaningInContext: meaningText || '', // Layer 3: empty string if no meaning (UI will show Action Hint)
        meaning: meaningText || '', // Legacy compatibility
        soundRule,
        howItSounds: soundRule, // Legacy compatibility
        inSentence: {
          original: fullSentence,
          highlighted: highlightedText, // Use chunkDisplay (written_form) when variant is used
          heardAs,
          chunkDisplay,
          reducedForm,
          chunkMeaning: meaningText || undefined, // Legacy field for chunk mode
          parentChunkDisplay: parentChunkDisplay || undefined, // Always pass parentChunkDisplay if available (UI decides display)
        },
        extraExample,
        tip,
      }
      
      // Debug log for 'gonna' before pushing to steps (otherEvents loop)
      if (process.env.NODE_ENV === 'development' && expandedTarget.toLowerCase() === 'gonna') {
        console.log('🔍 [practiceSteps] Feedback item created (gonna, otherEvents):', {
          category,
          target: expandedTarget,
          actualSpan: actualSpan || '(none)',
          matchedPatternId: matchedPattern?.id || '(none)',
          matchedPatternParentChunkDisplay: matchedPattern?.parentChunkDisplay || '(none)',
          useParentFallback,
          meaningText: meaningText || '(null)',
          parentChunkDisplay: parentChunkDisplay || '(none)',
          feedbackItemParentChunkDisplay: step.inSentence.parentChunkDisplay || '(none)',
        })
      }
      
      // Validation: ensure required fields
      // Note: extraExample is optional - if undefined, omit the section entirely (no placeholder)
      // Note: meaningInContext can be empty (Layer 3) - UI will show Action Hint instead
      if (!step.soundRule || !step.inSentence.original) {
        console.warn(`⚠️ FeedbackItem missing required fields for ${expandedTarget}:`, step)
        // Fill fallbacks if missing (but NEVER create placeholder meaning)
        step.soundRule = step.soundRule || 'This phrase can sound different in fast speech.'
        step.inSentence.original = step.inSentence.original || fullSentence
      }
      // If extraExample exists but has no sentence, remove it entirely (no placeholder)
      if (step.extraExample && !step.extraExample.sentence) {
        step.extraExample = undefined
      }
      
      steps.push(step)
    }
  }
  
  return steps.slice(0, maxSteps)
}

