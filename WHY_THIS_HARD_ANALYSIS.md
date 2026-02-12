# "Why This Is Hard" Text Generation and Rendering Analysis

## 1. UI Sections Displaying "Why This Is Hard"

### Location 1: AI Insights Modal (Primary Display)
**File:** `app/[locale]/(app)/practice/review/page.tsx`
**Lines:** 1300-1307
**Label:** `📚 {t('feedback.whyThisHappens')}` (English: "Why this happens", Japanese: "なぜこうなるのか")
**Data Source:** `currentInsight.why_this_happens_here`
**Visibility:** Only shown when "Why Did I Miss This?" button is clicked (line 1162-1171)

**Code:**
```typescript
<div className="p-3 bg-white rounded border border-blue-100">
  <div className="text-xs font-semibold text-blue-900 mb-1">
    📚 {t('feedback.whyThisHappens')}
  </div>
  <p className="text-xs text-gray-700">
    {currentInsight.why_this_happens_here}
  </p>
</div>
```

### Location 2: ReviewInsightCard Component (Legacy/Unused?)
**File:** `components/ReviewInsightCard.tsx`
**Lines:** 68-70
**Label:** "Why it sounded hard" (hard-coded English)
**Data Source:** `insight.whyHard`
**Visibility:** Only shown when card is expanded (collapsed by default)

**Code:**
```typescript
<div>
  <div className="text-sm font-medium text-blue-700 mb-1">Why it sounded hard</div>
  <div className="text-base text-blue-900">{insight.whyHard}</div>
</div>
```

**Note:** This component is imported in `components/MoreInsights.tsx` but I don't see it used in the review page. May be legacy code.

---

## 2. Data Flow Tracing

### Path A: AI-Generated Insights (Primary Path)

**Flow:**
1. User clicks "Why Did I Miss This?" button (review page line 1162)
2. `fetchMultipleInsights()` called (line 780)
3. Calls `/api/insight` for each prioritized mistake (line 842)
4. `/api/insight` route (`app/api/insight/route.ts`) calls `generateCoachingInsight()`
5. `generateCoachingInsight()` in `lib/coachingInsights.ts` generates AI insight or fallback
6. Returns `CoachingInsight` with `why_this_happens_here` field
7. Displayed in modal (line 1305)

**Data Shape:**
```typescript
// lib/coachingInsights.ts - CoachingInsight interface
interface CoachingInsight {
  title: string
  what_you_might_have_heard: string
  what_it_was: string
  why_this_happens_here: string  // ← This field
  try_this: string
  example_sentences?: string[]
  replay_target: { text: string; refStart: number; refEnd: number }
  reason_type: ReasonType
}
```

**Generation Logic:**
- **AI-Generated:** If OpenAI API key exists, calls GPT-4 with prompt (lines 98-232)
- **Fallback:** If AI fails or no API key, uses `minimalFallback()` (lines 37-78)
  - Missing: `"In this sentence, "${was}" sits between other words, so it can blend in and be easy to miss."`
  - Extra: `"When the sentence flows, it can feel like there's an extra word in the middle—even if it wasn't said."`
  - Substitution: `"In this spot, the surrounding words make this part easy to confuse with something that sounds close."`

**Mapping to UI:**
- Review page line 1305: `{currentInsight.why_this_happens_here}`
- Direct mapping, no transformation

### Path B: Data-Driven Feedback (Not Currently Used in Review Page)

**Flow:**
1. `generateFeedbackFromErrors()` in `lib/dataDrivenFeedback.ts` (line 175)
2. Calls `generateWhatHappened()` (line 223)
3. `generateWhatHappened()` returns `{ whatHappened, whyHard, examples }` (line 74)
4. `whyHard` comes from `generalExplanations` record (lines 143-152)

**Data Shape:**
```typescript
// lib/dataDrivenFeedback.ts - generateWhatHappened() return type
{
  whatHappened: string
  whyHard: string  // ← This field
  examples?: string[]
}
```

