import type { DetailedPracticeEvent } from './userPreferences'

/**
 * Linguistic Metrics Calculator
 * 
 * Calculates comprehensive linguistic metrics from practice events to enable
 * adaptive difficulty adjustment based on specific listening weaknesses.
 * 
 * Research basis:
 * - Buck (2001): Assessing Listening
 * - Vandergrift & Goh (2012): Teaching and Learning Second Language Listening
 * - Field (2008): Listening in the Language Classroom
 * - Rost (2016): Teaching and Researching Listening
 */

// ============================================================================
// Metric Interfaces
// ============================================================================

export interface PhonologicalMetrics {
  // Connected speech pattern accuracy (by pattern type)
  connectedSpeechPatterns: {
    [patternKey: string]: {
      encounters: number
      successes: number
      failures: number
      accuracy: number  // successes / encounters
    }
  }
  
  // Function words vs content words
  functionWordAccuracy: number  // 0-1
  contentWordAccuracy: number   // 0-1
  
  // Word position effects (primacy/recency)
  positionAccuracy: {
    initial: number    // first 20% of sentence
    medial: number     // middle 60%
    final: number      // last 20%
  }
}

export interface LexicalMetrics {
  // Keyword capture (semantic importance)
  keywordCaptureRate: number     // capturedKeywords / totalKeywords
  
  // Multi-word expressions
  multiWordExpressionAccuracy: number
}

export interface SyntacticMetrics {
  // Sentence length tolerance
  sentenceLengthTolerance: {
    short: number      // 1-5 words: accuracy
    medium: number     // 6-10 words
    long: number       // 11+ words
  }
  
  // Average words per error
  avgWordsPerError: number
}

export interface SemanticMetrics {
  // Gist comprehension vs detail
  gistComprehension: boolean     // understood = true even if accuracy low
  detailAccuracy: number         // surface form accuracy
  
  // Semantic unit completeness
  semanticUnitCaptureRate: number  // (totalUnits - missingUnits) / totalUnits
  
  // Comprehension-accuracy gap
  comprehensionAccuracyGap: number // semanticScore - accuracyPercent
}

export interface ProcessingMetrics {
  // Error type distribution
  errorTypeDistribution: {
    missingRate: number        // deletions / total_errors
    substitutionRate: number   // substitutions / total_errors
    extraRate: number          // insertions / total_errors
  }
  
  // Replay efficiency
  replayEfficiency: number     // accuracy_gain / replays (estimated)
  firstAttemptAccuracy: number // average accuracy
  
  // Processing speed
  processingSpeed: {
    timePerWord: number        // timeToSubmitMs / word_count
    timePerCorrectWord: number // timeToSubmitMs / correct_words
  }
}

export interface LinguisticMetrics {
  phonological: PhonologicalMetrics
  lexical: LexicalMetrics
  syntactic: SyntacticMetrics
  semantic: SemanticMetrics
  processing: ProcessingMetrics
  
  // Aggregated over last N events
  eventsAnalyzed: number
  lastUpdated: string
}

export interface Weakness {
  type: 'phonological' | 'lexical' | 'syntactic' | 'semantic' | 'processing'
  description: string
  severity: number  // 0-10
  metric: string    // specific metric name
  value: number     // actual value
  benchmark: number // expected value
}

export interface WeaknessReport {
  top3: Weakness[]
  allWeaknesses: Weakness[]
}

// ============================================================================
// Function Word List (common unstressed words)
// ============================================================================

const FUNCTION_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'of', 'to', 'in', 'on', 'at',
  'for', 'with', 'from', 'by', 'as', 'is', 'are', 'was', 'were', 'be', 'been',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'can', 'could',
  'should', 'may', 'might', 'must', 'shall', 'i', 'you', 'he', 'she', 'it',
  'we', 'they', 'my', 'your', 'his', 'her', 'its', 'our', 'their', 'this',
  'that', 'these', 'those', 'am', "i'm", "you're", "he's", "she's", "it's",
  "we're", "they're", "i've", "you've", "we've", "they've", "don't", "doesn't",
  "didn't", "won't", "wouldn't", "can't", "couldn't", "shouldn't"
])

// ============================================================================
// Helper Functions
// ============================================================================

function isFunctionWord(word: string): boolean {
  return FUNCTION_WORDS.has(word.toLowerCase())
}

