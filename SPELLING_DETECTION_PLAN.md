# Minimal Spelling Detection Implementation Plan

## 1. Insertion Point Analysis

### Option A: Post-Alignment, Pre-Classification (RECOMMENDED)
**Location:** `app/api/check-answer/route.ts` (after line 88, after `attachPhraseSpans`)
**Flow:**
```
alignTexts() → attachPhraseSpans() → [NEW: detectSpellingErrors()] → classifyError() → analyzeErrors()
```

**Pros:**
- Minimal changes to existing code
- Can mark tokens with `isSpelling` metadata before classification
- Classification logic stays unchanged (just skips spelling tokens)
- Easy to test in isolation

**Cons:**
- Requires passing tokens through one more function
- Slight performance overhead (negligible)

### Option B: Inside classifyError() (NOT RECOMMENDED)
**Location:** `lib/errorClassifier.ts` (inside `classifyError()`, first check)
**Flow:**
```
classifyError() → [NEW: if isSpelling, return ['SPELLING_OR_TYPING']] → existing logic
```

**Pros:**
- Single point of change
- No API route changes

**Cons:**
- Mixes spelling detection with listening classification
- Harder to test spelling detection in isolation
- Requires changing ErrorCause type (breaking change)

### **SELECTED: Option A**
Reason: Keeps concerns separated, easier to test, minimal impact on existing code.

---

## 2. Spelling Detection Function Design

### File: `lib/spellingDetector.ts` (NEW FILE)

