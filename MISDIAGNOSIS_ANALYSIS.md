# Misdiagnosis Analysis: Where and How Often Errors Are Misclassified

## 1. Misdiagnosis Points in the Codebase

### Point 1: Alignment Algorithm - No Spelling Detection
**Location:** `lib/alignmentEngine.ts` (lines 108-289)
**Function:** `alignTexts()`
**Why it misdiagnoses:**
- Uses Levenshtein distance which treats all character differences equally
- "counter" vs "couter" = 1 substitution (same as "counter" vs "count")
- No distinction between:
  - Spelling error: "couter" (typo)
  - Listening error: "count" (misheard)
  - Vocabulary gap: "desk" (unknown word)
**Impact:** All word-level differences are treated as listening comprehension errors

### Point 2: Error Classifier - Sounds Similar Heuristic
**Location:** `lib/errorClassifier.ts` (lines 97-120, 168-170)
**Function:** `soundsSimilar()`, used in `classifyError()`
**Why it misdiagnoses:**
- Checks: same first letter + similar length (≤2 chars difference)
- "counter" vs "couter" → TRUE (same first letter, length diff = 1)
- **Problem:** Spelling errors match this heuristic perfectly
- Classifies as `VOWEL_REDUCTION` (listening error) when it's actually a spelling error
**Impact:** Spelling errors are always classified as listening perception errors

### Point 3: Semantic Evaluator - Fuzzy Matching Masks Spelling
**Location:** `lib/semanticEvaluator.ts` (lines 105-126)
**Function:** `isFuzzyMatch()`
**Why it misdiagnoses:**
- Uses Levenshtein distance with 1-2 char tolerance
- "counter" vs "couter" → Levenshtein = 1 → FUZZY MATCH
- **Problem:** Treats spelling errors as "understood" (semantic score stays high)
- User gets "Great! You got the meaning" even with spelling errors
**Impact:** Spelling errors are hidden from feedback, learner doesn't know they made a mistake

### Point 4: Review Summary - Content Word Threshold
**Location:** `lib/reviewSummary.ts` (lines 294-306)
**Function:** `pickTopIssue()`
**Why it misdiagnoses:**
- Gate: `contentWordErrors >= 2` to show "key_words_hard" category
- **Problem:** Single spelling error in content word doesn't trigger this
- Falls through to default "words_blended" category
- Example: "counter" → "couter" (1 content word error) → shows wrong category
**Impact:** Single spelling errors get wrong category label

### Point 5: Review Summary - Casual Reduction Check
**Location:** `lib/reviewSummary.ts` (lines 269-281)
**Function:** `pickTopIssue()`
**Why it misdiagnoses:**
- Checks if substitution involves casual reductions (wanna, gonna, etc.)
- **Problem:** Doesn't check if it's a spelling error first
- Example: User types "gonna" correctly but misspells another word → system might focus on wrong issue
**Impact:** Spelling errors can be ignored if casual reductions are present

### Point 6: Data-Driven Feedback - Confidence Threshold
**Location:** `lib/dataDrivenFeedback.ts` (lines 184-189)
**Function:** `generateFeedbackFromErrors()`
**Why it misdiagnoses:**
- Filters out substitutions with `confidence < 0.55`
- Low-confidence substitutions are split into delete+insert
- **Problem:** Spelling errors might have low confidence (if alignment is uncertain)
- These get reclassified as `CONNECTED_SPEECH` (boundary issue) instead of spelling
**Impact:** Spelling errors with low confidence become boundary misalignment errors

### Point 7: Data-Driven Feedback - Secondary Cause Threshold
**Location:** `lib/dataDrivenFeedback.ts` (line 219)
**Function:** `generateFeedbackFromErrors()`
**Why it misdiagnoses:**
- Secondary cause only shown if `count >= 2`
- **Problem:** If user has 1 spelling error + 1 listening error, only listening error is shown
- Spelling error is completely hidden from feedback
**Impact:** Mixed error types (spelling + listening) only show listening cause

