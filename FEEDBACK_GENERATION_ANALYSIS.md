# Feedback Generation Logic - Current Implementation Analysis

## 1. Files Involved in Feedback Generation

### Core API & Processing
- **`app/api/check-answer/route.ts`** - Main API endpoint that processes user input
- **`lib/alignmentEngine.ts`** - Performs word-level alignment (Levenshtein distance algorithm)
- **`lib/semanticEvaluator.ts`** - Evaluates semantic understanding (meaning-based scoring)
- **`lib/errorClassifier.ts`** - Classifies errors by perceptual cause (6 categories)
- **`lib/dataDrivenFeedback.ts`** - Generates feedback text from error analysis
- **`lib/reviewSummary.ts`** - Picks top issue category and extracts example phrases
- **`lib/feedbackEngine.ts`** - Legacy feedback engine (partially used)

### UI Components
- **`app/[locale]/(app)/practice/respond/page.tsx`** - User input page (sends userText to review)
- **`app/[locale]/(app)/practice/review/page.tsx`** - Review page that displays feedback
- **`app/[locale]/(app)/practice/review/page.tsx`** (lines 1082-1158) - Renders feedback sections

### Supporting Utilities
- **`lib/phraseSpans.ts`** - Attaches phrase spans to alignment tokens
- **`lib/practiceSteps.ts`** - Extracts practice steps from alignment events
- **`lib/mistakePrioritization.ts`** - Prioritizes mistakes for AI insights

---

## 2. Concrete Example: "pay at the couter" vs "pay at the counter"

### Step-by-Step Execution Flow

#### **Step 1: User Submits Answer**
- **Location:** `app/[locale]/(app)/practice/respond/page.tsx`
- **Action:** User types "pay at the couter when you're ready"
- **Data:** `userText = "pay at the couter when you're ready"`
- **Navigation:** Redirects to `/practice/review?userText=pay%20at%20the%20couter%20when%20you're%20ready&clipId=...`

#### **Step 2: Review Page Calls API**
- **Location:** `app/[locale]/(app)/practice/review/page.tsx` (lines 443-637)
- **Action:** `useEffect` calls `/api/check-answer` on mount
- **Request Body:**
  ```json
  {
    "transcript": "pay at the counter when you're ready",
    "userText": "pay at the couter when you're ready",
    "clipId": "abc123"  // Optional, for variant-specific feedback
  }
  ```

#### **Step 3: API Normalizes Text**
- **Location:** `lib/alignmentEngine.ts` (lines 60-74)
- **Action:** `normalizeText()` function:
  - Lowercases: `"pay at the counter when you're ready"` → `"pay at the counter when you're ready"`
  - Removes punctuation: `"you're"` → `"you're"` (apostrophes kept)
  - Collapses spaces
  - Normalizes contractions: `"i m"` → `"i'm"` (via `normalizeContractions`)
- **Output:** Tokenized arrays:
  - `refTokens = ["pay", "at", "the", "counter", "when", "you're", "ready"]`
  - `userTokens = ["pay", "at", "the", "couter", "when", "you're", "ready"]`

#### **Step 4: Alignment Algorithm (Levenshtein)**
- **Location:** `lib/alignmentEngine.ts` (lines 108-289)
- **Algorithm:** Dynamic programming (DP) alignment
- **Cost Model:**
  - Match: 0 cost
  - Substitution: 1 cost
  - Deletion: 1 cost
  - Insertion: 1 cost
- **Process:**
  1. Builds DP matrix comparing each ref token to each user token
  2. Finds minimum cost path
  3. Backtraces to generate alignment steps
- **Result for our example:**
  - `"pay"` → **correct** (match)
  - `"at"` → **correct** (match)
  - `"the"` → **correct** (match)
  - `"counter"` vs `"couter"` → **substitution** (wrong)
  - `"when"` → **correct** (match)
  - `"you're"` → **correct** (match)
  - `"ready"` → **correct** (match)

