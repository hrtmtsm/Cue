import { FeedbackBundle, Insight, Phrase } from './sessionTypes'

// Generate mock feedback for a phrase based on user attempt
export function generateFeedback(
  phrase: Phrase,
  userText: string
): FeedbackBundle {
  const insights: Insight[] = []

  // Simple heuristics to generate insights
  const phraseLower = phrase.text.toLowerCase()
  const userLower = userText.toLowerCase()
  const words = phrase.text.split(/\s+/)
  const phraseWordCount = words.length

  // For demo: Always create at least 2 insights with specific highlight ranges
  // Primary insight: highlight "with oat milk" (if phrase contains it) or first few words
  const withOatMilkIndex = words.findIndex((w) => w.toLowerCase() === 'with')
  if (withOatMilkIndex >= 0 && withOatMilkIndex + 2 < phraseWordCount) {
    insights.push({
      id: 'connected-speech-1',
      category: 'CONNECTED_SPEECH',
      severity: 'high',
      title: 'Connected speech',
      whatHappened: 'The phrase "with oat milk" blended together making it hard to hear clearly.',
      whyHard: 'Words flow together in natural speech, especially with function words like "with".',
      focusTip: 'Listen for how "with" connects to the following words.',
      highlightRanges: [{ start: withOatMilkIndex, end: withOatMilkIndex + 3 }],
      examples: ['with oat → "withoat"', 'oat milk → "oatmilk"'],
    })
  } else {
    // Fallback primary insight
    insights.push({
      id: 'connected-speech-1',
      category: 'CONNECTED_SPEECH',
      severity: 'high',
      title: 'Connected speech',
      whatHappened: 'Some sounds connected in ways that made them hard to distinguish.',
      whyHard: 'Words flow together in natural speech, creating sound connections you might not expect.',
      focusTip: 'Listen for how words link together, especially at word boundaries.',
      highlightRanges: [{ start: 0, end: Math.min(3, phraseWordCount) }],
    })
  }

  // Secondary insight: highlight "please" or last word if phrase ends with it
  const pleaseIndex = words.findIndex((w) => w.toLowerCase().includes('please'))
  if (pleaseIndex >= 0) {
    insights.push({
      id: 'function-words-1',
      category: 'FUNCTION_WORDS',
      severity: 'med',
      title: 'Politeness markers',
      whatHappened: 'You missed the word "please" at the end of the phrase.',
      whyHard: 'Politeness markers like "please" are often said quickly and softly.',
      focusTip: 'Listen for soft, quick words at the end of sentences.',
      highlightRanges: [{ start: pleaseIndex, end: pleaseIndex + 1 }],
    })
  } else {
    // Fallback secondary insight
    const lastWordIndex = phraseWordCount - 1
    if (lastWordIndex >= 0) {
      insights.push({
        id: 'function-words-1',
        category: 'FUNCTION_WORDS',
        severity: 'med',
        title: 'Ending words',
        whatHappened: 'The ending of the phrase was unclear.',
        whyHard: 'Ending words are often reduced or rushed in fast speech.',
        focusTip: 'Pay attention to how sentences end—words may be softer or shorter.',
        highlightRanges: [{ start: lastWordIndex, end: phraseWordCount }],
      })
    }
  }

  // Add more insights if user text is much shorter (speed/chunking)
  const userWordCount = userText.split(/\s+/).length
  if (userWordCount < phraseWordCount * 0.7 && insights.length < 3) {
    insights.push({
      id: 'speed-chunking-1',
      category: 'SPEED_CHUNKING',
      severity: 'high',
      title: 'Speed & chunking',
      whatHappened: 'You captured the beginning but missed chunks later in the phrase.',
      whyHard: 'Fast speech comes in connected chunks—it takes practice to catch the full flow.',
      focusTip: 'Try breaking the phrase into smaller chunks and listen multiple times.',
      highlightRanges: [{ start: Math.floor(phraseWordCount * 0.5), end: phraseWordCount }],
    })
  }

  // Determine primary insight (highest severity, or first if tied)
  const severityOrder = { high: 3, med: 2, low: 1 }
  const primaryInsight = insights.reduce((prev, current) => {
    if (severityOrder[current.severity] > severityOrder[prev.severity]) {
      return current
    }
    return prev
  })

  return {
    phraseId: phrase.id,
    insights,
    primaryInsightId: primaryInsight.id,
  }
}

function findContractionRanges(text: string): Array<{ start: number; end: number }> {
  const words = text.split(/\s+/)
  const ranges: Array<{ start: number; end: number }> = []
  words.forEach((word, index) => {
    if (word.includes("'")) {
      ranges.push({ start: index, end: index + 1 })
    }
  })
  return ranges
}

function findFunctionWordRanges(
  text: string,
  functionWords: string[]
): Array<{ start: number; end: number }> {
  const words = text.split(/\s+/)
  const ranges: Array<{ start: number; end: number }> = []
  words.forEach((word, index) => {
    const wordLower = word.toLowerCase().replace(/[^\w]/g, '')
    if (functionWords.includes(wordLower)) {
      ranges.push({ start: index, end: index + 1 })
    }
  })
  return ranges
}

