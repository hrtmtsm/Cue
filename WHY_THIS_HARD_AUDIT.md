# "Why This is Hard" Feedback Logic Audit

## Current Algorithm (Step-by-Step)

### 1. User Clicks "Why did I miss this?" Button
- **Location**: `app/[locale]/(app)/practice/review/page.tsx` line ~1530
- **Handler**: `fetchMultipleInsights()` (line 830)
- **Trigger**: Sets `showInsightsModal = true` and calls `fetchMultipleInsights()`

### 2. Data Source: `/api/check-answer` Response
- **Location**: `app/api/check-answer/route.ts`
- **Input**: `{ transcript, userText, clipId? }`
- **Output**: `DiffResult` with:
  - `tokens`: word-level alignment tokens
  - `events`: alignment events (missing/substitution/extra)
  - `refTokens`: reference transcript as token array
  - `patternFeedback`: DB pattern feedback (if clipId provided and comprehension failed)

### 3. PhraseHint Attachment
- **Location**: `app/api/check-answer/route.ts` line 88
- **Function**: `attachPhraseSpans(base)` from `lib/phraseSpans.ts`
- **Logic**:
  - Uses hardcoded `PHRASE_PATTERNS` (e.g., `['want', 'to']`, `['going', 'to']`)
  - For each event, finds best matching pattern starting at `event.refStart`
  - Attaches `phraseHint: { spanText, spanRefStart, spanRefEnd }` to events
- **Limitation**: Only matches hardcoded patterns, not DB patterns

### 4. DB Pattern Feedback (clip_pattern_spans)
- **Location**: `app/api/check-answer/route.ts` lines 147-338
- **Trigger**: Only when `clipId` provided AND `semanticEval.understood === false`
- **Query**: Fetches from `clip_pattern_spans` with `listening_patterns` and `listening_pattern_variants`
- **Filtering**: 
  - Matches spans to `semanticEval.missingKeywords` or `semanticEval.missingUnits`
  - Falls back to alignment events if strict filter fails
- **Output**: `patternFeedback` array with:
  - `writtenForm`, `spokenForm`, `explanation_short`, `explanation_medium`
  - `listeningStrategy`, `whatToFocusOn`
  - `ref_start`, `ref_end` (character indices, not token indices)
- **Status**: **NOT USED** in insights modal - only shown in fallback static feedback

### 5. Event Selection for Insights
- **Location**: `app/[locale]/(app)/practice/review/page.tsx` lines 869-873
- **Steps**:
  1. `mergeConsecutiveMistakes()`: Merges consecutive events, preserves phraseHint if covers merged range
  2. `prioritizeAndSelectTop3()`: Selects top 3 mistakes
- **Note**: phraseHint is preserved during merging

### 6. LLM Generation (`/api/insight`)
- **Location**: `app/api/insight/route.ts` → `lib/coachingInsights.ts`
- **Input**: 
  - `event`: AlignmentEvent (with phraseHint if available)
  - `transcript`, `userText`, `userLocale`
- **Function**: `generateCoachingInsight()`
- **LLM Prompt** (lines 118-176):
  - Includes `replayPhrase: "${replay.text}"` (from `safeReplayText()`)
  - `safeReplayText()` prioritizes: `event.phraseHint?.spanText ?? event.expectedSpan`
  - Instructs LLM to use `replayPhrase` in `what_it_was` if present
  - **Does NOT include DB pattern feedback** (no `patternFeedback` in prompt)
- **Output**: `CoachingInsight` with:
  - `what_it_was`: LLM-generated (should use phraseHint.spanText if available)
  - `replay_target`: `{ text, refStart, refEnd }` from `safeReplayText()` (uses phraseHint)
  - `why_this_happens_here`, `try_this`: LLM-generated explanations
- **Fallback**: If OpenAI fails, uses `minimalFallback()` which also uses `safeReplayText()`