#### **Step 5: Generate Alignment Tokens & Events**
- **Location:** `lib/alignmentEngine.ts` (lines 178-279)
- **Tokens Created:**
  ```typescript
  [
    { type: 'correct', expected: 'pay', actual: 'pay', refIndex: 0, userIndex: 0 },
    { type: 'correct', expected: 'at', actual: 'at', refIndex: 1, userIndex: 1 },
    { type: 'correct', expected: 'the', actual: 'the', refIndex: 2, userIndex: 2 },
    { type: 'substitution', expected: 'counter', actual: 'couter', refIndex: 3, userIndex: 3 },
    { type: 'correct', expected: 'when', actual: 'when', refIndex: 4, userIndex: 4 },
    { type: 'correct', expected: "you're", actual: "you're", refIndex: 5, userIndex: 5 },
    { type: 'correct', expected: 'ready', actual: 'ready', refIndex: 6, userIndex: 6 }
  ]
  ```
- **Events Created:**
  ```typescript
  [
    {
      eventId: 'abc123',
      type: 'substitution',
      refStart: 3,
      refEnd: 3,
      userStart: 3,
      userEnd: 3,
      expectedSpan: 'counter',
      actualSpan: 'couter',
      context: {
        before: 'pay at the',
        after: "when you're ready",
        fullRef: "pay at the counter when you're ready",
        fullUser: "pay at the couter when you're ready"
      }
    }
  ]
  ```
- **Stats Calculated:**
  ```typescript
  {
    correct: 6,
    substitutions: 1,
    missing: 0,
    extra: 0
  }
  ```

#### **Step 6: Attach Phrase Spans**
- **Location:** `lib/phraseSpans.ts` (called from `app/api/check-answer/route.ts` line 88)
- **Action:** Attaches phrase hints to events (for blended phrases like "gonna")
- **Result:** Events may have `phraseHint` property if phrase spans are detected

#### **Step 7: Calculate Accuracy**
- **Location:** `app/api/check-answer/route.ts` (lines 110-130)
- **Formula:** `accuracyPercent = (correct / (correct + substitutions + missing)) * 100`
- **For our example:** `(6 / (6 + 1 + 0)) * 100 = 85.7%` → **86%** (rounded)

#### **Step 8: Semantic Evaluation (if clipId provided)**
- **Location:** `lib/semanticEvaluator.ts` (lines 168-320)
- **Condition:** Only runs if `clipId` is provided AND clip has `semantic_structure` and `critical_keywords` in database
- **Process:**
  1. **Keyword Matching (60% of score):**
     - Checks if critical keywords appear in user input (fuzzy matching with Levenshtein distance)
     - For "counter" vs "couter": Levenshtein distance = 1, so it's a fuzzy match
     - `keywordScore = capturedKeywords.length / criticalKeywords.length`
  
  2. **Semantic Unit Matching (40% of score):**
     - Checks if semantic units (actor, action, object, timing, location) appear in user input
     - Uses fuzzy matching for each unit value
  
  3. **Preposition Penalty:**
     - If timing keywords captured but wrong preposition used (e.g., "for" instead of "before"), applies 0.3 penalty
  
  4. **Final Score:**
     - `semanticScore = (keywordScore * 0.6) + (unitScore * 0.4) - prepositionPenalty`
     - `understood = semanticScore >= 0.7`
- **For our example:** If "counter" is a critical keyword and fuzzy-matched, semantic score would be high (likely > 0.7), so `understood = true`

#### **Step 9: Pattern Feedback (if semantic evaluation fails)**
- **Location:** `app/api/check-answer/route.ts` (lines 132-351)
- **Condition:** Only runs if `clipId` provided AND `semanticEval.understood === false`
- **Process:**
  1. Fetches `clip_pattern_spans` from database for this clip
  2. Filters spans to only those affecting missed keywords/units
  3. Sorts by CEFR level → position → priority
  4. Takes first relevant span and builds feedback from `listening_pattern_variants`