**Generation Logic:**
- Uses hard-coded `generalExplanations` record (lines 143-150):
  ```typescript
  const generalExplanations: Record<ErrorCause, string> = {
    CONNECTED_SPEECH: 'In fast speech, words often blend together, making boundaries hard to hear.',
    WORD_REDUCTION: 'Reduced forms like "gonna" are common in casual speech and can be hard to catch.',
    FUNCTION_WORD_DROP: 'Small connecting words are often spoken quickly and can be missed.',
    VOWEL_REDUCTION: 'Similar-sounding words can be confusing when spoken quickly.',
    BOUNDARY_MISALIGNMENT: 'Word boundaries can be unclear when speech flows quickly.',
    CONTENT_WORD_MISS: 'Content words carry meaning but can be missed in fast speech.',
  }
  ```
- Selected based on `ErrorCause` (line 152)

**Mapping to UI:**
- **NOT CURRENTLY USED** in review page
- Only used in `DataDrivenFeedback` interface, which is returned but not displayed in review UI
- Could be used in future refactoring

### Path C: ReviewInsightCard (Legacy Path)

**Flow:**
1. `Insight` type from `lib/sessionTypes.ts` (line 32)
2. Has `whyHard: string` field (line 38)
3. Used in `ReviewInsightCard` component (line 70)

**Data Shape:**
```typescript
// lib/sessionTypes.ts - Insight interface
interface Insight {
  id: string
  category: InsightCategory
  severity: InsightSeverity
  title: string
  whatHappened: string
  whyHard: string  // ← This field
  focusTip?: string
  highlightRanges?: Array<{ start: number; end: number }>
  examples?: string[]
}
```

**Generation Logic:**
- Not clear where `Insight.whyHard` is populated
- `mockFeedbackGenerator.ts` has hard-coded examples (lines 26, 39, 54, 68, 84)
- But `ReviewInsightCard` doesn't appear to be used in review page

**Mapping to UI:**
- `ReviewInsightCard` line 70: `{insight.whyHard}`
- **Status:** Component exists but may be unused

---

## 3. Current Data Shapes and Mapping

### Active Path: AI Insights Modal

**API Response (`/api/insight`):**
```json
{
  "title": "Two parts can sound close",
  "what_you_might_have_heard": "couter",
  "what_it_was": "counter",
  "why_this_happens_here": "In this spot, the surrounding words make this part easy to confuse with something that sounds close.",
  "try_this": "Replay \"counter\" and listen for how it connects to the words around it.",
  "example_sentences": ["..."],
  "replay_target": { "text": "counter", "refStart": 3, "refEnd": 4 },
  "reason_type": "sounds_like"
}
```

**UI Mapping:**
- `why_this_happens_here` → Direct display in modal (line 1305)
- No transformation, direct string interpolation

### Inactive Path: Data-Driven Feedback

**Function Return:**
```typescript
{
  whatHappened: "You missed several words in this sentence.",
  whyHard: "Similar-sounding words can be confusing when spoken quickly.",
  examples: undefined
}
```

**UI Mapping:**
- **NOT USED** in review page
- Only exists in `DataDrivenFeedback` interface

---

## 4. Minimal Change Plan

### Goal
A) Always show an "observed fact" sentence first (based on expectedSpan/actualSpan)
B) If any event.isSpelling is true, switch to spelling-specific explanation
C) Otherwise, keep existing explanation but change wording to non-absolute ("often", "might")

### Change Location: `lib/coachingInsights.ts`

**File:** `lib/coachingInsights.ts`
**Function:** `minimalFallback()` (lines 37-78) and `generateCoachingInsight()` (lines 98-232)

### Strategy
- Modify `minimalFallback()` to generate observed fact + conditional explanation
- Update AI prompt to include observed fact requirement
- Add spelling detection check

---

## 5. Precise Diff Plan

### File 1: `lib/coachingInsights.ts`

#### Change 1: Update `minimalFallback()` to generate observed fact

**Location:** Lines 37-78

**Current Code:**
```typescript
function minimalFallback(input: {
  event: AlignmentEvent
  transcript: string
  userText: string
}): CoachingInsight {
  const { event } = input
  const replay = safeReplayText(event)
  const heard = event.actualSpan ?? '(not heard)'
  const was = replay.text || event.expectedSpan

  if (event.type === 'missing') {
    return {
      title: 'That part can disappear',
      what_you_might_have_heard: heard,
      what_it_was: was,
      why_this_happens_here: `In this sentence, "${was}" sits between other words, so it can blend in and be easy to miss.`,
      try_this: `Replay "${was}" and listen for it as one small piece, not word-by-word.`,
      replay_target: replay,
      reason_type: 'short_word_got_swallowed',
    }
  }
  // ... rest of fallback
}
```