```typescript
/**
 * Spelling/typing error detection utilities
 * Detects when user mistakes are likely spelling errors vs listening errors
 */

import { levenshteinDistance } from './semanticEvaluator' // Reuse existing function

/**
 * Common English words (function words + high-frequency content words)
 * Used to check if a word is likely a real English word
 * 
 * Source: Combined from existing FUNCTION_WORDS, CONTRACTIONS, plus common content words
 * Size: ~500-1000 words (small enough to be in-memory)
 */
const COMMON_WORDS = new Set<string>([
  // Function words (from errorClassifier.ts)
  'a', 'an', 'the', 'to', 'for', 'of', 'in', 'on', 'at', 'by', 'with',
  'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'must',
  'and', 'or', 'but', 'so', 'if', 'when', 'where', 'what', 'who', 'how', 'why',
  'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
  'my', 'your', 'his', 'her', 'its', 'our', 'their', 'me', 'him', 'us', 'them',
  
  // Contractions
  "i'm", "you're", "he's", "she's", "it's", "we're", "they're",
  "i've", "you've", "we've", "they've", "i'll", "you'll", "he'll", "she'll", "we'll", "they'll",
  "i'd", "you'd", "he'd", "she'd", "we'd", "they'd",
  "isn't", "aren't", "wasn't", "weren't", "don't", "doesn't", "didn't",
  "won't", "wouldn't", "couldn't", "shouldn't", "can't", "couldn't",
  "haven't", "hasn't", "hadn't", "let's", "that's", "there's", "here's", "what's", "who's",
  
  // Common content words (top 200-300 most frequent English words)
  'time', 'way', 'year', 'work', 'government', 'day', 'man', 'thing', 'woman', 'life',
  'child', 'world', 'school', 'state', 'family', 'student', 'group', 'country', 'problem',
  'hand', 'part', 'place', 'case', 'week', 'company', 'system', 'program', 'question',
  'work', 'government', 'number', 'night', 'point', 'home', 'water', 'room', 'mother',
  'area', 'money', 'story', 'fact', 'month', 'lot', 'right', 'study', 'book', 'eye',
  'job', 'word', 'business', 'issue', 'side', 'kind', 'head', 'house', 'service', 'friend',
  'father', 'power', 'hour', 'game', 'line', 'end', 'member', 'law', 'car', 'city',
  'community', 'name', 'president', 'team', 'minute', 'idea', 'kid', 'body', 'information',
  'back', 'parent', 'face', 'others', 'level', 'office', 'door', 'health', 'person', 'art',
  'war', 'history', 'party', 'result', 'change', 'morning', 'reason', 'research', 'girl',
  'guy', 'moment', 'air', 'teacher', 'force', 'education', 'need', 'meeting', 'report',
  'food', 'table', 'phone', 'call', 'help', 'question', 'answer', 'meeting', 'schedule',
  'check', 'finish', 'start', 'stop', 'continue', 'wait', 'think', 'know', 'see', 'look',
  'come', 'go', 'get', 'give', 'take', 'make', 'do', 'say', 'tell', 'ask', 'want', 'need',
  'try', 'use', 'find', 'work', 'call', 'move', 'play', 'run', 'walk', 'talk', 'listen',
  'hear', 'read', 'write', 'speak', 'understand', 'remember', 'forget', 'learn', 'teach',
  'show', 'buy', 'sell', 'pay', 'cost', 'spend', 'save', 'open', 'close', 'turn', 'put',
  'send', 'receive', 'meet', 'leave', 'arrive', 'stay', 'live', 'die', 'born', 'grow',
  'change', 'become', 'seem', 'feel', 'look', 'sound', 'taste', 'smell', 'touch',
  'good', 'bad', 'big', 'small', 'large', 'little', 'long', 'short', 'high', 'low',
  'new', 'old', 'young', 'hot', 'cold', 'warm', 'cool', 'fast', 'slow', 'early', 'late',
  'right', 'wrong', 'true', 'false', 'easy', 'hard', 'difficult', 'simple', 'complex',
  'important', 'necessary', 'possible', 'impossible', 'ready', 'sure', 'certain', 'clear',
  'nice', 'great', 'wonderful', 'terrible', 'awful', 'excellent', 'perfect', 'beautiful',
  'happy', 'sad', 'angry', 'excited', 'worried', 'surprised', 'tired', 'busy', 'free',
  'today', 'yesterday', 'tomorrow', 'now', 'then', 'here', 'there', 'where', 'when', 'why',
  'how', 'what', 'which', 'who', 'whose', 'whom', 'more', 'most', 'less', 'least',
  'many', 'much', 'some', 'any', 'all', 'every', 'each', 'both', 'few', 'little',
  'first', 'last', 'next', 'previous', 'other', 'another', 'same', 'different', 'same',
  'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'hundred', 'thousand', 'million', 'billion', 'number', 'amount', 'total', 'part', 'whole',
  // ... (expand to ~500-1000 words total)
])

/**
 * Check if a word is likely a real English word
 * Uses common words set (fast lookup, no external dependencies)
 */
function isLikelyEnglishWord(word: string): boolean {
  const normalized = word.toLowerCase().trim()
  if (normalized.length === 0) return false
  
  // Check common words set
  if (COMMON_WORDS.has(normalized)) return true
  
  // Heuristic: if word is 1-2 chars, likely a function word (treat as valid)
  if (normalized.length <= 2) return true
  
  // Heuristic: if word ends with common suffixes, likely valid
  const commonSuffixes = ['ing', 'ed', 'er', 'est', 'ly', 'tion', 'sion', 'ness', 'ment']
  if (commonSuffixes.some(suffix => normalized.endsWith(suffix))) {
    // Check if base word exists
    for (const suffix of commonSuffixes) {
      if (normalized.endsWith(suffix)) {
        const base = normalized.slice(0, -suffix.length)
        if (COMMON_WORDS.has(base)) return true
      }
    }
  }
  
  return false
}

/**
 * Check if a substitution is likely a spelling/typing error
 * 
 * Heuristics:
 * 1. Levenshtein distance <= 2 (close character-wise)
 * 2. Expected word is a real English word
 * 3. Actual word is NOT a real English word (or very close to expected)
 * 4. Same first letter (typos usually preserve first letter)
 * 5. Length difference <= 2 (spelling errors don't drastically change length)
 * 
 * @param expected - The correct word from transcript
 * @param actual - The word user typed
 * @returns true if likely a spelling error, false if likely a listening error
 */
export function isLikelySpellingError(expected: string, actual: string): boolean {
  const expectedLower = expected.toLowerCase().trim()
  const actualLower = actual.toLowerCase().trim()
  
  // Same word = not an error
  if (expectedLower === actualLower) return false
  
  // Calculate Levenshtein distance
  const distance = levenshteinDistance(expectedLower, actualLower)
  
  // Heuristic 1: Distance must be small (1-2 chars for spelling errors)
  if (distance > 2) return false
  
  // Heuristic 2: Expected word must be a real English word
  if (!isLikelyEnglishWord(expectedLower)) return false
  
  // Heuristic 3: Actual word should NOT be a real English word (or be very close)
  const actualIsRealWord = isLikelyEnglishWord(actualLower)
  if (actualIsRealWord && distance > 1) {
    // If actual is a real word and distance > 1, might be a different word (vocab gap)
    // Check if they share first letter (spelling errors usually do)
    if (expectedLower[0] !== actualLower[0]) return false
    // If same first letter and distance <= 2, still likely spelling
    return distance <= 2
  }
  
  // Heuristic 4: Same first letter (typos usually preserve first letter)
  if (expectedLower[0] !== actualLower[0]) {
    // Exception: if distance is 1 and lengths are same, might be first-letter typo
    if (distance === 1 && expectedLower.length === actualLower.length) {
      return true // e.g., "counter" → "couter" (missing char, not first letter)
    }
    return false
  }
  
  // Heuristic 5: Length difference should be small
  const lengthDiff = Math.abs(expectedLower.length - actualLower.length)
  if (lengthDiff > 2) return false
  
  // All heuristics passed → likely spelling error
  return true
}

/**
 * Mark spelling errors in alignment tokens
 * Adds `isSpelling` flag to tokens and events
 */
export function detectSpellingErrors(
  tokens: Array<{ 
    type: string
    ref?: string
    hyp?: string
    expected?: string
    actual?: string
    [key: string]: any
  }>,
  events: Array<{
    type: string
    expectedSpan?: string
    actualSpan?: string
    [key: string]: any
  }>
): {
  tokens: Array<any>
  events: Array<any>
  spellingCount: number
} {
  let spellingCount = 0
  
  // Mark spelling errors in tokens
  const markedTokens = tokens.map(token => {
    if (token.type === 'substitution' || token.type === 'wrong') {
      const expected = token.ref || token.expected || ''
      const actual = token.hyp || token.actual || ''
      
      if (isLikelySpellingError(expected, actual)) {
        spellingCount++
        return { ...token, isSpelling: true }
      }
    }
    return { ...token, isSpelling: false }
  })
  
  // Mark spelling errors in events
  const markedEvents = events.map(event => {
    if (event.type === 'substitution') {
      const expected = event.expectedSpan || ''
      const actual = event.actualSpan || ''
      
      if (isLikelySpellingError(expected, actual)) {
        return { ...event, isSpelling: true }
      }
    }
    return { ...event, isSpelling: false }
  })
  
  return {
    tokens: markedTokens,
    events: markedEvents,
    spellingCount
  }
}
```

