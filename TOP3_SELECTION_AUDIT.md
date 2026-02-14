# Top 3 Insights Selection Algorithm Audit

## A) Top 3 Selection Algorithm (Exact Steps)

### Pipeline Overview
1. **Alignment** → 2. **PhraseHint Attachment** → 3. **Merge Consecutive** → 4. **Filter Trivial** → 5. **Score** → 6. **Group by Phrase** → 7. **Select Top 3**

### Step-by-Step Execution

#### Step 1: Alignment Events from `/api/check-answer`
- **Location**: `app/api/check-answer/route.ts` line 77
- **Function**: `alignTexts(transcript, userText)`
- **Output**: `AlignmentResult` with:
  - `events`: Array of `AlignmentEvent` (missing/substitution/extra)
  - `tokens`: Word-level alignment tokens
  - `refTokens`: Reference transcript as token array
- **Fields per event**:
  - `type`: 'missing' | 'substitution' | 'extra'
  - `expectedSpan`: Expected text (single word or phrase)
  - `actualSpan`: User's text (or '(not heard)')
  - `refStart`: Token index start
  - `refEnd`: Token index end
  - `eventId`: Unique identifier

#### Step 2: Attach PhraseHint (Hardcoded Patterns)
- **Location**: `app/api/check-answer/route.ts` line 88
- **Function**: `attachPhraseSpans(base)` from `lib/phraseSpans.ts`
- **Logic**: 
  - Matches hardcoded `PHRASE_PATTERNS` (11 patterns: `['want', 'to']`, `['going', 'to']`, etc.)
  - For each event, finds best matching pattern starting at `event.refStart`
  - Attaches `phraseHint: { spanText, spanRefStart, spanRefEnd }` if match found
- **Output**: Events with optional `phraseHint` field
- **Note**: Only matches hardcoded patterns, **NOT** DB patterns from `clip_pattern_spans`

#### Step 3: Merge Consecutive Mistakes
- **Location**: `app/[locale]/(app)/practice/review/page.tsx` line 744
- **Function**: `mergeConsecutiveMistakes(events)`
- **Input**: Events from `diffResult.events` (with phraseHint if available)
- **Logic**:
  - Iterates through events in order
  - If current event and next event are:
    - Same type (`missing` or `extra`)
    - Consecutive positions (`current.refEnd + 1 === next.refStart`)
  - Then merge:
    - Concatenate `expectedSpan`: `"word1 word2 word3"`
    - Preserve `phraseHint` if it covers the merged range
    - Update `refEnd` to span merged range
- **Output**: Merged events (fewer events, longer spans)
- **Example**: `["caught", "up", "with"]` → `["caught up with"]`

#### Step 4: Filter Trivial Mistakes
- **Location**: `lib/mistakePrioritization.ts` line 335
- **Function**: `prioritizeAndSelectTop3()` → filtering step
- **Filter Rules**:
  1. **Remove single-letter words**: `trimmed.length === 1` → filtered out
  2. **Remove very short function words**: `length <= 2 && isFunctionWord()` → filtered out
- **Output**: Filtered events (trivial mistakes removed)

#### Step 5: Score Each Mistake
- **Location**: `lib/mistakePrioritization.ts` line 140
- **Function**: `scoreMistake(event, clip)`
- **Scoring Formula** (additive):

| Criterion | Score | Condition |
|-----------|-------|-----------|
| **Multi-word (3+ words)** | +100 | `wordCount >= 3` |
| **Multi-word (2 words)** | +90 | `wordCount === 2` |
| **Phrasal verb** | +85 | `isPhrasalVerb(expectedSpan)` |
| **Focus area match** | +80 | `clip.focusAreas` contains related keyword |
| **Idiom/expression** | +70 | `isIdiom(expectedSpan)` |
| **Reduction** | +60 | `isReduction(expectedSpan, actualSpan)` |
| **Contraction** | +40 | Contains `'` (apostrophe) |
| **Position penalty** | `-0.5 * position` | Later in sentence = lower score |
| **Single letter penalty** | -200 | `wordCount === 1 && length === 1` |
| **Function word penalty** | -100 | `wordCount === 1 && isFunctionWord()` |
| **Short word penalty** | -50 | `wordCount === 1 && length <= 3` (if not function word) |

