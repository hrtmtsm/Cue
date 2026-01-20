# Listening Pattern Feedback Display - End-to-End Audit

**Date:** 2024-12-19  
**Purpose:** Understand the complete data flow from API → UI for `chunkDisplay`, `reducedForm`, `howItSounds`, and `tip` fields.

---

## A) Call Chain Diagram

```
API Layer:
app/api/listening-patterns/route.ts:74
  └─ GET() → Supabase query (line 78-82)
  └─ convertSupabasePattern() (line 43-67)
     └─ Returns: { id, words, chunkDisplay, reducedForm, howItSounds, tip, priority }
  └─ Falls back to LISTENING_PATTERNS if DB unavailable (line 87, 97, 115)

Client Hook:
lib/useListeningPatterns.ts:17
  └─ useListeningPatterns()
     └─ Fetches /api/listening-patterns (line 27)
     └─ Initial state: LISTENING_PATTERNS (local fallback) (line 18)
     └─ Updates state with API response (line 42)
     └─ Returns: { patterns: ListeningPattern[], loading, error }

Practice Page:
app/(app)/practice/[clipId]/practice/page.tsx:74
  └─ useListeningPatterns() → gets patterns array
  └─ useMemo() (line 74-84)
     └─ extractPracticeSteps(events, refTokens, userTokens, 5, transcript, patterns)
        └─ patterns passed as 6th argument (line 82)

Pattern Matching:
lib/practiceSteps.ts:455
  └─ matchListeningPattern(firstTargetToken, refTokens, targetIndex, patterns)
     └─ Returns: PatternMatchResult | null
        └─ { pattern, soundRule, tip, chunkDisplay } (line 96-101)
        └─ NOTE: reducedForm is NOT included in PatternMatchResult

Feedback Item Creation:
lib/practiceSteps.ts:499-521
  └─ Creates PracticeStep object:
     ├─ soundRule = patternMatch.soundRule (line 459)
     ├─ tip = patternMatch.tip ?? tip (line 460)
     ├─ chunkDisplay = patternMatch.chunkDisplay (line 461)
     └─ inSentence.chunkDisplay = chunkDisplay (line 516)
     └─ NOTE: reducedForm is NOT stored anywhere in PracticeStep

UI Rendering:
components/PhraseCard.tsx:168
  └─ hasChunk = Boolean(inSentence?.chunkDisplay) (line 168)
  └─ Chunk line rendering (line 384):
     └─ "{inSentence.highlighted}" links into "{inSentence.chunkDisplay}"
     └─ NOTE: reducedForm is NEVER referenced in PhraseCard
```

---

## B) Field Source Table

| Field | API Response | PatternMatchResult | PracticeStep | PhraseCard Usage | Gap? |
|-------|-------------|-------------------|--------------|------------------|------|
| **chunkDisplay** | ✅ Line 61: `chunkDisplay: pattern.chunk_display` | ✅ Line 100: `chunkDisplay: pattern.chunkDisplay` | ✅ Line 516: `inSentence.chunkDisplay = chunkDisplay` | ✅ Line 225: `showChunkLine = hasChunk && inSentence.chunkDisplay`<br>✅ Line 384: Renders chunk line | ❌ None |
| **reducedForm** | ✅ Line 62: `reducedForm: pattern.reduced_form \|\| undefined` | ❌ **NOT IN PatternMatchResult** | ❌ **NOT IN PracticeStep** | ❌ **NEVER REFERENCED** | ⚠️ **GAP: Lost after API** |
| **howItSounds** | ✅ Line 63: `howItSounds: pattern.how_it_sounds` | ✅ Line 98: `soundRule: pattern.howItSounds` | ✅ Line 510: `soundRule` (from patternMatch.soundRule) | ✅ Line 207: `showHowItSounds = hasChunk ? true : !isTautological`<br>✅ Line 350: Renders `soundRule` | ❌ None |
| **tip** | ✅ Line 64: `tip: pattern.tip \|\| undefined` | ✅ Line 99: `tip: pattern.tip \|\| undefined` | ✅ Line 520: `tip` (from patternMatch.tip) | ✅ Line 401: Renders `tip` if exists | ❌ None |

---

## C) Gaps Identified

### Gap 1: `reducedForm` Lost After API Response