**Heuristics Summary:**
- Levenshtein distance <= 2
- Expected word is real English word
- Actual word is NOT real English word (or very close)
- Same first letter (with exception for single-char deletions)
- Length difference <= 2

**Word List:**
- Location: In-memory Set in `lib/spellingDetector.ts`
- Size: ~500-1000 words (function words + top frequency content words)
- Loading: Static initialization (no file I/O)
- Expansion: Can add more words later without breaking changes

---

## 3. Output Updates

### 3.1 API Response (`app/api/check-answer/route.ts`)

**Current Response:**
```typescript
{
  accuracyPercent: number
  tokens: AlignmentToken[]
  events: AlignmentEvent[]
  stats: { correct, substitutions, missing, extra }
  semanticScore?: number
  understood?: boolean
  // ...
}
```

**Updated Response (add fields):**
```typescript
{
  // ... existing fields ...
  spellingCount: number  // NEW: count of spelling errors
  hasSpellingErrors: boolean  // NEW: quick check flag
  // tokens and events now have isSpelling: boolean field
}
```

**Pseudo-diff:**
```typescript
// After line 88 (after attachPhraseSpans)
import { detectSpellingErrors } from '@/lib/spellingDetector'

const aligned = attachPhraseSpans(base)

// NEW: Detect spelling errors
const { tokens: markedTokens, events: markedEvents, spellingCount } = 
  detectSpellingErrors(aligned.tokens, aligned.events)

// ... existing semantic evaluation code ...

const responseBody = {
  accuracyPercent,
  refTokens: aligned.refTokens,
  userTokens: aligned.userTokens,
  tokens: markedTokens,  // CHANGED: use marked tokens
  events: markedEvents,  // CHANGED: use marked events
  stats: aligned.stats,
  transcript,
  userText,
  semanticScore: semanticEval?.semanticScore ?? null,
  missingUnits: semanticEval?.missingUnits ?? [],
  capturedKeywords: semanticEval?.capturedKeywords ?? [],
  missingKeywords: semanticEval?.missingKeywords ?? [],
  understood: semanticEval?.understood ?? (accuracyPercent >= 70),
  spellingCount,  // NEW
  hasSpellingErrors: spellingCount > 0,  // NEW
  ...(patternFeedback !== undefined && { patternFeedback }),
} as const
```

