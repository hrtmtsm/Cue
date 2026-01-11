/**
 * Token-level sequence alignment using dynamic programming (Levenshtein)
 * Produces accurate diff operations for answer evaluation
 * 
 * Uses confidence thresholds to avoid false positives
 */

import { evaluateReplacement } from './alignmentConfidence'

export type AlignmentOperation = 
  | { type: 'correct'; ref: string; hyp: string; refIndex: number; hypIndex: number; confidence?: number }
  | { type: 'wrong'; ref: string; hyp: string; refIndex: number; hypIndex: number; confidence: number }
  | { type: 'missing'; ref: string; refIndex: number }
  | { type: 'extra'; hyp: string; hypIndex: number }

export interface AlignmentResult {
  operations: AlignmentOperation[]
  wer: number // Word Error Rate
  accuracy: number // 1 - WER, clamped to 0..1
  counts: {
    correct: number
    substitution: number
    deletion: number
    insertion: number
    refWords: number
  }
}

/**
 * Apply acceptable variant normalization:
 * - Expand common reductions (gonna -> going to, wanna -> want to, gotta -> got to)
 * - Normalize common contractions missing apostrophes (im -> i'm, dont -> don't)
 * - Keep output in expanded, multi-token canonical form to maintain alignment with originals
 */
function applyVariantNormalization(text: string): string {
  let t = text
    // Normalize missing-apostrophe contractions
    .replace(/\bim\b/g, "i'm")
    .replace(/\bill\b/g, "i'll")
    .replace(/\bitll\b/g, "it'll")
    .replace(/\bdont\b/g, "don't")
    .replace(/\bcant\b/g, "can't")
    .replace(/\bwont\b/g, "won't")
    .replace(/\bshouldnt\b/g, "shouldn't")
    .replace(/\bcouldnt\b/g, "couldn't")
    .replace(/\bwouldnt\b/g, "wouldn't")
    .replace(/\baren't\b/g, "aren't") // sometimes typed correctly but retains
  
  // Expand reduced forms to canonical multi-word
  t = t
    .replace(/\bgonna\b/g, 'going to')
    .replace(/\bwanna\b/g, 'want to')
    .replace(/\bgotta\b/g, 'got to')
    .replace(/\bkinda\b/g, 'kind of')
    .replace(/\bsorta\b/g, 'sort of')
    .replace(/\bgimme\b/g, 'give me')
    .replace(/\blemme\b/g, 'let me')

  return t
}

/**
 * Normalize text for comparison:
 * - Lowercase
 * - Trim whitespace
 * - Collapse multiple spaces
 * - Normalize apostrophes (keep contractions)
 * - Remove most punctuation but keep apostrophes in contractions
 */
export function normalizeText(text: string): string {
  // Base normalization
  let base = text
    .toLowerCase()
    .trim()
    // Normalize apostrophes (straight, curly, smart quotes)
    .replace(/[''']/g, "'")
    // Keep apostrophes in contractions, remove other punctuation
    .replace(/[^\w\s']/g, ' ')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim()
  
  // Apply acceptable variant normalization after base cleaning
  base = applyVariantNormalization(base)
  
  // Collapse whitespace again in case expansions introduced spacing
  return base.replace(/\s+/g, ' ').trim()
}

/**
 * Tokenize text into words
 */
export function tokenize(text: string): string[] {
  return normalizeText(text)
    .split(' ')
    .filter(w => w.length > 0)
}

/**
 * Compute token-level alignment using dynamic programming
 * Returns operations list with correct/wrong/missing/extra classifications
 */
export function alignTokens(refTokens: string[], hypTokens: string[]): AlignmentResult {
  const m = refTokens.length
  const n = hypTokens.length

  // DP matrix: dp[i][j] = minimum edit distance for ref[0..i-1] and hyp[0..j-1]
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0))

  // Initialize base cases
  for (let i = 0; i <= m; i++) {
    dp[i][0] = i // Deletions
  }
  for (let j = 0; j <= n; j++) {
    dp[0][j] = j // Insertions
  }

  // Fill DP matrix
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (refTokens[i - 1] === hypTokens[j - 1]) {
        // Match
        dp[i][j] = dp[i - 1][j - 1]
      } else {
        // Choose minimum of substitution, deletion, insertion
        dp[i][j] = Math.min(
          dp[i - 1][j - 1] + 1, // Substitution
          dp[i - 1][j] + 1, // Deletion
          dp[i][j - 1] + 1 // Insertion
        )
      }
    }
  }

  // Backtrack to get operations (first pass: standard DP backtracking)
  const rawOperations: Array<{
    type: 'correct' | 'wrong' | 'missing' | 'extra'
    ref?: string
    hyp?: string
    refIndex?: number
    hypIndex?: number
  }> = []
  let i = m
  let j = n

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && refTokens[i - 1] === hypTokens[j - 1]) {
      // Match
      rawOperations.unshift({
        type: 'correct',
        ref: refTokens[i - 1],
        hyp: hypTokens[j - 1],
        refIndex: i - 1,
        hypIndex: j - 1,
      })
      i--
      j--
    } else if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + 1) {
      // Substitution (will be evaluated for confidence later)
      rawOperations.unshift({
        type: 'wrong',
        ref: refTokens[i - 1],
        hyp: hypTokens[j - 1],
        refIndex: i - 1,
        hypIndex: j - 1,
      })
      i--
      j--
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      // Deletion
      rawOperations.unshift({
        type: 'missing',
        ref: refTokens[i - 1],
        refIndex: i - 1,
      })
      i--
    } else {
      // Insertion
      rawOperations.unshift({
        type: 'extra',
        hyp: hypTokens[j - 1],
        hypIndex: j - 1,
      })
      j--
    }
  }

  // Post-process: evaluate confidence and split low-confidence replacements
  const operations: AlignmentOperation[] = []
  for (const op of rawOperations) {
    if (op.type === 'correct') {
      operations.push({
        type: 'correct',
        ref: op.ref!,
        hyp: op.hyp!,
        refIndex: op.refIndex!,
        hypIndex: op.hypIndex!,
        confidence: 1.0,
      })
    } else if (op.type === 'wrong') {
      // Evaluate confidence for replacement
      const evaluation = evaluateReplacement(op.ref!, op.hyp!)
      
      if (evaluation.isSubstitution) {
        // High-confidence substitution
        operations.push({
          type: 'wrong',
          ref: op.ref!,
          hyp: op.hyp!,
          refIndex: op.refIndex!,
          hypIndex: op.hypIndex!,
          confidence: evaluation.confidence,
        })
      } else {
        // Low-confidence: split into delete + insert
        operations.push({
          type: 'missing',
          ref: op.ref!,
          refIndex: op.refIndex!,
        })
        operations.push({
          type: 'extra',
          hyp: op.hyp!,
          hypIndex: op.hypIndex!,
        })
      }
    } else if (op.type === 'missing') {
      operations.push({
        type: 'missing',
        ref: op.ref!,
        refIndex: op.refIndex!,
      })
    } else if (op.type === 'extra') {
      operations.push({
        type: 'extra',
        hyp: op.hyp!,
        hypIndex: op.hypIndex!,
      })
    }
  }

  // Count operations (only high-confidence substitutions count as substitutions)
  const counts = {
    correct: operations.filter(op => op.type === 'correct').length,
    substitution: operations.filter(op => op.type === 'wrong').length, // Only high-confidence
    deletion: operations.filter(op => op.type === 'missing').length,
    insertion: operations.filter(op => op.type === 'extra').length,
    refWords: m,
  }

  // Calculate WER = (S + D + I) / N_ref
  // Note: Low-confidence "replacements" are already split into D + I
  const wer = m > 0 ? (counts.substitution + counts.deletion + counts.insertion) / m : 0
  const accuracy = Math.max(0, Math.min(1, 1 - wer))

  return {
    operations,
    wer,
    accuracy,
    counts,
  }
}

/**
 * Main alignment function: takes raw text, normalizes, tokenizes, and aligns
 */
export function alignTexts(referenceText: string, hypothesisText: string): AlignmentResult {
  const refTokens = tokenize(referenceText)
  const hypTokens = tokenize(hypothesisText)
  return alignTokens(refTokens, hypTokens)
}

