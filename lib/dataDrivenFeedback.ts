import { ErrorCause, analyzeErrors, getRankedCauses } from './errorClassifier'

/**
 * Data-driven summary templates
 * These reference what the USER did, not generic explanations
 */
const SUMMARY_TEMPLATES: Record<ErrorCause, string[]> = {
  CONNECTED_SPEECH: [
    'You often missed words when they were spoken together.',
    'You missed several words that blended together in fast speech.',
    'You had trouble hearing word boundaries when words connected.',
  ],
  WORD_REDUCTION: [
    'You often missed reduced words like "gonna" or "wanna".',
    'You missed contractions and shortened forms when they were spoken quickly.',
    'You had difficulty hearing reduced words in casual speech.',
  ],
  FUNCTION_WORD_DROP: [
    'You often missed small connecting words like "the" or "a".',
    'You missed function words that are spoken quickly and softly.',
    'You had trouble hearing small words that connect the sentence.',
  ],
  VOWEL_REDUCTION: [
    'You often confused similar-sounding words.',
    'You misheard words that sound alike in fast speech.',
    'You had difficulty distinguishing between similar-sounding words.',
  ],
  BOUNDARY_MISALIGNMENT: [
    'You often misaligned where words begin and end.',
    'You had trouble identifying word boundaries in connected speech.',
    'You missed the breaks between words when they flowed together.',
  ],
  CONTENT_WORD_MISS: [
    'You often missed important content words.',
    'You missed key words that carry the main meaning.',
    'You had difficulty hearing content words in fast speech.',
  ],
}

/**
 * Generate user-specific diagnostic summary based on actual errors
 * Supports both new alignment format (ref/hyp) and old format (expected/actual)
 */
export function generateDataDrivenSummary(
  tokens: Array<{ type: string; ref?: string; hyp?: string; expected?: string; actual?: string; word?: string }>,
  primaryCause: ErrorCause,
  secondaryCause?: ErrorCause
): string {
  // Get templates for primary cause
  const primaryTemplates = SUMMARY_TEMPLATES[primaryCause] || SUMMARY_TEMPLATES.CONNECTED_SPEECH
  
  // Select template (can be randomized or based on error count)
  const summary = primaryTemplates[0] // Use first template for consistency
  
  // If secondary cause is meaningful (at least 2 errors), mention it
  if (secondaryCause) {
    const secondaryTemplates = SUMMARY_TEMPLATES[secondaryCause] || []
    if (secondaryTemplates.length > 0) {
      // Combine: "You often missed X, and also had trouble with Y."
      return summary.replace('.', `, and also ${secondaryTemplates[0].toLowerCase().replace('you ', '')}`)
    }
  }
  
  return summary
}

/**
 * Generate "What happened" with examples from actual errors
 * Supports both new alignment format (ref/hyp) and old format (expected/actual)
 */
