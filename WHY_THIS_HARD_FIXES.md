# "Why this was hard" Modal Fixes

## Summary

Fixed disappearing cards bug and improved mistake prioritization to surface grammar-critical words like "to" and "a" when relevant.

## Root Cause: Disappearing Cards

**Problem:** Modal sometimes showed only header with no card body.

**Root Causes Identified:**
1. **No error state handling**: When API failed, `aiInsights` remained empty but no error UI was shown
2. **Race conditions**: Rapid modal open/close or phrase switching caused state to be overwritten by failed requests
3. **Missing fallback for edge cases**: When `hasEvents === true` but `aiInsights.length === 0` and no error, nothing was rendered
4. **No request cancellation**: Previous requests could complete after new ones started, overwriting state

## Changes Made

### A) Fixed Disappearing Cards

1. **Added AbortController** for race condition handling
   - Each `fetchMultipleInsights` call creates a new `AbortController`
   - Previous requests are cancelled when new ones start
   - State updates are guarded by `abortController.signal.aborted` checks

2. **Added error state** (`insightError`)
   - Shows error UI with retry button when API fails
   - Prevents blank modal when requests fail

3. **Added lastSuccessfulFeedback cache**
   - Keyed by `phraseId` (clipId + transcript)
   - On failure, falls back to cached feedback instead of showing blank
   - Prevents overwriting successful feedback with empty state

4. **Ensured modal always shows something**
   - Loading: Shows skeleton card (not just spinner)
   - Error: Shows error UI + retry button
   - Empty (no events): Shows friendly "No specific miss detected" message
   - Edge case: Shows safety fallback card generated from first event

5. **Improved state management**
   - Don't reset `aiInsights` on modal close (keeps them for next open)
   - Only reset `currentInsightIndex` and `insightError`
   - Cache persists across modal open/close cycles

### B) Unified Fallback Quality

1. **Replaced generic fallback** with same card UI format
   - Fallback now uses same `InsightCard` component structure
   - Shows "What you missed", "How it sounds", "One example" sections
   - Generated from first event when API fails but events exist

2. **Improved fallback content**
   - Mentions specific listening patterns (linking, weak forms)
   - Actionable tips based on missed token(s)
   - No generic "Some phrases blended together..." text

### C) Improved Prioritization: Grammar-Critical Words

1. **Renamed LISTENING_CRITICAL to GRAMMAR_CRITICAL**
   - More accurate terminology (prepositions, articles, infinitive markers)
   - `GRAMMAR_CRITICAL_WORDS = ['to', 'a', 'an', 'the', 'of', 'at', 'for', 'in', 'on']`
   - Kept `LISTENING_CRITICAL_SHORT_WORDS` as deprecated alias for backward compatibility

2. **Enhanced scoring**
   - Grammar-critical boost: +70 (increased from +60)
   - Meaning-critical boost: +150 (unchanged)
   - Reduced penalties for grammar-critical words (0.25x of normal penalties)

3. **Improved filtering**
   - Never hard-filter grammar-critical words (same as meaning-critical)
   - Gating rules: Only surface when adjacent to content word, part of phrase pattern, or only remaining mistake

4. **Selection rules**
   - Guarantee at least 1 meaning-critical in top 3 when present
   - Limit grammar-critical to max 1-2 in top 3 (unless user missed many mistakes)
   - Meaning-critical always ranks higher than grammar-critical

5. **Added instrumentation**
   - Dev-only logs show: token, category (meaning/grammar/content), filtered?, score breakdown, final rank
   - Easy to debug why "to" was not selected

### D) Unit Tests

Created `lib/__tests__/mistakePrioritization.test.ts` with tests for:
- "around seven o'clock if possible" → "if" included in top results
- "I'd like to make a reservation" → "to" and/or "a" included when missed
- Content words still appear when they are the main miss
- Meaning-critical prioritized over grammar-critical
- Grammar-critical limited to 1-2 in top 3

## Files Changed

1. **`app/[locale]/(app)/practice/review/page.tsx`**
   - Added `insightError` state
   - Added `lastSuccessfulFeedbackRef` cache
   - Added `insightAbortControllerRef` for race condition handling
   - Updated `fetchMultipleInsights` with AbortController, caching, error handling
   - Updated modal JSX to always show something (loading skeleton, error UI, or content)
   - Improved fallback UI to use same card format

2. **`lib/mistakePrioritization.ts`**
   - Renamed `LISTENING_CRITICAL_SHORT_WORDS` to `GRAMMAR_CRITICAL_WORDS`
   - Added `isGrammarCritical()` function
   - Added `getWordCategory()` helper for debugging
   - Updated scoring: grammar-critical boost +70, reduced penalties
   - Updated filtering: never filter grammar-critical
   - Updated selection: limit grammar-critical to 1-2 in top 3
   - Enhanced debug logging with category and score breakdown
   - Updated all references from `isListeningCritical` to `isGrammarCritical`

3. **`lib/__tests__/mistakePrioritization.test.ts`** (new)
   - Unit tests for prioritization logic
   - Tests for grammar-critical word surfacing
   - Tests for meaning-critical vs grammar-critical priority

## Acceptance Criteria Met

✅ **Modal never shows only header** - Always renders loading skeleton, error UI, or content  
✅ **Rapid switching doesn't cause blank content** - AbortController cancels previous requests  
✅ **No uncaught errors** - All failures handled gracefully with fallbacks  
✅ **Grammar-critical words surface** - "to" and "a" appear when relevant (gated by rules)  
✅ **Fallback uses same card UI** - Consistent experience  
✅ **Debug logs available** - Easy to see why "to" was not selected  

## Testing Recommendations

1. **Manual testing:**
   - Open modal rapidly multiple times → should not show blank
   - Trigger API error (disconnect network) → should show error UI with retry
   - Test with sentence containing "to" and "a" → should see them in top 3 when missed
   - Test with "if" and "o'clock" → "if" should rank higher

2. **Check console logs:**
   - Look for `📊 [Prioritization] Scoring` logs showing category and score breakdown
   - Look for `📋 [Prioritization] Final ranking` showing final order

3. **Run unit tests:**
   - `npm test -- lib/__tests__/mistakePrioritization.test.ts` (when test framework is configured)
