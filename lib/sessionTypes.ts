export interface Phrase {
  id: string
  text: string
  audioUrl: string
  durationMs: number
}

export interface ClipSession {
  id: string
  phrases: Phrase[]
  currentIndex: number
}

export interface Attempt {
  phraseId: string
  mode: 'type' | 'speak'
  userText?: string
  userAudioUrl?: string
}

export type InsightSeverity = 'high' | 'med' | 'low'

export type InsightCategory =
  | 'CONNECTED_SPEECH'
  | 'FUNCTION_WORDS'
  | 'CONTRACTION'
  | 'SPEED_CHUNKING'
  | 'VOCAB_UNKNOWN'
  | 'GRAMMAR_PATTERN'
  | 'STRESS_RHYTHM'

export interface Insight {
  id: string
  category: InsightCategory
  severity: InsightSeverity
  title: string
  whatHappened: string
  whyHard: string
  focusTip?: string
  highlightRanges?: Array<{ start: number; end: number }>
  examples?: string[]
}

export interface FeedbackBundle {
  phraseId: string
  insights: Insight[]
  primaryInsightId: string
}

// Helper function to get category label
export function getCategoryLabel(category: InsightCategory): string {
  const labels: Record<InsightCategory, string> = {
    CONNECTED_SPEECH: 'Connected speech',
    FUNCTION_WORDS: 'Function words',
    CONTRACTION: 'Contraction',
    SPEED_CHUNKING: 'Speed & chunking',
    VOCAB_UNKNOWN: 'Vocabulary',
    GRAMMAR_PATTERN: 'Grammar pattern',
    STRESS_RHYTHM: 'Stress & rhythm',
  }
  return labels[category]
}

