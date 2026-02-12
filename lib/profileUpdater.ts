import { ListeningProfile, PracticeEvent, DetailedPracticeEvent, getPracticeEvents } from './userPreferences'
import { Clip } from './clipTypes'
import { calculateMetrics, identifyWeaknesses } from './metricsCalculator'

/**
 * Update listening profile based on practice event and clip metadata
 * Now supports DetailedPracticeEvent for enhanced metrics tracking
 */
export function updateListeningProfile(
  profile: ListeningProfile,
  event: PracticeEvent | DetailedPracticeEvent,
  clipMeta: { focus: string[]; difficulty?: 'easy' | 'medium' | 'hard' }
): ListeningProfile {
  const updated = { ...profile }
  updated.lastUpdatedAt = new Date().toISOString()
  
  // Initialize new fields if not present (backward compat)
  if (!updated.patternMastery) updated.patternMastery = {}
  if (!updated.weaknesses) updated.weaknesses = []
  
  // Target difficulty band: replays 1-3, accuracy 0.55-0.85
  const targetReplaysMin = 1
  const targetReplaysMax = 3
  const targetAccuracyMin = 0.55
  const targetAccuracyMax = 0.85
  
  // Check if user struggled (high replays or gave up)
  const struggled = event.replays >= 4 || event.gaveUp
  
  // Check if user did well (low replays, good accuracy, reasonable time)
  const didWell = 
    event.replays <= 1 && 
    event.accuracyScore >= targetAccuracyMin &&
    event.accuracyScore <= targetAccuracyMax &&
    event.timeToSubmitMs > 0 // Actually submitted
    
  // Update confidence based on performance
  if (struggled) {
    // Decrease confidence and speed tolerance
    updated.confidence = Math.max(0, updated.confidence - 5)
    updated.speedTolerance = Math.max(0, updated.speedTolerance - 4)
  } else if (didWell) {
    // Increase confidence
    updated.confidence = Math.min(100, updated.confidence + 3)
    
    // Increase tolerance for the clip's focus type
    if (clipMeta.focus.includes('speed')) {
      updated.speedTolerance = Math.min(100, updated.speedTolerance + 4)
    }
    if (clipMeta.focus.some(f => f === 'connected_speech' || f === 'reductions')) {
      updated.reductionTolerance = Math.min(100, updated.reductionTolerance + 4)
    }
    if (clipMeta.focus.includes('vocab')) {
      updated.vocabTolerance = Math.min(100, updated.vocabTolerance + 4)
    }
    if (clipMeta.focus.some(f => f === 'parsing' || f === 'syntax_load')) {
      updated.memoryLoadTolerance = Math.min(100, updated.memoryLoadTolerance + 4)
    }
  }
  
  // Adjust based on accuracy score relative to target band
  if (event.accuracyScore < targetAccuracyMin && !struggled) {
    // Below target: small decrease in relevant tolerances
    const adjustment = -2
    if (clipMeta.focus.includes('speed')) {
      updated.speedTolerance = Math.max(0, updated.speedTolerance + adjustment)
    }
    if (clipMeta.focus.some(f => f === 'connected_speech' || f === 'reductions')) {
      updated.reductionTolerance = Math.max(0, updated.reductionTolerance + adjustment)
    }
  } else if (event.accuracyScore > targetAccuracyMax && !didWell) {
    // Above target but not perfect performance: small increase
    const adjustment = 2
    if (clipMeta.focus.includes('speed')) {
      updated.speedTolerance = Math.min(100, updated.speedTolerance + adjustment)
    }
    if (clipMeta.focus.some(f => f === 'connected_speech' || f === 'reductions')) {
      updated.reductionTolerance = Math.min(100, updated.reductionTolerance + adjustment)
    }
  }
  
  // Adjust based on replay count relative to target
  if (event.replays > targetReplaysMax && !struggled) {
    // Too many replays: decrease speed tolerance
    updated.speedTolerance = Math.max(0, updated.speedTolerance - 3)
  } else if (event.replays < targetReplaysMin && event.replays > 0 && !didWell) {
    // Too few replays but not perfect: might be too easy, but don't adjust too aggressively
    // Small increase to make it slightly harder
    updated.speedTolerance = Math.min(100, updated.speedTolerance + 1)
  }
  
  // Clamp all values to 0..100
  updated.speedTolerance = Math.max(0, Math.min(100, updated.speedTolerance))
  updated.reductionTolerance = Math.max(0, Math.min(100, updated.reductionTolerance))
  updated.vocabTolerance = Math.max(0, Math.min(100, updated.vocabTolerance))
  updated.memoryLoadTolerance = Math.max(0, Math.min(100, updated.memoryLoadTolerance))
  updated.confidence = Math.max(0, Math.min(100, updated.confidence))
  
  // NEW: Update pattern mastery (if DetailedPracticeEvent)
  if ('patternsEncountered' in event && event.patternsEncountered) {
    event.patternsEncountered.forEach(patternKey => {
      const success = event.patternsSucceeded?.includes(patternKey) || false
      const current = updated.patternMastery![patternKey] || 50
      
      // Exponential moving average: new = 0.7 * old + 0.3 * (success ? 100 : 0)
      updated.patternMastery![patternKey] = current * 0.7 + (success ? 100 : 0) * 0.3
    })
  }
  
  // NEW: Recalculate linguistic metrics (every 5 events)
  try {
    const recentEvents = getPracticeEvents()
    
    // Check if we have enough events and it's time to recalculate (every 5 events)
    if (recentEvents.length >= 5 && recentEvents.length % 5 === 0) {
      // Filter for DetailedPracticeEvents (have alignmentEvents field)
      const detailedEvents = recentEvents.filter(
        (e): e is DetailedPracticeEvent => 'alignmentEvents' in e
      ).slice(-30) // Last 30 detailed events
      
      if (detailedEvents.length >= 5) {
        console.log('📊 [Metrics] Recalculating linguistic metrics:', {
          totalEvents: recentEvents.length,
          detailedEvents: detailedEvents.length,
        })
        
        updated.linguisticMetrics = calculateMetrics(detailedEvents)
        const weaknessReport = identifyWeaknesses(updated.linguisticMetrics)
        updated.weaknesses = weaknessReport.top3
        
        console.log('📊 [Metrics] Updated profile:', {
          patternMastery: Object.keys(updated.patternMastery!).length,
          weaknesses: updated.weaknesses!.map(w => w.type),
          metricsAnalyzed: updated.linguisticMetrics.eventsAnalyzed,
        })
      }
    }
  } catch (error) {
    console.error('❌ [Metrics] Error calculating metrics:', error)
    // Don't fail profile update if metrics calculation fails
  }
  
  return updated
}

