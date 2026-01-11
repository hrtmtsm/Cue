/**
 * Analyze alignment operations to identify top mistakes and generate summary
 */

import { AlignmentOperation } from './textAlignment'

export interface MistakeKind {
  kind: string
  evidence: string[]
  count: number
}

/**
 * Known reduced forms mapping
 */
const REDUCED_FORMS: Record<string, string[]> = {
  'going': ['gonna'],
  'want': ['wanna'],
  'got': ['gotta'],
  'kind': ['kinda'],
  'sort': ['sorta'],
  'give': ['gimme'],
  'let': ['lemme'],
}

/**
 * Function words that are often dropped
 */
const FUNCTION_WORDS = new Set([
  'a', 'an', 'the',
  'to', 'for', 'of', 'in', 'on', 'at', 'by', 'with',
  'and', 'or', 'but',
  'is', 'are', 'was', 'were', 'be', 'been',
  'have', 'has', 'had',
  'do', 'does', 'did',
  'will', 'would', 'could', 'should',
  'i', 'you', 'he', 'she', 'it', 'we', 'they',
  'my', 'your', 'his', 'her', 'its', 'our', 'their',
])

/**
 * Check if a substitution involves a reduced form
 */
function isReducedForm(ref: string, hyp: string): boolean {
  const refLower = ref.toLowerCase()
  const hypLower = hyp.toLowerCase()

  // Check direct mapping
  for (const [full, reduced] of Object.entries(REDUCED_FORMS)) {
    if (refLower.includes(full) && reduced.includes(hypLower)) {
      return true
    }
    if (hypLower.includes(full) && reduced.includes(refLower)) {
      return true
    }
  }

  // Check for "going to" -> "gonna" pattern
  if ((refLower.includes('going') && refLower.includes('to')) && hypLower === 'gonna') {
    return true
  }
  if (refLower === 'gonna' && hypLower.includes('going') && hypLower.includes('to')) {
    return true
  }

  // Check for "want to" -> "wanna" pattern
  if ((refLower.includes('want') && refLower.includes('to')) && hypLower === 'wanna') {
    return true
  }
  if (refLower === 'wanna' && hypLower.includes('want') && hypLower.includes('to')) {
    return true
  }

  // Check for "got to" -> "gotta" pattern
  if ((refLower.includes('got') && refLower.includes('to')) && hypLower === 'gotta') {
    return true
  }
  if (refLower === 'gotta' && hypLower.includes('got') && hypLower.includes('to')) {
    return true
  }

  return false
}

/**
 * Check if words sound similar (simple heuristic)
 */
function soundsSimilar(word1: string, word2: string): boolean {
  const w1 = word1.toLowerCase()
  const w2 = word2.toLowerCase()

  // Same first letter and similar length
  if (w1[0] === w2[0] && Math.abs(w1.length - w2.length) <= 2) {
    // Check if they share significant characters
    const minLen = Math.min(w1.length, w2.length)
    let matches = 0
    for (let i = 0; i < minLen; i++) {
      if (w1[i] === w2[i]) matches++
    }
    if (matches >= minLen * 0.6) {
      return true
    }
  }

  // Common sound-alike pairs
  const similarPairs = [
    ['a', 'the'],
    ['an', 'a'],
    ['is', "it's"],
    ['are', 'our'],
    ['your', "you're"],
    ['their', 'there'],
    ['to', 'too', 'two'],
    ['hear', 'here'],
    ['know', 'no'],
  ]

  return similarPairs.some(pair => pair.includes(w1) && pair.includes(w2))
}

/**
 * Analyze operations to identify mistake kinds
 */
