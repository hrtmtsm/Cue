export type FeedbackCategory =
  | 'SPEED_CHUNKING'
  | 'SOUND_REDUCTION'
  | 'CONTRACTION'
  | 'LINKING'
  | 'STRESS_RHYTHM'
  | 'VOCAB_UNKNOWN'
  | 'GRAMMAR_PATTERN'

export interface FeedbackInsight {
  id: string
  category: FeedbackCategory
  title: string
  summary: string
  detail?: string
  highlights?: Array<{ start: number; end: number }>
  severity: number // 1-5
}

export interface FeedbackResult {
  insights: FeedbackInsight[]
  highlightSpan: { start: number; end: number }
}

// Category priority for tie-breaking (lower index = higher priority)
const CATEGORY_PRIORITY: FeedbackCategory[] = [
  'SOUND_REDUCTION',
  'SPEED_CHUNKING',
  'CONTRACTION',
  'LINKING',
  'STRESS_RHYTHM',
  'VOCAB_UNKNOWN',
  'GRAMMAR_PATTERN',
]

export function pickPrimaryInsight(insights: FeedbackInsight[]): FeedbackInsight | null {
  if (insights.length === 0) return null
  
  // Sort by severity (highest first), then by category priority
  const sorted = [...insights].sort((a, b) => {
    if (b.severity !== a.severity) {
      return b.severity - a.severity
    }
    const aPriority = CATEGORY_PRIORITY.indexOf(a.category)
    const bPriority = CATEGORY_PRIORITY.indexOf(b.category)
    return aPriority - bPriority
  })
  
  return sorted[0]
}

export function getCategoryLabel(category: FeedbackCategory): string {
  const labels: Record<FeedbackCategory, string> = {
    SPEED_CHUNKING: 'Speed & chunking',
    SOUND_REDUCTION: 'Sound & reduction',
    CONTRACTION: 'Contraction',
    LINKING: 'Linking',
    STRESS_RHYTHM: 'Stress & rhythm',
    VOCAB_UNKNOWN: 'Vocabulary / expression',
    GRAMMAR_PATTERN: 'Grammar pattern',
  }
  return labels[category]
}