- **For our example:** If semantic evaluation passed, pattern feedback is **NOT** generated

#### **Step 10: Error Classification**
- **Location:** `lib/errorClassifier.ts` (lines 126-187)
- **Process:** Classifies each error token by perceptual cause
- **For "counter" → "couter" substitution:**
  - Checks if it's a reduced form: NO
  - Checks if words sound similar: YES (same first letter, similar length)
  - **Classification:** `['VOWEL_REDUCTION', 'BOUNDARY_MISALIGNMENT']`
- **Error Counts:**
  ```typescript
  Map {
    'VOWEL_REDUCTION' => 1,
    'BOUNDARY_MISALIGNMENT' => 1
  }
  ```

#### **Step 11: Generate Data-Driven Feedback**
- **Location:** `lib/dataDrivenFeedback.ts` (lines 175-234)
- **Process:**
  1. Filters to high-confidence tokens (confidence >= 0.55 for substitutions)
  2. Analyzes errors using `analyzeErrors()` → gets error counts
  3. Gets ranked causes: `[{ cause: 'VOWEL_REDUCTION', count: 1 }, { cause: 'BOUNDARY_MISALIGNMENT', count: 1 }]`
  4. Primary cause: `'VOWEL_REDUCTION'`
  5. Generates summary from templates:
     - `SUMMARY_TEMPLATES.VOWEL_REDUCTION[0]` = `"You often confused similar-sounding words."`
  6. Generates "What happened":
     - Finds examples from tokens: None found (no "gonna"/"wanna" patterns)
     - Default: `"You missed several words in this sentence."`
  7. Generates "Why it sounded hard":
     - `generalExplanations.VOWEL_REDUCTION` = `"Similar-sounding words can be confusing when spoken quickly."`
- **Output:**
  ```typescript
  {
    primaryCause: 'VOWEL_REDUCTION',
    summary: 'You often confused similar-sounding words.',
    whatHappened: 'You missed several words in this sentence.',
    whyHard: 'Similar-sounding words can be confusing when spoken quickly.',
    examples: undefined,
    errorCounts: Map { 'VOWEL_REDUCTION' => 1, 'BOUNDARY_MISALIGNMENT' => 1 }
  }
  ```

#### **Step 12: Generate Review Summary**
- **Location:** `lib/reviewSummary.ts` (lines 111-350)
- **Process:**
  1. Counts error types: `missingCount = 0, substitutionCount = 1, extraCount = 0`
  2. Checks for clustered missing: NO
  3. Checks for casual reductions: NO
  4. Checks for content word errors: YES (`"counter"` is a content word)
  5. **Category Selection:**
     - Since `contentWordErrors >= 2` is FALSE (only 1), falls through to default
     - Default: `categoryId = 'words_blended'`
     - `title = 'You tended to miss phrases when words were spoken together.'`
  6. Extracts example phrase:
     - From first event: `extractPhrase(refTokens, 3, 3)` → `"at the counter"` (expanded to 3 words)
  7. Extracts practice phrases:
     - From error spans: `["at the counter"]`
     - Deduplicated and limited to 5
- **Output:**
  ```typescript
  {
    categoryId: 'words_blended',
    title: 'You tended to miss phrases when words were spoken together.',
    examplePhrase: 'at the counter',
    phrasesToPractice: ['at the counter']
  }
  ```

#### **Step 13: API Returns Response**
- **Location:** `app/api/check-answer/route.ts` (lines 353-372)
- **Response Body:**
  ```json
  {
    "accuracyPercent": 86,
    "refTokens": ["pay", "at", "the", "counter", "when", "you're", "ready"],
    "userTokens": ["pay", "at", "the", "couter", "when", "you're", "ready"],
    "tokens": [...alignment tokens...],
    "events": [...alignment events...],
    "stats": { "correct": 6, "substitutions": 1, "missing": 0, "extra": 0 },
    "transcript": "pay at the counter when you're ready",
    "userText": "pay at the couter when you're ready",
    "semanticScore": 0.95,
    "missingUnits": [],
    "capturedKeywords": ["counter"],
    "missingKeywords": [],
    "understood": true,
    "patternFeedback": []  // Empty because understood = true
  }
  ```