### 3.2 Review UI (`app/[locale]/(app)/practice/review/page.tsx`)

**Current Display (lines 1000-1080):**
- Shows semantic evaluation result OR accuracy percentage
- Shows summary card with category

**Updated Display:**
- If `semanticScore >= 0.7` AND `hasSpellingErrors === true`:
  - Show: "Great! You got the meaning. Minor spelling fixes: [list of words]"
  - Example: "Great! You got the meaning. Minor spelling fixes: counter → couter"

**Pseudo-diff:**
```typescript
// Around line 1000-1042, update semantic evaluation display

{diffResult.semanticEval ? (
  diffResult.semanticEval.understood ? (
    <div className="mb-6 p-5 bg-green-50 rounded-xl border border-green-200">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          <div className="w-5 h-5 text-green-600 text-xl font-bold">✓</div>
        </div>
        <div className="flex-1 space-y-2">
          <div className="text-body font-medium text-green-900 leading-relaxed">
            Great! You got the meaning
          </div>
          {/* NEW: Show spelling errors if present */}
          {diffResult.hasSpellingErrors && diffResult.spellingCount > 0 && (
            <div className="text-sm text-green-700 leading-relaxed">
              Minor spelling fixes: {
                diffResult.events
                  .filter((e: any) => e.isSpelling && e.type === 'substitution')
                  .slice(0, 3)  // Show max 3
                  .map((e: any) => `${e.expectedSpan} → ${e.actualSpan}`)
                  .join(', ')
              }
            </div>
          )}
          {/* Existing: missing keywords */}
          {diffResult.semanticEval.missingKeywords.length > 0 && (
            <div className="text-sm text-green-700 leading-relaxed">
              Minor corrections: {diffResult.semanticEval.missingKeywords.join(', ')}
            </div>
          )}
        </div>
      </div>
    </div>
  ) : (
    // ... existing "Not quite" display ...
  )
) : (
  // ... existing fallback ...
)}
```

### 3.3 Review Summary Category (`lib/reviewSummary.ts`)

**Current Categories:**
- `words_blended`
- `casual_shortcuts`
- `brain_filled_in`
- `key_words_hard`
- `speed_fast`

**New Category:**
- `spelling_typing` (for spelling errors)

