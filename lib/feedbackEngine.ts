import {
  FeedbackCategory,
  FeedbackInsight,
  FeedbackResult,
  pickPrimaryInsight,
} from './feedbackTypes'

export interface FeedbackMetadata {
  wpm?: number
  clipDurationSec?: number
}

// Common function words and contractions that indicate sound reduction
const FUNCTION_WORDS = new Set([
  'a', 'an', 'the', 'to', 'of', 'in', 'on', 'at', 'for', 'with', 'by',
  'from', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has',
  'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may',
  'might', 'can', 'must', 'am', 'is', 'it', 'its', 'this', 'that', 'these',
  'those', 'i', 'you', 'he', 'she', 'we', 'they', 'and', 'or', 'but', 'so',
])

const CONTRACTIONS = new Set([
  "i'm", "you're", "he's", "she's", "it's", "we're", "they're",
  "i've", "you've", "we've", "they've",
  "i'd", "you'd", "he'd", "she'd", "we'd", "they'd",
  "i'll", "you'll", "he'll", "she'll", "we'll", "they'll",
  "isn't", "aren't", "wasn't", "weren't",
  "don't", "doesn't", "didn't",
  "can't", "couldn't", "won't", "wouldn't", "shouldn't",
  "haven't", "hasn't", "hadn't",
  "let's", "that's", "there's", "here's", "what's", "who's",
])

const TAG_QUESTIONS = new Set([
  "isn't it", "aren't they", "wasn't it", "weren't they",
  "don't you", "doesn't it", "didn't you",
  "can't you", "won't you", "wouldn't it",
])

function normalizeText(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s']/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 0)
}

function computeWordDiff(reference: string[], user: string[]): {
  deletions: Set<string>
  additions: Set<string>
  deletionsIndices: number[]
  missingContentWords: number[]
} {
  const deletions = new Set<string>()
  const additions = new Set<string>()
  const deletionsIndices: number[] = []
  const missingContentWords: number[] = []

  const userSet = new Set(user)
  const referenceSet = new Set(reference)

  // Find deletions (words in reference but not in user)
  reference.forEach((word, index) => {
    if (!userSet.has(word)) {
      deletions.add(word)
      deletionsIndices.push(index)
      if (!FUNCTION_WORDS.has(word) && !CONTRACTIONS.has(word)) {
        missingContentWords.push(index)
      }
    }
  })

  // Find additions (words in user but not in reference)
  user.forEach((word) => {
    if (!referenceSet.has(word)) {
      additions.add(word)
    }
  })

  return { deletions, additions, deletionsIndices, missingContentWords }
}

function findHighlightSpan(
  reference: string[],
  deletionsIndices: number[]
): { start: number; end: number } {
  if (deletionsIndices.length === 0) {
    return { start: 0, end: Math.min(3, reference.length) }
  }

  const firstDeletion = deletionsIndices[0]
  const lastDeletion = deletionsIndices[deletionsIndices.length - 1]
  return {
    start: Math.max(0, firstDeletion - 1),
    end: Math.min(reference.length, lastDeletion + 2),
  }
}

function detectSoundReduction(
  reference: string[],
  deletions: Set<string>
): { detected: boolean; severity: number; contractions: boolean } {
  let functionWordDeletions = 0
  let contractionDeletions = 0
  deletions.forEach((word) => {
    if (CONTRACTIONS.has(word)) {
      contractionDeletions++
      functionWordDeletions++
    } else if (FUNCTION_WORDS.has(word)) {
      functionWordDeletions++
    }
  })
  
  if (deletions.size === 0) {
    return { detected: false, severity: 0, contractions: false }
  }
  
  const ratio = functionWordDeletions / deletions.size
  const hasContractions = contractionDeletions > 0
  
  if (ratio > 0.4) {
    return { 
      detected: true, 
      severity: hasContractions ? 4 : 3,
      contractions: hasContractions
    }
  }
  
  return { detected: false, severity: 0, contractions: false }
}

function detectSpeedChunking(
  reference: string[],
  user: string[],
  deletionsIndices: number[]
): { detected: boolean; severity: number } {
  const referenceLength = reference.length
  const deletionRate = deletionsIndices.length / referenceLength

  if (deletionRate > 0.3) {
    return { detected: true, severity: 5 }
  }

  const latterHalfDeletions = deletionsIndices.filter(
    (idx) => idx > referenceLength / 2
  ).length
  if (
    deletionsIndices.length > 0 &&
    latterHalfDeletions / deletionsIndices.length > 0.5
  ) {
    return { detected: true, severity: 4 }
  }

  return { detected: false, severity: 0 }
}