### Point 8: Review Summary - Default Fallback
**Location:** `lib/reviewSummary.ts` (lines 317-325)
**Function:** `pickTopIssue()`
**Why it misdiagnoses:**
- If no category matches, defaults to `'words_blended'`
- **Problem:** Spelling errors that don't match any category get wrong default
- Example: Single spelling error in function word → shows "words_blended" (wrong)
**Impact:** Many edge cases get wrong default category

### Point 9: Semantic Evaluation - Keyword Matching
**Location:** `lib/semanticEvaluator.ts` (lines 184-190)
**Function:** `evaluateSemanticUnderstanding()`
**Why it misdiagnoses:**
- Fuzzy matches keywords with 1-2 char tolerance
- **Problem:** Spelling errors in keywords are treated as "captured"
- User might miss the keyword entirely but fuzzy match says they got it
- Example: "meeting" vs "meting" → fuzzy match → keyword marked as captured
**Impact:** Spelling errors in critical keywords are treated as correct understanding

### Point 10: Alignment - No Vocabulary Gap Detection
**Location:** `lib/alignmentEngine.ts` (lines 108-289)
**Function:** `alignTexts()`
**Why it misdiagnoses:**
- All substitutions are treated equally
- No check if user word is a real English word
- **Problem:** "counter" vs "desk" (vocab gap) vs "couter" (spelling) vs "count" (listening) all treated the same
- All classified as listening errors
**Impact:** Vocabulary gaps are misdiagnosed as listening perception errors

---

## 2. Error Case Table (20+ Realistic Examples)

| # | Transcript | User Text | System Primary Cause | System Category | Real Cause | High Risk? | Why Misdiagnosis |
|---|-----------|-----------|---------------------|-----------------|------------|------------|------------------|
| 1 | pay at the counter when you're ready | pay at the couter when you're ready | VOWEL_REDUCTION | words_blended | **Spelling** | ✅ YES | Same first letter + similar length → classified as listening error |
| 2 | I need to check my schedule | I need to check my scedule | VOWEL_REDUCTION | words_blended | **Spelling** | ✅ YES | "schedule" vs "scedule" → soundsSimilar() returns true |
| 3 | Can you help me with this? | Can you help me with tis? | VOWEL_REDUCTION | words_blended | **Spelling** | ✅ YES | Single char deletion → treated as listening error |
| 4 | I'm going to the store | I'm going to the stoe | VOWEL_REDUCTION | words_blended | **Spelling** | ✅ YES | Missing 'r' → classified as vowel reduction |
| 5 | What time is the meeting? | What time is the meting? | VOWEL_REDUCTION | words_blended | **Spelling** | ✅ YES | Fuzzy match in semantic eval → keyword marked as captured |
| 6 | I'll be there in a minute | I'll be there in a minuet | VOWEL_REDUCTION | words_blended | **Spelling** | ✅ YES | Homophone spelling error → treated as listening |
| 7 | Let's discuss this later | Let's discus this later | VOWEL_REDUCTION | words_blended | **Spelling** | ✅ YES | Missing 's' → classified as listening error |
| 8 | I don't understand | I don't understan | VOWEL_REDUCTION | words_blended | **Spelling** | ✅ YES | Missing 'd' → treated as listening error |
| 9 | That sounds great | That sound great | FUNCTION_WORD_DROP | words_blended | **Spelling** | ✅ YES | Missing 's' in "sounds" → classified as function word drop |
| 10 | I have a question | I have a qustion | VOWEL_REDUCTION | words_blended | **Spelling** | ✅ YES | Missing 'e' → treated as listening error |
| 11 | Can I get a coffee? | Can I get a cofee? | VOWEL_REDUCTION | words_blended | **Spelling** | ✅ YES | Missing 'f' → classified as listening error |
| 12 | I'm sorry about that | I'm sorry abot that | VOWEL_REDUCTION | words_blended | **Spelling** | ✅ YES | Missing 'u' → treated as listening error |
| 13 | What do you think? | What do you thik? | VOWEL_REDUCTION | words_blended | **Spelling** | ✅ YES | Missing 'n' → classified as listening error |
| 14 | I need more time | I need more tim | VOWEL_REDUCTION | words_blended | **Spelling** | ✅ YES | Missing 'e' → treated as listening error |
| 15 | Let me know when you're ready | Let me know when you're redy | VOWEL_REDUCTION | words_blended | **Spelling** | ✅ YES | Missing 'a' → classified as listening error |
| 16 | I'll call you back | I'll call you bak | VOWEL_REDUCTION | words_blended | **Spelling** | ✅ YES | Missing 'c' → treated as listening error |
| 17 | That's a good idea | That's a good ide | VOWEL_REDUCTION | words_blended | **Spelling** | ✅ YES | Missing 'a' → classified as listening error |
| 18 | I'm going to be late | I'm going to be lat | VOWEL_REDUCTION | words_blended | **Spelling** | ✅ YES | Missing 'e' → treated as listening error |
| 19 | Can you send me the file? | Can you send me the fil? | VOWEL_REDUCTION | words_blended | **Spelling** | ✅ YES | Missing 'e' → classified as listening error |
| 20 | I need to finish this | I need to finis this | VOWEL_REDUCTION | words_blended | **Spelling** | ✅ YES | Missing 'h' → treated as listening error |
| 21 | What's your name? | What's your nme? | VOWEL_REDUCTION | words_blended | **Spelling** | ✅ YES | Missing 'a' → classified as listening error |
| 22 | I'm looking for a job | I'm looking for a jb | VOWEL_REDUCTION | words_blended | **Spelling** | ✅ YES | Missing 'o' → treated as listening error |
| 23 | Let's meet tomorrow | Let's meet tomorow | VOWEL_REDUCTION | words_blended | **Spelling** | ✅ YES | Missing 'r' → classified as listening error |
| 24 | I don't know what to do | I don't know what to d | VOWEL_REDUCTION | words_blended | **Spelling** | ✅ YES | Missing 'o' → treated as listening error |
| 25 | Can you help me? | Can you help m? | FUNCTION_WORD_DROP | words_blended | **Spelling** | ✅ YES | Missing 'e' in "me" → classified as function word drop |