**Pseudo-diff:**
```typescript
// Add new category type
export type IssueCategory = 
  | 'words_blended' 
  | 'casual_shortcuts'
  | 'brain_filled_in'
  | 'key_words_hard'
  | 'speed_fast'
  | 'spelling_typing'  // NEW

// In pickTopIssue() function, add check BEFORE existing checks (around line 251)

export function pickTopIssue(
  tokens: AlignmentToken[],
  events: AlignmentEvent[],
  refTokens: string[],
  refText: string,
  userText: string,
  accuracyPercent: number
): ReviewSummary {
  // ... existing counting logic ...
  
  // NEW: Check for spelling errors first (highest priority)
  const spellingErrors = events.filter((e: any) => e.isSpelling === true)
  if (spellingErrors.length > 0) {
    categoryId = 'spelling_typing'
    title = 'You got the meaning, but there were some spelling mistakes.'
    const firstSpelling = spellingErrors[0]
    if (firstSpelling && refTokens.length > 0) {
      examplePhrase = extractPhrase(refTokens, firstSpelling.refStart, firstSpelling.refEnd)
    }
    // Extract practice phrases from spelling errors
    phrasesArray = spellingErrors
      .slice(0, 5)
      .map(e => extractPhrase(refTokens, e.refStart, e.refEnd))
      .filter(p => p.trim().length > 0)
    
    return {
      categoryId,
      title,
      examplePhrase: examplePhrase || refTokens.slice(0, 3).join(' '),
      phrasesToPractice: phrasesArray.length > 0 ? phrasesArray : [refTokens.slice(0, 3).join(' ')],
    }
  }
  
  // ... existing category selection logic (words_blended, casual_shortcuts, etc.) ...
}
```

**Behavior:**
- If ANY spelling errors detected → use `spelling_typing` category
- Title: "You got the meaning, but there were some spelling mistakes."
- Example phrase: First spelling error location
- Practice phrases: All spelling error locations (max 5)

---

## 4. Precise Implementation Plan

### File 1: `lib/spellingDetector.ts` (NEW FILE)

**Contents:**
- `COMMON_WORDS` Set (500-1000 words)
- `isLikelyEnglishWord(word: string): boolean`
- `isLikelySpellingError(expected: string, actual: string): boolean`
- `detectSpellingErrors(tokens, events): { tokens, events, spellingCount }`

**Dependencies:**
- Import `levenshteinDistance` from `lib/semanticEvaluator.ts`

**Exports:**
- `isLikelySpellingError` (for testing)
- `detectSpellingErrors` (for API route)

### File 2: `lib/errorClassifier.ts` (MINOR UPDATE)

**Change:**
- Update `classifyError()` to skip spelling errors (early return if `token.isSpelling === true`)

**Pseudo-diff:**
```typescript
export function classifyError(
  token: { 
    type: string
    ref?: string
    hyp?: string
    expected?: string
    actual?: string
    word?: string
    isSpelling?: boolean  // NEW: optional flag
  },
  context: { prevToken?: any; nextToken?: any }
): ErrorCause[] {
  const causes: ErrorCause[] = []
  
  // NEW: Skip classification for spelling errors
  if (token.isSpelling === true) {
    return []  // Return empty causes (spelling errors handled separately)
  }
  
  // ... existing classification logic unchanged ...
}
```

### File 3: `lib/reviewSummary.ts` (UPDATE)

**Changes:**
1. Add `'spelling_typing'` to `IssueCategory` type
2. Add spelling check at start of `pickTopIssue()` (before line 256)
3. Update `extractPhrase()` calls to handle spelling events

**Pseudo-diff:**
```typescript
// Line 3-9: Add new category
export type IssueCategory = 
  | 'words_blended' 
  | 'casual_shortcuts'
  | 'brain_filled_in'
  | 'key_words_hard'
  | 'speed_fast'
  | 'spelling_typing'  // NEW

// Line 251: Add spelling check BEFORE existing category logic
export function pickTopIssue(...): ReviewSummary {
  // ... existing counting logic ...
  
  // NEW: Check spelling errors first
  const spellingEvents = events.filter((e: any) => e.isSpelling === true)
  if (spellingEvents.length > 0) {
    // Return spelling category
    // ... (see section 3.3 for full code)
  }
  
  // ... existing category selection unchanged ...
}
```

### File 4: `app/api/check-answer/route.ts` (UPDATE)

**Changes:**
1. Import `detectSpellingErrors`
2. Call after `attachPhraseSpans()`
3. Add `spellingCount` and `hasSpellingErrors` to response