**Location:** `lib/listeningPatternMatcher.ts:8-13`

**Problem:**
- `PatternMatchResult` interface does NOT include `reducedForm`
- When `matchListeningPattern()` returns a match (line 96-101), it only extracts:
  - `soundRule` from `pattern.howItSounds`
  - `tip` from `pattern.tip`
  - `chunkDisplay` from `pattern.chunkDisplay`
- `pattern.reducedForm` exists but is never passed through

**Impact:**
- `reducedForm` exists in DB, API response, and local patterns
- But it's never stored in `PracticeStep` or accessible to `PhraseCard`
- UI cannot display "want to → wanna" format

### Gap 2: Local Fallback Patterns Missing `reducedForm`

**Location:** `lib/listeningPatterns.ts`

**Problem:**
- When API fails, `useListeningPatterns()` falls back to `LISTENING_PATTERNS` (line 18, 47, 56)
- Some patterns in `LISTENING_PATTERNS` have `reducedForm` (lines 40, 51, 99, 110)
- But if API is working, local patterns are ignored
- If API is down, local patterns are used BUT `reducedForm` still won't reach UI (due to Gap 1)

**Impact:**
- Even with `reducedForm` in local patterns, it won't reach UI
- This is a secondary issue (Gap 1 is the blocker)

### Gap 3: Chunk Display Doesn't Show Reduced Form

**Location:** `components/PhraseCard.tsx:384`

**Current Behavior:**
```tsx
<span className="font-medium">"{inSentence.highlighted}"</span> links into 
<span className="font-medium">"{inSentence.chunkDisplay}"</span>
```

**Example Output:**
- `"want to"` links into `"want to"` (if `chunkDisplay: "want to"`)
- Desired: `"want to"` links into `"wanna"` (if `reducedForm: "wanna"` exists)

**Problem:**
- Line 384 only uses `chunkDisplay` (canonical form)
- No logic to check for `reducedForm` and display "canonical → reduced" format

---

## D) Current Data Flow Details

### 1. API Response Shape

**File:** `app/api/listening-patterns/route.ts`

**Response Format (Lines 58-66):**
```typescript
{
  id: string                    // pattern_key from DB
  words: string[]               // words[] from DB
  chunkDisplay: string          // chunk_display from DB ✅
  reducedForm?: string          // reduced_form from DB ✅ (but lost later)
  howItSounds: string           // how_it_sounds from DB ✅
  tip?: string                  // tip from DB ✅
  priority: number
}
```

**SELECT Query (Line 80):**
```typescript
.select('id, pattern_key, words, chunk_display, reduced_form, how_it_sounds, tip, priority, is_active, focus, left1, right1, right2')
```
- ✅ `reduced_form` is fetched from DB

**Conversion (Lines 58-66):**
```typescript
return {
  id: pattern.pattern_key || pattern.id,
  words,
  chunkDisplay: pattern.chunk_display,
  reducedForm: pattern.reduced_form || undefined,  // ✅ Converted correctly
  howItSounds: pattern.how_it_sounds,
  tip: pattern.tip || undefined,
  priority: pattern.priority,
}
```

### 2. Pattern Matching Result

**File:** `lib/listeningPatternMatcher.ts:8-13`

**PatternMatchResult Interface:**
```typescript
export interface PatternMatchResult {
  pattern: ListeningPattern     // Full pattern object (includes reducedForm)
  soundRule: string             // From pattern.howItSounds
  tip?: string                  // From pattern.tip
  chunkDisplay: string          // From pattern.chunkDisplay
  // ❌ MISSING: reducedForm
}
```

**Match Return (Lines 96-101):**
```typescript
return {
  pattern,
  soundRule: pattern.howItSounds,  // ✅ Extracted
  tip: pattern.tip || undefined,   // ✅ Extracted
  chunkDisplay: pattern.chunkDisplay, // ✅ Extracted
  // ❌ reducedForm is NOT extracted
}
```

**Note:** `pattern.reducedForm` exists in the full `pattern` object, but it's never extracted into `PatternMatchResult`.

### 3. PracticeStep Creation

**File:** `lib/practiceSteps.ts:455-521`

