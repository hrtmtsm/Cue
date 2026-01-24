# Evaluation and Feedback System Documentation

## 1. Core Evaluation Logic

### 1.1 Text Alignment (`lib/alignmentEngine.ts`)

**Primary Function**: `alignTexts(refText: string, userText: string): AlignmentResult`

**How it works**:
- Uses **Levenshtein distance** (dynamic programming) to align token sequences
- Normalizes text: lowercase, removes punctuation (keeps apostrophes), merges contractions
- Tokenizes both reference and user text
- Creates alignment operations: `match`, `sub` (substitution), `del` (deletion), `ins` (insertion)
- Returns:
  - `refTokens`: Tokenized reference transcript
  - `userTokens`: Tokenized user input
  - `tokens`: Array of `AlignmentToken` objects (one per token)
  - `events`: Array of `AlignmentEvent` objects (only errors: substitutions, missing, extra)
  - `stats`: Counts of correct/substitutions/missing/extra

**Key Normalization Steps**:
```typescript
// 1. Lowercase
// 2. Remove punctuation (keep apostrophes)
// 3. Merge contractions: "i m" → "i'm", "im" → "i'm"
// 4. Collapse spaces
```

**Accuracy Calculation** (`app/api/check-answer/route.ts:89-90`):
```typescript
const denom = aligned.stats.correct + aligned.stats.substitutions + aligned.stats.missing
const accuracyPercent = denom > 0 ? Math.round((aligned.stats.correct / denom) * 100) : 0
```

**Note**: Extra tokens don't count against accuracy (only missing/substitutions do).

---

### 1.2 Alternative Accuracy Calculator (`lib/accuracyCalculator.ts`)

**Function**: `calculateAccuracyScore(expected: string, userInput: string): number`

**Method**:
- **Token overlap** (70% weight): Count matching tokens (case-insensitive)
- **Character similarity** (30% weight): Character-by-character comparison
- Returns value 0-1

**Formula**:
```
tokenOverlap = matches / max(expectedTokens.length, userTokens.length)
charSimilarity = charMatches / max(expectedLength, userLength)
accuracy = tokenOverlap * 0.7 + charSimilarity * 0.3
```

**Note**: This is currently **not used** in the main flow (only in legacy code).

---

## 2. Feedback Generation

### 2.1 Practice Steps Generation (`lib/practiceSteps.ts`)

**Primary Function**: `extractPracticeSteps(events, refTokens, userTokens, maxSteps, transcript, patterns?, patternFeedback?)`

**Process**:
1. **Categorize each error event** by type:
   - `missing`: Word was expected but not heard/typed
   - `substitution`: Word was replaced with different word
   - `extra`: Word was added that wasn't in reference

