import type { AlignmentEvent } from './alignmentEngine'
import { expandContraction, isContraction } from './contractionNormalizer'
import { matchListeningPattern, isEligibleForPatternMatching, matchListeningPatternBackward, isEligibleForBackwardPatternMatching } from './listeningPatternMatcher'
import { shouldSynthesizeChunk, isEligibleForChunkSynthesis, synthesizeChunk } from './chunkSynthesizer'

export type FeedbackCategory = 
  | 'weak_form'      // Function words reduced (the, to, and → thuh, ta, n)
  | 'linking'        // Words blend at boundaries (want to → wanna)
  | 'elision'        // Sounds dropped (going to → gonna)
  | 'contraction'    // Contractions (you're → yer, I'm → im)
  | 'similar_words'  // Phonetically similar words (a/the, your/you're)
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
  
  // NEW: Enhanced feedback fields
  meaningInContext: string          // What this word/phrase means IN THIS sentence (1-2 sentences)
  soundRule: string                 // What happens to the sound in fast speech (phonetic/weak-form/linking)
  inSentence: {                     // How it sounded in the ORIGINAL sentence
    original: string                 // Full original sentence with highlighted target
    highlighted: string              // Just the target phrase
    heardAs: string                  // How it sounds (e.g., "later" → "layder")
    chunkDisplay?: string            // Optional: Pattern-based chunk display (e.g., "went-to-the")
    chunkMeaning?: string            // Optional: Chunk-specific meaning
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
 * Detect category based on phrase and context
 */
function detectCategory(phrase: string, actualSpan?: string): FeedbackCategory {
  const lower = phrase.toLowerCase().trim()
  const actualLower = actualSpan?.toLowerCase().trim() || ''
  
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
  
  // Weak forms (function words)
  const weakFormWords = ['the', 'to', 'and', 'for', 'of', 'with', 'a', 'an', 'at', 'in', 'on']
  const words = lower.split(/\s+/)
  if (words.some(w => weakFormWords.includes(w))) {
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
  }
  
  // Multi-word phrases often chunked
  if (words.length >= 2) {
    return 'speed_chunking'
  }
  
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
 * Check if a meaning string is a placeholder/generic fallback
 */
function isPlaceholderMeaning(text: string): boolean {
  const normalized = text.toLowerCase().trim()
  const placeholders = [
    'this phrase carries meaning but can be hard to catch in fast speech',
    'this phrase carries meaning in context',
    'this phrase can sound different in fast speech',
    'this small word is often spoken softly and can be hard to hear',
    'this contraction combines two words into one sound',
    'these words connect together when spoken quickly',
    'this word can sound like another similar word in fast speech',
    'these words flow together as one chunk in natural speech',
  ]
  return placeholders.some(placeholder => normalized.includes(placeholder))
}

/**
 * Generate meaning in context
 */
function generateMeaningInContext(
  phrase: string,
  fullSentence: string,
  category: FeedbackCategory,
  chunkDisplay?: string
): string {
  const lower = phrase.toLowerCase().trim()
  
  // CHUNK MEANINGS: If chunkDisplay exists, provide contextual chunk meaning
  if (chunkDisplay) {
    const chunkMeanings: Record<string, string> = {
      'gonna-go': 'Expresses an intention to leave or do something soon.',
      'going-to-go': 'Describes a future plan to move or take action.',
      'want-to-go': 'Expresses a desire to leave or participate.',
      'gonna': 'Expresses future intention or plan.',
      'going-to': 'Future plan or intention.',
      'want-to': 'Expressing desire or intention to do something.',
    }
    
    const chunkLower = chunkDisplay.toLowerCase()
    if (chunkMeanings[chunkLower]) {
      return chunkMeanings[chunkLower]
    }
    
    // No chunk meaning available - return empty string (caller should handle)
    return ''
  }
  
  // For contractions, expand them (e.g., "I'm" = "I am") and explain role
  if (category === 'contraction' && isContraction(phrase)) {
    const expanded = expandContraction(phrase)
    // Determine role based on the expanded form
    if (expanded.includes(' am ') || expanded.includes(' are ') || expanded.includes(' is ')) {
      return `${phrase} means "${expanded}" - it describes a state or identity.`
    } else if (expanded.includes(' will ')) {
      return `${phrase} means "${expanded}" - it shows future action or intention.`
    } else if (expanded.includes(' would ')) {
      return `${phrase} means "${expanded}" - it shows conditional or past habit.`
    } else if (expanded.includes(' have ') || expanded.includes(' has ')) {
      return `${phrase} means "${expanded}" - it shows completion or possession.`
    } else if (expanded.includes(' not ')) {
      return `${phrase} means "${expanded}" - it makes the statement negative.`
    } else {
      return `${phrase} means "${expanded}" - it combines two words into one sound.`
    }
  }
  
  // Context-aware meanings based on category and common phrases
  const contextMeanings: Record<string, string> = {
    'have you': 'Asking if someone did something.',
    'want to': 'Expressing desire or intention to do something.',
    'going to': 'Future plan or intention.',
    'you\'re': 'Describing someone or their state.',
    'i\'m': 'Describing yourself or your state.',
    'we\'re': 'Describing a group or situation.',
    'later': 'Referring to a time after now.',
    'the': 'Pointing to a specific thing.',
    'to': 'Showing direction or purpose.',
    'and': 'Connecting ideas together.',
    'for': 'Indicating purpose or recipient.',
    'with': 'Showing accompaniment or means.',
    'in the': 'Inside or within something specific.',
    'on the': 'Located on top of something specific.',
    'at the': 'Located near or at a specific place.',
  }
  
  // Check for exact matches first
  for (const [key, meaning] of Object.entries(contextMeanings)) {
    if (lower === key || lower.includes(key)) {
      return meaning
    }
  }
  
  // Category-based fallbacks
  switch (category) {
    case 'contraction':
      return 'This contraction combines two words into one sound.'
    case 'linking':
      return 'These words connect together when spoken quickly.'
    case 'weak_form':
      return 'This small word is often spoken softly and can be hard to hear.'
    case 'similar_words':
      return 'This word can sound like another similar word in fast speech.'
    case 'speed_chunking':
      return 'These words flow together as one chunk in natural speech.'
    default:
      return 'This phrase carries meaning but can be hard to catch in fast speech.'
  }
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
function generateTip(category: FeedbackCategory, phrase: string): string | undefined {
  switch (category) {
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
 */
export function extractPracticeSteps(
  events: AlignmentEvent[],
  refTokens: string[],
  userTokens: string[],
  maxSteps: number = 5,
  fullTranscript?: string // Optional: full sentence for context
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
    if (event.actualSpan) {
      actualSpan = event.actualSpan
    } else if (event.type === 'missing') {
      actualSpan = undefined
    } else if (event.userStart !== undefined && event.userEnd !== undefined) {
      actualSpan = userTokens.slice(event.userStart, event.userEnd).join(' ')
    }
    
    const category = detectCategory(target, actualSpan)
    const heardAs = generateHeardAs(target, category)
    const extraExample = generateExtraExample(target, category)
    let tip = generateTip(category, target)
    let soundRule = generateSoundRule(target, category, heardAs)
    let chunkDisplay: string | undefined = undefined

    // Pattern-based matching: if category is 'weak_form' or 'missed' AND target is eligible
    if ((category === 'weak_form' || category === 'missed') && isEligibleForPatternMatching(target)) {
      // Find target index in refTokens
      // For multi-word spans, use the first token
      const targetTokens = target.split(' ').filter(t => t.length > 0)
      const firstTargetToken = targetTokens[0]?.toLowerCase()
      
        if (firstTargetToken) {
          // Find index of first token in refTokens
          let targetIndex = -1
          for (let i = span.spanRefStart; i <= span.spanRefEnd && i < refTokens.length; i++) {
            if (refTokens[i]?.toLowerCase() === firstTargetToken) {
              targetIndex = i
              break
            }
          }
          
          // If found, try pattern matching
          if (targetIndex >= 0) {
            const patternMatch = matchListeningPattern(firstTargetToken, refTokens, targetIndex)
            if (patternMatch) {
              // Override soundRule and tip with pattern-based feedback
              // Use nullish coalescing to preserve existing values when pattern match doesn't provide them
              soundRule = patternMatch.soundRule
              tip = patternMatch.tip ?? tip // Preserve original tip if patternMatch.tip is null/undefined
              chunkDisplay = patternMatch.chunkDisplay
              // Note: chunkMeaning will be set from generateMeaningInContext if chunkDisplay exists
            }
          }
        }
    }
    
    // Dynamic chunk synthesis for function words
    // If pattern matching didn't find a meaningful chunk, synthesize one from context
    if (shouldSynthesizeChunk(target, chunkDisplay) && 
        isEligibleForChunkSynthesis(target) && 
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
    
    // Generate meaning - in chunk mode, use chunk-aware meaning
    const meaningText = generateMeaningInContext(target, fullSentence, category, chunkDisplay)
    const chunkMeaning = chunkDisplay && !isPlaceholderMeaning(meaningText) ? meaningText : undefined
    
    const step: PracticeStep = {
      id: event.eventId,
      target,
      expectedSpan: target, // Legacy compatibility
      actualSpan,
      refStart: span.spanRefStart,
      refEnd: span.spanRefEnd,
      type: event.type,
      category,
      meaningInContext: chunkMeaning || (!isPlaceholderMeaning(meaningText) ? meaningText : ''),
      meaning: chunkMeaning || (!isPlaceholderMeaning(meaningText) ? meaningText : ''), // Legacy compatibility
      soundRule,
      howItSounds: soundRule, // Legacy compatibility
      inSentence: {
        original: fullSentence,
        highlighted: target,
        heardAs,
        chunkDisplay,
        chunkMeaning,
      },
      extraExample,
      tip,
    }
    
    // Validation: ensure required fields
    // Note: extraExample is optional - if undefined, omit the section entirely (no placeholder)
    if (!step.meaningInContext || !step.soundRule || !step.inSentence.original) {
      console.warn(`⚠️ FeedbackItem missing required fields for ${target}:`, step)
      // Fill fallbacks if missing (but don't create placeholder extraExample)
      step.meaningInContext = step.meaningInContext || 'This phrase carries meaning in context.'
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
      if (event.actualSpan) {
        actualSpan = event.actualSpan
      } else if (event.type === 'missing') {
        actualSpan = undefined
      } else if (event.userStart !== undefined && event.userEnd !== undefined) {
        actualSpan = userTokens.slice(event.userStart, event.userEnd).join(' ')
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
      
      const category = detectCategory(expandedTarget, actualSpan)
      const heardAs = generateHeardAs(expandedTarget, category)
      const extraExample = generateExtraExample(expandedTarget, category)
      let tip = generateTip(category, expandedTarget)
      let soundRule = generateSoundRule(expandedTarget, category, heardAs)
      let chunkDisplay: string | undefined = undefined

      // Pattern-based matching: if category is 'weak_form' or 'missed' AND target is eligible
      if ((category === 'weak_form' || category === 'missed') && isEligibleForPatternMatching(expandedTarget)) {
        // Find target index in refTokens (use phraseStart as starting point)
        const targetTokens = expandedTarget.split(' ').filter(t => t.length > 0)
        const firstTargetToken = targetTokens[0]?.toLowerCase()
        
        if (firstTargetToken && phraseStart >= 0) {
          // Try pattern matching starting at phraseStart
          const patternMatch = matchListeningPattern(firstTargetToken, refTokens, phraseStart)
          if (patternMatch) {
            // Override soundRule and tip with pattern-based feedback
            // Use nullish coalescing to preserve existing values when pattern match doesn't provide them
            soundRule = patternMatch.soundRule
            tip = patternMatch.tip ?? tip // Preserve original tip if patternMatch.tip is null/undefined
            chunkDisplay = patternMatch.chunkDisplay
          }
        }
      }
      
      // Dynamic chunk synthesis for function words (in other events loop)
      // Check if the original target (before expansion) is eligible for synthesis
      if (shouldSynthesizeChunk(target, chunkDisplay) && 
          isEligibleForChunkSynthesis(target) && 
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
      
      // Generate meaning - in chunk mode, use chunk-aware meaning
      const meaningText = generateMeaningInContext(expandedTarget, fullSentence, category, chunkDisplay)
      const chunkMeaning = chunkDisplay && !isPlaceholderMeaning(meaningText) ? meaningText : undefined
      
      const step: PracticeStep = {
        id: event.eventId,
        target: expandedTarget,
        expectedSpan: expandedTarget, // Legacy compatibility
        actualSpan,
        refStart: phraseStart,
        refEnd: phraseEnd,
        type: event.type,
        category,
        meaningInContext: chunkMeaning || (!isPlaceholderMeaning(meaningText) ? meaningText : ''),
        meaning: chunkMeaning || (!isPlaceholderMeaning(meaningText) ? meaningText : ''), // Legacy compatibility
        soundRule,
        howItSounds: soundRule, // Legacy compatibility
        inSentence: {
          original: fullSentence,
          highlighted: expandedTarget,
          heardAs,
          chunkDisplay,
          chunkMeaning,
        },
        extraExample,
        tip,
      }
      
      // Validation: ensure required fields
      // Note: extraExample is optional - if undefined, omit the section entirely (no placeholder)
      if (!step.meaningInContext || !step.soundRule || !step.inSentence.original) {
        console.warn(`⚠️ FeedbackItem missing required fields for ${expandedTarget}:`, step)
        // Fill fallbacks if missing (but don't create placeholder extraExample)
        step.meaningInContext = step.meaningInContext || 'This phrase carries meaning in context.'
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