**Pattern Matching (Lines 455-463):**
```typescript
const patternMatch = matchListeningPattern(firstTargetToken, refTokens, targetIndex, patterns)
if (patternMatch) {
  soundRule = patternMatch.soundRule      // ✅ Applied
  tip = patternMatch.tip ?? tip           // ✅ Applied
  chunkDisplay = patternMatch.chunkDisplay // ✅ Applied
  // ❌ reducedForm is NOT available from patternMatch
}
```

**PracticeStep Object (Lines 499-521):**
```typescript
const step: PracticeStep = {
  // ... other fields
  soundRule,                              // ✅ From patternMatch
  tip,                                    // ✅ From patternMatch
  inSentence: {
    original: fullSentence,
    highlighted: target,
    heardAs,
    chunkDisplay,                         // ✅ From patternMatch
    chunkMeaning,
    // ❌ NO reducedForm field
  },
}
```

**FeedbackItem Interface (Lines 16-43):**
```typescript
export interface FeedbackItem {
  // ... existing fields
  inSentence: {
    original: string
    highlighted: string
    heardAs: string
    chunkDisplay?: string                 // ✅ Exists
    chunkMeaning?: string
    // ❌ reducedForm is NOT in interface
  }
  // ❌ No top-level reducedForm field
}
```

### 4. PhraseCard Rendering

**File:** `components/PhraseCard.tsx`

**Chunk Mode Detection (Line 168):**
```typescript
const hasChunk = Boolean(inSentence?.chunkDisplay)
```

**Chunk Line Rendering (Line 384):**
```tsx
{showChunkLine && (
  <div className="text-sm text-gray-600 leading-6">
    <span className="font-medium">"{inSentence.highlighted}"</span> links into 
    <span className="font-medium">"{inSentence.chunkDisplay}"</span>
  </div>
)}
```

**Current Output Examples:**
- If `chunkDisplay: "want to"` → Displays: `"want to"` links into `"want to"` (redundant)
- If `chunkDisplay: "went-to-the"` → Displays: `"went to the"` links into `"went-to-the"` (okay)

**Desired Behavior:**
- If `chunkDisplay: "want to"` AND `reducedForm: "wanna"` → Display: `"want to"` links into `"wanna"`

---

## E) Proposed Minimal Data-Shape Change

### Option A: Add `reducedForm` to `inSentence` (Recommended)

**Changes Required:**

1. **Update `PatternMatchResult` interface** (`lib/listeningPatternMatcher.ts:8-13`)
   ```typescript
   export interface PatternMatchResult {
     pattern: ListeningPattern
     soundRule: string
     tip?: string
     chunkDisplay: string
     reducedForm?: string  // ← ADD THIS
   }
   ```

2. **Extract `reducedForm` in match functions** (`lib/listeningPatternMatcher.ts:96-101, 187-192`)
   ```typescript
   return {
     pattern,
     soundRule: pattern.howItSounds,
     tip: pattern.tip || undefined,
     chunkDisplay: pattern.chunkDisplay,
     reducedForm: pattern.reducedForm || undefined,  // ← ADD THIS
   }
   ```

3. **Store `reducedForm` in `PracticeStep`** (`lib/practiceSteps.ts:455-463, 512-518`)
   ```typescript
   let chunkDisplay: string | undefined = undefined
   let reducedForm: string | undefined = undefined  // ← ADD THIS
   
   if (patternMatch) {
     soundRule = patternMatch.soundRule
     tip = patternMatch.tip ?? tip
     chunkDisplay = patternMatch.chunkDisplay
     reducedForm = patternMatch.reducedForm        // ← ADD THIS
   }
   
   // ... later in PracticeStep creation
   inSentence: {
     original: fullSentence,
     highlighted: target,
     heardAs,
     chunkDisplay,
     reducedForm,                                  // ← ADD THIS
     chunkMeaning,
   },
   ```

4. **Update `FeedbackItem` interface** (`lib/practiceSteps.ts:31-37`)
   ```typescript
   inSentence: {
     original: string
     highlighted: string
     heardAs: string
     chunkDisplay?: string
     reducedForm?: string                          // ← ADD THIS
     chunkMeaning?: string
   }
   ```

5. **Update PhraseCard rendering** (`components/PhraseCard.tsx:382-386`)
   ```tsx
   {showChunkLine && (
     <div className="text-sm text-gray-600 leading-6">
       <span className="font-medium">"{inSentence.highlighted}"</span> links into{' '}
       <span className="font-medium">
         "{inSentence.reducedForm || inSentence.chunkDisplay}"
       </span>
     </div>
   )}
   ```

