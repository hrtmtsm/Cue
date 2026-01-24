# Feedback Logic Analysis

## 1. Step-by-Step Feedback Generation Flow

### Entry Point: User Submits Answer

**Files:**
- `app/onboarding/diagnosis/page.tsx` (lines 248-409) - Diagnostic flow
- `app/(app)/practice/respond/page.tsx` (lines 1484-1574) - Normal practice flow
- `app/(app)/practice/review/page.tsx` (lines 372-504) - Review page (re-checks answer)

**Flow:**
1. User types answer → `userInput` state
2. `handleSubmit()` / `handleCheckAnswer()` called
3. POST to `/api/check-answer` with `{ transcript, userText, skipped? }`

### Step 2: Alignment Engine (Token-Level)

**File:** `app/api/check-answer/route.ts` (lines 72-87)

**Function:** `alignTexts()` from `lib/alignmentEngine.ts`

**What it does:**
- Tokenizes reference transcript and user text
- Performs word-level alignment (Levenshtein-based)
- Generates `AlignmentToken[]` and `AlignmentEvent[]`

**Output Structure:**
```typescript
{
  refTokens: string[],        // ["i", "went", "to", "the", "store"]
  userTokens: string[],       // ["i", "went", "store"]
  tokens: AlignmentToken[],   // Token-level diff
  events: AlignmentEvent[],   // Error events (missing/substitution/extra)
  stats: { correct, substitutions, missing, extra }
}
```

**Key Point:** Feedback is **word/token-level**, not sentence-level.

### Step 3: Phrase Span Attachment

**File:** `app/api/check-answer/route.ts` (line 73)

**Function:** `attachPhraseSpans()` from `lib/phraseSpans.ts`

**What it does:**
- Attaches phrase hints to events (identifies multi-word phrases)
- Example: "went to the" → single phrase span

**Output:** Enhanced `AlignmentEvent[]` with `phraseHint` field

### Step 4: Practice Steps Generation (Category-Level)

**File:** `lib/practiceSteps.ts` (lines 400-1032)

**Function:** `extractPracticeSteps()`

**Input:**
- `events: AlignmentEvent[]` (from alignment engine)
- `refTokens: string[]`
- `userTokens: string[]`
- `maxSteps: number`
- `fullTranscript?: string`
- `patterns?: ListeningPattern[]` (optional, from Supabase or local fallback)

**Process:**

1. **Event Prioritization** (lines 407-414):
   - Phrase hint events first (multi-word phrases)
   - Then other missing/substitution events

2. **Category Detection** (lines 131-209):
   - `detectCategory(phrase, actualSpan)` - **Hardcoded regex/string matching**
   - Categories: `contraction`, `linking`, `elision`, `weak_form`, `similar_words`, `spelling`, `missed`
   - Uses regex patterns like `/\b(you're|i'm|we're)\b/` for contractions
   - Uses hardcoded word lists for similar words: `['a', 'the'], ['an', 'a']`

3. **Pattern Matching** (lines 469-524):
   - If category is `weak_form`, `missed`, or `spelling`:
     - Calls `matchListeningPattern()` from `lib/listeningPatternMatcher.ts`
     - Matches against `LISTENING_PATTERNS` array (local) or Supabase patterns
     - Returns: `soundRule`, `tip`, `chunkDisplay`, `reducedForm`
   - **Pattern matching is OPTIONAL** - falls back to template-based if no match

4. **Template-Based Generation** (if no pattern match):
   - `generateHeardAs()` (lines 214-260) - **Hardcoded mappings**:
     ```typescript
     if (lower.includes('want to')) return "wanna"
     if (lower.includes('going to')) return "gonna"
     if (lower === 'the') return "thuh"
     ```
   - `generateSoundRule()` (lines 265-284) - **Template strings**:
     ```typescript
     case 'contraction':
       return `Contractions blend two words. "${phrase}" often sounds like "${heardAs}" in fast speech.`
     ```
   - `generateExtraExample()` (lines 290-320) - **Hardcoded examples**:
     ```typescript
     const examples: Record<string, string> = {
       'later': "I'll see you later.",
       'you\'re': "You're doing great!",
     }
     ```

5. **Meaning Extraction** (lines 601-620):
   - **3-layer system**: `meaningApproved` > `meaningGeneral` > `parentMeaningGeneral`
   - Extracted from matched `ListeningPattern` object
   - If no pattern matched → `meaningInContext = ''` (empty string)

