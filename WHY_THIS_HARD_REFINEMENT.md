# "Why this was hard" Feedback System Refinement

## Summary

Fixed bug where same "Stress is on RE-ser-VA-tion." line appeared on unrelated cards, implemented 2-lane ranking system, and created token-specific pronunciation hint generator.

## Bug Fix: Token-Specific Content Generation

**Problem:** The same hint ("Stress is on RE-ser-VA-tion.") appeared on cards for "a" or "to" because the code used `includes()` checks instead of exact token matching.

**Root Cause:** 
- `generateSoundHint()` in `app/api/insight/route.ts` used `text.includes('station')` which matched "a reservation"
- `generateSoundHint()` in `lib/formatHowItSounds.ts` had the same issue

**Fix:**
- Created new `lib/pronunciationHints.ts` with token-specific generators
- `generateTipLine()` checks exact token matches first, then falls back to multi-word patterns
- `generateHowItSounds()` uses exact token lookups in `WEAK_FORMS` and `STRESS_HINTS` maps
- Updated API route to use new generators with context tokens (prev/next)

## 2-Lane Ranking System

### Lane A: Meaning-Critical Words
- **Always eligible** even if 1-2 letters
- **Strong boost** (+150)
- **Guarantee:** If any exist in mistakes, at least 1 must appear in top 3
- Examples: `if`, `not`, `no`, `can't`, `don't`, `do/did`, `can/could/should/would`, `before/after/until/unless/without`

### Lane B: Reduced/Linked Function Words
- **Not always surfaced** - only when pedagogically valuable
- **Surface rules:**
  1. Adjacent to missed/incorrect content word (suggesting linking caused the miss)
  2. User missed 2+ consecutive tokens including the function word
  3. Weak-form high value set: `to`, `a`, `the`, `of`, `for` (these frequently reduce)
- **Limit:** Max 1-2 in top 3 (unless user missed many mistakes)
- **Boost:** +70 (less than meaning-critical but enough to compete)

## Pronunciation Hint Generator

Created `lib/pronunciationHints.ts` with:

### WEAK_FORMS Map
- Maps function words to weak forms: `to` → `tuh`, `a` → `uh`, `the` → `thuh/thee`
- Includes IPA notation and hints
- Special handling: `the` before vowel sounds like "thee"

### STRESS_HINTS Map
- Maps content words to stress patterns: `reservation` → `re-ZER-vation`
- Includes IPA notation and hints
- Examples: `tonight` → `tuh-NIGHT`, `station` → `STAY-shun`

### Functions
- `generateTipLine(token, heardText?, prevToken?, nextToken?)`: One short sentence (max 60 chars)
- `generateHowItSounds(token, prevToken?, nextToken?)`: Returns `{ display, ipa? }`
- `isWeakFormHighValue(token)`: Checks if token is in high-value set

## Changes Made

### Files Created
1. **`lib/pronunciationHints.ts`** - Token-specific pronunciation hint generator
2. **`lib/__tests__/pronunciationHints.test.ts`** - Unit tests for bug regression

### Files Modified
1. **`app/api/insight/route.ts`**
   - Replaced `generateSoundHint()` and `generateCompactForm()` with new generators
   - Added context token extraction (prev/next) from `chunkRefStart/chunkRefEnd`
   - Updated fallback card generation to use token-specific hints

2. **`lib/mistakePrioritization.ts`**
   - Updated `shouldSurfaceGrammarCritical()` to implement 3 rules for Lane B
   - Added guarantee that at least 1 meaning-critical word appears in top 3 (Lane A)
   - Improved consecutive token detection for Rule 2

3. **`app/[locale]/(app)/practice/review/page.tsx`**
   - Added context token extraction when calling `/api/insight`
   - Passes `prevToken` and `nextToken` for better pronunciation hints

4. **`lib/formatHowItSounds.ts`**
   - Updated `generateSoundHint()` to delegate to new generator (backward compatibility)

## Unit Tests

### `lib/__tests__/pronunciationHints.test.ts`
- ✅ "a" card does NOT show "RE-ser-VA-tion" hint
- ✅ "reservation" card DOES show "ZER" stress hint
- ✅ "to" shows weak form hint
- ✅ "a reservation" chunk shows appropriate hint
- ✅ "the" before vowel vs consonant handled correctly

### `lib/__tests__/mistakePrioritization.test.ts` (existing)
- ✅ "if" surfaces in top results
- ✅ "to" and "a" can surface when rules trigger
- ✅ Content words still appear when they're the main miss

## Acceptance Criteria Met

✅ **Bug fix:** Tip line and "How it sounds" are token-specific (no includes-based checks)  
✅ **2-lane ranking:** Meaning-critical always appears; grammar-critical only when valuable  
✅ **Pronunciation hints:** Deterministic generator with WEAK_FORMS and STRESS_HINTS maps  
✅ **No shallow fallback:** All tokens get specific cards (removed generic "blended together" text)  
✅ **Unit tests:** Bug regression tests ensure "a" doesn't show reservation hint  

## Testing Recommendations

1. **Manual testing:**
   - Test with "a reservation" → should show weak form hint for "a", not reservation stress
   - Test with "reservation" → should show "Stress is on ZER"
   - Test with "to" → should show "reduces to tuh"
   - Test with "if" → should appear in top 3 even if other mistakes exist

2. **Check console logs:**
   - Look for `📊 [Prioritization] Scoring` showing category and shouldSurface
   - Look for `📋 [Prioritization] Final ranking` showing final order

3. **Run unit tests:**
   - `npm test -- lib/__tests__/pronunciationHints.test.ts`
   - `npm test -- lib/__tests__/mistakePrioritization.test.ts`