function calculateWordPosition(refStart: number, refEnd: number, transcriptLength: number): 'initial' | 'medial' | 'final' {
  const midpoint = (refStart + refEnd) / 2
  const relativePosition = midpoint / transcriptLength
  
  if (relativePosition < 0.2) return 'initial'
  if (relativePosition > 0.8) return 'final'
  return 'medial'
}

function isMultiWordExpression(span: string): boolean {
  return span.trim().split(/\s+/).length > 1
}

// ============================================================================
// Main Calculation Function
// ============================================================================

export function calculateMetrics(events: DetailedPracticeEvent[]): LinguisticMetrics {
  if (events.length === 0) {
    return createEmptyMetrics()
  }
  
  // Initialize accumulators
  const phonoData = {
    patterns: new Map<string, { encounters: number; successes: number }>(),
    functionWordCorrect: 0,
    functionWordTotal: 0,
    contentWordCorrect: 0,
    contentWordTotal: 0,
    positionCorrect: { initial: 0, medial: 0, final: 0 },
    positionTotal: { initial: 0, medial: 0, final: 0 },
  }
  
  const lexicalData = {
    keywordsCaptured: 0,
    keywordsTotal: 0,
    multiWordCorrect: 0,
    multiWordTotal: 0,
  }
  
  const syntacticData = {
    sentencesByLength: { short: [], medium: [], long: [] } as { short: number[]; medium: number[]; long: number[] },
    totalErrors: 0,
    totalWords: 0,
  }
  
  const semanticData = {
    understoodCount: 0,
    accuracySum: 0,
    semanticScoreSum: 0,
    semanticScoreCount: 0,
    unitsCapture: [] as number[],
  }
  
  const processingData = {
    missingTotal: 0,
    substitutionTotal: 0,
    extraTotal: 0,
    accuracySum: 0,
    timePerWordSum: 0,
    timePerCorrectWordSum: 0,
    eventCount: 0,
  }
  
  // Aggregate data from all events
  events.forEach(event => {
    // Phonological: Pattern tracking
    event.patternsEncountered.forEach(patternKey => {
      if (!phonoData.patterns.has(patternKey)) {
        phonoData.patterns.set(patternKey, { encounters: 0, successes: 0 })
      }
      const patternStats = phonoData.patterns.get(patternKey)!
      patternStats.encounters++
      if (event.patternsSucceeded.includes(patternKey)) {
        patternStats.successes++
      }
    })
    
    // Phonological: Function vs content words, position effects
    event.alignmentEvents.forEach(alignEvent => {
      const word = alignEvent.expectedSpan.toLowerCase()
      const isMissing = alignEvent.type === 'missing'
      const isSubstitution = alignEvent.type === 'substitution'
      const isCorrect = !isMissing && !isSubstitution
      
      // Function vs content words
      if (isFunctionWord(word)) {
        phonoData.functionWordTotal++
        if (isCorrect) phonoData.functionWordCorrect++
      } else {
        phonoData.contentWordTotal++
        if (isCorrect) phonoData.contentWordCorrect++
      }
      
      // Position effects (only for missing/substitution)
      if (isMissing || isSubstitution) {
        const position = calculateWordPosition(
          alignEvent.refStart,
          alignEvent.refEnd,
          event.transcriptText.length
        )
        phonoData.positionTotal[position]++
        if (isCorrect) {
          phonoData.positionCorrect[position]++
        }
      }
      
      // Lexical: Multi-word expressions
      if (isMultiWordExpression(alignEvent.expectedSpan)) {
        lexicalData.multiWordTotal++
        if (isCorrect) lexicalData.multiWordCorrect++
      }
    })
    
    // Lexical: Keyword capture
    const totalKeywords = event.capturedKeywords.length + event.missingKeywords.length
    if (totalKeywords > 0) {
      lexicalData.keywordsCaptured += event.capturedKeywords.length
      lexicalData.keywordsTotal += totalKeywords
    }
    
    // Syntactic: Sentence length tolerance
    const wordCount = event.transcriptWordCount
    const accuracy = event.accuracyScore
    if (wordCount <= 5) {
      syntacticData.sentencesByLength.short.push(accuracy)
    } else if (wordCount <= 10) {
      syntacticData.sentencesByLength.medium.push(accuracy)
    } else {
      syntacticData.sentencesByLength.long.push(accuracy)
    }
    
    // Syntactic: Words per error
    const errorCount = event.alignmentStats.missing + event.alignmentStats.substitutions + event.alignmentStats.extra
    syntacticData.totalErrors += errorCount
    syntacticData.totalWords += wordCount
    
    // Semantic: Gist vs detail
    if (event.understood) semanticData.understoodCount++
    semanticData.accuracySum += event.accuracyScore
    if (event.semanticScore !== null) {
      semanticData.semanticScoreSum += event.semanticScore
      semanticData.semanticScoreCount++
    }
    
    // Semantic: Unit capture
    const totalUnits = event.missingUnits.length + event.capturedKeywords.length  // approximate
    if (totalUnits > 0) {
      const captureRate = 1 - (event.missingUnits.length / totalUnits)
      semanticData.unitsCapture.push(captureRate)
    }
    
    // Processing: Error type distribution
    processingData.missingTotal += event.alignmentStats.missing
    processingData.substitutionTotal += event.alignmentStats.substitutions
    processingData.extraTotal += event.alignmentStats.extra
    processingData.accuracySum += event.accuracyScore
    
    // Processing: Speed
    if (wordCount > 0) {
      processingData.timePerWordSum += event.timeToSubmitMs / wordCount
      if (event.alignmentStats.correct > 0) {
        processingData.timePerCorrectWordSum += event.timeToSubmitMs / event.alignmentStats.correct
      }
    }
    processingData.eventCount++
  })
  
  // Calculate final metrics
  const totalEvents = events.length
  
  // Phonological metrics
  const connectedSpeechPatterns: PhonologicalMetrics['connectedSpeechPatterns'] = {}
  phonoData.patterns.forEach((stats, patternKey) => {
    connectedSpeechPatterns[patternKey] = {
      encounters: stats.encounters,
      successes: stats.successes,
      failures: stats.encounters - stats.successes,
      accuracy: stats.encounters > 0 ? stats.successes / stats.encounters : 0,
    }
  })
  
  const phonological: PhonologicalMetrics = {
    connectedSpeechPatterns,
    functionWordAccuracy: phonoData.functionWordTotal > 0
      ? phonoData.functionWordCorrect / phonoData.functionWordTotal
      : 0,
    contentWordAccuracy: phonoData.contentWordTotal > 0
      ? phonoData.contentWordCorrect / phonoData.contentWordTotal
      : 0,
    positionAccuracy: {
      initial: phonoData.positionTotal.initial > 0
        ? phonoData.positionCorrect.initial / phonoData.positionTotal.initial
        : 0,
      medial: phonoData.positionTotal.medial > 0
        ? phonoData.positionCorrect.medial / phonoData.positionTotal.medial
        : 0,
      final: phonoData.positionTotal.final > 0
        ? phonoData.positionCorrect.final / phonoData.positionTotal.final
        : 0,
    },
  }
  
  // Lexical metrics
  const lexical: LexicalMetrics = {
    keywordCaptureRate: lexicalData.keywordsTotal > 0
      ? lexicalData.keywordsCaptured / lexicalData.keywordsTotal
      : 0,
    multiWordExpressionAccuracy: lexicalData.multiWordTotal > 0
      ? lexicalData.multiWordCorrect / lexicalData.multiWordTotal
      : 0,
  }
  
  // Syntactic metrics
  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
  const syntactic: SyntacticMetrics = {
    sentenceLengthTolerance: {
      short: avg(syntacticData.sentencesByLength.short),
      medium: avg(syntacticData.sentencesByLength.medium),
      long: avg(syntacticData.sentencesByLength.long),
    },
    avgWordsPerError: syntacticData.totalErrors > 0
      ? syntacticData.totalWords / syntacticData.totalErrors
      : Infinity,
  }
  
  // Semantic metrics
  const avgAccuracy = semanticData.accuracySum / totalEvents
  const avgSemanticScore = semanticData.semanticScoreCount > 0
    ? semanticData.semanticScoreSum / semanticData.semanticScoreCount
    : avgAccuracy
  
  const semantic: SemanticMetrics = {
    gistComprehension: semanticData.understoodCount / totalEvents > 0.5,
    detailAccuracy: avgAccuracy,
    semanticUnitCaptureRate: avg(semanticData.unitsCapture),
    comprehensionAccuracyGap: avgSemanticScore - avgAccuracy,
  }
  
  // Processing metrics
  const totalErrors = processingData.missingTotal + processingData.substitutionTotal + processingData.extraTotal
  
  const processing: ProcessingMetrics = {
    errorTypeDistribution: {
      missingRate: totalErrors > 0 ? processingData.missingTotal / totalErrors : 0,
      substitutionRate: totalErrors > 0 ? processingData.substitutionTotal / totalErrors : 0,
      extraRate: totalErrors > 0 ? processingData.extraTotal / totalErrors : 0,
    },
    replayEfficiency: 0,  // TODO: requires replay-by-replay tracking
    firstAttemptAccuracy: processingData.accuracySum / totalEvents,
    processingSpeed: {
      timePerWord: processingData.eventCount > 0
        ? processingData.timePerWordSum / processingData.eventCount
        : 0,
      timePerCorrectWord: processingData.eventCount > 0
        ? processingData.timePerCorrectWordSum / processingData.eventCount
        : 0,
    },
  }
  
  return {
    phonological,
    lexical,
    syntactic,
    semantic,
    processing,
    eventsAnalyzed: totalEvents,
    lastUpdated: new Date().toISOString(),
  }
}

