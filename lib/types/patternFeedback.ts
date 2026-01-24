/**
 * TypeScript types for variant-specific pattern feedback
 * Used to ensure correct explanations for clip-specific pattern variants
 */

export interface ListeningPatternVariant {
  id: string
  pattern_key: string
  written_form: string
  spoken_form: string
  explanation_short: string
  explanation_medium: string | null
  examples: { sentence: string }[] | null
  created_at: Date
  updated_at: Date
}

export interface ClipPatternSpan {
  id: string
  clip_id: string
  pattern_key: string
  variant_id: string | null // Links to listening_pattern_variants.id
  ref_start: number
  ref_end: number
  word_start: number | null
  word_end: number | null
  confidence: string
  approved: boolean
  created_at: Date
}

export interface PatternFeedback {
  pattern_key: string
  written_form: string
  spoken_form: string
  explanation_short: string
  explanation_medium: string | null
  ref_start: number
  ref_end: number
}