6. **Output:** `PracticeStep[]` with structure:
   ```typescript
   {
     id, target, actualSpan, refStart, refEnd, type, category,
     meaningInContext, soundRule, inSentence: { original, highlighted, heardAs, chunkDisplay },
     extraExample, tip, explainAllowed
   }
   ```

### Step 5: UI Rendering

**File:** `components/PhraseCard.tsx`

**What it displays:**
- Category badge (from `getCategoryLabel()` - lines 23-35)
- `meaningInContext` (or Action Hint if empty)
- `soundRule` (how it sounds explanation)
- `inSentence.original` (full sentence with highlight)
- `inSentence.heardAs` (phonetic representation)
- `extraExample` (optional transfer example)
- `tip` (optional listening tip)

## 2. Feedback Granularity

### Current System: **Hybrid Token + Category Level**

**Token-Level:**
- Alignment engine works at word/token level
- Each `AlignmentEvent` represents a single word or phrase span
- `refStart`, `refEnd` indices are token positions

**Category-Level:**
- Categories are assigned per error event (`contraction`, `linking`, etc.)
- Category detection uses **hardcoded regex patterns** and **word lists**
- Categories are **NOT** keyed on sentence structure

**Pattern-Level (Partial):**
- Pattern matching exists but is **optional**
- Only used for `weak_form`, `missed`, `spelling` categories
- Falls back to template-based generation if no pattern match

## 3. Where Feedback Text/Explanation is Decided

### A) Category Detection (Hardcoded)
**File:** `lib/practiceSteps.ts` lines 131-209
- Regex patterns: `/\b(you're|i'm|we're)\b/` for contractions
- Hardcoded word lists: `['a', 'the'], ['an', 'a']` for similar words
- Function word detection: `FUNCTION_WORDS` Set (lines 105-111)

### B) HeardAs Generation (Hardcoded Mappings)
**File:** `lib/practiceSteps.ts` lines 214-260
- Direct string mappings: `"want to" → "wanna"`, `"the" → "thuh"`
- No pattern lookup - pure hardcoded if/else

### C) Sound Rule Templates (Template Strings)
**File:** `lib/practiceSteps.ts` lines 265-284
- Switch statement with template strings per category
- Example: `"Contractions blend two words. "${phrase}" often sounds like "${heardAs}" in fast speech."`

### D) Pattern-Based (Optional, Data-Driven)
**File:** `lib/listeningPatternMatcher.ts`
- Matches against `LISTENING_PATTERNS` array (lines 22-143 in `lib/listeningPatterns.ts`)
- Returns `howItSounds`, `tip`, `chunkDisplay` from pattern object
- **Only used if pattern matches** - otherwise falls back to templates

### E) Meaning Extraction (Pattern-Based)
**File:** `lib/practiceSteps.ts` lines 601-620
- Extracted from matched `ListeningPattern.meaningApproved` or `meaningGeneral`
- **Requires pattern match** - if no match, `meaningInContext = ''`

### F) Extra Examples (Hardcoded Dictionary)
**File:** `lib/practiceSteps.ts` lines 290-320
- Hardcoded `Record<string, string>` mapping
- Only ~10 examples defined

## 4. Data Structures Controlling Feedback

### Primary: `PracticeStep` / `FeedbackItem`
**File:** `lib/practiceSteps.ts` lines 17-49

```typescript
interface FeedbackItem {
  id: string
  target: string                    // The word/phrase (expectedSpan)
  actualSpan?: string               // What user heard/typed
  refStart: number                  // Token indices
  refEnd: number
  type: 'missing' | 'substitution' | 'extra'
  category: FeedbackCategory        // ← KEY: Determines explanation type
  meaningInContext: string          // ← From pattern or empty
  soundRule: string                 // ← From pattern or template
  inSentence: {
    original: string
    highlighted: string
    heardAs: string                 // ← From pattern or hardcoded mapping
    chunkDisplay?: string           // ← From pattern only
    reducedForm?: string            // ← From pattern only
  }
  extraExample?: { sentence: string; heardAs?: string }
  tip?: string                      // ← From pattern only
  explainAllowed: boolean
}
```

### Secondary: `ListeningPattern`
**File:** `lib/listeningPatterns.ts` lines 6-20

