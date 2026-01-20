# "wanna" → "wana" Spelling Error Audit

**Date:** 2024-12-19  
**Issue:** "wanna" typed as "wana" (missing 'n') is categorized as `'missed'` and gets generic listening feedback instead of spelling feedback.

---

## A) Current Flow Analysis

### 1. Token Normalization
**File:** `lib/alignmentEngine.ts:60-78`

**Process:**
- Input: `"wanna"` (expected) vs `"wana"` (user typed)
- `normalizeText()` lowercases both → `"wanna"` and `"wana"`
- `tokenize()` splits on spaces → `["wanna"]` and `["wana"]`
- **Result:** Both are single tokens, no normalization issues

**Lines:**
- `normalizeText()`: 60-74
- `tokenize()`: 76-79

### 2. Alignment Event Type
**File:** `lib/alignmentEngine.ts:108-289`

**Process:**
- `alignTexts()` runs Levenshtein DP alignment (line 108)
- `"wanna" !== "wana"` → treated as substitution (`op: 'sub'`, line 141)
- Creates `AlignmentEvent` with:
  - `type: 'substitution'` (line 221)
  - `expectedSpan: "wanna"` (line 226)
  - `actualSpan: "wana"` (line 227)

**Lines:**
- DP alignment: 131-154
- Event creation for substitution: 205-230

**Key Finding:** ✅ Event type is `'substitution'` (NOT `'missing'`)

### 3. Category Detection
**File:** `lib/practiceSteps.ts:57-102`

**Function Call:**
```typescript
detectCategory("wanna", "wana")  // Line 430 (or 573 for other events)
```

**Execution Path:**
1. Line 58: `lower = "wanna"`, `actualLower = "wana"`
2. Line 62-64: Contractions check → ❌ No match
3. Line 67-69: Linking patterns → ❌ No match
4. Line 72-74: Elision patterns → ❌ No match
5. Line 77-80: Weak form words → ❌ "wanna" not in `weakFormWords` array
6. Line 84-93: Similar words (hardcoded pairs) → ❌ Not in pairs list
7. Line 97-99: Multi-word check → ❌ Single word
8. Line 101: **Returns `'missed'`** ⚠️

**Problem:** No spelling/typo detection path exists.

**Lines:**
- `detectCategory()` definition: 57-102
- Called in `extractPracticeSteps()`: 430, 573

### 4. Sound Rule Generation (Fallback)
**File:** `lib/practiceSteps.ts:269-288`

**Function Call:**
```typescript
generateSoundRule("wanna", 'missed', "wanna")  // heardAs from generateHeardAs()
```

**Execution:**
- Line 272: `switch (category)` → `case 'missed':` not present
- Line 286: Default case → `"wanna" can sound like "wanna" when spoken quickly.` ⚠️ **TAUTOLOGY**

**HeardAs Generation:**
**File:** `lib/practiceSteps.ts:107-153`
- Line 131-136: Linking patterns → ❌ "wanna" not in phrases
- Line 138-144: Weak forms → ❌ "wanna" not in list
- Line 152: Fallback → Returns `"wanna"` (same as input)

**Result:** Generic, tautological feedback: "wanna can sound like wanna when spoken quickly"

**Lines:**
- `generateSoundRule()`: 269-288
- `generateHeardAs()`: 107-153

---

## B) Edit Distance Analysis

### Existing Levenshtein Infrastructure
**File:** `lib/alignmentConfidence.ts`

**Functions Available:**
1. `computeStringSimilarity(str1, str2)` (line 10)
   - Uses `levenshteinDistance()` (line 25)
   - Returns 0..1 similarity score
   - For "wanna" vs "wana": edit distance = 1, similarity ≈ 0.8 (4/5)

2. `evaluateReplacement(ref, hyp)` (line 129)
   - Checks similarity threshold (line 137)
   - Checks known reduced forms (line 146)
   - Used in `lib/textAlignment.ts:204` to determine if substitution is high-confidence

**Current Threshold:**
- `REPLACEMENT_CONFIDENCE_THRESHOLD`: ~0.7 (estimated, needs verification)
- "wanna" vs "wana" similarity ≈ 0.8 → Would pass threshold ✅