2. **For each error, determine category** (`FeedbackCategory`):
   - `weak_form`: Function words (the, to, and)
   - `linking`: Words blend at boundaries (want to → wanna)
   - `elision`: Sounds dropped (going to → gonna)
   - `contraction`: Contractions (you're, I'm)
   - `similar_words`: Phonetically similar (a/the, your/you're)
   - `spelling`: 1-char edit distance typos
   - `missed`: Generic missed content
   - `speed_chunking`: Fast speech chunking

3. **Pattern Matching** (if patterns provided):
   - Attempts to match error against `listening_patterns` from database
   - Checks: `pattern.words[0]`, `pattern.patternKey`, `pattern.variants[].spoken_form`
   - If match found, uses pattern's explanation fields

4. **Variant-Specific Feedback** (if `patternFeedback` provided):
   - Uses clip-specific variant from `clip_pattern_spans` table
   - Provides `written_form` (e.g., "going to") and `spoken_form` (e.g., "gonna")
   - Uses variant's `explanation_short` or `explanation_medium`

5. **Generate feedback fields**:
   - `soundRule`: Explanation of what happens to the sound
   - `meaningInContext`: What the word/phrase means in this sentence
   - `inSentence.highlighted`: The canonical form (e.g., "going to")
   - `inSentence.heardAs`: How it sounds (e.g., "gonna")
   - `tip`: Short listening tip
   - `extraExample`: Another sentence using the same pattern

**Output**: Array of `PracticeStep` objects (max `maxSteps`, default 10)

---

### 2.2 Error Classification (`lib/errorClassifier.ts`)

**Function**: `classifyError(token, context): ErrorCause[]`

**Error Causes**:
- `CONNECTED_SPEECH`: Words blend together
- `WORD_REDUCTION`: Reduced forms (gonna, wanna)
- `FUNCTION_WORD_DROP`: Small connecting words (the, a, to)
- `VOWEL_REDUCTION`: Similar-sounding words
- `BOUNDARY_MISALIGNMENT`: Wrong word boundaries
- `CONTENT_WORD_MISS`: Important content words missed

**Classification Logic**:
```typescript
// Missing word:
if (isFunctionWord(expected)) → FUNCTION_WORD_DROP
if (isContraction(expected) || isReducedForm(expected)) → WORD_REDUCTION
if (context.prevToken && context.nextToken) → CONNECTED_SPEECH
else → CONTENT_WORD_MISS

// Substitution:
if (isReducedForm(expected, actual)) → WORD_REDUCTION
if (soundsSimilar(expected, actual)) → VOWEL_REDUCTION
always → BOUNDARY_MISALIGNMENT
```

---

### 2.3 Data-Driven Feedback (`lib/dataDrivenFeedback.ts`)

**Function**: `generateFeedbackFromErrors(tokens): DataDrivenFeedback | null`

**Process**:
1. Filters to high-confidence errors (confidence ≥ 0.55 for substitutions)
2. Analyzes all errors and counts by `ErrorCause`
3. Ranks causes by frequency
4. Generates summary using templates
5. Extracts examples from actual errors

**Templates** (examples):
- `WORD_REDUCTION`: "You often missed reduced words like 'gonna' or 'wanna'."
- `FUNCTION_WORD_DROP`: "You often missed small connecting words like 'the' or 'a'."
- `CONNECTED_SPEECH`: "You often missed words when they were spoken together."

---

## 3. Pattern/Difficulty Identification

### 3.1 Pattern Matching (`lib/listeningPatternMatcher.ts`)

**Function**: `matchListeningPattern(target, patterns, context)`

**Matching Strategy**:
1. Checks if `pattern.words[0]` matches target
2. Checks if `pattern.patternKey` or `pattern.id` matches target
3. Checks if any `pattern.variants[].spoken_form` matches target

**Eligibility Check**: `isEligibleForPatternMatching(target, category)`
- Must be `missing` or `substitution` event
- Target must not be a function word (unless category is `weak_form`)
- Target must be ≥ 2 characters

---

### 3.2 Clip Pattern Spans (`app/api/check-answer/route.ts:95-210`)

**Database Tables**:
- `clip_pattern_spans`: Links clips to specific pattern variants
  - Fields: `clip_id`, `pattern_key`, `variant_id`, `ref_start`, `ref_end`, `approved`
- `listening_patterns`: Pattern definitions
  - Fields: `pattern_key`, `cefr_min`, `priority`, `category`
- `listening_pattern_variants`: Variant-specific explanations
  - Fields: `pattern_key`, `written_form`, `spoken_form`, `explanation_short`, `explanation_medium`

**Process**:
1. Fetch `clip_pattern_spans` for the clip (where `approved = true`)
2. Detect which patterns were missed (check if alignment events overlap with pattern spans)
3. Sort by: CEFR level → position → priority
4. Show only first missed pattern (one at a time)
5. Fetch variant data and return `patternFeedback` array

---

## 4. Database Queries and Data Models

### 4.1 Clips Table (`curated_clips`)

**Key Fields**:
- `id`: UUID
- `transcript`: Full transcript text
- `cefr`: Difficulty level (A1, A2, B1, B2)
- `focus_areas`: Array of focus categories
- `clip_type`: 'diagnostic' or 'practice'
- `situation`: Optional situation tag

**Query Example** (`app/api/clips/diagnostic/route.ts`):
```typescript
const { data } = await supabase
  .from('curated_clips')
  .select('*')
  .eq('clip_type', 'diagnostic')
  .order('id', { ascending: true })
  .limit(3)
```

---

### 4.2 Pattern Tables

**`listening_patterns`**:
- `pattern_key`: Unique identifier (e.g., "gonna")
- `words`: Array of words that match this pattern
- `cefr_min`: Minimum CEFR level
- `priority`: Sorting priority
- `category`: FeedbackCategory
- `is_active`: Boolean flag

**`listening_pattern_variants`**:
- `pattern_key`: Foreign key to `listening_patterns`
- `written_form`: Canonical form (e.g., "going to")
- `spoken_form`: Reduced form (e.g., "gonna")
- `explanation_short`: Brief explanation
- `explanation_medium`: Detailed explanation

**`clip_pattern_spans`**:
- `clip_id`: Foreign key to `curated_clips`
- `pattern_key`: Foreign key to `listening_patterns`
- `variant_id`: Foreign key to `listening_pattern_variants`
- `ref_start`: Character start position in transcript
- `ref_end`: Character end position in transcript
- `approved`: Boolean flag

---

### 4.3 User Attempts Tracking

**Currently stored in `localStorage`**:
- `diagnosticClips`: Array of diagnostic clips
- `diagnosticResults`: Array of per-clip results
- `diagnosticSummary`: Overall summary (CEFR, accuracy, weaknessRank)
- `quickStartSummary`: Quick start summary (missedRate, attemptAccuracy, startingDifficulty)

**Future**: Could be migrated to database tables:
- `user_attempts`: `user_id`, `clip_id`, `accuracy_percent`, `submitted_at`
- `user_diagnostic_results`: `user_id`, `clip_id`, `accuracy_percent`, `categories[]`

---

## 5. Sample Feedback Examples

### 5.1 Reduction Pattern: "gonna"

**When user misses "gonna" or types "going to" instead**:

**From variant feedback**:
```typescript
{
  written_form: "going to",
  spoken_form: "gonna",
  explanation_short: "In casual speech, 'going to' often sounds like 'gonna'.",
  explanation_medium: "The phrase 'going to' is commonly reduced to 'gonna' in fast, casual speech. The 'g' sound blends with the 'o', and the 'ing' becomes 'n'."
}
```

**UI Display** (PhraseCard):
- **Highlighted**: "going to"
- **Heard as**: "gonna"
- **Sound rule**: "In casual speech, 'going to' often sounds like 'gonna'."

---

### 5.2 Weak Form: "the"

**When user misses "the"**:

**Category**: `weak_form`

**Generated feedback**:
```typescript
{
  category: 'weak_form',
  soundRule: "Function words like 'the' are often unstressed and reduced to 'thuh'.",
  meaningInContext: "The word 'the' is a definite article that points to a specific thing.",
  inSentence: {
    highlighted: "the",
    heardAs: "thuh"
  }
}
```

---

### 5.3 Content Word Miss

**When user misses a key content word**:

**Category**: `missed`

**Generated feedback**:
```typescript
{
  category: 'missed',
  soundRule: "Content words carry meaning but can be missed in fast speech.",
  meaningInContext: "[Context-specific meaning from pattern or generated]",
  inSentence: {
    highlighted: "[missed word]",
    heardAs: "[missed word]"
  }
}
```

---

## 6. Configuration and Constants

### 6.1 Function Words (`lib/errorClassifier.ts:15-27`)

```typescript
const FUNCTION_WORDS = new Set([
  'a', 'an', 'the',
  'is', 'are', 'was', 'were', 'be', 'been',
  'have', 'has', 'had',
  'do', 'does', 'did',
  'will', 'would', 'could', 'should',
  'to', 'for', 'of', 'in', 'on', 'at', 'by', 'with',
  'and', 'or', 'but',
  'this', 'that', 'these', 'those',
  'i', 'you', 'he', 'she', 'it', 'we', 'they',
  'my', 'your', 'his', 'her', 'its', 'our', 'their',
  'please', 'thanks', 'thank', 'you',
])
```

**Usage**: Function words are often ignored or treated differently in error classification.

---

### 6.2 Reduced Forms (`lib/errorClassifier.ts:47-59`)

```typescript
const REDUCED_FORMS: Record<string, string> = {
  'going to': 'gonna',
  'want to': 'wanna',
  'got to': 'gotta',
  'kind of': 'kinda',
  'sort of': 'sorta',
  'give me': 'gimme',
  'let me': 'lemme',
  'what are': "what're",
  'you are': "you're",
  'we are': "we're",
  'they are': "they're",
}
```

**Usage**: Maps canonical forms to reduced forms for error classification.

---

### 6.3 Similarity Thresholds (`lib/alignmentConfidence.ts:60`)

```typescript
const REPLACEMENT_CONFIDENCE_THRESHOLD = 0.55
```

**Usage**: If string similarity ≥ 0.55, treat as substitution. Otherwise, split into delete + insert.

---

### 6.4 High-Confidence Threshold (`lib/dataDrivenFeedback.ts:186`)

```typescript
if (token.type === 'wrong') {
  return token.confidence !== undefined && token.confidence >= 0.55
}
```

**Usage**: Only analyze substitutions with confidence ≥ 0.55 for feedback generation.

---

### 6.5 Accuracy Calculation Weights (`lib/accuracyCalculator.ts:50-51`)

```typescript
const accuracy = tokenOverlap * 0.7 + charSimilarity * 0.3
```

**Usage**: Token overlap weighted 70%, character similarity 30% (not currently used in main flow).

---

### 6.6 Max Practice Steps (`lib/practiceSteps.ts`)

**Default**: `maxSteps = 10`

**Usage**: Limits the number of feedback items shown to user per clip.

---

## 7. Feedback Flow Diagram

```
User submits answer
    ↓
/api/check-answer (POST)
    ↓
alignTexts(transcript, userText)
    ↓
Returns: { events, refTokens, userTokens, stats, accuracyPercent }
    ↓
If clipId provided:
    ↓
Query clip_pattern_spans → detect missed patterns → fetch variants
    ↓
Return patternFeedback[]
    ↓
Client: extractPracticeSteps(events, refTokens, userTokens, transcript, patterns, patternFeedback)
    ↓
For each error event:
    ↓
1. Categorize (weak_form, linking, elision, etc.)
    ↓
2. Try pattern matching (if patterns provided)
    ↓
3. Use variant feedback (if patternFeedback provided)
    ↓
4. Generate soundRule, meaningInContext, heardAs, etc.
    ↓
Return PracticeStep[]
    ↓
UI: Display feedback in PhraseCard components
```

---

## 8. Key Files Reference

### Core Evaluation
- `lib/alignmentEngine.ts`: Text alignment algorithm
- `app/api/check-answer/route.ts`: API endpoint for answer checking
- `lib/accuracyCalculator.ts`: Alternative accuracy calculation (legacy)

### Feedback Generation
- `lib/practiceSteps.ts`: Main feedback generation logic
- `lib/errorClassifier.ts`: Error cause classification
- `lib/dataDrivenFeedback.ts`: Data-driven summary generation
- `lib/listeningPatternMatcher.ts`: Pattern matching logic

### Pattern Data
- `app/api/listening-patterns/route.ts`: API endpoint for patterns
- `lib/listeningPatterns.ts`: Pattern type definitions
- `lib/types/patternFeedback.ts`: Pattern feedback types

### UI Components
- `components/PhraseCard.tsx`: Displays individual feedback items
- `app/(app)/practice/review/page.tsx`: Review page that shows feedback

---

## 9. Example: Complete Flow for "gonna"

**Input**:
- Transcript: "I'm going to grab some coffee"
- User types: "I'm going grab some coffee" (misses "to")

**Alignment**:
```typescript
{
  events: [
    {
      type: 'missing',
      expectedSpan: 'to',
      refStart: 2,
      refEnd: 2
    }
  ],
  stats: { correct: 5, missing: 1, substitutions: 0, extra: 0 }
}
```

**Pattern Detection** (if clip has pattern span for "going to"):
```typescript
{
  pattern_key: "gonna",
  written_form: "going to",
  spoken_form: "gonna",
  explanation_short: "In casual speech, 'going to' often sounds like 'gonna'."
}
```

**Practice Step Generated**:
```typescript
{
  category: 'elision',
  target: 'to',
  inSentence: {
    highlighted: 'going to',  // From variant.written_form
    heardAs: 'gonna'          // From variant.spoken_form
  },
  soundRule: "In casual speech, 'going to' often sounds like 'gonna'.",
  meaningInContext: "The phrase 'going to' indicates future intention."
}
```

**UI Display**:
- Shows: "going to" → "gonna"
- Explanation: "In casual speech, 'going to' often sounds like 'gonna'."

---

## 10. Future Improvements

1. **Database-backed user attempts**: Store attempts in Supabase instead of localStorage
2. **Confidence scoring**: Improve confidence calculation for substitutions
3. **Semantic similarity**: Add semantic matching for synonyms/paraphrases
4. **Adaptive feedback**: Adjust feedback detail based on user level
5. **Pattern learning**: Track which patterns users struggle with most

