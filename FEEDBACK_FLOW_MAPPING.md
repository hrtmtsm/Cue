# Feedback Flow & Logic End-to-End Mapping

## 1. Flow Diagrams

### Diagnostic Flow
```
/onboarding/diagnosis
  ↓ (user submits answer)
  POST /api/check-answer
    Input: { transcript, userText, skipped? }
    Output: { accuracyPercent, refTokens, userTokens, events, stats }
    localStorage: none (stateless API)
  ↓
  extractPracticeSteps() in diagnosis page
    Input: events, refTokens, userTokens, maxSteps=10, transcript, patterns=undefined
    Output: PracticeStep[] with category, soundRule, meaningInContext, etc.
    localStorage: none (in-memory only)
  ↓
  Map FeedbackCategory → DiagnosticCategory
    weak_form → weak_forms
    linking → linking
    elision → reductions
    contraction → reductions
    spelling → spelling
    speed_chunking → speed
    similar_words → idioms
    missed → missed
  ↓
  storeDiagnosticResult()
    Input: { clipId, accuracyPercent, categories: DiagnosticCategory[] }
    localStorage: 'diagnosticResults' (array)
  ↓
  (after 3 clips complete)
  completeDiagnostic()
    Input: { expectedCount: 3, onboardingCefr }
    Calls: buildDiagnosticSummary()
    Output: DiagnosticSummary { cefr, avgAccuracyPercent, categoryScore, weaknessRank }
    localStorage: 'diagnosticSummary' (object)
  ↓
  Navigate to /onboarding/situations
```

### Normal Practice Flow
```
/practice/respond
  ↓ (user submits answer)
  POST /api/check-answer
    Input: { transcript, userText, skipped? }
    Output: { accuracyPercent, refTokens, userTokens, events, stats }
    localStorage: none
  ↓
  Navigate to /practice/review?storyId=...&clipId=...&userText=...
  ↓
  Review page useEffect
    Calls: POST /api/check-answer (same as above)
    Receives: diffResult { accuracyPercent, refTokens, userTokens, events, tokens }
  ↓
  extractPracticeSteps() in review page
    Input: events, refTokens, userTokens, maxSteps=10, transcript, patterns=undefined
    Output: PracticeStep[] (same structure as diagnostic)
    localStorage: none (in-memory only)
  ↓
  pickTopIssue() from reviewSummary.ts
    Input: tokens, events, refTokens, refText, userText, accuracyPercent
    Output: ReviewSummary { categoryId, title, examplePhrase, phrasesToPractice }
    Uses: IssueCategory (words_blended, casual_shortcuts, brain_filled_in, key_words_hard, speed_fast)
    localStorage: none
  ↓
  Render review UI:
    - Accuracy % + progress bar
    - Summary card with pickTopIssue() result (ONE insight)
    - "Compared to what you heard" diff view
    - Collapsible "Why this was hard" (generates 1-3 bullets from events)
    - Continue button → /practice/[clipId]/practice
  ↓
  /practice/[clipId]/practice
    Loads practiceSteps from sessionStorage (stored in review page)
    Renders PhraseCard for each step
    Shows: meaningInContext, soundRule, inSentence, extraExample, tip
    Category badge shown: YES (getCategoryLabel() converts category to display text)
```

## 2. Step-by-Step File/Function Mapping

### Step 1: User Submission
**Files:**
- `app/onboarding/diagnosis/page.tsx` (diagnostic)
- `app/(app)/practice/respond/page.tsx` (normal practice)

**Functions:**
- `handleSubmit()` in diagnosis page
- `handleCheckAnswer()` in respond page

**Inputs:**
- `userInput` (string from textarea)
- `currentClip.transcript` (reference text)
- `skipped` (boolean flag)

**Outputs:**
- POST request to `/api/check-answer`
- Navigation to review page with query params

**localStorage:**
- None at this step

---

### Step 2: Alignment API
**File:** `app/api/check-answer/route.ts`

**Function:** `POST(request: NextRequest)`

**Inputs:**
- `body.userText` or `body.userAnswer`
- `body.transcript` or `body.correctAnswer`
- `body.skipped` (optional)