#### **Step 14: Review Page Displays Feedback**
- **Location:** `app/[locale]/(app)/practice/review/page.tsx` (lines 973-1180)
- **Rendering Logic:**

  **A. Accuracy Display (lines 980-998):**
  - Only shown if `!diffResult.semanticEval`
  - Displays: `86%` with progress bar

  **B. Summary Card (lines 1000-1080):**
  - If `semanticEval.understood === true`:
    - Shows green card: "Great! You got the meaning"
    - Lists missing keywords if any: "Minor corrections: (none)"
  - If `semanticEval.understood === false`:
    - Shows orange card: "Not quite"
    - Lists missing units: "You missed: (none)"
  - Fallback (no semantic eval):
    - Shows blue card with `reviewSummary.title`: "You tended to miss phrases when words were spoken together."
    - Shows example: "For example, 'at the counter' sounded like one word."

  **C. Compared to What You Heard (lines 1082-1109):**
  - Renders tokens with color coding:
    - Correct: black text
    - Missing: gray text with dotted underline
    - Extra: gray text with strikethrough
    - Substitution: red text with dotted underline
  - For our example:
    - `pay at the` (black) `counter` (red underlined) `when you're ready` (black)
    - But displays as: `pay at the couter when you're ready` (shows what user typed, with "counter" highlighted in red)

  **D. "Why Did I Miss This?" Button (lines 1162-1171):**
  - Opens modal that fetches AI insights (calls `/api/insight` for top 3 mistakes)
  - Not part of initial feedback display

---

## 3. Assumptions the Current Logic Makes

### About Why the Learner Failed

1. **Single Primary Cause Assumption:**
   - The system picks ONE primary cause from ranked error counts
   - Secondary cause only mentioned if it has at least 2 errors
   - **Limitation:** Doesn't explain that multiple factors may contribute

2. **Perceptual Cause Mapping:**
   - Assumes errors map directly to 6 perceptual causes:
     - `CONNECTED_SPEECH` - Words blended together
     - `WORD_REDUCTION` - Reduced forms like "gonna"
     - `FUNCTION_WORD_DROP` - Small connecting words missed
     - `VOWEL_REDUCTION` - Similar-sounding words confused
     - `BOUNDARY_MISALIGNMENT` - Word boundaries unclear
     - `CONTENT_WORD_MISS` - Important words missed
   - **Limitation:** Doesn't account for spelling errors, typos, or vocabulary gaps

3. **Confidence Threshold:**
   - Only high-confidence substitutions (>= 0.55) are analyzed
   - Low-confidence substitutions are split into delete+insert
   - **Assumption:** Low confidence = boundary misalignment, not substitution

### About What Kind of Mistake Occurred

1. **Word-Level Analysis:**
   - All analysis happens at word level (no phoneme-level)
   - **Assumption:** Errors are whole-word substitutions, not partial

2. **Spelling vs. Listening Error:**
   - No distinction between spelling errors ("couter" vs "counter") and listening errors
   - **Assumption:** All substitutions are listening comprehension issues

3. **Content Word Priority:**
   - Content words (nouns/verbs/adjectives > 3 chars) are weighted more heavily
   - **Assumption:** Missing content words = more serious than function words

### About What Feedback is Appropriate

1. **Template-Based Explanations:**
   - Uses hard-coded templates from `SUMMARY_TEMPLATES` and `generalExplanations`
   - **Assumption:** Generic explanations apply to all learners

2. **Example Phrase Extraction:**
   - Extracts 2-5 word phrases around errors
   - **Assumption:** Showing the phrase helps learner understand the mistake

3. **Semantic Understanding Priority:**
   - If semantic score >= 0.7, shows "Great! You got the meaning" even with word errors
   - **Assumption:** Meaning > accuracy

