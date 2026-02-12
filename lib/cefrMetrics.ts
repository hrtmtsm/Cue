import { DetailedPracticeEvent } from './userPreferences'
import { Clip } from './clipTypes'

export type CEFRLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1'

export interface CEFRBandStats {
  level: CEFRLevel
  clipCount: number
  avgAccuracy: number  // Raw weighted accuracy
  stabilityScore: number  // Stability-adjusted score (0-1)
  confidence: 'low' | 'medium' | 'high'
  status: 'comfortable' | 'stretch' | 'too-hard' | 'exploring'
}

export interface ListeningLevelData {
  currentLevel: CEFRLevel
  confidence: 'low' | 'medium' | 'high'
  stabilityScore: number  // Display as percentage (0-1)
  capabilityDescriptor: string
  progressionContext?: {
    direction: 'up' | 'down'
    fromLevel: CEFRLevel
  }
  bandStats: CEFRBandStats[]
}

/**
 * CEFR Level descriptors (behavior-based, human-readable)
 */
const CEFR_DESCRIPTORS: Record<CEFRLevel, string> = {
  'A1': 'Understanding simple phrases',
  'A2': 'Following basic conversations',
  'B1': 'Catching most everyday conversations',
  'B2': 'Understanding complex discussions',
  'C1': 'Grasping nuanced native speech',
}

/**
 * CEFR Level labels (non-exam terminology)
 */
const CEFR_LABELS: Record<CEFRLevel, string> = {
  'A1': 'Beginner',
  'A2': 'Elementary',
  'B1': 'Intermediate',
  'B2': 'Upper-Intermediate',
  'C1': 'Advanced',
}

/**
 * CEFR Level order for comparisons
 */
const CEFR_ORDER: Record<CEFRLevel, number> = {
  'A1': 1,
  'A2': 2,
  'B1': 3,
  'B2': 4,
  'C1': 5,
}

/**
 * Map difficulty to CEFR level (for backfilling existing clips)
 */
export function mapDifficultyToCEFR(difficulty: 'easy' | 'medium' | 'hard'): CEFRLevel {
  switch (difficulty) {
    case 'easy': return 'A2'
    case 'medium': return 'B1'
    case 'hard': return 'B2'
    default: return 'B1'
  }
}

/**
 * Get CEFR level for a clip (with fallback)
 */
function getClipCEFR(clip: Clip): CEFRLevel {
  if (clip.cefrLevel) {
    return clip.cefrLevel
  }
  // Fallback: map from difficulty
  if (clip.difficulty) {
    return mapDifficultyToCEFR(clip.difficulty)
  }
  // Final fallback
  return 'B1'
}

/**
 * Calculate weighted accuracy with recency bias (14-day half-life)
 */
function calculateWeightedAccuracy(
  events: Array<{ accuracyScore: number; timestamp: string }>,
  halfLifeDays: number = 14
): number {
  if (events.length === 0) return 0

  const now = Date.now()
  let weightedSum = 0
  let totalWeight = 0

  events.forEach(event => {
    const ageMs = now - new Date(event.timestamp).getTime()
    const ageDays = ageMs / (1000 * 60 * 60 * 24)

    // Exponential decay: weight = 2^(-age / halfLife)
    const weight = Math.pow(0.5, ageDays / halfLifeDays)

    weightedSum += event.accuracyScore * weight
    totalWeight += weight
  })

  return totalWeight > 0 ? weightedSum / totalWeight : 0
}

/**
 * Calculate replay penalty (0-0.15)
 * High replays indicate instability
 */
function calculateReplayPenalty(events: DetailedPracticeEvent[]): number {
  if (events.length === 0) return 0

  const avgReplays = events.reduce((sum, e) => sum + e.replays, 0) / events.length

  // Penalty formula: min(avgReplays * 0.05, 0.15)
  // 0 replays = 0% penalty
  // 1 replay = 5% penalty
  // 3+ replays = 15% penalty (cap)
  return Math.min(avgReplays * 0.05, 0.15)
}

/**
 * Calculate variance penalty (0-0.10)
 * High variance indicates inconsistency
 */