**Lines:**
- `computeStringSimilarity()`: 10-20
- `levenshteinDistance()`: 25-54
- `evaluateReplacement()`: 129-160

### Why "wanna" → "wana" Passes Substitution Threshold

**Similarity Calculation:**
- Edit distance: 1 (delete 'n' or insert 'n')
- Max length: 5
- Similarity: `1 - (1/5) = 0.8`
- Threshold likely ~0.7 → ✅ Passes → Creates `'substitution'` event

**But:** Category detection doesn't use similarity; it only checks hardcoded patterns.

---

## C) Where Spelling Detection Should Be Added

### Option 1: Add to `detectCategory()` (Recommended)
**File:** `lib/practiceSteps.ts:57-102`

**Location:** Before the final `return 'missed'` (line 101)

**Logic:**
```typescript
// Spelling/typo detection: 1 char difference in short words
if (actualSpan && phrase.length <= 6) {
  const editDist = levenshteinDistance(phrase, actualSpan)
  if (editDist === 1) {
    return 'spelling'
  }
}
```

**Pros:**
- Minimal change (one function)
- Early detection (before fallback)
- Uses existing `actualSpan` parameter

**Cons:**
- Requires importing `levenshteinDistance` (or re-implementing)
- Need to add `'spelling'` to `FeedbackCategory` type

**Lines to modify:**
- Type definition: Line 7-14 (add `'spelling'`)
- `detectCategory()`: Line 94-101 (add spelling check before return)

### Option 2: Add to `generateSoundRule()` (Not Recommended)

**Why Not:**
- `generateSoundRule()` receives `category` already decided
- Would require passing `actualSpan` as additional parameter
- Less clean separation of concerns

### Option 3: Add Pre-Processing Step Before `detectCategory()`

**File:** `lib/practiceSteps.ts:430` (or 573)

**Logic:**
```typescript
// Pre-check spelling before category detection
let category = detectCategory(target, actualSpan)
if (category === 'missed' && actualSpan) {
  const editDist = computeEditDistance(target, actualSpan)
  if (editDist === 1 && target.length <= 6) {
    category = 'spelling'
  }
}
```

**Pros:**
- No changes to `detectCategory()` function
- Can reuse existing similarity functions

**Cons:**
- Less clean (post-processing category)
- Duplicates spelling logic in two places (phrase hints + other events)

---

## D) Minimal Implementation Options

### Option 1: Extend `detectCategory()` with Spelling Check (SAFEST)

**Changes Required:**

1. **Add `'spelling'` to FeedbackCategory type** (`lib/practiceSteps.ts:7-14`)
   ```typescript
   export type FeedbackCategory = 
     | 'weak_form'
     | 'linking'
     | 'elision'
     | 'contraction'
     | 'similar_words'
     | 'missed'
     | 'speed_chunking'
     | 'spelling'  // ← ADD
   ```

2. **Add spelling check in `detectCategory()`** (`lib/practiceSteps.ts:94-101`)
   ```typescript
   // Spelling/typo: 1 character difference in short words
   if (actualSpan && lower.length <= 6 && actualLower.length <= 6) {
     const editDist = simpleEditDistance(lower, actualLower)
     if (editDist === 1) {
       return 'spelling'
     }
   }
   
   return 'missed'
   ```

3. **Add simple edit distance helper** (inline or at top of file)
   ```typescript
   function simpleEditDistance(s1: string, s2: string): number {
     const m = s1.length, n = s2.length
     if (Math.abs(m - n) > 1) return Infinity
     // Simple Levenshtein for length ≤ 6 (fast enough)
     // ... implementation ...
   }
   ```

4. **Add spelling-specific handlers:**
   - `generateSoundRule()` case (line 269-288): Skip or show spelling message
   - `generateHeardAs()`: Return undefined or actualSpan
   - `generateTip()` case (line 373-386): Spelling-specific tip
   - PhraseCard rendering: Skip "How it sounds" section for spelling

**Files Modified:**
- `lib/practiceSteps.ts` (type, detectCategory, soundRule, tip)

**Risk:** Low - Only affects 1-char-diff short words, falls back to 'missed' otherwise

---

### Option 2: Pre-Check in `extractPracticeSteps()` (MIDDLE GROUND)

**Changes Required:**

