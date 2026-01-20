/**
 * Quick Start Summary Module
 * 
 * Lightweight heuristic for initial feed seeding (replaces diagnostic/placement)
 */

const STORAGE_KEY = 'quickStartSummary'
const IS_DEV = typeof process !== 'undefined' && process.env.NODE_ENV === 'development'

export interface QuickStartClipResult {
  clipId: string
  skipped: boolean
  userInputLength: number
  accuracyPercent: number
}

export interface QuickStartSummary {
  version: 1
  createdAt: number
  missedRate: number // 0..1, fraction of clips that were missed
  attemptAccuracy: number // 0..100, average accuracy over attempted clips only
  startingDifficulty: number // 15 | 25 | 35 | 55, heuristic-based starting difficulty
}

/**
 * Store a single clip result (for tracking during onboarding)
 */
export function storeQuickStartClipResult(result: QuickStartClipResult): void {
  if (typeof window === 'undefined') return

  try {
    const stored = localStorage.getItem('quickStartClipResults')
    const results: QuickStartClipResult[] = stored ? JSON.parse(stored) : []
    
    // Remove existing result for this clip (if retaking)
    const filtered = results.filter(r => r.clipId !== result.clipId)
    
    // Add new result
    filtered.push(result)
    
    localStorage.setItem('quickStartClipResults', JSON.stringify(filtered))
    
    if (IS_DEV) {
      console.debug('✅ [QuickStart] Stored clip result:', {
        clipId: result.clipId,
        skipped: result.skipped,
        userInputLength: result.userInputLength,
        accuracyPercent: result.accuracyPercent,
        totalResults: filtered.length,
      })
    }
  } catch (error) {
    console.error('❌ [QuickStart] Failed to store clip result:', error)
  }
}

/**
 * Load all clip results from localStorage
 */
export function loadQuickStartClipResults(): QuickStartClipResult[] {
  if (typeof window === 'undefined') return []

  try {
    const stored = localStorage.getItem('quickStartClipResults')
    if (!stored) return []
    
    return JSON.parse(stored) as QuickStartClipResult[]
  } catch (error) {
    console.error('❌ [QuickStart] Failed to load clip results:', error)
    return []
  }
}

/**
 * Clear all clip results from localStorage
 */
export function clearQuickStartClipResults(): void {
  if (typeof window === 'undefined') return

  try {
    localStorage.removeItem('quickStartClipResults')
    
    if (IS_DEV) {
      console.debug('✅ [QuickStart] Cleared clip results from localStorage')
    }
  } catch (error) {
    console.error('❌ [QuickStart] Failed to clear clip results:', error)
  }
}

/**
 * Check if a clip counts as "missed"
 * A clip is missed if:
 * - skipped === true
 * OR trimmed user input length < 3
 * OR accuracyPercent === 0
 */
function isClipMissed(result: QuickStartClipResult): boolean {
  return result.skipped || result.userInputLength < 3 || result.accuracyPercent === 0
}

/**
 * Build quick start summary from clip results
 */
export function buildQuickStartSummary(results: QuickStartClipResult[]): QuickStartSummary {
  if (!results || results.length === 0) {
    // Default values if no results
    return {
      version: 1,
      createdAt: Date.now(),
      missedRate: 0.5,
      attemptAccuracy: 50,
      startingDifficulty: 35,
    }
  }

  // Calculate missedRate: fraction of clips that were missed
  const missedCount = results.filter(isClipMissed).length
  const missedRate = results.length > 0 ? missedCount / results.length : 0

  // Calculate attemptAccuracy: average accuracy over attempted clips only
  // Exclude skipped / no-input clips
  const attemptedResults = results.filter(r => !r.skipped && r.userInputLength >= 3)
  const attemptAccuracy = attemptedResults.length > 0
    ? attemptedResults.reduce((sum, r) => sum + r.accuracyPercent, 0) / attemptedResults.length
    : 0

  // Compute startingDifficulty using heuristic:
  // if missedRate >= 0.4 => 15
  // else if attemptAccuracy >= 70 => 55
  // else if attemptAccuracy >= 40 => 35
  // else => 25
  let startingDifficulty: 15 | 25 | 35 | 55
  if (missedRate >= 0.4) {
    startingDifficulty = 15
  } else if (attemptAccuracy >= 70) {
    startingDifficulty = 55
  } else if (attemptAccuracy >= 40) {
    startingDifficulty = 35
  } else {
    startingDifficulty = 25
  }

  const summary: QuickStartSummary = {
    version: 1,
    createdAt: Date.now(),
    missedRate,
    attemptAccuracy,
    startingDifficulty,
  }

  if (IS_DEV) {
    console.log('📊 [QuickStart] Built summary:', {
      totalClips: results.length,
      missedCount,
      missedRate: missedRate.toFixed(2),
      attemptedCount: attemptedResults.length,
      attemptAccuracy: attemptAccuracy.toFixed(1),
      startingDifficulty,
    })
  }

  return summary
}

/**
 * Store quick start summary to localStorage
 */
export function storeQuickStartSummary(summary: QuickStartSummary): void {
  if (typeof window === 'undefined') return

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(summary))
    
    if (IS_DEV) {
      console.debug('✅ [QuickStart] Stored summary:', summary)
    }
  } catch (error) {
    console.error('❌ [QuickStart] Failed to store summary:', error)
  }
}

/**
 * Load quick start summary from localStorage
 * Safe helper: validates structure and returns null if missing/invalid
 */
export function loadQuickStartSummary(): QuickStartSummary | null {
  if (typeof window === 'undefined') return null

  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) {
      if (IS_DEV) {
        console.debug('🔍 [QuickStart] No summary found in localStorage')
      }
      return null
    }
    
    const summary = JSON.parse(stored) as QuickStartSummary
    
    // Validate structure: must have version:1 and all required fields
    if (summary.version !== 1 || 
        typeof summary.missedRate !== 'number' || 
        typeof summary.attemptAccuracy !== 'number' || 
        typeof summary.startingDifficulty !== 'number' ||
        typeof summary.createdAt !== 'number') {
      console.warn('⚠️ [QuickStart] Invalid summary structure, returning null', {
        version: summary.version,
        hasMissedRate: typeof summary.missedRate === 'number',
        hasAttemptAccuracy: typeof summary.attemptAccuracy === 'number',
        hasStartingDifficulty: typeof summary.startingDifficulty === 'number',
        hasCreatedAt: typeof summary.createdAt === 'number',
      })
      return null
    }
    
    return summary
  } catch (error) {
    console.error('❌ [QuickStart] Failed to load summary:', error)
    return null
  }
}

/**
 * Complete quick start: build and store summary from all clip results
 */
export function completeQuickStart(): QuickStartSummary | null {
  const results = loadQuickStartClipResults()
  
  if (results.length === 0) {
    if (IS_DEV) {
      console.warn('⚠️ [QuickStart] No clip results found, cannot build summary')
    }
    return null
  }

  const summary = buildQuickStartSummary(results)
  storeQuickStartSummary(summary)
  
  // Clear clip results after building summary
  clearQuickStartClipResults()
  
  return summary
}

/**
 * Get feed start difficulty from quick start summary
 * feedStartDifficulty = max(0, startingDifficulty - 20)
 */
export function getFeedStartDifficulty(summary: QuickStartSummary | null): number {
  if (!summary) {
    // Default fallback
    return 15
  }
  
  return Math.max(0, summary.startingDifficulty - 20)
}