function calculateVariancePenalty(accuracies: number[]): number {
  if (accuracies.length < 3) return 0

  const mean = accuracies.reduce((a, b) => a + b, 0) / accuracies.length
  const variance = accuracies.reduce((sum, acc) =>
    sum + Math.pow(acc - mean, 2), 0
  ) / accuracies.length

  const stdDev = Math.sqrt(variance)

  // Penalty for high variance (unstable performance)
  // stdDev of 0.15 (15%) = 7.5% penalty
  // stdDev of 0.20 (20%) = 10% penalty (cap)
  return Math.min(stdDev * 0.5, 0.10)
}

/**
 * Calculate consistency bonus (0-0.05)
 * Reward stable performance
 */
function calculateConsistencyBonus(accuracies: number[]): number {
  if (accuracies.length < 5) return 0

  const mean = accuracies.reduce((a, b) => a + b, 0) / accuracies.length
  const variance = accuracies.reduce((sum, acc) =>
    sum + Math.pow(acc - mean, 2), 0
  ) / accuracies.length

  const stdDev = Math.sqrt(variance)

  // Bonus for low variance (stable performance)
  // stdDev < 0.05 (5%) = 5% bonus
  // stdDev < 0.10 (10%) = 2.5% bonus
  if (stdDev < 0.05) return 0.05
  if (stdDev < 0.10) return 0.025
  return 0
}

/**
 * Calculate stability score for a CEFR band
 * Stability = weightedAccuracy - penalties + bonuses
 */
function calculateStabilityScore(events: DetailedPracticeEvent[]): number {
  if (events.length === 0) return 0

  const weightedAccuracy = calculateWeightedAccuracy(
    events.map(e => ({ accuracyScore: e.accuracyScore, timestamp: e.timestamp }))
  )

  const replayPenalty = calculateReplayPenalty(events)
  const variancePenalty = calculateVariancePenalty(
    events.map(e => e.accuracyScore)
  )
  const consistencyBonus = calculateConsistencyBonus(
    events.map(e => e.accuracyScore)
  )

  // Stability formula
  let stability = weightedAccuracy - replayPenalty - variancePenalty + consistencyBonus

  // Clamp to [0, 1] and cap at 95% to avoid "100% Stability" UX issue
  stability = Math.max(0, Math.min(0.95, stability))

  return stability
}

/**
 * Determine confidence level based on clip count
 */
function getConfidence(clipCount: number): 'low' | 'medium' | 'high' {
  if (clipCount >= 10) return 'high'
  if (clipCount >= 5) return 'medium'
  return 'low'
}

/**
 * Determine status based on stability score
 */
function getStatus(
  stabilityScore: number,
  clipCount: number
): 'comfortable' | 'stretch' | 'too-hard' | 'exploring' {
  if (clipCount < 3) return 'exploring'
  if (stabilityScore >= 0.70) return 'comfortable'
  if (stabilityScore >= 0.55) return 'stretch'
  return 'too-hard'
}

/**
 * Calculate CEFR band statistics from practice events
 */
export function calculateCEFRBandStats(
  events: DetailedPracticeEvent[],
  clips: Map<string, Clip>
): CEFRBandStats[] {
  // Group events by CEFR level
  const eventsByLevel = new Map<CEFRLevel, DetailedPracticeEvent[]>()

  events.forEach(event => {
    const clip = clips.get(event.clipId)
    if (!clip) return

    const cefrLevel = getClipCEFR(clip)

    if (!eventsByLevel.has(cefrLevel)) {
      eventsByLevel.set(cefrLevel, [])
    }
    eventsByLevel.get(cefrLevel)!.push(event)
  })

  // Calculate stats for each level
  const bandStats: CEFRBandStats[] = []

  const allLevels: CEFRLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1']

  allLevels.forEach(level => {
    const levelEvents = eventsByLevel.get(level) || []
    const clipCount = levelEvents.length

    if (clipCount === 0) {
      // No data for this level
      bandStats.push({
        level,
        clipCount: 0,
        avgAccuracy: 0,
        stabilityScore: 0,
        confidence: 'low',
        status: 'exploring',
      })
      return
    }

    const avgAccuracy = calculateWeightedAccuracy(
      levelEvents.map(e => ({ accuracyScore: e.accuracyScore, timestamp: e.timestamp }))
    )

    const stabilityScore = calculateStabilityScore(levelEvents)
    const confidence = getConfidence(clipCount)
    const status = getStatus(stabilityScore, clipCount)

    bandStats.push({
      level,
      clipCount,
      avgAccuracy,
      stabilityScore,
      confidence,
      status,
    })
  })

  return bandStats
}