- **Output**: Array of `{ event, score }` pairs

#### Step 6: Filter Negative Scores
- **Location**: `lib/mistakePrioritization.ts` line 365
- **Logic**: 
  - Filter to `score > 0` (meaningful mistakes)
  - If all scores negative, use all scored items (fallback)
- **Output**: Meaningful mistakes only (or all if none positive)

#### Step 7: Group by Phrase
- **Location**: `lib/mistakePrioritization.ts` line 286
- **Function**: `groupMistakesByPhrase(scored)`
- **Logic**:
  - For each mistake, find matching phrase using `findPhraseForMistake()`
  - `findPhraseForMistake()` checks against hardcoded phrasal verbs + idioms (60+ patterns)
  - Group mistakes that belong to the same phrase
  - Ungrouped mistakes get their own group (key = `expectedSpan`)
- **Output**: `Map<phrase, Array<{event, score}>>`

#### Step 8: Select Best from Each Group
- **Location**: `lib/mistakePrioritization.ts` line 375
- **Logic**:
  - For each phrase group, sort by score (highest first)
  - Take the best mistake from each group
- **Output**: Array of `{ phrase, bestItem, score }`

#### Step 9: Sort Groups by Score
- **Location**: `lib/mistakePrioritization.ts` line 386
- **Logic**: Sort groups by their best mistake's score (highest first)
- **Output**: Sorted groups

#### Step 10: Take Top 3
- **Location**: `lib/mistakePrioritization.ts` line 389
- **Logic**: `sortedGroups.slice(0, 3).map(g => g.bestItem.event)`
- **Output**: Array of up to 3 `AlignmentEvent` objects

#### Step 11: Generate Insights
- **Location**: `app/[locale]/(app)/practice/review/page.tsx` line 878
- **Function**: `fetchMultipleInsights()` → `insightPromises`
- **Logic**: For each of top 3 events:
  - Find nearby mistakes (within 2 positions) for context
  - Call `/api/insight` with event + context
  - LLM generates `CoachingInsight`
- **Output**: Array of `CoachingInsight` objects → stored in `aiInsights` state

#### Step 12: Display in Carousel
- **Location**: `app/[locale]/(app)/practice/review/page.tsx` line 1603
- **State**: `aiInsights` array (length 0-3)
- **UI**: Carousel with navigation, shows `aiInsights[currentInsightIndex]`

## B) File → Function → Role → Key Lines

| File | Function | Role in Pipeline | Key Lines |
|------|----------|------------------|-----------|
| `app/api/check-answer/route.ts` | `alignTexts()` | Step 1: Generate alignment events | 77 |
| `app/api/check-answer/route.ts` | `attachPhraseSpans()` | Step 2: Attach phraseHint (hardcoded) | 88 |
| `app/[locale]/(app)/practice/review/page.tsx` | `mergeConsecutiveMistakes()` | Step 3: Merge consecutive events | 744-827 |
| `lib/mistakePrioritization.ts` | `prioritizeAndSelectTop3()` | Steps 4-10: Filter, score, group, select top 3 | 324-447 |
| `lib/mistakePrioritization.ts` | `scoreMistake()` | Step 5: Calculate learning value score | 140-206 |
| `lib/mistakePrioritization.ts` | `groupMistakesByPhrase()` | Step 7: Group by phrase membership | 286-314 |
| `lib/mistakePrioritization.ts` | `findPhraseForMistake()` | Step 7: Match to known phrases | 255-280 |
| `app/[locale]/(app)/practice/review/page.tsx` | `fetchMultipleInsights()` | Step 11: Generate insights for top 3 | 830-943 |
| `app/api/insight/route.ts` | `generateCoachingInsight()` | Step 11: LLM generation | 22-29 |