export function generateWhatHappened(
  tokens: Array<{ type: string; ref?: string; hyp?: string; expected?: string; actual?: string; word?: string }>,
  cause: ErrorCause
): { whatHappened: string; whyHard: string; examples?: string[] } {
  // Find examples from actual tokens
  const examples: string[] = []
  
  if (cause === 'WORD_REDUCTION') {
    tokens.forEach(token => {
      // Support both formats
      const ref = token.ref || token.expected
      const hyp = token.hyp || token.actual
      
      if (token.type === 'missing' && ref) {
        const expected = ref.toLowerCase()
        if (['gonna', 'wanna', 'gotta', 'kinda'].includes(expected)) {
          examples.push(`"${ref}"`)
        }
      }
      if (token.type === 'wrong' && ref && hyp) {
        const expected = ref.toLowerCase()
        const actual = hyp.toLowerCase()
        if (['going to', 'want to', 'got to'].some(phrase => expected.includes(phrase))) {
          examples.push(`"${ref}" (you heard "${hyp}")`)
        }
      }
    })
  }
  
  if (cause === 'FUNCTION_WORD_DROP') {
    tokens.forEach(token => {
      const ref = token.ref || token.expected
      if (token.type === 'missing' && ref) {
        const expected = ref.toLowerCase()
        if (['a', 'an', 'the', 'to', 'for', 'of', 'with'].includes(expected)) {
          if (examples.length < 2) {
            examples.push(`"${ref}"`)
          }
        }
      }
    })
  }
  
  if (cause === 'CONNECTED_SPEECH') {
    // Find sequences of missing words
    let sequence: string[] = []
    tokens.forEach((token, idx) => {
      const ref = token.ref || token.expected
      if (token.type === 'missing' && ref) {
        sequence.push(ref)
      } else {
        if (sequence.length >= 2) {
          examples.push(sequence.join(' '))
        }
        sequence = []
      }
    })
    if (sequence.length >= 2) {
      examples.push(sequence.join(' '))
    }
  }
  
  // Build "What happened" - references examples from THIS sentence
  let whatHappened = ''
  if (examples.length > 0) {
    const exampleText = examples.slice(0, 2).join(' and ')
    whatHappened = `You missed ${exampleText} in this sentence.`
  } else {
    whatHappened = 'You missed several words in this sentence.'
  }
  
  // Build "Why it sounded hard" - brief general explanation
  const generalExplanations: Record<ErrorCause, string> = {
    CONNECTED_SPEECH: 'In fast speech, words often blend together, making boundaries hard to hear.',
    WORD_REDUCTION: 'Reduced forms like "gonna" are common in casual speech and can be hard to catch.',
    FUNCTION_WORD_DROP: 'Small connecting words are often spoken quickly and can be missed.',
    VOWEL_REDUCTION: 'Similar-sounding words can be confusing when spoken quickly.',
    BOUNDARY_MISALIGNMENT: 'Word boundaries can be unclear when speech flows quickly.',
    CONTENT_WORD_MISS: 'Content words carry meaning but can be missed in fast speech.',
  }
  
  const whyHard = generalExplanations[cause] || generalExplanations.CONNECTED_SPEECH
  
  return {
    whatHappened,
    whyHard,
    examples: examples.length > 0 ? examples : undefined,
  }
}

/**
 * Analyze tokens and generate data-driven feedback
 * Conservative approach: only makes claims when evidence is strong
 */
export interface DataDrivenFeedback {
  primaryCause: ErrorCause
  secondaryCause?: ErrorCause
  summary: string
  whatHappened: string
  whyHard: string
  examples?: string[]
  errorCounts: Map<ErrorCause, number>
}

export function generateFeedbackFromErrors(
  tokens: Array<{ type: string; ref?: string; hyp?: string; expected?: string; actual?: string; word?: string; confidence?: number }>
): DataDrivenFeedback | null {
  if (!tokens || tokens.length === 0) {
    return null
  }
  
  // Filter to only high-confidence substitutions for analysis
  // Low-confidence ones are already split into delete+insert
  const highConfidenceTokens = tokens.filter(token => {
    if (token.type === 'wrong') {
      return token.confidence !== undefined && token.confidence >= 0.55
    }
    return true
  })
  
  // Analyze errors (only from high-confidence operations)
  const errorCounts = analyzeErrors(highConfidenceTokens)
  
  if (errorCounts.size === 0) {
    // If no high-confidence errors, return conservative feedback
    const hasDeletions = tokens.some(t => t.type === 'missing')
    const hasInsertions = tokens.some(t => t.type === 'extra')
    
    if (hasDeletions || hasInsertions) {
      return {
        primaryCause: 'CONNECTED_SPEECH',
        summary: 'Some parts were unclear.',
        whatHappened: 'You missed some words or added extra words.',
        whyHard: 'In fast speech, words often blend together, making boundaries hard to hear.',
        errorCounts: new Map(),
      }
    }
    return null
  }
  
  // Get ranked causes
  const ranked = getRankedCauses(errorCounts)
  
  if (ranked.length === 0) {
    return null
  }
  
  const primaryCause = ranked[0].cause
  const secondaryCause = ranked.length > 1 && ranked[1].count >= 2 ? ranked[1].cause : undefined
  
  // Generate summaries (conservative)
  const summary = generateDataDrivenSummary(highConfidenceTokens, primaryCause, secondaryCause)
  const { whatHappened, whyHard, examples } = generateWhatHappened(highConfidenceTokens, primaryCause)
  
  return {
    primaryCause,
    secondaryCause,
    summary,
    whatHappened,
    whyHard,
    examples,
    errorCounts,
  }
}