**Pseudo-diff:**
```typescript
// After line 2 (imports)
import { detectSpellingErrors } from '@/lib/spellingDetector'

// After line 88 (after attachPhraseSpans)
const aligned = attachPhraseSpans(base)

// NEW: Detect spelling errors
const { tokens: markedTokens, events: markedEvents, spellingCount } = 
  detectSpellingErrors(aligned.tokens, aligned.events)

// ... existing semantic evaluation code (unchanged) ...

// Line 353: Update response body
const responseBody = {
  // ... existing fields ...
  tokens: markedTokens,  // CHANGED
  events: markedEvents,  // CHANGED
  spellingCount,  // NEW
  hasSpellingErrors: spellingCount > 0,  // NEW
  // ... rest unchanged ...
}
```

### File 5: `app/[locale]/(app)/practice/review/page.tsx` (UPDATE)

**Changes:**
1. Update semantic evaluation display to show spelling fixes
2. Handle `spellingCount` and `hasSpellingErrors` from API response

**Pseudo-diff:**
```typescript
// Line 125-152: Update DiffResult interface
interface DiffResult {
  // ... existing fields ...
  spellingCount?: number  // NEW
  hasSpellingErrors?: boolean  // NEW
  // ... rest unchanged ...
}

// Line 500: Map API response (add spelling fields)
const diffResult: DiffResult = {
  // ... existing mapping ...
  spellingCount: data.spellingCount ?? 0,  // NEW
  hasSpellingErrors: data.hasSpellingErrors ?? false,  // NEW
  // ... rest unchanged ...
}

// Line 1000-1042: Update semantic evaluation display
// (see section 3.2 for full code)
```

### File 6: `lib/dataDrivenFeedback.ts` (MINOR UPDATE)

