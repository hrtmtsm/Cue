import type { FeedbackItem, FeedbackCategory } from '@/lib/practiceSteps'
import { Bookmark } from 'lucide-react'

type PhraseCardProps = 
  | {
      // New enhanced structure
      feedbackItem: FeedbackItem
      phrase?: never
      meaning?: never
      howItSounds?: never
    }
  | {
      // Legacy structure (backward compatibility)
      feedbackItem?: never
      phrase: string
      meaning: string
      howItSounds: string
    }

/**
 * Get display label for category
 */
function getCategoryLabel(category: FeedbackCategory): string {
  const labels: Record<FeedbackCategory, string> = {
    weak_form: 'Weak form',
    linking: 'Linking',
    elision: 'Elision',
    contraction: 'Contraction',
    similar_words: 'Similar words',
    missed: 'Missed',
    speed_chunking: 'Speed & chunking',
  }
  return labels[category] || 'Practice'
}

/**
 * Normalize text for comparison: lowercase, trim, collapse whitespace,
 * remove surrounding quotes and punctuation
 */
function normalizeText(s: string): string {
  let normalized = s
    .toLowerCase()
    .trim()
  
  // Remove surrounding quotes (", ', ", ')
  normalized = normalized.replace(/^[""'']+|[""'']+$/g, '')
  
  // Remove surrounding punctuation: . , ! ? : ; and parentheses
  normalized = normalized.replace(/^[.,!?:;()]+|[.,!?:;()]+$/g, '')
  
  // Trim again after removing quotes/punctuation
  normalized = normalized.trim()
  
  // Collapse whitespace
  normalized = normalized.replace(/\s+/g, ' ')
  
  return normalized
}

/**
 * Check if two strings are tautological (identical after normalization)
 */
function isTautology(a: string, b: string): boolean {
  return normalizeText(a) === normalizeText(b)
}

/**
 * Check if soundRule contains an obvious tautology pattern
 */