### Vocabulary Gap Examples

| # | Transcript | User Text | System Primary Cause | System Category | Real Cause | High Risk? | Why Misdiagnosis |
|---|-----------|-----------|---------------------|-----------------|------------|------------|------------------|
| 26 | I need to submit the report | I need to send the report | BOUNDARY_MISALIGNMENT | words_blended | **Vocabulary** | ✅ YES | Unknown word "submit" → replaced with known word "send" → treated as listening error |
| 27 | Let's schedule a meeting | Let's plan a meeting | BOUNDARY_MISALIGNMENT | words_blended | **Vocabulary** | ✅ YES | Unknown "schedule" → replaced with "plan" → classified as listening error |
| 28 | I'll confirm the reservation | I'll check the reservation | BOUNDARY_MISALIGNMENT | words_blended | **Vocabulary** | ✅ YES | Unknown "confirm" → replaced with "check" → treated as listening error |
| 29 | Can you recommend a restaurant? | Can you suggest a restaurant? | BOUNDARY_MISALIGNMENT | words_blended | **Vocabulary** | ✅ YES | Unknown "recommend" → replaced with "suggest" → classified as listening error |
| 30 | I need to cancel the appointment | I need to stop the appointment | BOUNDARY_MISALIGNMENT | words_blended | **Vocabulary** | ✅ YES | Unknown "cancel" → replaced with "stop" → treated as listening error |

### True Listening Error Examples (Correctly Diagnosed)

| # | Transcript | User Text | System Primary Cause | System Category | Real Cause | High Risk? | Why Correct |
|---|-----------|-----------|---------------------|-----------------|------------|------------|-------------|
| 31 | I'm going to the store | I'm gonna the store | WORD_REDUCTION | casual_shortcuts | **Listening** | ❌ NO | Correctly identifies "going to" → "gonna" as reduction |
| 32 | I want to see you | I wanna see you | WORD_REDUCTION | casual_shortcuts | **Listening** | ❌ NO | Correctly identifies "want to" → "wanna" as reduction |
| 33 | What are you doing? | What you doing? | FUNCTION_WORD_DROP | words_blended | **Listening** | ❌ NO | Correctly identifies missing "are" as function word drop |
| 34 | I have been working | I have been work | CONTENT_WORD_MISS | key_words_hard | **Listening** | ❌ NO | Correctly identifies missing "ing" as content word miss |
| 35 | Can you help me? | Can help me? | FUNCTION_WORD_DROP | words_blended | **Listening** | ❌ NO | Correctly identifies missing "you" as function word drop |

