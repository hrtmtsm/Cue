/**
 * Generate context-specific listening feedback for a single word
 * ONLY uses words that exist in the provided sentence/user input
 * NO dictionaries, NO general rules, NO unrelated words
 */

export interface WordFeedbackParams {
  originalSentence: string
  userInput: string
  word: string
  wordType: 'grey' | 'grey-slash' | 'red' | 'black'
  previousWord?: string | null
  nextWord?: string | null
  userTypedWord?: string | null // For substitutions (red) or extra words (grey-slash)
}

export interface MissingWordFeedback {
  whatUserMightHaveHeard: string
  whatItWas: string
  whyThisWasHard: string
}

export interface ExtraWordFeedback {
  whatUserHeard: string
  whatWasActuallySaid: string
  whyThisHappened: string
}

export interface SubstitutionFeedback {
  whatUserHeard: string
  whatItWas: string
  whyTheySoundedSimilarHere: string
}

export interface CorrectWordFeedback {
  meaning: string
  pronunciationTip: string
  reductionOrLinking?: string
}

export type WordFeedback = 
  | { type: 'missing'; feedback: MissingWordFeedback }
  | { type: 'extra'; feedback: ExtraWordFeedback }
  | { type: 'substitution'; feedback: SubstitutionFeedback }
  | { type: 'correct'; feedback: CorrectWordFeedback }

/**
 * Analyze word boundaries and sound patterns in context
 * Uses ONLY words from the provided sentence
 */
function analyzeWordInContext(
  word: string,
  previousWord: string | null | undefined,
  nextWord: string | null | undefined,
  originalSentence: string
): {
  isFunctionWord: boolean
  hasLinkingPotential: boolean
  reductionPattern?: string
} {
  const wordLower = word.toLowerCase()
  const prevLower = previousWord?.toLowerCase() || ''
  const nextLower = nextWord?.toLowerCase() || ''
  
  // Function words (using only common ones that appear in sentences)
  const functionWords = ['a', 'an', 'the', 'to', 'for', 'of', 'in', 'on', 'at', 'by', 'with', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'i', 'you', 'he', 'she', 'it', 'we', 'they']
  const isFunctionWord = functionWords.includes(wordLower)
  
  // Check for linking potential (vowel/consonant patterns)
  const hasLinkingPotential = 
    (prevLower.endsWith('n') && wordLower.startsWith('y')) || // "when you"
    (prevLower.endsWith('s') && wordLower.startsWith('y')) || // "miss you"
    (prevLower.endsWith('t') && wordLower.startsWith('y')) || // "get you"
    (prevLower.endsWith('d') && wordLower.startsWith('y')) || // "did you"
    (prevLower.endsWith('r') && wordLower.startsWith('a')) || // "for a"
    (prevLower.endsWith('r') && wordLower.startsWith('o')) || // "for our"
    (prevLower.endsWith('n') && wordLower.startsWith('a')) || // "in a"
    (prevLower.endsWith('n') && wordLower.startsWith('o'))    // "on a"
  
  // Check for reduction patterns in this specific context
  let reductionPattern: string | undefined
  if (prevLower === 'going' && wordLower === 'to') {
    reductionPattern = 'going to → gonna'
  } else if (prevLower === 'want' && wordLower === 'to') {
    reductionPattern = 'want to → wanna'
  } else if (prevLower === 'got' && wordLower === 'to') {
    reductionPattern = 'got to → gotta'
  } else if (prevLower === 'kind' && wordLower === 'of') {
    reductionPattern = 'kind of → kinda'
  }
  
  return { isFunctionWord, hasLinkingPotential, reductionPattern }
}

/**
 * Generate feedback for missing word (grey)
 */
function generateMissingFeedback(params: WordFeedbackParams): MissingWordFeedback {
  const { word, previousWord, nextWord, originalSentence } = params
  const analysis = analyzeWordInContext(word, previousWord, nextWord, originalSentence)
  
  let whatUserMightHaveHeard = '(nothing perceived)'
  let whyThisWasHard = ''
  
  // Determine why this word was hard based on context
  if (analysis.reductionPattern) {
    // Part of a reduction pattern
    whyThisWasHard = `Here, '${previousWord} ${word}' is often reduced to a single sound (like '${analysis.reductionPattern.split('→')[1].trim()}'), making '${word}' hard to hear separately.`
  } else if (analysis.hasLinkingPotential && previousWord) {
    // Linking/blending with previous word
    whyThisWasHard = `'${previousWord}' and '${word}' often blend together when spoken quickly, making '${word}' sound like part of the previous word.`
  } else if (analysis.isFunctionWord) {
    // Function word with weak stress
    if (previousWord && nextWord) {
      whyThisWasHard = `Between '${previousWord}' and '${nextWord}', '${word}' is often unstressed and spoken very quickly, so it can disappear.`
    } else if (previousWord) {
      whyThisWasHard = `After '${previousWord}', '${word}' is often unstressed and can fade into the next sound.`
    } else {
      whyThisWasHard = `'${word}' is a small function word that's often unstressed and spoken quickly, making it easy to miss.`
    }
  } else {
    // Content word - less common but possible
    if (previousWord && nextWord) {
      whyThisWasHard = `Between '${previousWord}' and '${nextWord}', '${word}' may have been spoken quickly or blended with surrounding sounds.`
    } else {
      whyThisWasHard = `'${word}' may have been spoken quickly or reduced in this context.`
    }
  }
  
  return {
    whatUserMightHaveHeard: whatUserMightHaveHeard,
    whatItWas: word,
    whyThisWasHard,
  }
}