**New Code:**
```typescript
function minimalFallback(input: {
  event: AlignmentEvent
  transcript: string
  userText: string
}): CoachingInsight {
  const { event } = input
  const replay = safeReplayText(event)
  const heard = event.actualSpan ?? '(not heard)'
  const was = replay.text || event.expectedSpan
  
  // NEW: Check if this is a spelling error
  const isSpelling = (event as any).isSpelling === true
  
  // NEW: Generate observed fact sentence
  let observedFact = ''
  if (event.type === 'missing') {
    observedFact = `You didn't hear "${was}" in this sentence.`
  } else if (event.type === 'substitution') {
    observedFact = `You wrote "${heard}" but the correct word is "${was}".`
  } else if (event.type === 'extra') {
    observedFact = `You added "${heard}" which wasn't in the original sentence.`
  } else {
    observedFact = `There was a difference between what you heard and the correct text.`
  }
  
  // NEW: Generate explanation based on spelling vs listening
  let whyExplanation = ''
  if (isSpelling) {
    // Spelling-specific explanation
    whyExplanation = `This looks like a spelling mistake. The word "${was}" might be hard to spell, but you got the meaning right!`
  } else {
    // Listening explanation (with non-absolute wording)
    if (event.type === 'missing') {
      whyExplanation = `In this sentence, "${was}" might blend in with other words, making it easy to miss.`
    } else if (event.type === 'extra') {
      whyExplanation = `When the sentence flows, it might feel like there's an extra word—even if it wasn't said.`
    } else {
      whyExplanation = `In this spot, the surrounding words might make this part easy to confuse with something that sounds close.`
    }
  }
  
  // Combine observed fact + explanation
  const why_this_happens_here = `${observedFact} ${whyExplanation}`

  if (event.type === 'missing') {
    return {
      title: isSpelling ? 'Spelling check' : 'That part can disappear',
      what_you_might_have_heard: heard,
      what_it_was: was,
      why_this_happens_here,  // CHANGED: Use combined text
      try_this: isSpelling 
        ? `Double-check the spelling of "${was}"—you're close!`
        : `Replay "${was}" and listen for it as one small piece, not word-by-word.`,
      replay_target: replay,
      reason_type: isSpelling ? 'sounds_like' : 'short_word_got_swallowed',
    }
  }
  if (event.type === 'extra') {
    return {
      title: isSpelling ? 'Spelling check' : 'Your ear may have filled a gap',
      what_you_might_have_heard: heard,
      what_it_was: was,
      why_this_happens_here,  // CHANGED: Use combined text
      try_this: isSpelling
        ? `Double-check the spelling of "${was}"—you're close!`
        : `Replay "${was}" and focus on the flow into the next words.`,
      replay_target: replay,
      reason_type: isSpelling ? 'sounds_like' : 'brain_autofill',
    }
  }
  return {
    title: isSpelling ? 'Spelling check' : 'Two parts can sound close',
    what_you_might_have_heard: heard,
    what_it_was: was,
    why_this_happens_here,  // CHANGED: Use combined text
    try_this: isSpelling
      ? `Double-check the spelling of "${was}"—you're close!`
      : `Replay "${was}" and listen for how it connects to the words around it.`,
    replay_target: replay,
    reason_type: 'sounds_like',
  }
}
```

#### Change 2: Update AI prompt to include observed fact requirement

**Location:** Lines 98-232 (inside `generateCoachingInsight()`)

**Current Prompt (around line 155-173):**
```typescript
const prompt = `...existing prompt...
  "why_this_happens_here": "1-2 sentences tied to THIS sentence",
  ...
`
```

**New Prompt:**
```typescript
const prompt = `...existing prompt...
  "why_this_happens_here": "Start with an observed fact: 'You wrote [actualSpan] but the correct word is [expectedSpan].' Then add 1-2 sentences explaining why this might happen. Use non-absolute language ('might', 'often', 'can') instead of absolute statements.",
  ...
`
```

**Also update prompt instructions (around line 158):**
```typescript
// OLD:
'If a phrasal verb or idiom is detected, explain the FULL phrase in what_it_was and why_this_happens_here.',