**Outputs:**
- `{ accuracyPercent, refTokens, userTokens, events, stats, transcript, userText }`
- If skipped: returns `{ accuracyPercent: 0, events: [], ... }`

**localStorage:**
- None (stateless API)

**Key Logic:**
- Calls `alignTexts(transcript, userText)` from `alignmentEngine.ts`
- Calls `attachPhraseSpans(base)` from `phraseSpans.ts`
- Calculates accuracy: `correct / (correct + substitutions + missing) * 100`

---

### Step 3: Practice Steps Generation
**File:** `lib/practiceSteps.ts`

**Function:** `extractPracticeSteps(events, refTokens, userTokens, maxSteps, fullTranscript, patterns?)`

**Inputs:**
- `events: AlignmentEvent[]` (from alignment API)
- `refTokens: string[]` (reference sentence tokens)
- `userTokens: string[]` (user input tokens)
- `maxSteps: number` (default 5, diagnostic uses 10)
- `fullTranscript?: string` (optional full sentence)
- `patterns?: ListeningPattern[]` (optional, falls back to local LISTENING_PATTERNS)

**Outputs:**
- `PracticeStep[]` with structure:
  ```typescript
  {
    id: string
    target: string                    // Expected phrase
    actualSpan?: string               // What user typed
    category: FeedbackCategory         // weak_form | linking | elision | etc.
    explainAllowed: boolean           // Eligibility gate for explanations
    meaningInContext: string          // What it means (from patterns or empty)
    soundRule: string                 // How it sounds (from patterns or generated)
    inSentence: {
      original: string                // Full sentence
      highlighted: string             // Target phrase
      heardAs: string                 // Phonetic representation
      chunkDisplay?: string           // Pattern-based chunk (e.g., "went-to-the")
      reducedForm?: string            // Phonetic reduction (e.g., "wanna")
      parentChunkDisplay?: string     // Parent pattern for fallback
    }
    extraExample?: { sentence, heardAs }
    tip?: string
  }
  ```

**localStorage:**
- None (in-memory only)

**Key Logic:**
1. **Category Detection** (`detectCategory()`):
   - Hardcoded rules in `practiceSteps.ts`:
     - Contractions: regex match `/\b(you're|i'm|...)\b/`
     - Linking: regex match `/\b(want to|going to|...)\b/`
     - Elision: string includes `'going to'` or `'want to'`
     - Weak forms: checks `containsOnlyFunctionWords()` (function words only)
     - Similar words: hardcoded pairs `['a', 'the'], ['your', 'you're'], ...`
     - Spelling: edit distance ≤ 1 for words ≤ 6 chars
     - Default: `'missed'`

2. **Pattern Matching** (`matchListeningPattern()`):
   - **Data-driven**: Uses `ListeningPattern[]` from:
     - Supabase `listening_patterns` table (if provided via API)
     - Fallback: local `LISTENING_PATTERNS` in `lib/listeningPatterns.ts`
   - Matches by: `words` array, `chunkDisplay`, `patternKey`, or `id`
   - Returns: `{ pattern, soundRule, tip, chunkDisplay, reducedForm }`

3. **Meaning Extraction** (3-layer system):
   - Layer 1: `meaningApproved` (if `meaningStatus === 'approved'`)
   - Layer 2: `meaningGeneral` (if `meaningStatus === 'general'`)
   - Layer 3: `parentMeaningGeneral` (if parent exists)
   - Layer 4: empty string (UI shows "Action Hint" instead)

4. **Sound Rule Generation**:
   - **Data-driven**: From matched pattern's `howItSounds` field
   - **Fallback**: Hardcoded `generateSoundRule()` based on category
   - Examples:
     - Contraction: `"Contractions blend two words. "${phrase}" often sounds like "${heardAs}" in fast speech."`
     - Linking: `"Words link together at boundaries. "${phrase}" blends into "${heardAs}" when spoken quickly."`

5. **HeardAs Generation**:
   - **Hardcoded**: `generateHeardAs()` function with lookup table:
     - Contractions: `"you're" → "yer"`, `"i'm" → "im"`
     - Linking: `"want to" → "wanna"`, `"going to" → "gonna"`
     - Weak forms: `"the" → "thuh"`, `"to" → "ta"`

