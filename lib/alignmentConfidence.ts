/**
 * Confidence evaluation for alignment operations
 * Prevents false positives by requiring high confidence for substitutions
 */

/**
 * Compute normalized string similarity (0..1)
 * Uses Levenshtein distance normalized by max length
 */
export function computeStringSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase()
  const s2 = str2.toLowerCase()

  if (s1 === s2) return 1.0
  if (s1.length === 0 || s2.length === 0) return 0.0

  const maxLen = Math.max(s1.length, s2.length)
  const distance = levenshteinDistance(s1, s2)
  return 1 - distance / maxLen
}

/**
 * Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length
  const n = str2.length
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0))

  for (let i = 0; i <= m; i++) {
    dp[i][0] = i
  }
  for (let j = 0; j <= n; j++) {
    dp[0][j] = j
  }

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1]
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j - 1] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j] + 1
        )
      }
    }
  }

  return dp[m][n]
}

/**
 * Confidence threshold for treating a replacement as a substitution
 * Below this threshold, split into delete + insert
 */
const REPLACEMENT_CONFIDENCE_THRESHOLD = 0.55

/**
 * Check if a replacement operation has high enough confidence
 */
export function isHighConfidenceReplacement(ref: string, hyp: string): boolean {
  const similarity = computeStringSimilarity(ref, hyp)
  return similarity >= REPLACEMENT_CONFIDENCE_THRESHOLD
}

/**
 * Known reduced forms that should be treated as high-confidence
 * even if similarity is low
 */
const KNOWN_REDUCED_FORMS: Record<string, string[]> = {
  'going': ['gonna'],
  'want': ['wanna'],
  'got': ['gotta'],
  'kind': ['kinda'],
  'sort': ['sorta'],
  'give': ['gimme'],
  'let': ['lemme'],
}

/**
 * Check if replacement matches a known reduced form
 */
export function isKnownReducedForm(ref: string, hyp: string): boolean {
  const refLower = ref.toLowerCase()
  const hypLower = hyp.toLowerCase()

  // Check direct mapping
  for (const [full, reduced] of Object.entries(KNOWN_REDUCED_FORMS)) {
    if (refLower.includes(full) && reduced.includes(hypLower)) {
      return true
    }
    if (hypLower.includes(full) && reduced.includes(refLower)) {
      return true
    }
  }

  // Check multi-word patterns
  if ((refLower.includes('going') && refLower.includes('to')) && hypLower === 'gonna') {
    return true
  }
  if (refLower === 'gonna' && hypLower.includes('going') && hypLower.includes('to')) {
    return true
  }

  if ((refLower.includes('want') && refLower.includes('to')) && hypLower === 'wanna') {
    return true
  }
  if (refLower === 'wanna' && hypLower.includes('want') && hypLower.includes('to')) {
    return true
  }

  if ((refLower.includes('got') && refLower.includes('to')) && hypLower === 'gotta') {
    return true
  }
  if (refLower === 'gotta' && hypLower.includes('got') && hypLower.includes('to')) {
    return true
  }

  return false
}

/**
 * Evaluate if a replacement should be treated as substitution or split
 */
export function evaluateReplacement(ref: string, hyp: string): {
  isSubstitution: boolean
  confidence: number
  reason: 'high_similarity' | 'known_reduction' | 'low_confidence'
} {
  const similarity = computeStringSimilarity(ref, hyp)
  
  // High similarity → substitution
  if (similarity >= REPLACEMENT_CONFIDENCE_THRESHOLD) {
    return {
      isSubstitution: true,
      confidence: similarity,
      reason: 'high_similarity',
    }
  }

  // Known reduced form → substitution (even with low similarity)
  if (isKnownReducedForm(ref, hyp)) {
    return {
      isSubstitution: true,
      confidence: 0.8, // Assign high confidence for known patterns
      reason: 'known_reduction',
    }
  }

  // Low confidence → split into delete + insert
  return {
    isSubstitution: false,
    confidence: similarity,
    reason: 'low_confidence',
  }
}