```typescript
interface ListeningPattern {
  id: string
  words: string[]            // ["went", "to", "the"]
  chunkDisplay: string       // "went-to-the"
  reducedForm?: string       // "wanna"
  howItSounds: string       // Explanation text
  tip?: string
  meaningGeneral?: string   // Layer 2 meaning
  meaningApproved?: string  // Layer 1 meaning
  parentPatternKey?: string // For fallback
}
```

**Key Point:** Patterns are **optional** - system works without them using templates.

### Tertiary: `AlignmentEvent`
**File:** `lib/alignmentEngine.ts` lines 19-44

```typescript
interface AlignmentEvent {
  eventId: string
  type: 'substitution' | 'missing' | 'extra'
  refStart: number
  refEnd: number
  expectedSpan: string
  actualSpan?: string
  phraseHint?: { spanText: string; ... }
}
```

## 5. Reusable vs Tightly Coupled

### Reusable Components:
1. **Alignment Engine** (`lib/alignmentEngine.ts`)
   - Pure token-level diff algorithm
   - No sentence-specific logic
   - ✅ Fully reusable

2. **Pattern Matcher** (`lib/listeningPatternMatcher.ts`)
   - Generic pattern matching by word sequence
   - ✅ Reusable for any pattern set

3. **Pattern Data** (`lib/listeningPatterns.ts`)
   - JSON array of patterns
   - ✅ Can be loaded from Supabase or local

### Tightly Coupled to Sentences:
1. **Category Detection** (`detectCategory()`)
   - Hardcoded regex patterns: `/\b(you're|i'm|we're)\b/`
   - Hardcoded word lists: `['a', 'the']`
   - ❌ Not sentence-specific but **phrase-specific** (works on any phrase)

2. **HeardAs Generation** (`generateHeardAs()`)
   - Hardcoded string mappings: `"want to" → "wanna"`
   - ❌ Works on phrases, not sentences, but **hardcoded**

3. **Sound Rule Templates** (`generateSoundRule()`)
   - Template strings with placeholders
   - ✅ Reusable per category (not sentence-specific)

4. **Extra Examples** (`generateExtraExample()`)
   - Hardcoded dictionary of ~10 examples
   - ❌ Very limited, not sentence-specific

## 6. Current System Classification

### Answer: **B) Pattern-Based (Partial/Hybrid)**

**Evidence:**
- Pattern matching exists and is used (`matchListeningPattern()`)
- Patterns stored in data structure (`ListeningPattern[]`)
- Pattern matching returns `soundRule`, `tip`, `chunkDisplay`, `reducedForm`
- Meaning extracted from patterns (`meaningGeneral`, `meaningApproved`)

**However:**
- Pattern matching is **optional** - only for `weak_form`, `missed`, `spelling`
- Falls back to **hardcoded templates** if no pattern match
- Category detection is **hardcoded regex** (not pattern-based)
- HeardAs generation is **hardcoded mappings** (not pattern-based)

**Conclusion:** System is **transitioning toward pattern-based** but still heavily relies on hardcoded templates and regex.

## 7. Conflicts with Pattern-Based (Feature-Key) System

### Major Conflicts:

1. **Category Detection is Hardcoded** (lines 131-209)
   - Uses regex: `/\b(you're|i'm|we're)\b/` for contractions
   - Uses word lists: `['a', 'the']` for similar words
   - **Conflict:** Should be determined by pattern `category` field, not regex

2. **HeardAs Generation is Hardcoded** (lines 214-260)
   - Direct mappings: `"want to" → "wanna"`, `"the" → "thuh"`
   - **Conflict:** Should come from pattern `reducedForm` or `heardAs` field

3. **Sound Rule Templates** (lines 265-284)
   - Template strings per category
   - **Conflict:** Should come from pattern `howItSounds` field (already partially does)

4. **Pattern Matching is Optional** (lines 469-524)
   - Only used for `weak_form`, `missed`, `spelling`
   - Other categories (`contraction`, `linking`, `elision`) skip pattern matching
   - **Conflict:** All categories should use pattern matching

5. **Extra Examples are Hardcoded** (lines 290-320)
   - Dictionary of ~10 examples
   - **Conflict:** Should come from pattern `extraExample` field

6. **Category → Pattern Dependency is Backwards**
   - Current: Detect category → Try pattern match
   - Pattern-based: Match pattern → Get category from pattern

## 8. Minimal Refactor to Move Toward Pattern-Based

### Goal: Make pattern matching **primary**, templates **fallback only**

### Changes Required:

#### A) Make Pattern Matching Primary (Not Optional)

**File:** `lib/practiceSteps.ts` lines 469-524

