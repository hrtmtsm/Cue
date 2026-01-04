/**
 * Calculate accuracy score (0..1) between expected transcript and user input
 * Uses simple token overlap and Levenshtein-like scoring
 */
export function calculateAccuracyScore(
  expected: string,
  userInput: string
): number {
  if (!expected || !userInput) return 0
  
  const expectedLower = expected.toLowerCase().trim()
  const userLower = userInput.toLowerCase().trim()
  
  if (expectedLower === userLower) return 1.0
  
  // Token-based overlap
  const expectedTokens = expectedLower.split(/\s+/).filter(t => t.length > 0)
  const userTokens = userLower.split(/\s+/).filter(t => t.length > 0)
  
  if (expectedTokens.length === 0) return 0
  if (userTokens.length === 0) return 0
  
  // Count matching tokens (case-insensitive)
  const expectedSet = new Set(expectedTokens)
  const userSet = new Set(userTokens)
  
  let matches = 0
  for (const token of Array.from(userSet)) {
    if (expectedSet.has(token)) {
      matches++
    }
  }
  
  const tokenOverlap = matches / Math.max(expectedTokens.length, userTokens.length)
  
  // Character-based similarity (simple)
  const maxLen = Math.max(expectedLower.length, userLower.length)
  if (maxLen === 0) return 0
  
  let charMatches = 0
  const minLen = Math.min(expectedLower.length, userLower.length)
  for (let i = 0; i < minLen; i++) {
    if (expectedLower[i] === userLower[i]) {
      charMatches++
    }
  }
  
  const charSimilarity = charMatches / maxLen
  
  // Combine token overlap (70%) and character similarity (30%)
  const accuracy = tokenOverlap * 0.7 + charSimilarity * 0.3
  
  return Math.max(0, Math.min(1, accuracy))
}

