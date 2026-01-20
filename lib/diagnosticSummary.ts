/**
 * Diagnostic Summary Module
 * 
 * Manages diagnostic test results and summary generation
 */

import type { FeedbackCategory } from './practiceSteps'

export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2'

export type DiagnosticCategory = 
  | 'weak_forms' 
  | 'reductions' 
  | 'linking' 
  | 'speed' 
  | 'idioms' 
  | 'spelling' 
  | 'missed'

export type DiagnosticResult = {
  clipId: string
  accuracyPercent: number
  categories: DiagnosticCategory[] // Derived from practiceSteps (errors only)
}

export type DiagnosticSummary = {
  version: 1
  createdAt: string
  cefr: CefrLevel // Use onboarding level as source of truth
  avgAccuracyPercent: number
  categoryScore: Record<FeedbackCategory, number> // 0..1 lower=weaker, using FeedbackCategory
  weaknessRank: DiagnosticCategory[]
}

const STORAGE_KEY_RESULTS = 'diagnosticResults'
const STORAGE_KEY_SUMMARY = 'diagnosticSummary'

const IS_DEV = typeof process !== 'undefined' && process.env.NODE_ENV === 'development'

/**
 * Store diagnostic result for a single clip
 */
export function storeDiagnosticResult(result: DiagnosticResult): void {
  if (typeof window === 'undefined') return

  try {
    const stored = localStorage.getItem(STORAGE_KEY_RESULTS)
    const results: DiagnosticResult[] = stored ? JSON.parse(stored) : []
    
    // Remove existing result for this clip (if retaking)
    const filtered = results.filter(r => r.clipId !== result.clipId)
    
    // Add new result
    filtered.push(result)
    
    localStorage.setItem(STORAGE_KEY_RESULTS, JSON.stringify(filtered))
    
    if (IS_DEV) {
      console.debug('✅ [DiagnosticSummary] Stored diagnostic result:', {
        clipId: result.clipId,
        accuracyPercent: result.accuracyPercent,
        categoryCount: result.categories.length,
        categories: result.categories,
        totalResults: filtered.length,
      })
    }
  } catch (error) {
    console.error('❌ [DiagnosticSummary] Failed to store diagnostic result:', error)
  }
}

/**
 * Load all diagnostic results from localStorage
 */
export function loadDiagnosticResults(): DiagnosticResult[] {
  if (typeof window === 'undefined') return []

  try {
    const stored = localStorage.getItem(STORAGE_KEY_RESULTS)
    if (!stored) return []
    
    return JSON.parse(stored) as DiagnosticResult[]
  } catch (error) {
    console.error('❌ [DiagnosticSummary] Failed to load diagnostic results:', error)
    return []
  }
}

/**
 * Clear all diagnostic results from localStorage
 */
export function clearDiagnosticResults(): void {
  if (typeof window === 'undefined') return

  try {
    localStorage.removeItem(STORAGE_KEY_RESULTS)
    
    if (IS_DEV) {
      console.debug('✅ [DiagnosticSummary] Cleared diagnostic results from localStorage')
    }
  } catch (error) {
    console.error('❌ [DiagnosticSummary] Failed to clear diagnostic results:', error)
  }
}

/**
 * Check if diagnostic is complete (has expected number of results)
 */
export function isDiagnosticComplete(expectedCount: number): boolean {
  const results = loadDiagnosticResults()
  const isComplete = results.length >= expectedCount
  
  if (IS_DEV) {
    console.debug('🔍 [DiagnosticSummary] Checking completion:', {
      expectedCount,
      actualCount: results.length,
      isComplete,
    })
  }
  
  return isComplete
}

/**
 * Map DiagnosticCategory to FeedbackCategory
 * Used to convert diagnostic results to feedback categories for categoryScore
 */
function mapDiagnosticCategoryToFeedbackCategory(
  diagCat: DiagnosticCategory
): FeedbackCategory[] {
  switch (diagCat) {
    case 'weak_forms':
      return ['weak_form']
    case 'reductions':
      return ['elision', 'contraction'] // Map reductions to both elision and contraction
    case 'linking':
      return ['linking']
    case 'speed':
      return ['speed_chunking']
    case 'idioms':
      return ['similar_words']
    case 'spelling':
      return ['spelling']
    case 'missed':
      return ['missed']
    default:
      return ['missed']
  }
}

/**
 * Build diagnostic summary from results and onboarding CEFR level
 * 
 * Algorithm:
 * - avgAccuracyPercent = average of results[].accuracyPercent
 * - Category counts: For each result, count each category at most 3 times (cap per clip per category = 3)
 * - Map DiagnosticCategory counts to FeedbackCategory counts
 * - totalErrors = sum(counts)
 * - categoryScore[cat] = totalErrors===0 ? 1 : 1 - (count[cat]/totalErrors)
 * - weaknessRank sorts DiagnosticCategories by score ascending (weaker first)
 */