**Where "Why it's hard" explanations come from:**
- **Primary source**: `ListeningPattern.howItSounds` (data-driven from Supabase or local)
- **Fallback**: `generateSoundRule()` (hardcoded in `practiceSteps.ts`)
- **Meaning**: `ListeningPattern.meaningApproved` or `meaningGeneral` (data-driven)
- **Parent fallback**: `parentMeaningGeneral` or `parentChunkDisplay` (for spelling cases like "gonna")

---

### Step 4: Diagnostic Category Mapping
**Files:**
- `app/onboarding/diagnosis/page.tsx` (lines 367-387)
- `app/(app)/practice/review/page.tsx` (lines 430-450)

**Function:** `mapToDiagnosticCategory(category: FeedbackCategory): DiagnosticCategory`

**Mapping:**
- `weak_form` → `weak_forms`
- `linking` → `linking`
- `elision` → `reductions`
- `contraction` → `reductions`
- `spelling` → `spelling`
- `speed_chunking` → `speed`
- `similar_words` → `idioms`
- `missed` → `missed`

**localStorage:**
- `storeDiagnosticResult()` writes to `'diagnosticResults'` (array)

---

### Step 5: Diagnostic Summary Building
**File:** `lib/diagnosticSummary.ts`

**Function:** `buildDiagnosticSummary({ results, onboardingCefr })`

**Inputs:**
- `results: DiagnosticResult[]` (from localStorage)
- `onboardingCefr: CefrLevel` (from onboardingData.level)

**Outputs:**
- `DiagnosticSummary`:
  ```typescript
  {
    version: 1
    createdAt: string
    cefr: CefrLevel
    avgAccuracyPercent: number
    categoryScore: Record<FeedbackCategory, number>  // 0..1, lower = weaker
    weaknessRank: DiagnosticCategory[]              // Sorted by score ascending
  }
  ```

**localStorage:**
- `storeDiagnosticSummary()` writes to `'diagnosticSummary'` (object)

**Key Logic:**
1. Counts `DiagnosticCategory` occurrences (capped at 3 per clip per category)
2. Maps to `FeedbackCategory` counts via `mapDiagnosticCategoryToFeedbackCategory()`
3. Calculates `categoryScore[cat] = 1 - (count[cat] / totalErrors)`
4. Sorts `weaknessRank` by score ascending (weakest first)

---

### Step 6: Review UI Rendering
**File:** `app/(app)/practice/review/page.tsx`

**Functions:**
- `pickTopIssue()` from `lib/reviewSummary.ts` (generates summary card)
- Inline bullet generation (lines 860-900) for "Why this was hard"

**Where 1-line explanation text is generated:**

1. **Summary Card** (main insight):
   - **Source**: `pickTopIssue()` in `lib/reviewSummary.ts`
   - **Categories**: `IssueCategory` (words_blended, casual_shortcuts, brain_filled_in, key_words_hard, speed_fast)
   - **Titles**: Hardcoded strings:
     - `'words_blended'`: "You tended to miss phrases when words were spoken together."
     - `'casual_shortcuts'`: "It was hardest when casual shortcuts were used in fast speech."
     - `'brain_filled_in'`: "Your brain often filled in extra words when the audio was unclear."
     - `'key_words_hard'`: "Some key words were hard to catch in fast speech."
     - `'speed_fast'`: "The speed felt fast, making it harder to catch every word."
   - **Example phrase**: Extracted from `refTokens` around error spans (2-5 words)

2. **"Why this was hard" bullets** (collapsible section):
   - **Source**: Inline logic in review page (lines 860-900)
   - **Hardcoded text**:
     - Missing: "Some phrases blended together when words were spoken quickly."
     - Substitution: "Some words can sound similar when spoken in fast speech."
     - Extra: "Your brain sometimes fills in extra words when the audio is unclear."
   - **Example**: Extracted from `events[].expectedSpan` or `refTokens.slice(refStart, refEnd)`

**Where category labels are decided:**