1. Import or create simple edit distance function
2. Before `detectCategory()` call (line 430), add:
   ```typescript
   let category = detectCategory(target, actualSpan)
   
   // Override 'missed' with 'spelling' if 1-char diff
   if (category === 'missed' && actualSpan) {
     const editDist = simpleEditDistance(target.toLowerCase(), actualSpan.toLowerCase())
     if (editDist === 1 && target.length <= 6) {
       category = 'spelling'
     }
   }
   ```

3. Add `'spelling'` type and handlers (same as Option 1)

**Files Modified:**
- `lib/practiceSteps.ts` (two call sites: 430, 573)

**Risk:** Medium - Logic duplicated in two places

---

### Option 3: Use Existing Similarity Infrastructure (LEAST CHANGES)

**Changes Required:**

1. Import `computeStringSimilarity` from `lib/alignmentConfidence.ts`
2. In `detectCategory()`, before final return:
   ```typescript
   // Spelling: very high similarity (>0.8) but different words
   if (actualSpan && lower.length <= 6) {
     const similarity = computeStringSimilarity(lower, actualLower)
     if (similarity >= 0.8 && similarity < 1.0) {
       return 'spelling'
     }
   }
   ```

**Files Modified:**
- `lib/practiceSteps.ts` (add import, detectCategory)
- Type definition and handlers (same as Option 1)

**Risk:** Low - Reuses existing, tested similarity function

**Note:** Similarity of 0.8 = 1 edit in 5 chars (matches "wanna"/"wana")

---

## E) Recommended Approach: Option 1 (Extended detectCategory)

**Rationale:**
- Single place for categorization logic
- Early detection (catches spelling before other checks)
- Clear separation: spelling vs listening comprehension
- Minimal code changes

**Implementation Checklist:**
- [ ] Add `'spelling'` to `FeedbackCategory` type (line 7-14)
- [ ] Add `simpleEditDistance()` helper function (after `detectCategory`, ~20 lines)
- [ ] Add spelling check in `detectCategory()` (before `return 'missed'`, line 94-101)
- [ ] Add `case 'spelling':` to `generateSoundRule()` (skip listening explanation)
- [ ] Add `case 'spelling':` to `generateTip()` (spelling-specific tip)
- [ ] Update PhraseCard to hide "How it sounds" for spelling (check category === 'spelling')

**Estimated LOC:** ~30-40 lines

---

## F) Testing Scenarios

### Case 1: "wanna" → "wana" (Current Issue)
- Edit distance: 1 ✅
- Length ≤ 6: 5 chars ✅
- **Expected:** Category `'spelling'`, skip listening feedback

### Case 2: "going" → "goin" (Missing 'g')
- Edit distance: 1 ✅
- Length ≤ 6: 5 chars ✅
- **Expected:** Category `'spelling'`

### Case 3: "the" → "te" (Missing 'h')
- Edit distance: 1 ✅
- Length ≤ 6: 3 chars ✅
- **Expected:** Category `'spelling'`

### Case 4: "wanna" → "want" (2-char diff)
- Edit distance: 2 ❌
- **Expected:** Category `'missed'` (not spelling)

### Case 5: "wanna" → "wan" (2-char diff)
- Edit distance: 2 ❌
- **Expected:** Category `'missed'`

### Case 6: "wanna" → "want to" (Completely different)
- Edit distance: high ❌
- **Expected:** Category `'missed'` or `'similar_words'`

---

## G) Current File References

**Token Normalization:**
- `lib/alignmentEngine.ts:60-78` (normalizeText, tokenize)

**Alignment Event Creation:**
- `lib/alignmentEngine.ts:205-230` (substitution event)

**Category Assignment:**
- `lib/practiceSteps.ts:57-102` (detectCategory function)
- `lib/practiceSteps.ts:430` (called for phrase hints)
- `lib/practiceSteps.ts:573` (called for other events)

**Sound Rule Fallback:**
- `lib/practiceSteps.ts:269-288` (generateSoundRule)
- `lib/practiceSteps.ts:107-153` (generateHeardAs)

**Edit Distance Functions:**
- `lib/alignmentConfidence.ts:10-20` (computeStringSimilarity)
- `lib/alignmentConfidence.ts:25-54` (levenshteinDistance)

---

**End of Audit**