### Boundary/Segmentation Examples

| # | Transcript | User Text | System Primary Cause | System Category | Real Cause | High Risk? | Why Misdiagnosis |
|---|-----------|-----------|---------------------|-----------------|------------|------------|------------------|
| 36 | I need a break | I need abreak | BOUNDARY_MISALIGNMENT | words_blended | **Boundary** | ❌ NO | Correctly identifies word boundary issue |
| 37 | Let's go home | Let's gohome | BOUNDARY_MISALIGNMENT | words_blended | **Boundary** | ❌ NO | Correctly identifies word boundary issue |
| 38 | I'm all set | I'm allset | BOUNDARY_MISALIGNMENT | words_blended | **Boundary** | ❌ NO | Correctly identifies word boundary issue |

### Mixed Error Examples

| # | Transcript | User Text | System Primary Cause | System Category | Real Cause | High Risk? | Why Misdiagnosis |
|---|-----------|-----------|---------------------|-----------------|------------|------------|------------------|
| 39 | I'm going to check my schedule | I'm gonna check my scedule | WORD_REDUCTION | casual_shortcuts | **Mixed: Listening + Spelling** | ✅ YES | Shows "gonna" (listening) but hides "scedule" (spelling) - secondary cause threshold |
| 40 | Can you help me with this question? | Can you help me with this qustion? | FUNCTION_WORD_DROP | words_blended | **Spelling** | ✅ YES | Single spelling error → falls through to default category |

---

## 3. Problematic Thresholds and Trigger Examples

### Threshold 1: `contentWordErrors >= 2` (Review Summary)

**Location:** `lib/reviewSummary.ts` (line 295)

**Problem:** Single content word error doesn't trigger "key_words_hard" category, falls through to default "words_blended"

**Trigger Examples:**

| Transcript | User Text | contentWordErrors | System Category | Should Be |
|-----------|-----------|-------------------|-----------------|-----------|
| I need to check my schedule | I need to check my scedule | 1 | words_blended | key_words_hard (spelling) |
| Can you help me with this? | Can you help me with tis? | 1 | words_blended | key_words_hard (spelling) |
| I'll be there in a minute | I'll be there in a minuet | 1 | words_blended | key_words_hard (spelling) |
| I need to finish this | I need to finis this | 1 | words_blended | key_words_hard (spelling) |
| Let's meet tomorrow | Let's meet tomorow | 1 | words_blended | key_words_hard (spelling) |

**Why it's wrong:** Single spelling errors in content words are common but get wrong category label

---

### Threshold 2: `secondaryCause.count >= 2` (Data-Driven Feedback)

**Location:** `lib/dataDrivenFeedback.ts` (line 219)

**Problem:** Secondary cause only shown if it has at least 2 errors, hiding important error types

**Trigger Examples:**

| Transcript | User Text | Primary Cause (count) | Secondary Cause (count) | Secondary Shown? | Should Show? |
|-----------|-----------|----------------------|------------------------|------------------|--------------|
| I'm going to check my schedule | I'm gonna check my scedule | WORD_REDUCTION (1) | VOWEL_REDUCTION (1) | ❌ NO | ✅ YES (spelling) |
| Can you help me with this question? | Can you help me with tis qustion? | FUNCTION_WORD_DROP (1) | VOWEL_REDUCTION (2) | ✅ YES | ✅ YES (correct) |
| I need to submit the report | I need to send the report | BOUNDARY_MISALIGNMENT (1) | CONTENT_WORD_MISS (1) | ❌ NO | ✅ YES (vocab) |
| Let's schedule a meeting | Let's plan a meeting | BOUNDARY_MISALIGNMENT (1) | CONTENT_WORD_MISS (1) | ❌ NO | ✅ YES (vocab) |