function createEmptyMetrics(): LinguisticMetrics {
  return {
    phonological: {
      connectedSpeechPatterns: {},
      functionWordAccuracy: 0,
      contentWordAccuracy: 0,
      positionAccuracy: { initial: 0, medial: 0, final: 0 },
    },
    lexical: {
      keywordCaptureRate: 0,
      multiWordExpressionAccuracy: 0,
    },
    syntactic: {
      sentenceLengthTolerance: { short: 0, medium: 0, long: 0 },
      avgWordsPerError: 0,
    },
    semantic: {
      gistComprehension: false,
      detailAccuracy: 0,
      semanticUnitCaptureRate: 0,
      comprehensionAccuracyGap: 0,
    },
    processing: {
      errorTypeDistribution: { missingRate: 0, substitutionRate: 0, extraRate: 0 },
      replayEfficiency: 0,
      firstAttemptAccuracy: 0,
      processingSpeed: { timePerWord: 0, timePerCorrectWord: 0 },
    },
    eventsAnalyzed: 0,
    lastUpdated: new Date().toISOString(),
  }
}

// ============================================================================
// Weakness Identification
// ============================================================================

/**
 * Identify weaknesses by comparing metrics to research-based benchmarks
 */
export function identifyWeaknesses(metrics: LinguisticMetrics): WeaknessReport {
  const weaknesses: Weakness[] = []
  
  // Benchmark thresholds (based on L2 listening research)
  const BENCHMARKS = {
    functionWordAccuracy: 0.7,      // Below 70% = phonological weakness
    contentWordAccuracy: 0.75,       // Below 75% = phonological/lexical weakness
    keywordCaptureRate: 0.6,         // Below 60% = semantic weakness
    sentenceLengthShort: 0.8,        // Below 80% on short = severe phonological issue
    sentenceLengthMedium: 0.7,       // Below 70% on medium = working memory issue
    sentenceLengthLong: 0.6,         // Below 60% on long = working memory issue
    missingRate: 0.4,                // Above 40% missing = didn't hear (phonological)
    substitutionRate: 0.4,           // Above 40% substitution = heard wrong
    gistComprehension: true,         // false = severe comprehension issue
    comprehensionAccuracyGap: -0.1,  // Gap < -10% = over-reliant on bottom-up
  }
  
  // Phonological weaknesses
  if (metrics.phonological.functionWordAccuracy < BENCHMARKS.functionWordAccuracy) {
    weaknesses.push({
      type: 'phonological',
      description: 'Difficulty catching unstressed function words (e.g., "the", "of", "to")',
      severity: Math.round((1 - metrics.phonological.functionWordAccuracy / BENCHMARKS.functionWordAccuracy) * 10),
      metric: 'functionWordAccuracy',
      value: metrics.phonological.functionWordAccuracy,
      benchmark: BENCHMARKS.functionWordAccuracy,
    })
  }
  
  if (metrics.phonological.contentWordAccuracy < BENCHMARKS.contentWordAccuracy) {
    weaknesses.push({
      type: 'phonological',
      description: 'Difficulty recognizing content words despite stress',
      severity: Math.round((1 - metrics.phonological.contentWordAccuracy / BENCHMARKS.contentWordAccuracy) * 10),
      metric: 'contentWordAccuracy',
      value: metrics.phonological.contentWordAccuracy,
      benchmark: BENCHMARKS.contentWordAccuracy,
    })
  }
  
  // Check connected speech patterns
  Object.entries(metrics.phonological.connectedSpeechPatterns).forEach(([patternKey, stats]) => {
    if (stats.encounters >= 3 && stats.accuracy < 0.6) {
      weaknesses.push({
        type: 'phonological',
        description: `Difficulty with "${patternKey}" pattern (e.g., "gonna", "wanna")`,
        severity: Math.round((1 - stats.accuracy / 0.6) * 10),
        metric: `pattern_${patternKey}`,
        value: stats.accuracy,
        benchmark: 0.6,
      })
    }
  })
  
  // Lexical weaknesses
  if (metrics.lexical.keywordCaptureRate < BENCHMARKS.keywordCaptureRate) {
    weaknesses.push({
      type: 'lexical',
      description: 'Missing key information words',
      severity: Math.round((1 - metrics.lexical.keywordCaptureRate / BENCHMARKS.keywordCaptureRate) * 10),
      metric: 'keywordCaptureRate',
      value: metrics.lexical.keywordCaptureRate,
      benchmark: BENCHMARKS.keywordCaptureRate,
    })
  }
  
  // Syntactic weaknesses
  if (metrics.syntactic.sentenceLengthTolerance.medium < BENCHMARKS.sentenceLengthMedium) {
    weaknesses.push({
      type: 'syntactic',
      description: 'Struggles with medium-length sentences (6-10 words)',
      severity: Math.round((1 - metrics.syntactic.sentenceLengthTolerance.medium / BENCHMARKS.sentenceLengthMedium) * 10),
      metric: 'sentenceLengthMedium',
      value: metrics.syntactic.sentenceLengthTolerance.medium,
      benchmark: BENCHMARKS.sentenceLengthMedium,
    })
  }
  
  if (metrics.syntactic.sentenceLengthTolerance.long < BENCHMARKS.sentenceLengthLong) {
    weaknesses.push({
      type: 'syntactic',
      description: 'Struggles with long sentences (11+ words) - working memory overload',
      severity: Math.round((1 - metrics.syntactic.sentenceLengthTolerance.long / BENCHMARKS.sentenceLengthLong) * 10),
      metric: 'sentenceLengthLong',
      value: metrics.syntactic.sentenceLengthTolerance.long,
      benchmark: BENCHMARKS.sentenceLengthLong,
    })
  }
  
  // Semantic weaknesses
  if (!metrics.semantic.gistComprehension) {
    weaknesses.push({
      type: 'semantic',
      description: 'Difficulty understanding the overall meaning',
      severity: 8,
      metric: 'gistComprehension',
      value: 0,
      benchmark: 1,
    })
  }
  
  if (metrics.semantic.comprehensionAccuracyGap < BENCHMARKS.comprehensionAccuracyGap) {
    weaknesses.push({
      type: 'semantic',
      description: 'Over-reliant on exact word recognition, struggles with meaning inference',
      severity: Math.round(Math.abs(metrics.semantic.comprehensionAccuracyGap) * 20),
      metric: 'comprehensionAccuracyGap',
      value: metrics.semantic.comprehensionAccuracyGap,
      benchmark: BENCHMARKS.comprehensionAccuracyGap,
    })
  }
  
  // Processing weaknesses
  if (metrics.processing.errorTypeDistribution.missingRate > BENCHMARKS.missingRate) {
    weaknesses.push({
      type: 'processing',
      description: 'Frequently missing words entirely (not hearing them)',
      severity: Math.round((metrics.processing.errorTypeDistribution.missingRate / BENCHMARKS.missingRate - 1) * 10),
      metric: 'missingRate',
      value: metrics.processing.errorTypeDistribution.missingRate,
      benchmark: BENCHMARKS.missingRate,
    })
  }
  
  if (metrics.processing.errorTypeDistribution.substitutionRate > BENCHMARKS.substitutionRate) {
    weaknesses.push({
      type: 'processing',
      description: 'Frequently hearing words incorrectly (phonological confusion)',
      severity: Math.round((metrics.processing.errorTypeDistribution.substitutionRate / BENCHMARKS.substitutionRate - 1) * 10),
      metric: 'substitutionRate',
      value: metrics.processing.errorTypeDistribution.substitutionRate,
      benchmark: BENCHMARKS.substitutionRate,
    })
  }
  
  // Sort by severity (highest first) and take top 3
  weaknesses.sort((a, b) => b.severity - a.severity)
  
  return {
    top3: weaknesses.slice(0, 3),
    allWeaknesses: weaknesses,
  }
}