- **Review page**: Does NOT show `FeedbackCategory` labels (only `IssueCategory` from `pickTopIssue()`)
- **Practice page**: Shows `FeedbackCategory` labels via `getCategoryLabel()` in `components/PhraseCard.tsx`:
  ```typescript
  weak_form → 'Weak form'
  linking → 'Linking'
  elision → 'Elision'
  contraction → 'Contraction'
  similar_words → 'Similar words'
  spelling → 'Spelling'
  missed → 'Missed'
  speed_chunking → 'Speed & chunking'
  ```

**Are category names shown to user?**
- **Review page**: NO (uses `IssueCategory` labels, not `FeedbackCategory`)
- **Practice page**: YES (shows category badge via `getCategoryLabel()`)

---

### Step 7: Practice Page Rendering
**File:** `app/(app)/practice/[clipId]/practice/page.tsx`

**Component:** `PhraseCard` from `components/PhraseCard.tsx`

**Renders:**
- Category badge (visible to user)
- `meaningInContext` (or "Action Hint" if empty)
- `soundRule` (how it sounds explanation)
- `inSentence.original` (full sentence)
- `inSentence.highlighted` (target phrase)
- `inSentence.heardAs` (phonetic representation)
- `inSentence.chunkDisplay` (if pattern matched, e.g., "went-to-the")
- `inSentence.reducedForm` (if pattern matched, e.g., "wanna")
- `extraExample` (optional transfer example)
- `tip` (optional listening tip)

**Where explanations come from:**
- `meaningInContext`: Pattern's `meaningApproved` or `meaningGeneral` (data-driven) or empty (hardcoded fallback)
- `soundRule`: Pattern's `howItSounds` (data-driven) or `generateSoundRule()` (hardcoded fallback)
- `heardAs`: Pattern's `reducedForm` (data-driven) or `generateHeardAs()` (hardcoded fallback)
- `chunkDisplay`: Pattern's `chunkDisplay` (data-driven)
- `tip`: Pattern's `tip` (data-driven) or `generateTip()` (hardcoded fallback)

---

## 3. Category Taxonomy

### FeedbackCategory (used in practiceSteps)
**Defined in:** `lib/practiceSteps.ts` (lines 7-15)

```typescript
type FeedbackCategory = 
  | 'weak_form'      // Function words reduced (the, to, and → thuh, ta, n)
  | 'linking'        // Words blend at boundaries (want to → wanna)
  | 'elision'        // Sounds dropped (going to → gonna)
  | 'contraction'    // Contractions (you're → yer, I'm → im)
  | 'similar_words'  // Phonetically similar words (a/the, your/you're)
  | 'spelling'       // Spelling/typo errors (1-char edit distance)
  | 'missed'         // Generic missed content
  | 'speed_chunking' // Fast speech chunking
```

**Detection:** Hardcoded rules in `detectCategory()` function

**Used for:**
- Practice step categorization
- Diagnostic category mapping
- UI category badges (practice page only)

---

### DiagnosticCategory (used in diagnostic summary)
**Defined in:** `lib/diagnosticSummary.ts` (lines 11-18)

```typescript
type DiagnosticCategory = 
  | 'weak_forms' 
  | 'reductions' 
  | 'linking' 
  | 'speed' 
  | 'idioms' 
  | 'spelling' 
  | 'missed'
```

**Mapping from FeedbackCategory:**
- `weak_form` → `weak_forms`
- `elision` + `contraction` → `reductions`
- `linking` → `linking`
- `speed_chunking` → `speed`
- `similar_words` → `idioms`
- `spelling` → `spelling`
- `missed` → `missed`

**Used for:**
- Diagnostic result storage
- `weaknessRank` calculation
- Feed API personalization (via `weaknessRank[0]`)

---

### IssueCategory (used in review summary)
**Defined in:** `lib/reviewSummary.ts` (lines 3-9)

```typescript
type IssueCategory = 
  | 'words_blended' 
  | 'casual_shortcuts'
  | 'brain_filled_in'
  | 'key_words_hard'
  | 'speed_fast'
```

**Detection:** `pickTopIssue()` function analyzes tokens/events to pick strongest signal

**Used for:**
- Review page summary card (ONE insight)
- NOT used for personalization