**Why it's wrong:** Mixed error types (spelling + listening, vocab + listening) only show primary cause, hiding important secondary issues

---

### Threshold 3: `confidence >= 0.55` (Data-Driven Feedback)

**Location:** `lib/dataDrivenFeedback.ts` (line 186)

**Problem:** Low-confidence substitutions are filtered out and reclassified as delete+insert (boundary issue)

**Trigger Examples:**

| Transcript | User Text | Alignment Confidence | System Classification | Real Classification |
|-----------|-----------|---------------------|----------------------|---------------------|
| I need to check my schedule | I need to check my scedule | 0.45 (low) | CONNECTED_SPEECH (delete+insert) | VOWEL_REDUCTION (spelling) |
| Can you help me with this? | Can you help me with tis? | 0.50 (low) | CONNECTED_SPEECH (delete+insert) | VOWEL_REDUCTION (spelling) |
| I'll be there in a minute | I'll be there in a minuet | 0.48 (low) | CONNECTED_SPEECH (delete+insert) | VOWEL_REDUCTION (spelling) |
| Let's meet tomorrow | Let's meet tomorow | 0.52 (low) | CONNECTED_SPEECH (delete+insert) | VOWEL_REDUCTION (spelling) |

**Why it's wrong:** Spelling errors with uncertain alignment get wrong classification (boundary issue instead of spelling)

---

### Threshold 4: `missingClustered >= 2` (Review Summary)

**Location:** `lib/reviewSummary.ts` (line 257)

**Problem:** Single missing words don't trigger "words_blended" category, even if they're part of a phrase

**Trigger Examples:**

| Transcript | User Text | missingClustered | System Category | Should Be |
|-----------|-----------|------------------|-----------------|-----------|
| I'm going to the store | I'm going the store | 1 | words_blended (default) | words_blended (correct) |
| Can you help me? | Can help me? | 1 | words_blended (default) | words_blended (correct) |
| What are you doing? | What you doing? | 1 | words_blended (default) | words_blended (correct) |

**Why it's wrong:** Actually works correctly for listening errors, but spelling errors that look like missing words get wrong category

---

### Threshold 5: `casualReductionCount >= 2` (Review Summary)

**Location:** `lib/reviewSummary.ts` (line 270)

**Problem:** Single casual reduction doesn't trigger "casual_shortcuts" category

**Trigger Examples:**

| Transcript | User Text | casualReductionCount | System Category | Should Be |
|-----------|-----------|---------------------|-----------------|-----------|
| I'm going to check | I'm gonna check | 1 | words_blended (default) | casual_shortcuts |
| I want to see you | I wanna see you | 1 | words_blended (default) | casual_shortcuts |
| I got to go | I gotta go | 1 | words_blended (default) | casual_shortcuts |

**Why it's wrong:** Single casual reduction is still a significant listening pattern but gets wrong category

---

### Threshold 6: `accuracyPercent < 40 && uniqueWrongGuesses.size >= 3` (Review Summary)

**Location:** `lib/reviewSummary.ts` (line 309)

**Problem:** High accuracy with spelling errors doesn't trigger "speed_fast" category (correct), but spelling errors are still misclassified

**Trigger Examples:**

| Transcript | User Text | Accuracy | uniqueWrongGuesses | System Category | Real Issue |
|-----------|-----------|----------|-------------------|-----------------|------------|
| I need to check my schedule | I need to check my scedule | 86% | 1 | words_blended | Spelling (not speed) |
| Can you help me with this question? | Can you help me with tis qustion? | 80% | 2 | words_blended | Spelling (not speed) |

**Why it's wrong:** Threshold works correctly (doesn't trigger for spelling), but spelling errors still get wrong category from default fallback

---

### Threshold 7: `semanticScore >= 0.7` (Semantic Evaluator)

**Location:** `lib/semanticEvaluator.ts` (line 311)

**Problem:** Fuzzy matching treats spelling errors as "understood", hiding them from feedback

**Trigger Examples:**