// NEW:
'If a phrasal verb or idiom is detected, explain the FULL phrase in what_it_was and why_this_happens_here.',
'',
'OBSERVED FACT REQUIREMENT:',
'- why_this_happens_here MUST start with an observed fact based on expectedSpan/actualSpan',
'- Example: "You wrote \"couter\" but the correct word is \"counter\"."',
'- Then add explanation using non-absolute language ("might", "often", "can")',
'',
'SPELLING DETECTION:',
'- If event.isSpelling is true, focus explanation on spelling/typing rather than listening',
'- Example: "This looks like a spelling mistake. The word might be hard to spell, but you got the meaning right!"',
```

#### Change 3: Pass spelling flag to AI generation

**Location:** Lines 98-232 (inside `generateCoachingInsight()`)

**Current Code:**
```typescript
export async function generateCoachingInsight(input: {
  event: AlignmentEvent
  transcript: string
  userText: string
  userLocale?: string
}): Promise<CoachingInsight> {
  // ... existing code ...
}
```

**New Code:**
```typescript
export async function generateCoachingInsight(input: {
  event: AlignmentEvent & { isSpelling?: boolean }  // NEW: Add optional flag
  transcript: string
  userText: string
  userLocale?: string
}): Promise<CoachingInsight> {
  const { event } = input
  const isSpelling = (event as any).isSpelling === true  // NEW: Extract flag
  
  // ... existing code ...
  
  // In prompt construction (around line 155), add:
  const spellingHint = isSpelling 
    ? '\n\nNOTE: This is a spelling/typing error (event.isSpelling=true). Focus explanation on spelling rather than listening comprehension.'
    : ''
  
  const prompt = `...existing prompt...${spellingHint}`
  
  // ... rest of function ...
}
```

### File 2: `app/[locale]/(app)/practice/review/page.tsx`

#### Change: Pass isSpelling flag when calling /api/insight

**Location:** Lines 825-863 (inside `fetchMultipleInsights()`)

**Current Code:**
```typescript
const insightPromises = topEvents.map(event => {
  // ... context gathering ...
  
  return fetch('/api/insight', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: {
        ...event,
        nearbyBefore,
        nearbyAfter
      },
      transcript: diffResult.transcript || currentPhrase.text,
      userText: diffResult.userText || userText,
      userLocale: locale
    })
  })
})
```

**New Code:**
```typescript
const insightPromises = topEvents.map(event => {
  // ... context gathering ...
  
  return fetch('/api/insight', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: {
        ...event,
        nearbyBefore,
        nearbyAfter,
        isSpelling: event.isSpelling || false  // NEW: Pass spelling flag
      },
      transcript: diffResult.transcript || currentPhrase.text,
      userText: diffResult.userText || userText,
      userLocale: locale
    })
  })
})
```

### File 3: `app/api/insight/route.ts`

#### Change: Pass isSpelling flag to generateCoachingInsight

**Location:** Lines 22-27

**Current Code:**
```typescript
const insight = await generateCoachingInsight({
  event: e,
  transcript,
  userText,
  userLocale: userLocale ?? 'en',
})
```

**New Code:**
```typescript
const insight = await generateCoachingInsight({
  event: {
    ...e,
    isSpelling: (event as any).isSpelling || false  // NEW: Pass spelling flag
  },
  transcript,
  userText,
  userLocale: userLocale ?? 'en',
})
```

---

## 6. New Types and Constants

### Types

**File: `lib/coachingInsights.ts`**
- No new exported types (uses existing `AlignmentEvent` with optional `isSpelling` flag)

**File: `app/api/insight/route.ts`**
- No new types (uses existing `AlignmentEvent` with optional `isSpelling` flag)

### Constants

**File: `lib/coachingInsights.ts`**
- No new constants (uses existing event types)

---

## 7. Dev Mode Logging

### Logging Points

**File: `lib/coachingInsights.ts`**
```typescript
// In minimalFallback(), after isSpelling check
if (process.env.NODE_ENV === 'development') {
  console.log('🔤 [coachingInsights] Fallback generation:', {
    eventType: event.type,
    expectedSpan: event.expectedSpan,
    actualSpan: event.actualSpan,
    isSpelling,
    observedFact,
    whyExplanation
  })
}