function containsTautologyPattern(soundRule: string): boolean {
  // Check for patterns like: "X" can sound like "X" or "X" often sounds like "X"
  const normalized = normalizeText(soundRule)
  
  // Pattern: "x" can sound like "x"
  const canSoundLikePattern = /"([^"]+)"\s+can\s+sound\s+like\s+"([^"]+)"/i
  const canSoundMatch = normalized.match(canSoundLikePattern)
  if (canSoundMatch && isTautology(canSoundMatch[1], canSoundMatch[2])) {
    return true
  }
  
  // Pattern: "x" often sounds like "x"
  const oftenSoundsLikePattern = /"([^"]+)"\s+often\s+sounds\s+like\s+"([^"]+)"/i
  const oftenSoundsMatch = normalized.match(oftenSoundsLikePattern)
  if (oftenSoundsMatch && isTautology(oftenSoundsMatch[1], oftenSoundsMatch[2])) {
    return true
  }
  
  return false
}

/**
 * Check if soundRule is chunk-oriented (describes chunk behavior, not single word)
 */
function isChunkOrientedSoundRule(soundRule: string, highlighted: string): boolean {
  const lowerRule = soundRule.toLowerCase()
  const lowerHighlighted = highlighted.toLowerCase()
  
  // Check for chunk indicators
  if (lowerRule.includes('-') || lowerRule.includes('chunk') || lowerRule.includes('links together')) {
    return true
  }
  
  // Check if soundRule contains multiple words from highlighted span
  const highlightedWords = lowerHighlighted.split(/\s+/).filter(w => w.length > 0)
  if (highlightedWords.length > 1) {
    // Count how many words from highlighted appear in soundRule
    const wordsInRule = highlightedWords.filter(word => lowerRule.includes(word))
    if (wordsInRule.length >= 2) {
      return true
    }
  }
  
  return false
}

/**
 * Check if extraExample is redundant/tautological (should be hidden)
 * Only hides when literally redundant/tautological, NOT just because it's single-word-focused
 */
function isRedundantExample(
  extraExample: { sentence: string; heardAs?: string },
  target: string,
  highlighted?: string
): boolean {
  // Hide if example is missing (no sentence)
  if (!extraExample.sentence || extraExample.sentence.trim() === '') {
    return true
  }
  
  // If no heardAs, we can't check for redundancy, so keep it
  if (!extraExample.heardAs) {
    return false
  }
  
  const heardAs = normalizeText(extraExample.heardAs)
  const targetNormalized = normalizeText(target)
  const highlightedNormalized = highlighted ? normalizeText(highlighted) : undefined
  
  // Hide if heardAs is identical to target (redundant/tautological)
  if (heardAs === targetNormalized) {
    return true
  }
  
  // Hide if heardAs is identical to highlighted (redundant/tautological)
  if (highlightedNormalized && heardAs === highlightedNormalized) {
    return true
  }
  
  // Otherwise, show it (even if it's single-word-focused)
  return false
}

export default function PhraseCard(props: PhraseCardProps) {
  // Support both new and legacy props
  const isLegacy = !props.feedbackItem && props.phrase !== undefined
  
  const phrase = isLegacy ? props.phrase : props.feedbackItem.target
  const meaningInContext = isLegacy ? props.meaning : props.feedbackItem.meaningInContext
  const soundRule = isLegacy ? props.howItSounds : props.feedbackItem.soundRule
  const inSentence = isLegacy ? null : props.feedbackItem.inSentence
  const extraExample = isLegacy ? null : props.feedbackItem.extraExample
  const tip = isLegacy ? null : props.feedbackItem.tip
  const category = isLegacy ? undefined : props.feedbackItem.category
  const actualSpan = isLegacy ? undefined : props.feedbackItem.actualSpan
  const type = isLegacy ? undefined : props.feedbackItem.type

  // Chunk mode: active when chunkDisplay exists
  const hasChunk = Boolean(inSentence?.chunkDisplay)

  // Dev-only logging to debug tip/example visibility
  if (process.env.NODE_ENV === 'development') {
    console.log('🔍 [PhraseCard] Props debug:', {
      phrase,
      tip: tip || '(undefined)',
      extraExample: extraExample || '(undefined)',
      extraExampleSentence: extraExample?.sentence || '(undefined)',
      extraExampleHeardAs: extraExample?.heardAs || '(undefined)',
      hasChunk,
      category,
      inSentenceHighlighted: inSentence?.highlighted || '(undefined)',
    })
  }

  // Check for tautologies (only when NOT in chunk mode)
  const heardAsTautology = inSentence && !hasChunk && isTautology(inSentence.heardAs, inSentence.highlighted)
  const soundRuleTautology = !hasChunk && containsTautologyPattern(soundRule)
  const isTautological = heardAsTautology || soundRuleTautology
  
  // Check if extraExample heardAs is tautological with highlighted (only in non-chunk mode)
  const extraExampleTautology = extraExample?.heardAs && inSentence && !hasChunk && isTautology(extraExample.heardAs, inSentence.highlighted)

  // Dev guard: log in development if tautology detected (non-chunk mode only)
  if (process.env.NODE_ENV === 'development' && isTautological && !hasChunk) {
    console.warn('⚠️ [PhraseCard] Tautology detected:', {
      phrase,
      heardAs: inSentence?.heardAs,
      highlighted: inSentence?.highlighted,
      soundRule: soundRule.substring(0, 100),
    })
  }

  // Decide which sections to show
  // In chunk mode: chunk-specific logic (no phonetic/single-word heardAs)
  // In non-chunk mode: use existing tautology guards
  
  // "How it sounds" section
  const showHowItSounds = hasChunk ? true : !isTautological // Always show in chunk mode
  const showFallbackInHowItSounds = !hasChunk && isTautological && inSentence
  
  // Determine soundRule text for chunk mode
  // In chunk mode: only show if soundRule describes chunk behavior, otherwise use generic text
  const chunkModeSoundRule = hasChunk && inSentence
    ? (isChunkOrientedSoundRule(soundRule, inSentence.highlighted)
        ? soundRule
        : 'In fast speech, this part links together into one smooth chunk. Listen for the rhythm, not each word.')
    : null
  
  // "In this sentence" section
  // In chunk mode: ONLY show chunk line, NEVER show heardAs line
  // In non-chunk mode: show heardAs line if not tautological
  const showHeardAsLine = inSentence && !hasChunk && !heardAsTautology // Hide in chunk mode
  const showFallbackInSentence = !hasChunk && heardAsTautology && !soundRuleTautology && inSentence
  
  // Chunk display line (only in chunk mode)
  const showChunkLine = hasChunk && inSentence && inSentence.chunkDisplay
  
  // "Another example" section
  // Only hide when redundant/tautological or missing, not just because it's single-word-focused
  const showExtraExample = extraExample && !isRedundantExample(extraExample, phrase, inSentence?.highlighted)
  
  // Show extraExample heardAs suffix
  // In chunk mode: NEVER show heardAs (no phonetic abbreviations)
  // In non-chunk mode: show if not tautological
  const showExtraExampleHeardAs = hasChunk
    ? false // Never show in chunk mode
    : extraExample?.heardAs && !extraExampleTautology // Normal behavior in non-chunk mode

  // Handle play button clicks (stub - should be passed as props or handled by parent)
  const handlePlayInSentence = () => {
    // Stub: play the sentence from inSentence.original
    console.log('Play sentence:', inSentence?.original)
  }

  const handlePlayExtraExample = () => {
    // Stub: play the sentence from extraExample.sentence
    console.log('Play example:', extraExample?.sentence)
  }

  const handleBookmark = () => {
    // Stub: bookmark/save this clip
    console.log('Bookmark:', phrase)
  }

  return (
    <div className="p-8 bg-white border border-gray-200 rounded-2xl shadow-sm">
      {/* Header: Title, Category Badge, Bookmark Icon */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold text-gray-900 leading-tight">{phrase}</h1>
          {category && (
            <span className="text-xs font-medium px-2.5 py-1 bg-gray-100 text-gray-700 rounded-full">
              {getCategoryLabel(category)}
            </span>
          )}
        </div>
        
        {/* Bookmark/Clip icon button at top-right */}
        <button
          onClick={handleBookmark}
          className="flex-shrink-0 p-2 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Bookmark"
        >
          <Bookmark className="w-5 h-5" />
        </button>
      </div>

      {/* Comparison: What was said → What you typed (under title) */}
      {actualSpan !== undefined && (
        <div className="mb-6 px-4 py-3 bg-gray-50 border border-gray-100 rounded-lg">
          <div className="flex items-center gap-4 text-sm">
            <div className="flex flex-col items-start justify-start gap-2">
              <span className="text-gray-500">What was said</span>
              <span className="font-medium text-gray-900">{phrase}</span>
            </div>
            <span className="text-gray-300">→</span>
            <div className="flex flex-col items-start justify-start gap-2">
              <span className="text-gray-500">What you typed</span>
              {type === 'missing' ? (
                <span className="text-gray-400 italic">(missed)</span>
              ) : type === 'substitution' ? (
                <span className="font-medium text-red-600 line-through">{actualSpan}</span>
              ) : type === 'extra' ? (
                <span className="text-gray-500 italic">{actualSpan} (extra)</span>
              ) : (
                <span className="font-medium text-gray-900">{actualSpan}</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Meaning section: chunk-aware rendering */}
      {(() => {
        // Chunk mode: show "What it means here" with chunk meaning, or hide if missing
        if (hasChunk) {
          const chunkMeaning = inSentence?.chunkMeaning || meaningInContext
          if (!chunkMeaning || chunkMeaning.trim() === '') {
            return null // Hide if no chunk meaning
          }
          return (
            <div className="mb-6">
              <div className="text-sm font-medium text-gray-500 mb-2">What it means here</div>
              <div className="text-base text-gray-900 leading-7">{chunkMeaning}</div>
            </div>
          )
        }
        
        // Non-chunk mode: show "Meaning" only if not placeholder/empty
        if (!meaningInContext || meaningInContext.trim() === '') {
          return null // Hide if empty
        }
        
        // Check if it's a placeholder (simple check for common patterns)
        const normalized = meaningInContext.toLowerCase().trim()
        const isPlaceholder = normalized.includes('this phrase carries meaning') ||
                              normalized.includes('this small word is often spoken softly') ||
                              normalized.includes('this contraction combines') ||
                              normalized.includes('these words connect together') ||
                              normalized.includes('this word can sound like') ||
                              normalized.includes('these words flow together as one chunk')
        
        if (isPlaceholder) {
          return null // Hide placeholder text
        }
        
        // Show real meaning
        return (
          <div className="mb-6">
            <div className="text-sm font-medium text-gray-500 mb-2">Meaning</div>
            <div className="text-base text-gray-900 leading-7">{meaningInContext}</div>
          </div>
        )
      })()}

      {/* How it sounds in fast speech */}
      {showHowItSounds && (
        <div className="mb-6">
          <div className="text-sm font-medium text-gray-500 mb-2">How it sounds</div>
          <div className="text-base text-gray-900 leading-7">
            {hasChunk && chunkModeSoundRule ? chunkModeSoundRule : soundRule}
          </div>
        </div>
      )}

      {/* Fallback message when tautology is detected (shown in "How it sounds" section) */}
      {showFallbackInHowItSounds && (
        <div className="mb-6">
          <div className="text-sm font-medium text-gray-500 mb-2">How it sounds</div>
          <div className="text-base text-gray-900 leading-7">This word is often unstressed and easy to miss in fast speech.</div>
        </div>
      )}

      {/* In this sentence section */}
      {inSentence && (
        <div className="mb-6 pt-6 border-t border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-medium text-gray-500">In this sentence</div>
            <button
              onClick={handlePlayInSentence}
              className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
              aria-label="Play this sentence"
            >
              <svg className="w-3.5 h-3.5 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </button>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg border border-gray-100 mb-3">
            <div className="text-base text-gray-900 leading-7 italic">"{inSentence.original}"</div>
          </div>
          {/* Chunk mode: show chunk line */}
          {showChunkLine && (
            <div className="text-sm text-gray-600 leading-6">
              <span className="font-medium">"{inSentence.highlighted}"</span> links into <span className="font-medium">"{inSentence.chunkDisplay}"</span>
            </div>
          )}
          {/* Non-chunk mode: show heardAs line or fallback */}
          {!hasChunk && showHeardAsLine && (
            <div className="text-sm text-gray-600 leading-6">
              <span className="font-medium">"{inSentence.highlighted}"</span> often sounds like <span className="font-medium">"{inSentence.heardAs}"</span>
            </div>
          )}
          {showFallbackInSentence && (
            <div className="text-sm text-gray-600 leading-6">
              This word is often unstressed and easy to miss in fast speech.
            </div>
          )}
        </div>
      )}

      {/* Another example */}
      {showExtraExample && (
        <div className="mb-6 pt-6 border-t border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-medium text-gray-500">Another example</div>
            <button
              onClick={handlePlayExtraExample}
              className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
              aria-label="Play this example"
            >
              <svg className="w-3.5 h-3.5 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </button>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
            <div className="text-base text-gray-900 leading-7 italic">"{extraExample.sentence}"</div>
            {/* Show heardAs suffix only if not tautological and not hidden by chunk mode */}
            {showExtraExampleHeardAs && (
              <div className="mt-2 text-sm text-gray-600 leading-6">
                (sounds like "{extraExample.heardAs}")
              </div>
            )}
          </div>
        </div>
      )}

      {/* Optional listening tip */}
      {tip && (
        <div className="pt-6 border-t border-gray-100">
          <div className="text-sm font-medium text-blue-600 mb-2">💡 Listening tip</div>
          <div className="text-sm text-gray-700 leading-6">{tip}</div>
        </div>
      )}
    </div>
  )
}