## C) Ranking/Priority Heuristics (Explicit Answers)

### Q1: Do we prefer DB semantic chunks over single-word alignment events?
**Answer**: **NO**
- `clip_pattern_spans` / `patternFeedback` is **NOT used** in prioritization
- Only hardcoded patterns from `attachPhraseSpans()` and `findPhraseForMistake()` are used
- DB patterns are fetched but ignored in selection logic

### Q2: Do we prioritize missing vs substitutions vs extras?
**Answer**: **NO explicit type priority**
- All event types (missing/substitution/extra) are scored the same way
- Type only affects merging (only `missing` and `extra` can merge)
- Scoring is based on `expectedSpan` content, not event type

### Q3: Do we prioritize content words over function words?
**Answer**: **YES (via penalties)**
- Function words get **-100 penalty** if single word
- Function words are **filtered out** if `length <= 2`
- Content words (multi-word, phrasal verbs, idioms) get **+70 to +100 bonus**

### Q4: Do we use severity metrics (WER, confidence, frequency, position)?
**Answer**: **PARTIALLY**
- **Position**: Yes, `score -= position * 0.5` (earlier = slightly higher)
- **WER/confidence**: No, not used
- **Frequency**: No explicit frequency, but grouping by phrase prevents duplicates

### Q5: How are consecutive mistakes merged and how does that affect ranking?
**Answer**:
- **Merging**: Only `missing` and `extra` types merge if consecutive (`refEnd + 1 === next.refStart`)
- **Effect on ranking**: Merged events have longer `expectedSpan` (more words) → higher score
  - 3+ words: +100
  - 2 words: +90
  - Single word: penalties apply
- **phraseHint preservation**: If phraseHint covers merged range, it's preserved (chunk-level)

## D) Data Structures Used for Ranking

### Input Fields (from AlignmentEvent)
- `event.type`: 'missing' | 'substitution' | 'extra'
- `event.expectedSpan`: Text that should have been heard
- `event.actualSpan`: Text user typed/heard
- `event.refStart`: Token index start
- `event.refEnd`: Token index end
- `event.phraseHint`: Optional `{ spanText, spanRefStart, spanRefEnd }` (from hardcoded patterns)
- `event.eventId`: Unique identifier

### Scoring Fields (used in `scoreMistake()`)
- `expectedSpan`: Primary field for scoring
- `wordCount`: Number of words in `expectedSpan`
- `position`: `refStart` (for position penalty)
- `clip.focusAreas`: Optional clip metadata

### Grouping Fields (used in `groupMistakesByPhrase()`)
- `expectedSpan`: Matched against hardcoded phrase list
- Phrase membership: Determines grouping key

### Output Fields (from `prioritizeAndSelectTop3()`)
- Returns `AlignmentEvent[]` (up to 3 events)
- Events retain all original fields + phraseHint (if available)

## E) Explicit Score Function (Current Behavior)

```typescript
function scoreMistake(event: AlignmentEvent, clip?: { focusAreas?: string[] }): number {
  let score = 0
  const expectedSpan = event.expectedSpan || ''
  const wordCount = expectedSpan.split(/\s+/).filter(w => w.trim()).length
  const position = event.refStart || 0
  
  // Penalties
  if (wordCount === 1 && expectedSpan.length === 1) {
    score -= 200  // Single letters
  }
  if (wordCount === 1 && isFunctionWord(expectedSpan)) {
    score -= 100  // Function words
  }
  if (wordCount === 1 && expectedSpan.length <= 3 && expectedSpan.length > 1) {
    score -= 50   // Short words
  }
  
  // Bonuses
  if (wordCount >= 3) {
    score += 100  // Multi-word (3+)
  } else if (wordCount === 2) {
    score += 90   // Multi-word (2)
  }
  if (isPhrasalVerb(expectedSpan)) {
    score += 85
  }
  if (clip?.focusAreas?.some(f => isRelatedToFocus(event, f))) {
    score += 80
  }
  if (isIdiom(expectedSpan)) {
    score += 70
  }
  if (isReduction(expectedSpan, event.actualSpan || '')) {
    score += 60
  }
  if (expectedSpan.includes("'")) {
    score += 40
  }
  
  // Position penalty
  score -= position * 0.5
  
  return score
}
```

