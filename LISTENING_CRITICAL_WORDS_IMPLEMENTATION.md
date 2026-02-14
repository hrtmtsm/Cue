# Listening-Critical Short Words Implementation

## Summary

Added support for listening-critical short words (`to`, `a`, `an`, `the`, `of`, `at`, `for`, `and`, `or`, `but`) that are crucial for listening (weak forms, linking, chunk boundaries) but were being filtered out.

## Changes Made

### 1. **Added LISTENING_CRITICAL_SHORT_WORDS** (`lib/mistakePrioritization.ts`)
   - New constant: `LISTENING_CRITICAL_SHORT_WORDS = ["to","a","an","the","of","at","for","and","or","but"]`
   - Helper function: `isListeningCritical(word: string): boolean`
   - Helper function: `matchesListeningPattern(span: string, context?: string): boolean`
   - Known patterns: `LISTENING_PATTERNS` (e.g., "to get to", "want to", "a reservation", "the train")

### 2. **Gating Rules** (`shouldSurfaceListeningCritical`)
   - Show listening-critical words only if:
     - **a)** Adjacent to content word mistake (+/-2 tokens)
     - **b)** Part of known phrase pattern (e.g., "to get to", "a reservation")
     - **c)** Only remaining mistake in sentence (≤2 total mistakes)
     - **d)** LLM diagnosis explicitly references them (handled separately)

### 3. **Updated Scoring** (`scoreMistake`)
   - Added +60 boost for listening-critical words
   - Reduced penalties: `functionWordPenalty *= 0.25` (-25 instead of -100)
   - Reduced penalties: `shortWordPenalty *= 0.25` (-12.5 instead of -50)
   - Extra +40 boost if part of known phrase pattern

### 4. **Updated Filtering**
   - Never filter out listening-critical words (even if 1-2 letters)
   - Previously, "to" (2 letters) was filtered out entirely

### 5. **Chunking Logic** (`expandListeningCriticalChunk`)
   - "to" → "to get to" or "want to" (when adjacent to verbs)
   - "a/an/the" → "a reservation" or "the train" (when followed by noun)
   - Used in grouping phase to create better group keys

### 6. **Updated Grouping** (`groupMistakesByPhrase`)
   - Groups listening-critical words into chunks when they match patterns
   - Creates group keys like `chunk_a reservation` instead of just `a`

### 7. **Updated Selection Logic**
   - Separates mistakes: meaning-critical, listening-critical (gated), others
   - Limits listening-critical to max 1 in top3 (unless no other mistakes)
   - Updates event's `expectedSpan` to show chunk when selected (e.g., "a" → "a reservation")

### 8. **Removed Generic Fallback Card**
   - Removed the "Some phrases blended together... Example: 'to'" fallback card
   - Now uses normal per-mistake cards even when LLM fails

### 9. **Updated Call Site**
   - `prioritizeAndSelectTop3` now accepts `refTokens` parameter
   - Review page passes `refTokens` for chunking and gating

### 10. **Enhanced Debug Logging**
   - Logs: `isListeningCritical`, `shouldSurface`, `listeningCriticalBoost`, `listeningPatternBoost`
   - Shows gating reasons and final scores

### 11. **Added Tests**
   - Test: "to" appears when it's the only mistake
   - Test: "to" appears when adjacent to content word mistake
   - Test: "a reservation" is chunked when "a" is missed
   - Test: Listening-critical limited to max 1 in top3

## How It Works

**Example: "two people around seven o'clock to if possible"**
- User misses: "o'clock", "to", "if"
- **Before:**
  - "if" filtered out (2 letters + function word)
  - "to" filtered out (2 letters + function word)
  - Only "o'clock" appears (score: +90)
- **After:**
  - "if" gets +150 boost (meaning-critical) → included
  - "to" gets +60 boost, passes gating (adjacent to "o'clock") → included
  - "o'clock" still scores +90
  - Result: All three can appear, prioritized correctly

**Example: "I need a reservation"**
- User misses: "a"
- **Before:**
  - "a" filtered out (1 letter)
  - No feedback shown
- **After:**
  - "a" gets +60 boost, passes gating (part of "a reservation" pattern)
  - Chunked to "a reservation" for display
  - Result: Shows "a reservation" as missed chunk

## Gating Examples

1. **Adjacent to content word:**
   - "o'clock" (content) + "to" (listening-critical) → "to" surfaces

2. **Phrase pattern:**
   - "a reservation" → "a" surfaces as "a reservation"

3. **Only mistake:**
   - Only "to" missed → "to" surfaces

4. **Multiple listening-critical:**
   - "to", "a", "the" all missed → Max 1 in top3 (unless no other mistakes)

## Files Changed

1. **`lib/mistakePrioritization.ts`**
   - Added `LISTENING_CRITICAL_SHORT_WORDS`, `LISTENING_PATTERNS`
   - Added `isListeningCritical()`, `matchesListeningPattern()`, `shouldSurfaceListeningCritical()`
   - Added `expandListeningCriticalChunk()` for chunking
   - Updated `scoreMistake()` with listening-critical boosts
   - Updated filtering to never filter listening-critical
   - Updated grouping to chunk listening-critical words
   - Updated selection to limit listening-critical to max 1
   - Enhanced debug logging

2. **`app/[locale]/(app)/practice/review/page.tsx`**
   - Updated `prioritizeAndSelectTop3` call to pass `refTokens`
   - Removed generic fallback card ("Some phrases blended together...")

3. **`lib/__tests__/mistakePrioritization.test.ts`**
   - Added tests for listening-critical words
   - Tests gating, chunking, and selection limits

## Testing

Run tests:
```bash
npm test lib/__tests__/mistakePrioritization.test.ts
```

Manual testing:
1. Miss "to" only → should appear
2. Miss both "o'clock" and "to" → both should appear, "to" adjacent to content word
3. Miss "a" before "reservation" → should show "a reservation" as chunk
4. Miss multiple listening-critical words → max 1 in top3

## Debug Output

In development mode, you'll see logs like:
```
📊 [Prioritization] Scoring "to":
  - isListeningCritical: true
  - shouldSurface: true (adjacent to content word)
  - listeningCriticalBoost: 60
  - listeningPatternBoost: 40 (if part of pattern)
  - functionWordPenalty: -25 (reduced)
  - final score: 75

📊 [Prioritization] Scoring "a":
  - isListeningCritical: true
  - shouldSurface: true (phrase pattern: "a reservation")
  - listeningCriticalBoost: 60
  - listeningPatternBoost: 40
  - final score: 100
```