### 7. Modal Display
- **Location**: `app/[locale]/(app)/practice/review/page.tsx` lines 1620-1636
- **Display**:
  - **Primary**: `currentInsight.what_it_was` (chunk-level from LLM, uses phraseHint)
  - **Secondary**: `currentInsight.what_you_might_have_heard` (word-level, demoted)
  - **Highlighting**: Uses `currentInsight.replay_target.refStart/refEnd` (token indices)

### 8. Transcript Highlighting
- **Location**: `app/[locale]/(app)/practice/review/page.tsx` lines 1319-1375
- **Logic**: 
  - Gets `replayTarget` from current insight
  - Maps tokens to `refTokenIndex`
  - Highlights tokens where `refTokenIndex` is within `[replayTarget.refStart, replayTarget.refEnd]`
- **Status**: ✅ Uses chunk-level range from `replay_target`

## Key Files & Functions

| File | Function | Purpose |
|------|----------|---------|
| `app/[locale]/(app)/practice/review/page.tsx` | `fetchMultipleInsights()` | Selects top 3 events, calls `/api/insight` |
| `app/[locale]/(app)/practice/review/page.tsx` | `mergeConsecutiveMistakes()` | Merges events, preserves phraseHint |
| `app/api/check-answer/route.ts` | `attachPhraseSpans()` | Attaches phraseHint to events (hardcoded patterns) |
| `app/api/check-answer/route.ts` | DB pattern fetch (lines 147-338) | Fetches `clip_pattern_spans` but **not used in insights** |
| `app/api/insight/route.ts` | `generateCoachingInsight()` | LLM generation, uses `safeReplayText()` |
| `lib/coachingInsights.ts` | `safeReplayText()` | Returns `phraseHint.spanText` or `expectedSpan` |
| `lib/phraseSpans.ts` | `attachPhraseSpans()` | Hardcoded pattern matching |
| `lib/reviewSummary.ts` | `pickTopIssue()` | Used for summary card, prioritizes phraseHint |

## Current Issues

### Issue 1: DB Pattern Feedback Not Used
- **Problem**: `patternFeedback` from `clip_pattern_spans` is fetched but **never passed to `/api/insight`**
- **Impact**: Rich DB explanations (listeningStrategy, whatToFocusOn) are ignored
- **Location**: `app/api/check-answer/route.ts` returns `patternFeedback`, but `fetchMultipleInsights()` doesn't use it

### Issue 2: Hardcoded Pattern Matching
- **Problem**: `attachPhraseSpans()` only matches hardcoded patterns, not DB patterns
- **Impact**: phraseHint may miss DB patterns like "get to the train station"
- **Location**: `lib/phraseSpans.ts` lines 9-21

### Issue 3: LLM Doesn't Know About DB Patterns
- **Problem**: LLM prompt doesn't include DB pattern feedback
- **Impact**: LLM generates generic explanations instead of using curated DB tips
- **Location**: `lib/coachingInsights.ts` lines 133-176

## Single Best Change Point

**File**: `app/[locale]/(app)/practice/review/page.tsx`  
**Function**: `fetchMultipleInsights()` (line 830)

**Why**: This is where events are selected and sent to `/api/insight`. We can:
1. Check if `diffResult.patternFeedback` exists for the event
2. If yes, use DB pattern data instead of calling LLM
3. If no, fall back to LLM (current behavior)

## Minimal Fix Plan

### Step 1: Use DB Pattern Feedback When Available
**Location**: `app/[locale]/(app)/practice/review/page.tsx` line ~906

**Before**:
```typescript
return fetch('/api/insight', {
  method: 'POST',
  body: JSON.stringify({
    event: { ...event, nearbyBefore, nearbyAfter },
    transcript,
    userText,
    userLocale: locale
  })
})
```