// In generateCoachingInsight(), after AI generation
if (process.env.NODE_ENV === 'development') {
  console.log('🔤 [coachingInsights] AI generation:', {
    eventType: event.type,
    expectedSpan: event.expectedSpan,
    actualSpan: event.actualSpan,
    isSpelling,
    why_this_happens_here: insight.why_this_happens_here,
    startsWithObservedFact: insight.why_this_happens_here.startsWith('You wrote') || 
                            insight.why_this_happens_here.startsWith('You didn\'t hear') ||
                            insight.why_this_happens_here.startsWith('You added')
  })
}
```

**File: `app/[locale]/(app)/practice/review/page.tsx`**
```typescript
// In fetchMultipleInsights(), after mapping events
if (process.env.NODE_ENV === 'development') {
  console.log('🔤 [Review] Fetching insights with spelling flags:', {
    topEvents: topEvents.map(e => ({
      type: e.type,
      expectedSpan: e.expectedSpan,
      actualSpan: e.actualSpan,
      isSpelling: e.isSpelling || false
    }))
  })
}
```

---

## 8. Summary of Changes

### Files Modified: 3

1. **`lib/coachingInsights.ts`**
   - Update `minimalFallback()` to generate observed fact + conditional explanation
   - Update AI prompt to require observed fact + non-absolute language
   - Add spelling detection check
   - Add dev logging

2. **`app/[locale]/(app)/practice/review/page.tsx`**
   - Pass `isSpelling` flag when calling `/api/insight`
   - Add dev logging

3. **`app/api/insight/route.ts`**
   - Pass `isSpelling` flag to `generateCoachingInsight()`

### Behavior Changes

**Before:**
- `why_this_happens_here`: "In this spot, the surrounding words make this part easy to confuse with something that sounds close."
- Absolute language ("make", "easy")
- No observed fact
- No spelling detection

**After:**
- `why_this_happens_here`: "You wrote 'couter' but the correct word is 'counter'. This looks like a spelling mistake. The word 'counter' might be hard to spell, but you got the meaning right!"
- Non-absolute language ("might", "often", "can")
- Always starts with observed fact
- Spelling-specific explanation when `isSpelling === true`

### Minimal Impact

- **No breaking changes:** All changes are additive (optional flags, new text generation)
- **Backward compatible:** Existing code continues to work if `isSpelling` is undefined
- **Isolated changes:** Only affects `why_this_happens_here` text generation
- **No UI changes:** Same display location, just different text content

---

## 9. Testing Strategy

### Test Case 1: Spelling Error
```
Input: event = { type: 'substitution', expectedSpan: 'counter', actualSpan: 'couter', isSpelling: true }
Expected: why_this_happens_here starts with "You wrote 'couter' but the correct word is 'counter'." and includes spelling explanation
```

### Test Case 2: Listening Error
```
Input: event = { type: 'substitution', expectedSpan: 'counter', actualSpan: 'count', isSpelling: false }
Expected: why_this_happens_here starts with "You wrote 'count' but the correct word is 'counter'." and includes listening explanation with "might"
```

### Test Case 3: Missing Word
```
Input: event = { type: 'missing', expectedSpan: 'the', actualSpan: '(not heard)', isSpelling: false }
Expected: why_this_happens_here starts with "You didn't hear 'the' in this sentence." and includes non-absolute explanation
```

### Test Case 4: AI Generation
```
Input: event with isSpelling flag, OpenAI API available
Expected: AI-generated insight includes observed fact and non-absolute language
```

---

## 10. Implementation Checklist

- [ ] Update `minimalFallback()` in `lib/coachingInsights.ts`
- [ ] Update AI prompt in `generateCoachingInsight()`
- [ ] Add `isSpelling` parameter handling in `generateCoachingInsight()`
- [ ] Pass `isSpelling` flag in review page `fetchMultipleInsights()`
- [ ] Pass `isSpelling` flag in `/api/insight` route
- [ ] Add dev logging for verification
- [ ] Test with spelling error (isSpelling: true)
- [ ] Test with listening error (isSpelling: false)
- [ ] Verify observed fact always appears first
- [ ] Verify non-absolute language in explanations
- [ ] Verify spelling-specific explanations when isSpelling: true