function detectVocabExpression(
  deletions: Set<string>,
  additions: Set<string>,
  missingContentWords: number[]
): { detected: boolean; severity: number } {
  if (additions.size > 0 && missingContentWords.length > 0) {
    return { detected: true, severity: 3 }
  }

  if (
    deletions.size > 0 &&
    missingContentWords.length / deletions.size > 0.5
  ) {
    return { detected: true, severity: 3 }
  }

  return { detected: false, severity: 0 }
}

function detectGrammarPattern(
  reference: string[],
  deletions: Set<string>
): { detected: boolean; severity: number } {
  const referenceLower = reference.map((w) => w.toLowerCase()).join(' ')
  const tagQuestionMissing = Array.from(TAG_QUESTIONS).some((tag) => {
    if (referenceLower.includes(tag)) {
      const tagWords = tag.split(' ')
      return tagWords.some((w) => deletions.has(w))
    }
    return false
  })
  if (tagQuestionMissing) {
    return { detected: true, severity: 3 }
  }

  const auxiliaries = ['is', 'are', 'was', 'were', 'has', 'have', 'had', 'do', 'does', 'did']
  const missingAuxiliaries = auxiliaries.filter((aux) => deletions.has(aux))
  if (missingAuxiliaries.length > 0) {
    return { detected: true, severity: 2 }
  }

  return { detected: false, severity: 0 }
}

export function analyzeFeedback(
  referenceTranscript: string,
  userTyped: string,
  metadata?: FeedbackMetadata
): FeedbackResult {
  const referenceWords = normalizeText(referenceTranscript)
  const userWords = normalizeText(userTyped)

  const { deletions, additions, deletionsIndices, missingContentWords } =
    computeWordDiff(referenceWords, userWords)

  const insights: FeedbackInsight[] = []

  // Detect all possible insights
  const soundReduction = detectSoundReduction(referenceWords, deletions)
  if (soundReduction.detected) {
    insights.push({
      id: 'sound-reduction',
      category: soundReduction.contractions ? 'CONTRACTION' : 'SOUND_REDUCTION',
      title: soundReduction.contractions ? 'Contraction' : 'Sound & reduction',
      summary: soundReduction.contractions
        ? 'You missed some contractions like "isn\'t" or "you\'re".'
        : 'You missed some small connecting words or shortened sounds.',
      detail: soundReduction.contractions
        ? 'Contractions like "isn\'t" and "you\'re" often sound like one blended word in fast speech.'
        : 'Native speakers blend these words together, making them hard to hear.',
      severity: soundReduction.severity,
    })
  }

  const speedChunking = detectSpeedChunking(referenceWords, userWords, deletionsIndices)
  if (speedChunking.detected) {
    insights.push({
      id: 'speed-chunking',
      category: 'SPEED_CHUNKING',
      title: 'Speed & chunking',
      summary: 'You got the start but missed chunks later in the sentence.',
      detail: 'Fast speech comes in connected chunks—your ear needs practice catching the full flow.',
      severity: speedChunking.severity,
    })
  }

  const vocabExpression = detectVocabExpression(deletions, additions, missingContentWords)
  if (vocabExpression.detected) {
    insights.push({
      id: 'vocab-expression',
      category: 'VOCAB_UNKNOWN',
      title: 'Vocabulary / expression',
      summary: 'Some key words didn\'t come through clearly.',
      detail: 'Content words carry meaning—when they\'re unclear, the whole message gets fuzzy.',
      severity: vocabExpression.severity,
    })
  }

  const grammarPattern = detectGrammarPattern(referenceWords, deletions)
  if (grammarPattern.detected) {
    insights.push({
      id: 'grammar-pattern',
      category: 'GRAMMAR_PATTERN',
      title: 'Grammar pattern',
      summary: 'You missed a grammatical structure or ending.',
      detail: 'Grammar markers like tag questions and auxiliaries often get reduced or blended in fast speech.',
      severity: grammarPattern.severity,
    })
  }

  // If no insights detected, provide a default
  if (insights.length === 0) {
    insights.push({
      id: 'default',
      category: 'SOUND_REDUCTION',
      title: 'Sound & reduction',
      summary: 'Some parts were hard to catch.',
      detail: 'Native speakers blend words together, making them hard to hear.',
      severity: 2,
    })
  }

  const highlightSpan = findHighlightSpan(referenceWords, deletionsIndices)

  return {
    insights,
    highlightSpan,
  }
}

// Export for backwards compatibility
export { pickPrimaryInsight } from './feedbackTypes'