**After**:
```typescript
// Check if DB pattern feedback exists for this event
const patternMatch = diffResult.patternFeedback?.find((pf: any) => {
  // Match pattern span to event range (convert char indices to token indices if needed)
  const eventCharStart = /* calculate from event.refStart */
  const eventCharEnd = /* calculate from event.refEnd */
  return pf.ref_start <= eventCharEnd && pf.ref_end >= eventCharStart
})

if (patternMatch) {
  // Use DB pattern feedback instead of LLM
  return {
    title: `Listen for: "${patternMatch.writtenForm}"`,
    what_you_might_have_heard: event.actualSpan || '(not heard)',
    what_it_was: patternMatch.writtenForm, // Use DB chunk
    why_this_happens_here: patternMatch.explanation_medium || patternMatch.explanation_short,
    try_this: patternMatch.whatToFocusOn || patternMatch.listeningStrategy || 'Replay this phrase and listen carefully.',
    replay_target: {
      text: patternMatch.writtenForm,
      refStart: /* convert pf.ref_start to token index */,
      refEnd: /* convert pf.ref_end to token index */
    },
    eventType: event.type
  }
}

// Fallback to LLM
return fetch('/api/insight', { ... })
```

### Step 2: Convert Character Indices to Token Indices
**Location**: Helper function in `fetchMultipleInsights()`

```typescript
function charIdxToTokenIdx(charIdx: number, transcript: string, refTokens: string[]): number {
  let charCount = 0
  for (let i = 0; i < refTokens.length; i++) {
    const token = refTokens[i]
    const tokenStart = charCount
    const tokenEnd = charCount + token.length
    if (charIdx >= tokenStart && charIdx < tokenEnd) {
      return i
    }
    charCount = tokenEnd + 1 // +1 for space
  }
  return -1
}
```

## Before → After Example

### Input
- **Reference**: "I need to get to the train station"
- **User**: "I need to get to the transtation"
- **DB Pattern**: `clip_pattern_spans` has "get to the train station" with:
  - `writtenForm`: "get to the train station"
  - `explanation_medium`: "In fast speech, 'get to the' can sound like one word..."
  - `ref_start`: 9, `ref_end`: 33

### Before (Current)
1. `attachPhraseSpans()` matches hardcoded pattern → no match for "get to the train station"
2. phraseHint = null → uses `expectedSpan = "train"`
3. LLM generates: `what_it_was = "train"` (single word)
4. Modal shows: "train" prominently
5. Highlight: single token "train"

### After (With Fix)
1. `fetchMultipleInsights()` finds `patternFeedback` matching event range
2. Uses DB pattern: `what_it_was = "get to the train station"` (chunk)
3. Modal shows: "get to the train station" prominently
4. Highlight: tokens 2-5 ("get to the train station")
5. Explanation: Uses DB `explanation_medium` instead of LLM

## Verification Logging

Add these console.logs to confirm runtime values:

```typescript
// In fetchMultipleInsights(), before calling /api/insight
console.log('🔍 [Insight Selection] Event:', {
  eventType: event.type,
  expectedSpan: event.expectedSpan,
  phraseHint: event.phraseHint?.spanText,
  hasPatternFeedback: !!diffResult.patternFeedback,
  patternFeedbackCount: diffResult.patternFeedback?.length || 0,
  matchingPattern: patternMatch ? {
    writtenForm: patternMatch.writtenForm,
    ref_start: patternMatch.ref_start,
    ref_end: patternMatch.ref_end
  } : null
})

// In modal render
console.log('🎯 [Modal Display] Current insight:', {
  what_it_was: currentInsight.what_it_was,
  replay_target: currentInsight.replay_target,
  source: patternMatch ? 'DB' : 'LLM'
})
```

## Summary

**Current Algorithm**:
1. User clicks button → `fetchMultipleInsights()`
2. Selects top 3 events (with phraseHint from hardcoded patterns)
3. Calls `/api/insight` (LLM) for each event
4. LLM uses `safeReplayText()` which prioritizes phraseHint
5. Modal displays LLM output
6. **DB pattern feedback is ignored**

**Recommended Fix**:
- **Single change point**: `fetchMultipleInsights()` line ~906
- **Logic**: Check `diffResult.patternFeedback` before calling LLM
- **If DB match exists**: Use DB pattern (chunk-level text + curated explanation)
- **If no match**: Fall back to LLM (current behavior)
- **Result**: Chunk-level display + DB explanations prioritized over LLM
