import type { FeedbackItem, FeedbackCategory } from '@/lib/practiceSteps'
import { Bookmark } from 'lucide-react'
import { Heading, Body, Label, Caption } from '@/components/ui/Typography'
import { useState } from 'react'
import type { SaveTipData } from '@/lib/savedTips'

type PhraseCardProps = 
  | {
      // New enhanced structure
      feedbackItem: FeedbackItem
      phrase?: never
      meaning?: never
      howItSounds?: never
      onSave?: (tipData: SaveTipData) => Promise<boolean>
      onUnsave?: (phrase: string) => Promise<boolean>
      isSaved?: boolean
    }
  | {
      // Legacy structure (backward compatibility)
      feedbackItem?: never
      phrase: string
      meaning: string
      howItSounds: string
      onSave?: (tipData: SaveTipData) => Promise<boolean>
      onUnsave?: (phrase: string) => Promise<boolean>
      isSaved?: boolean
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
    spelling: 'Spelling',
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
  const explainAllowed = isLegacy ? true : props.feedbackItem.explainAllowed // Legacy items always show explanations
  const onSave = props.onSave
  const onUnsave = props.onUnsave
  const isSaved = props.isSaved || false

  // State for save button
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

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
  // TRUST-FIRST MVP: Hide if explainAllowed is false (trust > coverage gate)
  // Also hide for spelling category (not a listening issue)
  const showHowItSounds = explainAllowed && (category === 'spelling' ? false : (hasChunk ? true : !isTautological))
  const showFallbackInHowItSounds = explainAllowed && !hasChunk && isTautological && inSentence && category !== 'spelling'
  
  // Determine soundRule text for chunk mode
  // In chunk mode: only show if soundRule describes chunk behavior, otherwise use generic text
  const chunkModeSoundRule = hasChunk && inSentence
    ? (isChunkOrientedSoundRule(soundRule, inSentence.highlighted)
        ? soundRule
        : 'In fast speech, this part links together into one smooth chunk. Listen for the rhythm, not each word.')
    : null
  
  // "In this sentence" section
  // TRUST-FIRST MVP: Hide chunk/heardAs explanations if explainAllowed is false
  // In chunk mode: ONLY show chunk line, NEVER show heardAs line
  // In non-chunk mode: show heardAs line if not tautological
  const showHeardAsLine = explainAllowed && inSentence && !hasChunk && !heardAsTautology // Hide in chunk mode
  const showFallbackInSentence = explainAllowed && !hasChunk && heardAsTautology && !soundRuleTautology && inSentence
  
  // Chunk display line (only in chunk mode, only if explainAllowed)
  const showChunkLine = explainAllowed && hasChunk && inSentence && inSentence.chunkDisplay
  
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

  const handleSaveToggle = async (e: React.MouseEvent) => {
    // Stop event propagation
    e.stopPropagation()
    e.preventDefault()

    if (isSaving) return

    setIsSaving(true)
    setSaveSuccess(false)

    // If already saved, unsave it
    if (isSaved && onUnsave) {
      const success = await onUnsave(phrase)
      setIsSaving(false)
      return
    }

    // Otherwise, save it
    if (!onSave) {
      setIsSaving(false)
      return
    }

    const tipData: SaveTipData = {
      phrase,
      meaning_in_context: meaningInContext,
      sound_rule: soundRule,
      in_sentence_original: inSentence?.original,
      in_sentence_highlighted: inSentence?.highlighted,
      in_sentence_heard_as: inSentence?.heardAs,
      chunk_display: inSentence?.chunkDisplay,
      extra_example_sentence: extraExample?.sentence,
      extra_example_heard_as: extraExample?.heardAs,
      category,
      tip,
    }

    const success = await onSave(tipData)
    
    setIsSaving(false)
    if (success) {
      setSaveSuccess(true)
      // Reset success message after 2 seconds
      setTimeout(() => setSaveSuccess(false), 2000)
    }
  }

  return (
    <div className="p-8 bg-white border border-gray-200 rounded-2xl shadow-sm">
      {/* Header: Title, Category Badge, Bookmark Icon */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <Heading as="h1" className="text-gray-900 leading-tight text-3xl">{phrase}</Heading>
          {category && explainAllowed && (
            <Label className="text-xs px-2.5 py-1 bg-gray-100 text-gray-700 rounded-full">
              {getCategoryLabel(category)}
            </Label>
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

      {/* Meaning section: 3-layer system with parent fallback */}
      {(() => {
        const hasDirectMeaning = meaningInContext && meaningInContext.trim() !== ''
        const hasParentFallback = inSentence?.parentChunkDisplay && !hasDirectMeaning
        
        // Debug log for hasParentFallback computation (Location 1) - for spelling only
        if (category === 'spelling') {
          console.log('🔍 [PhraseCard] hasParentFallback computation (spelling):', {
            hasParentFallback,
            hasDirectMeaning,
            'inSentence?.parentChunkDisplay': inSentence?.parentChunkDisplay || '(none)',
            'inSentence exists': !!inSentence,
            category: category,
            meaningInContext: meaningInContext?.substring(0, 50) || '(empty)',
          })
        }
        
        // Case 1: Direct meaning exists
        if (hasDirectMeaning && !hasParentFallback) {
          const label = hasChunk ? 'What it means here' : 'Meaning'
          return (
            <div className="mb-6">
              <div className="text-sm font-medium text-gray-500 mb-2">{label}</div>
              <div className="text-base text-gray-900 leading-7">{meaningInContext}</div>
            </div>
          )
        }
        
        // Case 2: Parent-based fallback
        // Debug log BEFORE Case 2 check (Location 2)
        console.log('🔍 [PhraseCard] Before Case 2 check:', {
          hasParentFallback,
          willRenderCase2: hasParentFallback === true,
          'inSentence?.parentChunkDisplay': inSentence?.parentChunkDisplay,
          hasDirectMeaning,
        })
        
        if (hasParentFallback) {
          console.log('✅ [PhraseCard] Rendering Case 2 - parent fallback')
          
          const currentChunk = inSentence?.chunkDisplay || inSentence?.reducedForm || phrase
          const parentChunk = inSentence.parentChunkDisplay
          const title = category === 'spelling' ? 'What you heard' : 'What it means'
          
          // Debug log INSIDE Case 2 (Location 3)
          console.log('✅ [PhraseCard] Inside Case 2 - rendering parent fallback:', {
            parentChunkDisplay: inSentence.parentChunkDisplay,
            chunkDisplay: inSentence.chunkDisplay,
          })
          
          return (
            <div className="mb-6">
              <Label className="text-gray-500 mb-2">{title}</Label>
              <Body className="text-gray-900 leading-7">
                &quot;{currentChunk}&quot; is how &quot;{parentChunk}&quot; sounds in casual, fast speech.
              </Body>
            </div>
          )
        }
        
        // Case 3: True fallback - no meaning available
        // Never show generic listening tip for spelling (spelling has its own tip section)
        if (category === 'spelling') {
          if (process.env.NODE_ENV === 'development') {
            console.log('⚠️ [PhraseCard] Spelling case with no parent fallback - returning null')
          }
          return null
        }
        
        return (
          <div className="mb-6">
            <Label className="text-gray-500 mb-2">Listening tip</Label>
            <Body className="text-gray-900 leading-7">
              Try listening to this part again—it becomes clearer with practice.
            </div>
          </div>
        )
      })()}

      {/* How it sounds in fast speech */}
      {showHowItSounds && (
        <div className="mb-6">
          <Label className="text-gray-500 mb-2">How it sounds</Label>
          <Body className="text-gray-900 leading-7">
            {hasChunk && chunkModeSoundRule ? chunkModeSoundRule : soundRule}
          </div>
        </div>
      )}

      {/* Fallback message when tautology is detected (shown in "How it sounds" section) */}
      {showFallbackInHowItSounds && (
        <div className="mb-6">
          <Label className="text-gray-500 mb-2">How it sounds</Label>
          <Body className="text-gray-900 leading-7">This word is often unstressed and easy to miss in fast speech.</div>
        </div>
      )}

      {/* In this sentence section */}
      {inSentence && (
        <div className="mb-6 pt-6 border-t border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <Label className="text-gray-500">In this sentence</Label>
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
            <Body className="text-gray-900 leading-7 italic">"{inSentence.original}"</Body>
          </div>
          {/* Chunk mode: show chunk line */}
          {showChunkLine && (
            <Body className="text-gray-600 leading-6 text-sm">
              {inSentence.chunkDisplay && inSentence.reducedForm ? (
                <>
                  <Label>"{inSentence.chunkDisplay}"</Label> →{' '}
                  <Label>"{inSentence.reducedForm}"</Label>
                </>
              ) : (
                <>
                  <Label>"{inSentence.highlighted}"</Label> links into{' '}
                  <Label>"{inSentence.chunkDisplay}"</Label>
                </>
              )}
            </Body>
          )}
          {/* Non-chunk mode: show heardAs line or fallback */}
          {!hasChunk && showHeardAsLine && (
            <Body className="text-gray-600 leading-6 text-sm">
              <Label>"{inSentence.highlighted}"</Label> often sounds like <Label>"{inSentence.heardAs}"</Label>
            </Body>
          )}
          {showFallbackInSentence && (
            <Body className="text-gray-600 leading-6 text-sm">
              This word is often unstressed and easy to miss in fast speech.
            </Body>
          )}
        </div>
      )}

      {/* Another example */}
      {showExtraExample && (
        <div className="mb-6 pt-6 border-t border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <Label className="text-gray-500">Another example</Label>
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
            <Body className="text-gray-900 leading-7 italic">"{extraExample.sentence}"</Body>
            {/* Show heardAs suffix only if not tautological and not hidden by chunk mode */}
            {showExtraExampleHeardAs && (
              <Body className="mt-2 text-gray-600 leading-6 text-sm">
                (sounds like "{extraExample.heardAs}")
              </Body>
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

      {/* Save tip button */}
      {onSave && (
        <div className="pt-6 border-t border-gray-100">
          <button
            onClick={handleSaveToggle}
            onMouseDown={(e) => {
              e.stopPropagation()
              e.preventDefault()
            }}
            disabled={isSaving}
            className={`w-full py-3 px-4 rounded-lg font-medium text-sm transition-colors ${
              isSaving
                ? 'bg-gray-100 text-gray-500 border-2 border-gray-200 cursor-wait'
                : isSaved || saveSuccess
                ? 'bg-gray-100 text-gray-600 border-2 border-gray-200 hover:bg-gray-200 active:bg-gray-300'
                : 'bg-blue-50 text-blue-700 border-2 border-blue-200 hover:bg-blue-100 active:bg-blue-200'
            }`}
          >
            {isSaving ? (
              'Saving...'
            ) : isSaved || saveSuccess ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Saved
              </span>
            ) : (
              'Save tip'
            )}
          </button>
        </div>
      )}
    </div>
  )
}