---

## 4. Single vs. Multiple Causes

### Current Behavior: **Single Primary Cause**

- **Location:** `lib/dataDrivenFeedback.ts` (lines 211-219)
- **Process:**
  1. Gets ranked causes: `[{ cause: 'VOWEL_REDUCTION', count: 1 }, { cause: 'BOUNDARY_MISALIGNMENT', count: 1 }]`
  2. Primary cause: `ranked[0].cause` = `'VOWEL_REDUCTION'`
  3. Secondary cause: Only included if `ranked[1].count >= 2`
  4. **For our example:** Only `VOWEL_REDUCTION` is shown (secondary has count 1, so ignored)

### Uncertainty/Confidence Checking

- **Confidence Threshold:** Only substitutions with `confidence >= 0.55` are analyzed
- **Location:** `lib/dataDrivenFeedback.ts` (lines 184-189)
- **Behavior:** Low-confidence substitutions are treated as delete+insert (boundary misalignment)
- **No Uncertainty Display:** The UI never shows confidence scores or uncertainty to the learner

### Fallback/Default Diagnosis

- **Location:** `lib/dataDrivenFeedback.ts` (lines 194-208)
- **Fallback 1:** If no high-confidence errors:
  - Checks for deletions/insertions
  - Returns: `{ primaryCause: 'CONNECTED_SPEECH', summary: 'Some parts were unclear.' }`
- **Fallback 2:** If no errors at all:
  - Returns `null` (no feedback)
- **Location:** `lib/feedbackEngine.ts` (lines 267-277)
- **Fallback 3:** If no insights detected:
  - Returns default insight: `{ category: 'SOUND_REDUCTION', summary: 'Some parts were hard to catch.' }`
- **Location:** `lib/reviewSummary.ts` (lines 317-325)
- **Fallback 4:** If no category matches:
  - Default: `categoryId = 'words_blended'`, `title = 'You tended to miss phrases when words were spoken together.'`

---

## 5. Feedback Modal Sections

### Section 1: 「聞こえたもの」 (What You Heard) / "What you might have heard"

- **Location:** `app/[locale]/(app)/practice/review/page.tsx` (lines 1087-1109)
- **Generation:** **Deterministic** - Shows `actualSpan` from alignment event
- **For our example:** `"couter"` (what user typed)
- **Label Logic:** `getInsightLabels()` function (lines 47-70):
  - `substitution` → `"💭 What you might have heard"`
  - `missing` → `null` (not shown)
  - `extra` → `"➕ What you added"`

### Section 2: 「実際の内容」 (Actual Content) / "What it actually was"

- **Location:** `app/[locale]/(app)/practice/review/page.tsx` (lines 1087-1109)
- **Generation:** **Deterministic** - Shows `expectedSpan` from alignment event
- **For our example:** `"counter"` (correct word)
- **Label Logic:**
  - `substitution` → `"✅ What it actually was"`
  - `missing` → `"❌ What you missed"`
  - `extra` → `"✅ What it should be"`

### Section 3: 「なぜそうなるのか」 (Why This Happens) / "Why this happens"

- **Location:** `app/[locale]/(app)/practice/review/page.tsx` (lines 1162-1171)
- **Generation:** **AI-Generated** (when "Why Did I Miss This?" button clicked)
- **Process:**
  1. Calls `/api/insight` endpoint (not shown in provided files, but referenced)
  2. Fetches AI-generated explanation for the mistake
  3. **Not part of initial feedback** - only shown in modal
- **Fallback:** If AI fails, uses template from `generalExplanations` in `dataDrivenFeedback.ts`

### Section 4: 「試してみよう」 (Try This) / "Try this"

- **Location:** `lib/reviewSummary.ts` (lines 199-249)
- **Generation:** **Deterministic** - Extracts phrases from error spans
- **Process:**
  1. Extracts 2-5 word phrases around each error
  2. Prioritizes phrases from `phraseHint` (blended phrases)
  3. Deduplicates contained phrases
  4. Limits to top 5 phrases