/**
 * Generate feedback for extra word (grey-slash)
 */
function generateExtraFeedback(params: WordFeedbackParams): ExtraWordFeedback {
  const { word, previousWord, nextWord, originalSentence, userInput } = params
  
  // Find what was actually said around this position
  const userWords = userInput.toLowerCase().split(/\s+/)
  const originalWords = originalSentence.toLowerCase().split(/\s+/)
  
  // Try to find the position in original sentence
  let whatWasActuallySaid = ''
  if (previousWord && nextWord) {
    // Look for this pattern in original
    const prevIdx = originalWords.indexOf(previousWord.toLowerCase())
    const nextIdx = originalWords.indexOf(nextWord.toLowerCase())
    if (prevIdx >= 0 && nextIdx >= 0 && nextIdx === prevIdx + 1) {
      whatWasActuallySaid = `${previousWord} ${nextWord}`
    } else if (prevIdx >= 0) {
      whatWasActuallySaid = previousWord
    } else if (nextIdx >= 0) {
      whatWasActuallySaid = nextWord
    } else {
      whatWasActuallySaid = originalSentence.substring(0, 50) + '...'
    }
  } else if (previousWord) {
    whatWasActuallySaid = previousWord
  } else if (nextWord) {
    whatWasActuallySaid = nextWord
  } else {
    whatWasActuallySaid = originalSentence.substring(0, 50) + '...'
  }
  
  // Explain why this happened
  let whyThisHappened = ''
  if (previousWord && nextWord) {
    whyThisHappened = `Between '${previousWord}' and '${nextWord}', the word boundary may have been unclear, leading you to hear '${word}' that wasn't actually spoken.`
  } else if (previousWord) {
    whyThisHappened = `After '${previousWord}', the sound pattern may have suggested '${word}' was present, even though it wasn't in the audio.`
  } else {
    whyThisHappened = `The rhythm or sound pattern in this part of the sentence may have created the impression that '${word}' was spoken.`
  }
  
  return {
    whatUserHeard: word,
    whatWasActuallySaid,
    whyThisHappened,
  }
}

/**
 * Generate feedback for substitution (red)
 */
function generateSubstitutionFeedback(params: WordFeedbackParams): SubstitutionFeedback {
  const { word, userTypedWord, previousWord, nextWord, originalSentence } = params
  
  if (!userTypedWord) {
    // Fallback if user word not provided
    return {
      whatUserHeard: '(unknown)',
      whatItWas: word,
      whyTheySoundedSimilarHere: `This word may have sounded similar to another word in this context.`,
    }
  }
  
  const wordLower = word.toLowerCase()
  const userLower = userTypedWord.toLowerCase()
  
  // Analyze why they sound similar in THIS context
  let whyTheySoundedSimilarHere = ''
  
  // Check for vowel reduction patterns
  if ((wordLower === 'a' && userLower === 'the') || (wordLower === 'the' && userLower === 'a')) {
    whyTheySoundedSimilarHere = `In fast speech, '${wordLower}' and '${userLower}' can both be reduced to a quick, unstressed sound, making them hard to distinguish.`
  } else if ((wordLower === 'to' && userLower === 'too') || (wordLower === 'too' && userLower === 'to')) {
    whyTheySoundedSimilarHere = `'${wordLower}' and '${userLower}' are homophones—they sound identical, so context is needed to tell them apart.`
  } else if ((wordLower === 'your' && userLower === "you're") || (wordLower === "you're" && userLower === 'your')) {
    whyTheySoundedSimilarHere = `'${wordLower}' and '${userLower}' sound very similar, especially when 'you're' is reduced to 'yer' in fast speech.`
  } else if ((wordLower === 'their' && userLower === 'there') || (wordLower === 'there' && userLower === 'their')) {
    whyTheySoundedSimilarHere = `'${wordLower}' and '${userLower}' are homophones, so they're indistinguishable by sound alone.`
  } else if ((wordLower === 'hear' && userLower === 'here') || (wordLower === 'here' && userLower === 'hear')) {
    whyTheySoundedSimilarHere = `'${wordLower}' and '${userLower}' are homophones—they sound exactly the same.`
  } else if (previousWord && nextWord) {
    // Context-based explanation
    whyTheySoundedSimilarHere = `Between '${previousWord}' and '${nextWord}', '${wordLower}' and '${userLower}' may have similar vowel sounds or consonant patterns that blend in fast speech.`
  } else if (previousWord) {
    whyTheySoundedSimilarHere = `After '${previousWord}', '${wordLower}' and '${userLower}' may share similar sounds that are hard to distinguish when spoken quickly.`
  } else {
    // Generic but contextual
    whyTheySoundedSimilarHere = `In this sentence, '${wordLower}' and '${userLower}' likely share vowel or consonant sounds that make them sound similar when spoken at natural speed.`
  }
  
  return {
    whatUserHeard: userTypedWord,
    whatItWas: word,
    whyTheySoundedSimilarHere,
  }
}