---

## 4. Personalization Usage

### What's Used for Feed Ranking

**File:** `app/(app)/practice/select/page.tsx` (lines 201-260)

**Signals:**
1. **`weaknessRank`** (from `diagnosticSummary`):
   - Used in API call: `params.append('weakness', diagnosticSummary.weaknessRank.join(','))`
   - Used in local sorting: +30 points if story focusAreas match top 3 `weaknessRank` categories
   - **Source**: `DiagnosticCategory[]` from diagnostic summary

2. **`situations[0]`** (from `onboardingData`):
   - Used in API call: `params.append('situation', situation)`
   - Used in local sorting: +50 points if story matches selected situations
   - **Source**: `SituationKey[]` from onboarding

3. **`cefr`** (from `diagnosticSummary`):
   - Used in API call: `params.append('cefr', diagnosticSummary.cefr)`
   - **Source**: `onboardingData.level` mapped to CEFR

**NOT used:**
- `categoryScore` (only used internally for `weaknessRank` calculation)
- `listeningDifficulties` (legacy, not used)
- `patternKey` (only used for pattern matching, not personalization)

---

### What's Used for Onboarding Summary

**File:** `lib/diagnosticSummary.ts`

**Stored:**
- `categoryScore: Record<FeedbackCategory, number>` (0..1, lower = weaker)
- `weaknessRank: DiagnosticCategory[]` (sorted by score ascending)
- `avgAccuracyPercent: number`
- `cefr: CefrLevel`

**Used:**
- `weaknessRank` → Feed API and local sorting
- `cefr` → Feed API difficulty filtering
- `categoryScore` → Only used to calculate `weaknessRank` (not exposed)

**NOT used:**
- `listeningDifficulties` (legacy, not used in MVP)

---

## 5. Hardcoded vs Data-Driven

### Hardcoded (in code)
1. **Category detection rules** (`detectCategory()` in `practiceSteps.ts`):
   - Contraction regex patterns
   - Linking regex patterns
   - Elision string matching
   - Weak form function word list
   - Similar word pairs
   - Spelling edit distance threshold

2. **HeardAs generation** (`generateHeardAs()` in `practiceSteps.ts`):
   - Contraction mappings: `"you're" → "yer"`
   - Linking mappings: `"want to" → "wanna"`
   - Weak form mappings: `"the" → "thuh"`

3. **Sound rule fallbacks** (`generateSoundRule()` in `practiceSteps.ts`):
   - Template strings per category

4. **Review summary titles** (`pickTopIssue()` in `reviewSummary.ts`):
   - Hardcoded `IssueCategory` titles

5. **"Why this was hard" bullets** (review page inline):
   - Hardcoded explanation text

---

### Data-Driven (from Supabase or local patterns)
1. **Pattern matching** (`matchListeningPattern()`):
   - **Primary**: Supabase `listening_patterns` table (via API)
   - **Fallback**: Local `LISTENING_PATTERNS` in `lib/listeningPatterns.ts`

2. **Meaning explanations**:
   - `meaningApproved` (Supabase `meaning_approved` column)
   - `meaningGeneral` (Supabase `meaning_general` column)
   - `parentMeaningGeneral` (Supabase parent pattern)

3. **Sound rules** (when pattern matched):
   - `howItSounds` (Supabase `how_it_sounds` column or local pattern)

4. **Tips**:
   - `tip` (Supabase `tip` column or local pattern)

5. **Chunk display**:
   - `chunkDisplay` (Supabase `chunk_display` column or local pattern)

6. **Reduced forms**:
   - `reducedForm` (Supabase `reduced_form` column or local pattern)

---

## 6. Refactor Plan

### Goal
Separate:
- **A) Pedagogical explanation layer** (can use categories)
- **B) Personalization signals** (MVP: only `missedRate` + `attemptAccuracy` + `startingDifficulty`)

### Current Problems
1. **Categories used for both explanation AND personalization**:
   - `FeedbackCategory` → `DiagnosticCategory` → `weaknessRank` → Feed API
   - Categories are pedagogical (weak_form, linking) but used for content selection

