import { InsightCategory } from './sessionTypes'
import { ErrorCause } from './errorClassifier'

/**
 * Map error cause to insight category for color consistency
 */
function errorCauseToCategory(cause: ErrorCause): InsightCategory {
  const mapping: Record<ErrorCause, InsightCategory> = {
    CONNECTED_SPEECH: 'CONNECTED_SPEECH',
    WORD_REDUCTION: 'CONTRACTION',
    FUNCTION_WORD_DROP: 'FUNCTION_WORDS',
    VOWEL_REDUCTION: 'CONNECTED_SPEECH',
    BOUNDARY_MISALIGNMENT: 'CONNECTED_SPEECH',
    CONTENT_WORD_MISS: 'VOCAB_UNKNOWN',
  }
  return mapping[cause] || 'CONNECTED_SPEECH'
}

/**
 * Get color scheme for an error cause or insight category
 * Matches the color used in insight cards and highlights
 */
export function getCategoryColors(category: InsightCategory | ErrorCause): {
  bg: string
  border: string
  text: string
  icon: string
} {
  // If it's an ErrorCause, convert to InsightCategory
  const insightCategory = Object.values(['CONNECTED_SPEECH', 'FUNCTION_WORDS', 'CONTRACTION', 'SPEED_CHUNKING', 'VOCAB_UNKNOWN', 'GRAMMAR_PATTERN', 'STRESS_RHYTHM'] as const).includes(category as InsightCategory)
    ? (category as InsightCategory)
    : errorCauseToCategory(category as ErrorCause)
  
  const colors: Record<InsightCategory, ReturnType<typeof getCategoryColors>> = {
    CONNECTED_SPEECH: {
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      text: 'text-blue-900',
      icon: 'text-blue-600',
    },
    FUNCTION_WORDS: {
      bg: 'bg-purple-50',
      border: 'border-purple-200',
      text: 'text-purple-900',
      icon: 'text-purple-600',
    },
    CONTRACTION: {
      bg: 'bg-indigo-50',
      border: 'border-indigo-200',
      text: 'text-indigo-900',
      icon: 'text-indigo-600',
    },
    SPEED_CHUNKING: {
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      text: 'text-amber-900',
      icon: 'text-amber-600',
    },
    VOCAB_UNKNOWN: {
      bg: 'bg-red-50',
      border: 'border-red-200',
      text: 'text-red-900',
      icon: 'text-red-600',
    },
    GRAMMAR_PATTERN: {
      bg: 'bg-green-50',
      border: 'border-green-200',
      text: 'text-green-900',
      icon: 'text-green-600',
    },
    STRESS_RHYTHM: {
      bg: 'bg-teal-50',
      border: 'border-teal-200',
      text: 'text-teal-900',
      icon: 'text-teal-600',
    },
  }

  return colors[insightCategory] || colors.CONNECTED_SPEECH
}

/**
 * Generate learner-centric summary text
 * Focuses on what the USER missed, not what the audio did
 * Diagnostic tone (not teaching) - prepares user for word-level details below
 */
export function getCoachSummary(category: InsightCategory, whatHappened: string): string {
  // Extract pattern from whatHappened and rewrite in learner-centric way
  const lower = whatHappened.toLowerCase()

  // Connected speech patterns
  if (category === 'CONNECTED_SPEECH') {
    if (lower.includes('blended') || lower.includes('connected')) {
      return 'You missed connected speech, where words blend together and boundaries become hard to hear.'
    }
    return 'You missed connected speech, where words flow together in natural speech.'
  }

  // Function words patterns
  if (category === 'FUNCTION_WORDS') {
    if (lower.includes('please') || lower.includes('politeness')) {
      return 'You missed function words like "please" that are often spoken quickly and softly.'
    }
    return 'You missed function words, which are often reduced or spoken quickly.'
  }

  // Contractions
  if (category === 'CONTRACTION') {
    return 'You missed contractions like "gonna" or "wanna", where words are reduced in casual speech.'
  }

  // Speed & chunking
  if (category === 'SPEED_CHUNKING') {
    if (lower.includes('chunk') || lower.includes('later')) {
      return 'You missed chunks later in the phrase, where fast speech groups words together.'
    }
    return 'You missed word chunks, where fast speech groups words together.'
  }

  // Vocabulary
  if (category === 'VOCAB_UNKNOWN') {
    return 'You missed some vocabulary that may be unfamiliar or pronounced differently than expected.'
  }

  // Grammar patterns
  if (category === 'GRAMMAR_PATTERN') {
    return 'You missed a grammar pattern, where structure affects how words sound together.'
  }

  // Stress & rhythm
  if (category === 'STRESS_RHYTHM') {
    return 'You missed stress and rhythm patterns, where emphasis changes how words sound.'
  }

  // Fallback: rewrite whatHappened to be learner-centric
  // Remove specific examples and make it about the user
  let summary = whatHappened
    .replace(/the phrase ["'][^"']+["']/gi, 'words')
    .replace(/some sounds/gi, 'sounds')
    .replace(/making it hard/gi, 'making them hard')
  
  // Add "You missed" if not present
  if (!summary.toLowerCase().startsWith('you')) {
    summary = `You missed ${summary.charAt(0).toLowerCase() + summary.slice(1)}`
  }

  return summary
}