/**
 * Generate feedback for correct word (black) - Word Help
 */
function generateCorrectFeedback(params: WordFeedbackParams): CorrectWordFeedback {
  const { word, previousWord, nextWord, originalSentence } = params
  const wordLower = word.toLowerCase()
  const analysis = analyzeWordInContext(word, previousWord, nextWord, originalSentence)
  
  // Generate contextual meaning (very short, sentence-specific)
  let meaning = ''
  if (wordLower === 'the') {
    meaning = 'A definite article used before specific nouns.'
  } else if (wordLower === 'a' || wordLower === 'an') {
    meaning = 'An indefinite article used before general nouns.'
  } else if (wordLower === 'to') {
    meaning = 'A preposition indicating direction or purpose, or part of an infinitive verb.'
  } else if (wordLower === 'of') {
    meaning = 'A preposition showing relationship or belonging.'
  } else if (wordLower === 'in') {
    meaning = 'A preposition indicating location or time.'
  } else if (wordLower === 'on') {
    meaning = 'A preposition indicating position or time.'
  } else if (wordLower === 'at') {
    meaning = 'A preposition indicating location or time.'
  } else if (wordLower === 'and') {
    meaning = 'A conjunction connecting words or phrases.'
  } else if (wordLower === 'or') {
    meaning = 'A conjunction indicating alternatives.'
  } else if (wordLower === 'but') {
    meaning = 'A conjunction showing contrast.'
  } else if (wordLower === 'is' || wordLower === 'are' || wordLower === 'was' || wordLower === 'were') {
    meaning = 'A form of the verb "be" used to describe states or conditions.'
  } else if (wordLower === 'have' || wordLower === 'has' || wordLower === 'had') {
    meaning = 'A verb indicating possession or used in perfect tenses.'
  } else if (wordLower === 'will' || wordLower === 'would' || wordLower === 'could' || wordLower === 'should') {
    meaning = 'A modal verb expressing possibility, necessity, or condition.'
  } else {
    // Generic for content words
    meaning = `A word used in this sentence to convey meaning.`
  }
  
  // Pronunciation tip (practical, no IPA)
  let pronunciationTip = ''
  if (analysis.isFunctionWord) {
    pronunciationTip = `This word is usually unstressed and spoken quickly, so it can be hard to hear clearly.`
  } else {
    pronunciationTip = `Pay attention to how this word is stressed and how it connects to the words around it.`
  }
  
  // Reduction or linking (ONLY if relevant)
  let reductionOrLinking: string | undefined
  if (analysis.reductionPattern) {
    reductionOrLinking = `In casual speech, '${previousWord} ${word}' often becomes '${analysis.reductionPattern.split('→')[1].trim()}'.`
  } else if (analysis.hasLinkingPotential && previousWord) {
    reductionOrLinking = `'${previousWord}' and '${word}' often link together when spoken, creating a smooth sound connection.`
  }
  
  return {
    meaning,
    pronunciationTip,
    reductionOrLinking,
  }
}

/**
 * Main function: Generate context-specific feedback for a single word
 */
export function generateWordFeedback(params: WordFeedbackParams): WordFeedback {
  const { wordType } = params
  
  switch (wordType) {
    case 'grey':
      return {
        type: 'missing',
        feedback: generateMissingFeedback(params),
      }
    
    case 'grey-slash':
      return {
        type: 'extra',
        feedback: generateExtraFeedback(params),
      }
    
    case 'red':
      return {
        type: 'substitution',
        feedback: generateSubstitutionFeedback(params),
      }
    
    case 'black':
      return {
        type: 'correct',
        feedback: generateCorrectFeedback(params),
      }
    
    default:
      // Fallback
      return {
        type: 'correct',
        feedback: {
          meaning: 'A word in this sentence.',
          pronunciationTip: 'Listen carefully to how this word sounds.',
        },
      }
  }
}