export function buildDiagnosticSummary(args: {
  results: DiagnosticResult[]
  onboardingCefr: CefrLevel
}): DiagnosticSummary {
  const { results, onboardingCefr } = args

  // All FeedbackCategories
  const allFeedbackCategories: FeedbackCategory[] = [
    'weak_form',
    'linking',
    'elision',
    'contraction',
    'similar_words',
    'spelling',
    'missed',
    'speed_chunking',
  ]

  if (!results || results.length === 0) {
    if (IS_DEV) {
      console.debug('⚠️ [DiagnosticSummary] No results provided, creating default summary')
    }
    
    // Initialize all feedback categories with perfect scores
    const defaultCategoryScore = {} as Record<FeedbackCategory, number>
    for (const cat of allFeedbackCategories) {
      defaultCategoryScore[cat] = 1.0
    }
    
    return {
      version: 1,
      createdAt: new Date().toISOString(),
      cefr: onboardingCefr,
      avgAccuracyPercent: 0,
      categoryScore: defaultCategoryScore,
      weaknessRank: [],
    }
  }

  // 1. Calculate average accuracy with defensive parsing
  const accuracies = results.map(r => {
    let accuracy = r.accuracyPercent
    // Defensive parsing: if value is string, parseFloat; if NaN => 0
    if (typeof accuracy === 'string') {
      accuracy = parseFloat(accuracy)
    }
    if (isNaN(accuracy) || accuracy < 0) {
      accuracy = 0
    }
    if (accuracy > 100) {
      accuracy = 100
    }
    return accuracy
  })

  const totalAccuracy = accuracies.reduce((sum, acc) => sum + acc, 0)
  const avgAccuracyPercent = results.length > 0 ? totalAccuracy / results.length : 0

  // Ensure avgAccuracyPercent is a number (0-100)
  const validatedAvgAccuracy = Math.max(0, Math.min(100, avgAccuracyPercent))

  if (IS_DEV) {
    console.log('[DiagnosticSummary] avgAccuracy computed', {
      avgAccuracy: validatedAvgAccuracy.toFixed(2),
      accuracies: accuracies.map(a => a.toFixed(2)),
    })
  }

  // 2. Count DiagnosticCategory occurrences with cap (max 3 per clip per category)
  const diagnosticCategoryCounts: Record<DiagnosticCategory, number> = {
    weak_forms: 0,
    reductions: 0,
    linking: 0,
    speed: 0,
    idioms: 0,
    spelling: 0,
    missed: 0,
  }

  // Count with cap: each category can contribute at most 3 per clip
  for (const result of results) {
    const clipCategoryCounts: Record<DiagnosticCategory, number> = {
      weak_forms: 0,
      reductions: 0,
      linking: 0,
      speed: 0,
      idioms: 0,
      spelling: 0,
      missed: 0,
    }

    // Count occurrences in this clip
    for (const category of result.categories) {
      clipCategoryCounts[category] = (clipCategoryCounts[category] || 0) + 1
    }

    // Add to total counts with cap (max 3 per category per clip)
    for (const category of Object.keys(clipCategoryCounts) as DiagnosticCategory[]) {
      const count = clipCategoryCounts[category]
      const cappedCount = Math.min(count, 3) // Cap at 3 per clip
      diagnosticCategoryCounts[category] += cappedCount
    }
  }

  // 3. Map DiagnosticCategory counts to FeedbackCategory counts
  const feedbackCategoryCounts: Record<FeedbackCategory, number> = {
    weak_form: 0,
    linking: 0,
    elision: 0,
    contraction: 0,
    similar_words: 0,
    spelling: 0,
    missed: 0,
    speed_chunking: 0,
  }

  // Distribute diagnostic category counts to feedback categories
  for (const [diagCat, count] of Object.entries(diagnosticCategoryCounts) as [DiagnosticCategory, number][]) {
    const feedbackCats = mapDiagnosticCategoryToFeedbackCategory(diagCat)
    // Distribute count evenly across mapped feedback categories
    const countPerFeedbackCat = count / feedbackCats.length
    for (const feedbackCat of feedbackCats) {
      feedbackCategoryCounts[feedbackCat] += countPerFeedbackCat
    }
  }

  // 4. Calculate total errors
  const totalErrors = Object.values(feedbackCategoryCounts).reduce((sum, count) => sum + count, 0)

  // 5. Calculate category scores (0..1, lower = weaker) using FeedbackCategory
  const categoryScore: Record<FeedbackCategory, number> = {} as Record<FeedbackCategory, number>

  if (totalErrors === 0) {
    // No errors - all categories get perfect score
    for (const category of allFeedbackCategories) {
      categoryScore[category] = 1.0
    }
  } else {
    // Calculate scores: 1 - (count/totalErrors)
    for (const category of allFeedbackCategories) {
      const count = feedbackCategoryCounts[category] || 0
      const normalizedCount = count / totalErrors
      categoryScore[category] = Math.max(0, Math.min(1, 1 - normalizedCount))
    }
  }

  // 6. Build weakness rank (sorted by DiagnosticCategory score ascending = weakest first)
  // For this, we need to aggregate FeedbackCategory scores back to DiagnosticCategory scores
  const diagnosticCategoryScores: Record<DiagnosticCategory, number> = {
    weak_forms: categoryScore['weak_form'] || 1.0,
    reductions: Math.min(categoryScore['elision'] || 1.0, categoryScore['contraction'] || 1.0), // Use worse of the two
    linking: categoryScore['linking'] || 1.0,
    speed: categoryScore['speed_chunking'] || 1.0,
    idioms: categoryScore['similar_words'] || 1.0,
    spelling: categoryScore['spelling'] || 1.0,
    missed: categoryScore['missed'] || 1.0,
  }

  const allDiagnosticCategories: DiagnosticCategory[] = [
    'weak_forms',
    'reductions',
    'linking',
    'speed',
    'idioms',
    'spelling',
    'missed',
  ]

  const weaknessRank = [...allDiagnosticCategories].sort((a, b) => {
    const scoreA = diagnosticCategoryScores[a] || 1.0
    const scoreB = diagnosticCategoryScores[b] || 1.0
    return scoreA - scoreB // Lower score = weaker = comes first
  })

  const summary: DiagnosticSummary = {
    version: 1,
    createdAt: new Date().toISOString(),
    cefr: onboardingCefr,
    avgAccuracyPercent,
    categoryScore,
    weaknessRank,
  }

  if (IS_DEV) {
    console.debug('📊 [DiagnosticSummary] Built summary:', {
      version: summary.version,
      cefr: summary.cefr,
      avgAccuracyPercent: summary.avgAccuracyPercent.toFixed(1) + '%',
      totalClips: results.length,
      totalErrors,
      topWeaknesses: weaknessRank.slice(0, 3),
      categoryScores: Object.entries(categoryScore)
        .sort(([, a], [, b]) => a - b)
        .slice(0, 3)
        .map(([cat, score]) => `${cat}: ${score.toFixed(3)}`),
    })
  }

  return summary
}