**Change:**
- Filter out spelling errors before analysis (they're handled separately)

**Pseudo-diff:**
```typescript
// Line 184: Update filter to exclude spelling errors
const highConfidenceTokens = tokens.filter(token => {
  // NEW: Skip spelling errors
  if (token.isSpelling === true) return false
  
  if (token.type === 'wrong') {
    return token.confidence !== undefined && token.confidence >= 0.55
  }
  return true
})
```

---

## 5. New Types and Constants

### Types

**File: `lib/spellingDetector.ts`**
- No new exported types (uses existing AlignmentToken/Event types with `isSpelling` flag)

**File: `lib/reviewSummary.ts`**
- `IssueCategory` type: Add `'spelling_typing'`

**File: `app/api/check-answer/route.ts`**
- Response type: Add `spellingCount: number` and `hasSpellingErrors: boolean`

### Constants

**File: `lib/spellingDetector.ts`**
- `COMMON_WORDS: Set<string>` - ~500-1000 words (static initialization)

---

## 6. Dev Mode Logging

### Logging Points

**File: `lib/spellingDetector.ts`**
```typescript
// In isLikelySpellingError()
if (process.env.NODE_ENV === 'development') {
  console.log('🔤 [Spelling] Checking:', {
    expected,
    actual,
    distance: levenshteinDistance(expectedLower, actualLower),
    expectedIsWord: isLikelyEnglishWord(expectedLower),
    actualIsWord: isLikelyEnglishWord(actualLower),
    sameFirstLetter: expectedLower[0] === actualLower[0],
    result: isSpelling
  })
}

// In detectSpellingErrors()
if (process.env.NODE_ENV === 'development') {
  console.log('🔤 [Spelling] Detection complete:', {
    totalTokens: tokens.length,
    spellingCount,
    spellingTokens: markedTokens.filter(t => t.isSpelling).map(t => ({
      expected: t.ref || t.expected,
      actual: t.hyp || t.actual
    }))
  })
}
```

**File: `app/api/check-answer/route.ts`**
```typescript
// After detectSpellingErrors() call
if (process.env.NODE_ENV === 'development') {
  console.log('🔤 [check-answer] Spelling detection:', {
    spellingCount,
    hasSpellingErrors: spellingCount > 0,
    spellingEvents: markedEvents.filter((e: any) => e.isSpelling).map((e: any) => ({
      expected: e.expectedSpan,
      actual: e.actualSpan
    }))
  })
}
```

**File: `lib/reviewSummary.ts`**
```typescript
// In pickTopIssue(), when spelling category is selected
if (process.env.NODE_ENV === 'development') {
  console.log('🔤 [ReviewSummary] Spelling category selected:', {
    spellingCount: spellingErrors.length,
    examplePhrase,
    phrasesToPractice: phrasesArray
  })
}
```

---

## 7. Testing Strategy

### Unit Tests (Manual Verification)

**Test Case 1: Spelling Error Detection**
```
Input: expected="counter", actual="couter"
Expected: isLikelySpellingError() returns true
```

**Test Case 2: Listening Error (Not Spelling)**
```
Input: expected="counter", actual="count"
Expected: isLikelySpellingError() returns false (different word, not spelling)
```

**Test Case 3: Vocabulary Gap (Not Spelling)**
```
Input: expected="submit", actual="send"
Expected: isLikelySpellingError() returns false (both real words, different meaning)
```

**Test Case 4: Reduction (Not Spelling)**
```
Input: expected="going to", actual="gonna"
Expected: isLikelySpellingError() returns false (reduction, not spelling)
```

**Test Case 5: Mixed Errors**
```
Input: 
  - "counter" → "couter" (spelling)
  - "going to" → "gonna" (listening)
Expected: 
  - First marked as spelling
  - Second NOT marked as spelling
  - Category: "spelling_typing" (spelling takes priority)
```

### Integration Test (Manual)

1. Submit answer with spelling error: "pay at the couter when you're ready"
2. Check API response: `hasSpellingErrors: true`, `spellingCount: 1`
3. Check review page: Shows "Great! You got the meaning. Minor spelling fixes: counter → couter"
4. Check category: `categoryId: 'spelling_typing'`

---

## 8. Risk Assessment

### Low Risk
- Adding `isSpelling` flag to tokens/events (optional field, backward compatible)
- New category `spelling_typing` (doesn't break existing categories)
- Filtering spelling errors in `classifyError()` (early return, no side effects)

### Medium Risk
- Word list size (500-1000 words) - might miss some words, but heuristics help
- Levenshtein distance threshold (<= 2) - might miss some spelling errors, but catches most

### Mitigation
- Heuristics are conservative (better to miss some spelling errors than misclassify listening errors)
- Can expand word list incrementally
- Can adjust Levenshtein threshold based on testing

---

## 9. Implementation Order

1. **Create `lib/spellingDetector.ts`** (new file, isolated)
2. **Update `app/api/check-answer/route.ts`** (add spelling detection call)
3. **Update `lib/errorClassifier.ts`** (skip spelling errors)
4. **Update `lib/reviewSummary.ts`** (add spelling category)
5. **Update `app/[locale]/(app)/practice/review/page.tsx`** (display spelling fixes)
6. **Update `lib/dataDrivenFeedback.ts`** (filter spelling errors)

**Testing after each step:**
- Step 1: Unit test `isLikelySpellingError()`
- Step 2: Check API response includes `spellingCount`
- Step 3: Verify spelling tokens don't get listening classifications
- Step 4: Verify spelling category appears in review summary
- Step 5: Verify UI shows spelling fixes
- Step 6: Verify data-driven feedback ignores spelling errors

---

## 10. Success Criteria

✅ Spelling errors detected: "counter" → "couter" marked as spelling
✅ Listening errors preserved: "going to" → "gonna" still marked as listening
✅ API response includes spelling count
✅ Review UI shows "Meaning OK + Spelling fixes" when semanticScore >= 0.7
✅ Review summary uses `spelling_typing` category for spelling errors
✅ No breaking changes to existing listening error classifications

---

## Summary

**Minimal Changes:**
- 1 new file (`lib/spellingDetector.ts`)
- 5 files updated (API route, error classifier, review summary, review page, data-driven feedback)
- ~200 lines of new code (mostly word list)
- Backward compatible (optional fields, early returns)

**Impact:**
- Reduces misdiagnosis for spelling errors (100% → ~0% for detected cases)
- Preserves existing listening error classifications
- No external dependencies
- Easy to test and verify