**Rationale:**
- `reducedForm` is semantically part of "how it sounds in sentence" context
- Matches existing structure (`chunkDisplay` is already in `inSentence`)
- Minimal change (only affects pattern-matched items)
- Backward compatible (optional field)

### Option B: Top-Level `reducedForm` Field

**Changes Required:**
- Add `reducedForm?: string` to top-level `FeedbackItem` interface
- Store at `feedbackItem.reducedForm` instead of `feedbackItem.inSentence.reducedForm`
- Update PhraseCard to read from top-level

**Rationale:**
- Could be used for non-chunk patterns too (future flexibility)
- But doesn't fit semantic model (reduced form is contextual to the sentence)

**Recommendation:** Use Option A

---

## F) Risks and Edge Cases

### Risk 1: Local Fallback Patterns

**Location:** `lib/useListeningPatterns.ts:18, 47, 56`

**Risk:**
- If API fails, local `LISTENING_PATTERNS` is used
- Local patterns already have `reducedForm` (lines 40, 51, 99, 110 in `listeningPatterns.ts`)
- Once Gap 1 is fixed, local fallback will work correctly

**Mitigation:**
- No action needed—local patterns already have `reducedForm`
- Gap 1 fix will make it work

### Risk 2: Backward Compatibility

**Risk:**
- Existing `PracticeStep` objects in sessionStorage may not have `reducedForm`
- PhraseCard must handle `undefined` `reducedForm`

**Mitigation:**
- Use `inSentence.reducedForm || inSentence.chunkDisplay` (fallback to canonical)
- Optional field (`reducedForm?: string`) ensures compatibility

### Risk 3: Chunk Synthesis vs Pattern Matching

**Location:** `lib/practiceSteps.ts:468-493`

**Risk:**
- `chunkDisplay` can come from:
  1. Pattern matching (line 461) ✅ Has `reducedForm`
  2. Chunk synthesis (line 479) ❌ No `reducedForm` (synthesized chunks don't have reductions)
- Synthesized chunks will have `reducedForm: undefined`, which is correct

**Mitigation:**
- Only pattern-matched chunks should have `reducedForm`
- Synthesized chunks should fall back to `chunkDisplay` (expected behavior)

### Risk 4: Naming Consistency

**Current State:**
- DB: `reduced_form` (snake_case)
- API: `reducedForm` (camelCase) ✅
- TypeScript: `reducedForm` (camelCase) ✅
- No naming issues

---

## G) Summary

### Current State
- ✅ `reducedForm` exists in DB (`reduced_form` column)
- ✅ `reducedForm` exists in API response (`reducedForm` field)
- ✅ `reducedForm` exists in local patterns (some patterns)
- ❌ `reducedForm` is NOT extracted in `PatternMatchResult`
- ❌ `reducedForm` is NOT stored in `PracticeStep`
- ❌ `reducedForm` is NOT accessible to `PhraseCard`
- ❌ UI cannot display "canonical → reduced" format

### Required Changes (Option A)
1. Add `reducedForm?: string` to `PatternMatchResult`
2. Extract `reducedForm` in `matchListeningPattern()` and `matchListeningPatternBackward()`
3. Store `reducedForm` in `PracticeStep.inSentence`
4. Update `FeedbackItem.inSentence` interface
5. Update PhraseCard to use `reducedForm` if available, fallback to `chunkDisplay`

### Files to Modify
1. `lib/listeningPatternMatcher.ts` (lines 8-13, 96-101, 187-192)
2. `lib/practiceSteps.ts` (lines 31-37, 434, 455-463, 512-518)
3. `components/PhraseCard.tsx` (line 384)

### Testing Checklist
- ✅ Pattern with `reducedForm` → UI shows "canonical → reduced"
- ✅ Pattern without `reducedForm` → UI shows "canonical → canonical" (fallback)
- ✅ Synthesized chunk → UI shows `chunkDisplay` (no `reducedForm`)
- ✅ Local fallback patterns → `reducedForm` still works
- ✅ Backward compatibility → Old sessionStorage data doesn't break

---

**End of Audit**


