/**
 * Generate summaries based on dominant operation types
 * Conservative approach: only make claims when supported by evidence
 */

import { AlignmentOperation } from './textAlignment'

export interface OperationStats {
  correct: number
  substitution: number
  deletion: number
  insertion: number
  total: number
}

/**
 * Analyze operations to determine dominant patterns
 */
export function analyzeOperationPatterns(operations: AlignmentOperation[]): OperationStats {
  const stats: OperationStats = {
    correct: 0,
    substitution: 0,
    deletion: 0,
    insertion: 0,
    total: operations.length,
  }

  operations.forEach(op => {
    if (op.type === 'correct') {
      stats.correct++
    } else if (op.type === 'wrong') {
      stats.substitution++
    } else if (op.type === 'missing') {
      stats.deletion++
    } else if (op.type === 'extra') {
      stats.insertion++
    }
  })

  return stats
}

/**
 * Determine dominant operation type
 */
export function getDominantOperation(stats: OperationStats): 'correct' | 'substitution' | 'deletion' | 'insertion' | 'mixed' {
  const errorOps = stats.substitution + stats.deletion + stats.insertion
  
  if (errorOps === 0) {
    return 'correct'
  }

  // If one operation type dominates (>50% of errors), return it
  const totalErrors = errorOps
  if (totalErrors === 0) return 'correct'

  const substitutionRatio = stats.substitution / totalErrors
  const deletionRatio = stats.deletion / totalErrors
  const insertionRatio = stats.insertion / totalErrors

  if (substitutionRatio > 0.5) {
    return 'substitution'
  }
  if (deletionRatio > 0.5) {
    return 'deletion'
  }
  if (insertionRatio > 0.5) {
    return 'insertion'
  }

  // Mixed pattern
  return 'mixed'
}

/**
 * Generate conservative summary based on operation patterns
 */
export function generateOperationBasedSummary(operations: AlignmentOperation[]): string {
  const stats = analyzeOperationPatterns(operations)
  const dominant = getDominantOperation(stats)

  // If mostly correct, give positive feedback
  if (stats.correct / stats.total > 0.8) {
    return 'Your answer matches well.'
  }

  // Generate summary based on dominant pattern
  switch (dominant) {
    case 'deletion':
      return 'You missed some words.'
    
    case 'insertion':
      return 'You added extra words.'
    
    case 'substitution':
      // Only say this if substitutions are high-confidence
      const highConfSubs = operations.filter(
        op => op.type === 'wrong' && op.confidence && op.confidence >= 0.55
      ).length
      if (highConfSubs > 0) {
        return 'You substituted a few words.'
      }
      // If substitutions are low-confidence, treat as mixed
      return 'Some parts were unclear.'
    
    case 'mixed':
    default:
      return 'Some parts were unclear.'
  }
}

/**
 * Check if word-level feedback is safe to show
 * Only show for high-confidence substitutions
 */
export function isWordLevelFeedbackSafe(operation: AlignmentOperation): boolean {
  if (operation.type === 'wrong') {
    // Only show if confidence is high
    return operation.confidence !== undefined && operation.confidence >= 0.55
  }
  
  // Missing and extra words: safe to show (no substitution claim)
  if (operation.type === 'missing' || operation.type === 'extra') {
    return true
  }
  
  // Correct: always safe
  if (operation.type === 'correct') {
    return true
  }
  
  return false
}