/**
 * Detect progression context (if user recently moved levels)
 */
function detectProgressionContext(
  currentLevel: CEFRLevel,
  events: DetailedPracticeEvent[],
  clips: Map<string, Clip>
): { direction: 'up' | 'down'; fromLevel: CEFRLevel } | undefined {
  if (events.length < 10) return undefined

  // Look at last 20 events
  const recentEvents = events.slice(-20)
  
  // Get most common level from recent events
  const levelCounts = new Map<CEFRLevel, number>()
  recentEvents.forEach(event => {
    const clip = clips.get(event.clipId)
    if (!clip) return
    const level = getClipCEFR(clip)
    levelCounts.set(level, (levelCounts.get(level) || 0) + 1)
  })

  // Find previous most common level (excluding current)
  let prevLevel: CEFRLevel | null = null
  let maxCount = 0

  levelCounts.forEach((count, level) => {
    if (level !== currentLevel && count > maxCount) {
      maxCount = count
      prevLevel = level
    }
  })

  if (!prevLevel || maxCount < 3) return undefined

  // Determine direction
  const currentOrder = CEFR_ORDER[currentLevel]
  const prevOrder = CEFR_ORDER[prevLevel]

  if (currentOrder > prevOrder) {
    return { direction: 'up', fromLevel: prevLevel }
  } else if (currentOrder < prevOrder) {
    return { direction: 'down', fromLevel: prevLevel }
  }

  return undefined
}

/**
 * Calculate Listening Level from practice events
 */
export function calculateListeningLevel(
  events: DetailedPracticeEvent[],
  clips: Map<string, Clip>
): ListeningLevelData | null {
  if (events.length === 0) {
    return null
  }

  // Calculate band stats
  const bandStats = calculateCEFRBandStats(events, clips)

  // Find highest comfortable band
  const comfortableBands = bandStats
    .filter(b => b.status === 'comfortable' && b.clipCount >= 5)
    .sort((a, b) => CEFR_ORDER[b.level] - CEFR_ORDER[a.level])

  let currentLevel: CEFRLevel
  let stabilityScore: number
  let confidence: 'low' | 'medium' | 'high'

  if (comfortableBands.length > 0) {
    // User has at least one comfortable band
    currentLevel = comfortableBands[0].level
    stabilityScore = comfortableBands[0].stabilityScore
    confidence = comfortableBands[0].confidence
  } else {
    // No comfortable bands yet - find band with most clips
    const bandsWithData = bandStats
      .filter(b => b.clipCount > 0)
      .sort((a, b) => b.clipCount - a.clipCount)

    if (bandsWithData.length === 0) {
      return null
    }

    currentLevel = bandsWithData[0].level
    stabilityScore = bandsWithData[0].stabilityScore
    confidence = bandsWithData[0].confidence
  }

  const capabilityDescriptor = CEFR_DESCRIPTORS[currentLevel]
  const progressionContext = detectProgressionContext(currentLevel, events, clips)

  return {
    currentLevel,
    confidence,
    stabilityScore,
    capabilityDescriptor,
    progressionContext,
    bandStats,
  }
}

/**
 * Get human-readable label for CEFR level
 */
export function getCEFRLabel(level: CEFRLevel): string {
  return CEFR_LABELS[level]
}

/**
 * Get next CEFR level
 */
export function getNextCEFRLevel(level: CEFRLevel): CEFRLevel | null {
  const order = CEFR_ORDER[level]
  const levels: CEFRLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1']
  return levels[order] || null  // order is 1-indexed, array is 0-indexed
}

/**
 * Get previous CEFR level
 */
export function getPreviousCEFRLevel(level: CEFRLevel): CEFRLevel | null {
  const order = CEFR_ORDER[level]
  const levels: CEFRLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1']
  return levels[order - 2] || null  // order is 1-indexed, array is 0-indexed
}