**Current:**
```typescript
// Pattern matching only for weak_form, missed, spelling
if ((category === 'weak_form' || category === 'missed' || category === 'spelling') && isEligibleForPatternMatching(target, patterns)) {
  const patternMatch = matchListeningPattern(...)
  // ...
}
```

**Change to:**
```typescript
// Try pattern matching FIRST for ALL categories
if (isEligibleForPatternMatching(target, patterns)) {
  const patternMatch = matchListeningPattern(firstTargetToken, refTokens, targetIndex, patterns)
  if (patternMatch) {
    // Use pattern data: soundRule, tip, chunkDisplay, reducedForm
    // Get category from pattern.category (if exists) or keep detected category
    soundRule = patternMatch.soundRule
    tip = patternMatch.tip ?? tip
    chunkDisplay = patternMatch.chunkDisplay
    reducedForm = patternMatch.reducedForm
    // If pattern has category field, use it instead of detected category
    if (patternMatch.pattern.category) {
      category = patternMatch.pattern.category
    }
  }
}
// Fallback to templates only if NO pattern match
```

#### B) Add Category to Pattern Data Structure

**File:** `lib/listeningPatterns.ts` line 6

**Add:**
```typescript
interface ListeningPattern {
  // ... existing fields
  category?: FeedbackCategory  // ← NEW: Category from pattern, not regex
}
```

**Update patterns:**
```typescript
{
  id: 'want-to',
  words: ['want', 'to'],
  category: 'linking',  // ← NEW
  chunkDisplay: 'want to',
  reducedForm: 'wanna',
  howItSounds: '...',
}
```

#### C) Move HeardAs to Pattern (Remove Hardcoded Mappings)

**File:** `lib/listeningPatterns.ts`

**Add:**
```typescript
interface ListeningPattern {
  // ... existing fields
  heardAs?: string  // ← NEW: Phonetic representation
}
```

**File:** `lib/practiceSteps.ts` lines 461

**Change:**
```typescript
// BEFORE: Hardcoded generateHeardAs()
const heardAs = generateHeardAs(target, category)

// AFTER: Get from pattern or fallback
let heardAs: string
if (patternMatch?.reducedForm) {
  heardAs = patternMatch.reducedForm
} else if (patternMatch?.pattern.heardAs) {
  heardAs = patternMatch.pattern.heardAs
} else {
  heardAs = generateHeardAs(target, category) // Fallback only
}
```

#### D) Remove Category Detection for Pattern-Matched Items

**File:** `lib/practiceSteps.ts` lines 450-460

**Change:**
```typescript
// Try pattern match FIRST
let category: FeedbackCategory
let patternMatch = null

if (isEligibleForPatternMatching(target, patterns)) {
  patternMatch = matchListeningPattern(...)
  if (patternMatch && patternMatch.pattern.category) {
    category = patternMatch.pattern.category  // Use pattern category
  } else {
    category = detectCategory(target, actualSpan)  // Fallback to regex
  }
} else {
  category = detectCategory(target, actualSpan)  // No pattern, use regex
}
```

#### E) Add Extra Examples to Patterns

**File:** `lib/listeningPatterns.ts`

**Add:**
```typescript
interface ListeningPattern {
  // ... existing fields
  extraExample?: { sentence: string; heardAs?: string }  // ← NEW
}
```

**File:** `lib/practiceSteps.ts` lines 462

**Change:**
```typescript
// BEFORE: Hardcoded generateExtraExample()
const extraExample = generateExtraExample(target, category)

// AFTER: Get from pattern or fallback
let extraExample = patternMatch?.pattern.extraExample ?? generateExtraExample(target, category)
```

### Summary of Changes:

1. **Make pattern matching primary** (not optional) - ~20 lines
2. **Add `category` field to `ListeningPattern`** - ~5 lines
3. **Add `heardAs` field to `ListeningPattern`** - ~5 lines
4. **Add `extraExample` field to `ListeningPattern`** - ~5 lines
5. **Reorder logic: pattern match → category detection** - ~10 lines
6. **Update pattern data** - Add fields to existing patterns

**Total:** ~45 lines of code changes + pattern data updates

**Risk:** Low - templates remain as fallback, backward compatible

**Files Modified:**
- `lib/practiceSteps.ts` (main logic changes)
- `lib/listeningPatterns.ts` (add fields to interface + update patterns)
- `lib/listeningPatternMatcher.ts` (no changes needed)