- **For our example:** `["at the counter"]`
- **Display:** Shown in practice steps page (not in review page)

---

## 6. Deterministic vs. Random/AI-Generated

### Deterministic (Rule-Based)

1. **Alignment Algorithm:**
   - Levenshtein distance is deterministic
   - Same input always produces same alignment

2. **Error Classification:**
   - Hard-coded rules in `errorClassifier.ts`
   - Function word lists, contraction lists, reduced forms are static

3. **Feedback Templates:**
   - `SUMMARY_TEMPLATES` in `dataDrivenFeedback.ts` are hard-coded arrays
   - Always uses first template: `primaryTemplates[0]` (line 53)
   - **No randomization** - same cause always shows same template

4. **Example Phrase Extraction:**
   - Algorithm in `reviewSummary.ts` is deterministic
   - Always extracts same phrase for same error span

5. **Accuracy Calculation:**
   - Formula: `(correct / (correct + substitutions + missing)) * 100`
   - Always produces same result

### AI-Generated (Model-Based)

1. **"Why This Happens" Explanations:**
   - Calls `/api/insight` endpoint (not shown in files)
   - **Assumed to be AI-generated** based on context
   - Only shown in modal, not in initial feedback

### UX Decisions (Hard-Coded)

1. **Semantic Understanding Threshold:**
   - `understood = semanticScore >= 0.7` (line 311 in `semanticEvaluator.ts`)
   - Hard-coded threshold

2. **Confidence Threshold:**
   - `confidence >= 0.55` for high-confidence substitutions (line 186 in `dataDrivenFeedback.ts`)
   - Hard-coded threshold

3. **Secondary Cause Threshold:**
   - Secondary cause only shown if `count >= 2` (line 219 in `dataDrivenFeedback.ts`)
   - Hard-coded threshold

4. **Phrase Length:**
   - Example phrases are 2-5 words (line 40 in `reviewSummary.ts`)
   - Practice phrases limited to top 5 (line 249 in `reviewSummary.ts`)
   - Hard-coded limits

5. **Accuracy Display:**
   - Only shown if `!semanticEval` (line 980 in review page)
   - Hard-coded UX rule

---

## 7. Key Observations

### Strengths

1. **Multi-layered Analysis:**
   - Word-level alignment → Error classification → Semantic evaluation → Pattern feedback
   - Provides both accuracy and meaning-based feedback

2. **Fuzzy Matching:**
   - Semantic evaluator uses Levenshtein distance for keyword matching
   - Handles spelling errors gracefully (e.g., "couter" vs "counter")

3. **Context-Aware:**
   - Alignment events include context (before/after words)
   - Phrase extraction considers surrounding words

### Limitations

1. **Single Cause Focus:**
   - Only shows primary cause, ignores secondary causes with count < 2
   - Doesn't explain that multiple factors may contribute

2. **No Spelling vs. Listening Distinction:**
   - "couter" vs "counter" is treated as listening error, not spelling
   - May mislead learners about their actual listening ability

3. **Template-Based Explanations:**
   - Generic explanations don't adapt to learner's specific mistake
   - Same explanation for all learners with same error type

4. **No Confidence Display:**
   - Learners never see how confident the system is about their mistakes
   - May show feedback for uncertain errors

5. **AI Insights Hidden:**
   - "Why This Happens" requires clicking button, not shown initially
   - Most learners may never see detailed explanations

---

## Summary

The current feedback system is **primarily deterministic and rule-based**, with AI-generated content only for detailed "Why This Happens" explanations (hidden in modal). The flow is:

1. **Alignment** (deterministic) → 2. **Error Classification** (rule-based) → 3. **Semantic Evaluation** (rule-based with fuzzy matching) → 4. **Feedback Generation** (template-based) → 5. **Display** (deterministic rendering)

The system makes strong assumptions about error causes and uses hard-coded thresholds throughout, with minimal personalization or adaptation to individual learner needs.