/**
 * Complete diagnostic: build summary, store it, and clear results
 * Returns the summary if complete, null otherwise
 */
export function completeDiagnostic(args: {
  expectedCount: number
  onboardingCefr: CefrLevel
}): DiagnosticSummary | null {
  const { expectedCount, onboardingCefr } = args
  
  const results = loadDiagnosticResults()
  
  if (results.length < expectedCount) {
    if (IS_DEV) {
      console.debug('⚠️ [DiagnosticSummary] Diagnostic not complete:', {
        expectedCount,
        actualCount: results.length,
      })
    }
    return null
  }
  
  const summary = buildDiagnosticSummary({ results, onboardingCefr })
  storeDiagnosticSummary(summary)
  
  // Clear individual results after building summary
  clearDiagnosticResults()
  
  if (IS_DEV) {
    console.debug('✅ [DiagnosticSummary] Diagnostic completed:', {
      cefr: summary.cefr,
      avgAccuracyPercent: summary.avgAccuracyPercent.toFixed(1) + '%',
      totalClips: results.length,
      topWeaknesses: summary.weaknessRank.slice(0, 3),
    })
  }
  
  return summary
}

/**
 * Store diagnostic summary in localStorage
 */
export function storeDiagnosticSummary(summary: DiagnosticSummary): void {
  if (typeof window === 'undefined') return

  try {
    localStorage.setItem(STORAGE_KEY_SUMMARY, JSON.stringify(summary))
    
    if (IS_DEV) {
      console.debug('✅ [DiagnosticSummary] Stored summary in localStorage:', {
        version: summary.version,
        cefr: summary.cefr,
        avgAccuracyPercent: summary.avgAccuracyPercent.toFixed(1) + '%',
        topWeaknesses: summary.weaknessRank.slice(0, 3),
      })
    }
  } catch (error) {
    console.error('❌ [DiagnosticSummary] Failed to store summary:', error)
  }
}

/**
 * Load diagnostic summary from localStorage
 */
export function loadDiagnosticSummary(): DiagnosticSummary | null {
  if (typeof window === 'undefined') return null

  try {
    const stored = localStorage.getItem(STORAGE_KEY_SUMMARY)
    if (!stored) return null

    const parsed = JSON.parse(stored) as DiagnosticSummary
    
    if (IS_DEV) {
      console.debug('📂 [DiagnosticSummary] Loaded summary from localStorage:', {
        version: parsed.version,
        cefr: parsed.cefr,
        avgAccuracyPercent: parsed.avgAccuracyPercent.toFixed(1) + '%',
      })
    }
    
    return parsed
  } catch (error) {
    console.error('❌ [DiagnosticSummary] Failed to load summary:', error)
    return null
  }
}