export function analyzeMistakes(operations: AlignmentOperation[]): MistakeKind[] {
  const mistakes: Map<string, { evidence: Set<string>; count: number }> = new Map()

  // Analyze substitutions
  operations.forEach(op => {
    if (op.type === 'wrong') {
      const ref = op.ref.toLowerCase()
      const hyp = op.hyp.toLowerCase()

      if (isReducedForm(ref, hyp)) {
        const key = 'reduced speech'
        if (!mistakes.has(key)) {
          mistakes.set(key, { evidence: new Set(), count: 0 })
        }
        const mistake = mistakes.get(key)!
        mistake.evidence.add(`${ref}→${hyp}`)
        mistake.count++
      } else if (soundsSimilar(ref, hyp)) {
        const key = 'similar-sounding words'
        if (!mistakes.has(key)) {
          mistakes.set(key, { evidence: new Set(), count: 0 })
        }
        const mistake = mistakes.get(key)!
        mistake.evidence.add(`${ref}→${hyp}`)
        mistake.count++
      } else {
        const key = 'word substitutions'
        if (!mistakes.has(key)) {
          mistakes.set(key, { evidence: new Set(), count: 0 })
        }
        const mistake = mistakes.get(key)!
        mistake.evidence.add(`${ref}→${hyp}`)
        mistake.count++
      }
    }
  })

  // Analyze deletions
  const functionWordDeletions: string[] = []
  const contentWordDeletions: string[] = []

  operations.forEach(op => {
    if (op.type === 'missing') {
      const ref = op.ref.toLowerCase()
      if (FUNCTION_WORDS.has(ref)) {
        functionWordDeletions.push(op.ref)
      } else {
        contentWordDeletions.push(op.ref)
      }
    }
  })

  if (functionWordDeletions.length > 0) {
    mistakes.set('function words dropped', {
      evidence: new Set(functionWordDeletions.slice(0, 5)),
      count: functionWordDeletions.length,
    })
  }

  if (contentWordDeletions.length > 0) {
    mistakes.set('content words missed', {
      evidence: new Set(contentWordDeletions.slice(0, 5)),
      count: contentWordDeletions.length,
    })
  }

  // Analyze insertions (extra words)
  const insertions = operations.filter(op => op.type === 'extra')
  if (insertions.length > 0) {
    mistakes.set('extra words', {
      evidence: new Set(insertions.slice(0, 5).map(op => op.hyp)),
      count: insertions.length,
    })
  }

  // Convert to array and sort by count
  return Array.from(mistakes.entries())
    .map(([kind, data]) => ({
      kind,
      evidence: Array.from(data.evidence),
      count: data.count,
    }))
    .sort((a, b) => b.count - a.count)
}

/**
 * Generate conservative summary text from top mistakes
 * Only makes claims when evidence is strong
 */
export function generateSummary(topMistakes: MistakeKind[]): string {
  if (topMistakes.length === 0) {
    return 'Your answer matches the transcript well.'
  }

  const top1 = topMistakes[0]
  const top2 = topMistakes[1]

  // Build summary with top 1-2 mistakes, but be conservative
  let summary = 'You '

  if (top1.kind === 'reduced speech' && top1.count >= 2) {
    // Only mention if multiple instances
    const examples = top1.evidence.slice(0, 2).join('/')
    summary += `missed some reduced speech (${examples})`
  } else if (top1.kind === 'function words dropped' && top1.count >= 2) {
    // Only mention if multiple instances
    summary += `missed some small connector words`
  } else if (top1.kind === 'similar-sounding words' && top1.count >= 2) {
    summary += `confused some similar-sounding words`
  } else if (top1.kind === 'content words missed' && top1.count >= 2) {
    summary += `missed some important words`
  } else if (top1.kind === 'word substitutions' && top1.count >= 2) {
    // Only if high-confidence substitutions
    summary += `substituted a few words`
  } else if (top1.kind === 'extra words' && top1.count >= 2) {
    summary += `added some extra words`
  } else {
    // Default to vague if evidence is weak
    summary += `missed some words`
  }

  // Add secondary mistake only if very significant
  if (top2 && top2.count >= 3) {
    if (top2.kind === 'reduced speech') {
      summary += ` and missed some reduced forms`
    } else if (top2.kind === 'function words dropped') {
      summary += ` and dropped some connector words`
    }
  }

  summary += '.'

  return summary
}