2. **Complex category taxonomy**:
   - 3 different category systems: `FeedbackCategory`, `DiagnosticCategory`, `IssueCategory`
   - Mapping between them is lossy and hardcoded

3. **Hardcoded detection rules**:
   - Category detection is brittle (regex patterns, string matching)
   - Not data-driven or learnable

4. **Personalization relies on pedagogical categories**:
   - Feed uses `weaknessRank` (derived from `FeedbackCategory`)
   - But categories are for explanation, not content difficulty

---

### Proposed Refactor

#### A) Pedagogical Explanation Layer (Keep Categories)
**Keep as-is:**
- `FeedbackCategory` for practice step explanations
- `IssueCategory` for review summary
- Pattern matching for explanations (data-driven)
- Category detection for UI labels

**Changes:**
- Remove category → personalization mapping
- Keep categories ONLY for explanation/UI

---

#### B) Personalization Signals (New Simple System)
**Replace `weaknessRank` with:**
1. **`missedRate`**: `(missing + substitutions) / totalTokens` (0..1)
2. **`attemptAccuracy`**: `accuracyPercent / 100` (0..1)
3. **`startingDifficulty`**: `onboardingCefr` mapped to numeric (A1=1, A2=2, B1=3, B2=4)

**Feed API changes:**
- Remove `weakness` parameter
- Add `missedRate` and `attemptAccuracy` parameters
- Server filters by: `cefr <= userCefr` AND `(clipDifficulty <= missedRate + 1)` (allow one step easier)

**Local sorting changes:**
- Remove `weaknessRank` matching (+30 points)
- Keep `situations` matching (+50 points)
- Add difficulty matching: +20 points if clip difficulty matches `startingDifficulty`

---

### What to Change Today (Concrete Edits)

#### 1. Remove category → personalization mapping
**Files:**
- `app/(app)/practice/select/page.tsx` (lines 230-260)
- `app/api/clips/feed/route.ts` (remove `weakness` parameter)

**Changes:**
- Remove `weaknessRank` from feed API call
- Remove `weaknessRank` matching in local sorting
- Keep `situations` matching only

#### 2. Add simple personalization signals
**Files:**
- `lib/diagnosticSummary.ts`
- `app/(app)/practice/select/page.tsx`

**Changes:**
- Add `missedRate` and `attemptAccuracy` to `DiagnosticSummary`
- Pass to feed API instead of `weaknessRank`
- Update local sorting to use difficulty matching

#### 3. Keep categories for explanation only
**Files:**
- `lib/practiceSteps.ts` (no changes)
- `components/PhraseCard.tsx` (no changes)
- `app/(app)/practice/review/page.tsx` (no changes)

**Changes:**
- None (categories stay for UI/explanation)

---

### What to Log Only (Future Work)

1. **Category usage analytics**:
   - Log which categories appear most often
   - Log category → accuracy correlation
   - Use for future personalization research

2. **Pattern matching effectiveness**:
   - Log pattern match rate
   - Log pattern → meaning availability
   - Use to prioritize pattern seeding

3. **Personalization signal correlation**:
   - Log `missedRate` vs clip difficulty
   - Log `attemptAccuracy` vs clip difficulty
   - Use to refine difficulty matching algorithm

4. **Category taxonomy simplification**:
   - Research if `FeedbackCategory` can be simplified
   - Consider merging `elision` + `contraction` → `reductions`
   - Consider removing `speed_chunking` (map to `missed`)

---

## Summary

**Current State:**
- Categories used for BOTH explanation AND personalization
- 3 category systems with complex mappings
- Hardcoded detection rules + data-driven patterns
- Personalization relies on pedagogical categories

**Proposed State:**
- Categories ONLY for explanation/UI
- Simple personalization: `missedRate` + `attemptAccuracy` + `startingDifficulty`
- Remove category → personalization mapping
- Keep pattern matching for explanations (data-driven)

**MVP Changes:**
1. Remove `weaknessRank` from feed API
2. Add `missedRate` and `attemptAccuracy` to diagnostic summary
3. Update feed API to use simple signals
4. Update local sorting to use difficulty matching
5. Keep categories for explanation only (no changes needed)