## F) Key Findings

### 1. DB Patterns Not Used
- `clip_pattern_spans` / `patternFeedback` is fetched but **never used** in selection
- Only hardcoded patterns (11 in `phraseSpans.ts`, 60+ in `mistakePrioritization.ts`) are used

### 2. phraseHint vs expectedSpan
- `phraseHint` is attached but **not directly used in scoring**
- Scoring uses `expectedSpan` (which may be updated by merging)
- `phraseHint` is preserved during merging if it covers the range

### 3. Grouping Prevents Duplicates
- Mistakes belonging to the same phrase are grouped
- Only the highest-scoring mistake from each group is selected
- This prevents showing multiple insights for "caught up with" variations

### 4. No Type-Based Priority
- Missing, substitution, and extra are scored identically
- Type only affects merging eligibility (missing/extra can merge)

### 5. Multi-Word Bias
- Strong preference for multi-word phrases (+90 to +100)
- Single words get penalties unless they're phrasal verbs/idioms

## G) Example Execution

### Input
- Events: 
  1. `{ type: 'missing', expectedSpan: 'the', refStart: 0, refEnd: 0 }`
  2. `{ type: 'missing', expectedSpan: 'train', refStart: 1, refEnd: 1 }`
  3. `{ type: 'missing', expectedSpan: 'station', refStart: 2, refEnd: 2 }`
  4. `{ type: 'substitution', expectedSpan: 'caught up with', refStart: 5, refEnd: 7 }`

### Step 3: Merge
- Events 1-3 merge → `{ type: 'missing', expectedSpan: 'the train station', refStart: 0, refEnd: 2 }`
- Event 4 stays separate

### Step 4: Filter
- Event 1-3 merged: "the train station" → kept (not single letter, not short function word)
- Event 4: "caught up with" → kept

### Step 5: Score
- Event 1-3 merged: `wordCount = 3` → +100, `position = 0` → -0, total ≈ **100**
- Event 4: `wordCount = 3` → +100, `isPhrasalVerb = true` → +85, `position = 5` → -2.5, total ≈ **182.5**

### Step 7: Group
- Event 1-3: No phrase match → group "the train station"
- Event 4: Matches "caught up with" → group "caught up with"

### Step 8-10: Select Top 3
- Group 1: "caught up with" (score 182.5) → selected
- Group 2: "the train station" (score 100) → selected
- Total: 2 groups → returns 2 events

### Step 11: Generate Insights
- Call `/api/insight` for each of 2 events
- Store in `aiInsights` array (length 2)

## H) Recommended Explicit Score Function

The current `scoreMistake()` function is already explicit and well-documented. No changes needed for clarity.

However, to incorporate DB patterns, the scoring could be enhanced:

```typescript
function scoreMistake(
  event: AlignmentEvent,
  clip?: { focusAreas?: string[] },
  patternFeedback?: PatternFeedback[]  // NEW: Add DB patterns
): number {
  // ... existing scoring logic ...
  
  // NEW: Bonus for DB pattern matches
  if (patternFeedback) {
    const matchingPattern = patternFeedback.find(pf => {
      // Match pattern span to event range
      return pf.ref_start <= eventCharEnd && pf.ref_end >= eventCharStart
    })
    if (matchingPattern) {
      score += 120  // Higher than phrasal verb (85) to prioritize DB patterns
    }
  }
  
  return score
}
```

This would require passing `diffResult.patternFeedback` to `prioritizeAndSelectTop3()`.