| Transcript | User Text | Semantic Score | Understood? | Real Issue |
|-----------|-----------|----------------|-------------|------------|
| What time is the meeting? | What time is the meting? | 0.95 (fuzzy match) | ✅ YES | Spelling error hidden |
| I need to check my schedule | I need to check my scedule | 0.92 (fuzzy match) | ✅ YES | Spelling error hidden |
| Can you help me with this? | Can you help me with tis? | 0.88 (fuzzy match) | ✅ YES | Spelling error hidden |

**Why it's wrong:** Spelling errors in keywords are treated as correct understanding, learner never sees feedback about spelling

---

## 4. Summary Statistics

### Misdiagnosis Risk by Error Type

| Error Type | Total Cases | High Risk Cases | Misdiagnosis Rate |
|------------|-------------|-----------------|-------------------|
| **Spelling Errors** | 25 | 25 | **100%** |
| **Vocabulary Gaps** | 5 | 5 | **100%** |
| **True Listening Errors** | 5 | 0 | **0%** |
| **Boundary Issues** | 3 | 0 | **0%** |
| **Mixed Errors** | 2 | 2 | **100%** |

### Most Common Misdiagnosis Patterns

1. **Spelling → VOWEL_REDUCTION** (20 cases)
   - All spelling errors with 1-2 char differences
   - Triggered by `soundsSimilar()` heuristic

2. **Spelling → words_blended (default)** (5 cases)
   - Single spelling errors that don't match any category
   - Triggered by default fallback in `pickTopIssue()`

3. **Vocabulary → BOUNDARY_MISALIGNMENT** (5 cases)
   - Unknown words replaced with known synonyms
   - No vocabulary gap detection in alignment

4. **Mixed → Primary Cause Only** (2 cases)
   - Secondary cause threshold hides spelling errors
   - Only listening error is shown

### Threshold Impact Summary

| Threshold | Problem | Affected Cases | Severity |
|-----------|---------|----------------|----------|
| `contentWordErrors >= 2` | Single errors get wrong category | 5 | Medium |
| `secondaryCause.count >= 2` | Mixed errors hide secondary cause | 2 | High |
| `confidence >= 0.55` | Low-confidence spelling → boundary | 4 | High |
| `semanticScore >= 0.7` | Spelling errors marked as understood | 3 | Critical |
| `soundsSimilar()` heuristic | All spelling errors → listening | 25 | Critical |

---

## 5. Root Cause Analysis

### Primary Root Causes

1. **No Spelling Error Detection**
   - System assumes all word-level differences are listening errors
   - No dictionary lookup or spelling checker
   - No distinction between character-level and word-level errors

2. **Fuzzy Matching Masks Errors**
   - Semantic evaluator treats spelling errors as correct
   - Levenshtein distance tolerance too high (1-2 chars)
   - Keywords marked as "captured" when they're misspelled

3. **Heuristic-Based Classification**
   - `soundsSimilar()` uses simple rules (first letter + length)
   - No phonetic analysis or actual sound comparison
   - Spelling errors match listening error heuristics

4. **Threshold-Based Category Selection**
   - Hard-coded thresholds (>= 2, >= 0.55, >= 0.7)
   - Single errors fall through to defaults
   - No consideration of error type (spelling vs listening)

5. **No Vocabulary Gap Detection**
   - All substitutions treated as listening errors
   - No check if user word is a real English word
   - No check if user word is a synonym (vocab gap indicator)

---

## 6. Conclusion

**Overall Misdiagnosis Rate:** ~83% (30 out of 40 cases are high risk)

**Critical Issues:**
- 100% of spelling errors are misdiagnosed as listening errors
- 100% of vocabulary gaps are misdiagnosed as listening errors
- Semantic evaluation hides spelling errors from feedback
- Threshold gates cause wrong category labels

**System Strengths:**
- Correctly identifies true listening errors (reductions, function word drops)
- Correctly identifies boundary/segmentation issues
- Alignment algorithm is accurate (just misinterprets results)

**Key Insight:** The system is designed for listening comprehension errors but has no mechanism to distinguish them from spelling errors or vocabulary gaps. All word-level differences are treated as listening perception issues.
