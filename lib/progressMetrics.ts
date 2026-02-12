import { DetailedPracticeEvent } from './userPreferences'

/**
 * Accuracy trend over time
 */
export interface AccuracyTrend {
  overall: number        // All-time average (0-1)
  last7Days: number      // Weekly average (0-1)
  last30Days: number     // Monthly average (0-1)
  change7Days: number    // +/- percentage change vs previous week
}

/**
 * Semantic comprehension badge data
 */
export interface SemanticBadgeData {
  understoodCount: number
  totalAttempts: number
  understoodRate: number        // 0-1
  avgKeywordCapture: number     // 0-1
  improvementTrend: 'up' | 'down' | 'stable'
}

/**
 * Calculate listening accuracy trend from practice events
 * Uses accuracyScore from DetailedPracticeEvent
 */
export function calculateAccuracyTrend(events: DetailedPracticeEvent[]): AccuracyTrend {
  if (events.length === 0) {
    return { overall: 0, last7Days: 0, last30Days: 0, change7Days: 0 }
  }

  const now = Date.now()
  const day7 = now - 7 * 24 * 60 * 60 * 1000
  const day30 = now - 30 * 24 * 60 * 60 * 1000
  const day14 = now - 14 * 24 * 60 * 60 * 1000

  // Filter events by time period
  const last7Events = events.filter(e => new Date(e.timestamp).getTime() > day7)
  const last30Events = events.filter(e => new Date(e.timestamp).getTime() > day30)
  const prev7DaysEvents = events.filter(e => {
    const t = new Date(e.timestamp).getTime()
    return t > day14 && t <= day7
  })

  // Helper to calculate average
  const avg = (eventList: DetailedPracticeEvent[]) => {
    if (eventList.length === 0) return 0
    const sum = eventList.reduce((acc, e) => acc + e.accuracyScore, 0)
    return sum / eventList.length
  }

  const allScores = events.map(e => e.accuracyScore)
  const overallAvg = allScores.reduce((a, b) => a + b, 0) / allScores.length
  const last7Avg = avg(last7Events)
  const prev7Avg = avg(prev7DaysEvents)

  // Calculate percentage change
  let change7Days = 0
  if (prev7Avg > 0) {
    change7Days = ((last7Avg - prev7Avg) / prev7Avg) * 100
  }

  return {
    overall: overallAvg,
    last7Days: last7Avg,
    last30Days: avg(last30Events),
    change7Days,
  }
}

/**
 * Calculate semantic badge data from practice events
 * Uses understood, capturedKeywords, and missingKeywords from DetailedPracticeEvent
 */
export function calculateSemanticBadge(events: DetailedPracticeEvent[]): SemanticBadgeData {
  if (events.length === 0) {
    return { 
      understoodCount: 0, 
      totalAttempts: 0, 
      understoodRate: 0, 
      avgKeywordCapture: 0,
      improvementTrend: 'stable'
    }
  }

  // Count understood clips
  const understoodCount = events.filter(e => e.understood).length
  const totalAttempts = events.length

  // Calculate keyword capture rate
  const keywordRates = events.map(e => {
    const totalKw = e.capturedKeywords.length + e.missingKeywords.length
    return totalKw > 0 ? e.capturedKeywords.length / totalKw : 0
  })
  const avgKeywordCapture = keywordRates.reduce((a, b) => a + b, 0) / keywordRates.length

  // Calculate improvement trend: compare last 3 vs previous 3
  let improvementTrend: 'up' | 'down' | 'stable' = 'stable'
  
  if (events.length >= 6) {
    const last3 = events.slice(-3).filter(e => e.understood).length
    const prev3 = events.slice(-6, -3).filter(e => e.understood).length
    
    if (last3 > prev3) {
      improvementTrend = 'up'
    } else if (last3 < prev3) {
      improvementTrend = 'down'
    }
  }

  return {
    understoodCount,
    totalAttempts,
    understoodRate: understoodCount / totalAttempts,
    avgKeywordCapture,
    improvementTrend,
  }
}
