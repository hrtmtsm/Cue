# SYSTEM SPEC FROM CODE (CURRENT)

## A) Data Contracts

### A1) ListeningPattern type

**Full type definition from code:**
```typescript
interface ListeningPattern {
  id: string                    // Pattern identifier (pattern_key from DB)
  words: string[]              // Sequence of tokens for matching (e.g., ["want", "to"])
  chunkDisplay: string         // Learner-recognizable form (e.g., "want to")
  reducedForm?: string         // Optional phonetic reduction (e.g., "wanna")
  howItSounds: string          // Explanation text for how pattern sounds
  tip?: string                 // Optional listening tip
  priority: number             // Higher = better match when multiple patterns hit
}
```

**Runtime transformations:**
- **DB → API:** `app/api/listening-patterns/route.ts:43-67`
  - `reduced_form` (snake_case, nullable) → `reducedForm` (camelCase, undefined if null)
  - `chunk_display` → `chunkDisplay`
  - `how_it_sounds` → `howItSounds`
  - `pattern_key` → `id` (fallback to `id` if pattern_key missing)
  - `words` array used directly (no transformation)
  - Legacy fallback: if `words[]` is null, reconstructs from `focus/left1/right1/right2` columns

- **API → Client:** No transformation (JSON sent directly)

- **Normalization:**
  - **Pattern matching:** Both pattern.words[i] and tokens compared via `.toLowerCase()` (line 77-78 in listeningPatternMatcher.ts)
  - **Tokenization:** See A2 below

### A2) Alignment / Token shape

**Input normalization (`lib/alignmentEngine.ts:60-79`):**
- `normalizeText()`: lowercase, remove punctuation (except apostrophes), collapse spaces, merge contractions
- `tokenize()`: split on spaces after normalization
- Contractions normalized BEFORE tokenization (e.g., "i m" → "i'm")

**Alignment input:**
- `refText`: string (expected/transcript) - normalized via `normalizeText()` then tokenized
- `userText`: string (user typed) - normalized via `normalizeText()` then tokenized

**Alignment output shape (`lib/alignmentEngine.ts:46-57`):**
```typescript
{
  refTokens: string[]          // ["i", "want", "to", "go"]
  userTokens: string[]         // ["i", "wana", "go"]
  tokens: AlignmentToken[]     // Individual token alignments (correct/substitution/missing/extra)
  events: AlignmentEvent[]     // High-level events (missing/substitution/extra)
  stats: {
    correct: number
    substitutions: number
    missing: number
    extra: number
  }
}
```

**AlignmentEvent shape (`lib/alignmentEngine.ts:19-44`):**
```typescript
{
  eventId: string
  type: 'missing' | 'substitution' | 'extra'
  refStart: number              // Token index in refTokens
  refEnd: number                // Inclusive end index
  userStart?: number            // Token index in userTokens (if substitution/extra)
  userEnd?: number              // Inclusive end index
  expectedSpan: string          // Extracted from refTokens[refStart..refEnd]
  actualSpan?: string           // Extracted from userTokens or "(not heard)"
  context: {
    before: string              // 3 tokens before
    after: string               // 3 tokens after
    fullRef: string
    fullUser: string
  }
  phraseHint?: {                // Optional: multi-word phrase spans
    spanText: string
    spanRefStart: number
    spanRefEnd: number
  }
}
```

**Example alignment output:**
```typescript
// refText: "I want to go"
// userText: "i wana go"
{
  refTokens: ["i", "want", "to", "go"],
  userTokens: ["i", "wana", "go"],
  events: [
    {
      eventId: "abc123",
      type: "substitution",
      refStart: 1,
      refEnd: 1,
      userStart: 1,
      userEnd: 1,
      expectedSpan: "want",
      actualSpan: "wana",
      context: { before: "i", after: "to go", ... }
    },
    {
      eventId: "def456",
      type: "missing",
      refStart: 2,
      refEnd: 2,
      expectedSpan: "to",
      actualSpan: "(not heard)",
      ...
    }
  ]
}
```

---

## B) Matching Pipeline (end-to-end)

### 1. API Layer
**File:** `app/api/listening-patterns/route.ts`

**Flow:**
1. Queries Supabase `listening_patterns` table
   - Filters: `is_active = true`
   - Orders: `priority DESC`
   - Selects: `id, pattern_key, words, chunk_display, reduced_form, how_it_sounds, tip, priority, is_active, focus, left1, right1, right2`
2. If error OR empty results → falls back to `LISTENING_PATTERNS` from `lib/listeningPatterns.ts`
3. Converts each DB row via `convertSupabasePattern()` (snake_case → camelCase)
4. Returns JSON array with cache headers:
   - Success: `s-maxage=600, stale-while-revalidate=600`
   - Fallback: `s-maxage=60, stale-while-revalidate=60`

**Error behavior:** Always returns 200 status, falls back to local patterns (never throws)

### 2. Hook Layer
**File:** `lib/useListeningPatterns.ts`

**Behavior:**
- Initial state: `patterns = LISTENING_PATTERNS` (local fallback), `loading = true`
- On mount: Fetches `/api/listening-patterns`
- On success: Updates `patterns` if array non-empty, else keeps local fallback
- On error: Keeps local fallback, sets `error` state
- Always sets `loading = false` after fetch completes

**Return:** `{ patterns: ListeningPattern[], loading: boolean, error: Error | null }`

### 3. Matcher Layer
**File:** `lib/listeningPatternMatcher.ts`

**Input:** `matchListeningPattern(focus: string, tokens: string[], targetIndex: number, patterns?: ListeningPattern[])`

**Algorithm:**
1. Normalize focus: `focus.toLowerCase()`
2. Choose patterns source: `patterns || LISTENING_PATTERNS` (fallback to local)
3. Filter candidates: patterns where `words[0].toLowerCase() === focusLower`
4. Sort candidates:
   - Primary: longer patterns first (`b.words.length - a.words.length`)
   - Secondary: higher priority first (`b.priority - a.priority`)
5. Try each pattern (in sorted order):
   - For `i in [0..pattern.words.length-1]`:
     - Check `tokens[targetIndex + i]?.toLowerCase() === pattern.words[i].toLowerCase()`
     - If any mismatch → skip pattern
   - If all match → return `PatternMatchResult`
6. If no match → return `null`

**Output:** `PatternMatchResult | null`
```typescript
{
  pattern: ListeningPattern
  soundRule: string           // From pattern.howItSounds
  tip?: string                // From pattern.tip (undefined if null)
  chunkDisplay: string        // From pattern.chunkDisplay
  reducedForm?: string        // From pattern.reducedForm (undefined if null)
}
```

**Backward matching:** `matchListeningPatternBackward()` - same logic but matches patterns ending with target word (for verb chunks like "gonna go")

### 4. Step Builder Layer
**File:** `lib/practiceSteps.ts:extractPracticeSteps()`

**Flow:**
1. Prioritize events: phrase hints first, then other events
2. For each event (up to `maxSteps`):
   a. Extract `target` from `expectedSpan` or `refTokens[refStart..refEnd]`
   b. Extract `actualSpan` from event or `userTokens[userStart..userEnd]`
   c. Call `detectCategory(target, actualSpan)` → initial category
   d. Generate base feedback:
     - `heardAs = generateHeardAs(target, category)`
     - `soundRule = generateSoundRule(target, category, heardAs)`
     - `tip = generateTip(category, target, actualSpan)`
     - `extraExample = generateExtraExample(target, category)`
   e. Pattern matching (if `category === 'weak_form' || 'missed'`):
     - Check content-word guard: `targetHasContentWord = !containsOnlyFunctionWords(target)`
     - If eligible, call `matchListeningPattern()` at `targetIndex`
     - If pattern hit:
       - **SAFETY GUARD:** If `targetHasContentWord && category === 'weak_form'`:
         - Force `category = 'missed'`
         - **DO NOT** override soundRule/tip/chunkDisplay
       - Else:
         - Override `soundRule`, `tip`, `chunkDisplay`, `reducedForm` from pattern
   f. Chunk synthesis (if no pattern hit and eligible):
     - Only if `containsOnlyFunctionWords(target)` (SAFETY GUARD)
     - Synthesize chunk from right context (e.g., "to the" → "to-the-park")
   g. Generate meaning: `generateMeaningInContext(target, fullSentence, category, chunkDisplay, actualSpan)`
   h. Create `PracticeStep` object
3. Return `steps.slice(0, maxSteps)`

**Key logic:** Pattern matching only applies when category is `'weak_form'` OR `'missed'`, AND target is eligible (starts with pattern word)

### 5. UI Render Layer
**File:** `components/PhraseCard.tsx`

**Sections rendered (in order):**
1. Header: Phrase title + category badge + bookmark icon
2. Comparison box: "What was said" → "What you typed" (if `actualSpan !== undefined`)
3. Meaning section (chunk-aware)
4. "How it sounds" section (if `showHowItSounds`)
5. "In this sentence" section (if `inSentence` exists)
6. "Another example" section (if `showExtraExample`)
7. Listening tip (if `tip` exists)

**Chunk mode decision:** `hasChunk = Boolean(inSentence?.chunkDisplay)` (line 169)

---

## C) Categorization Logic (CRITICAL)

### C1) FeedbackCategory enum/union
**File:** `lib/practiceSteps.ts:7-15`

All categories:
- `'weak_form'` - Function words reduced (the, to, and → thuh, ta, n)
- `'linking'` - Words blend at boundaries (want to → wanna)
- `'elision'` - Sounds dropped (going to → gonna)
- `'contraction'` - Contractions (you're → yer, I'm → im)
- `'similar_words'` - Phonetically similar words (a/the, your/you're)
- `'spelling'` - Spelling/typo errors (1-char edit distance)
- `'missed'` - Generic missed content
- `'speed_chunking'` - Fast speech chunking

### C2) detectCategory() decision tree
**File:** `lib/practiceSteps.ts:127-180`

**Ordered checks (stops at first match):**

1. **Contractions** (line 132)
   - Condition: `lower.match(/\b(you're|i'm|we're|they're|it's|that's|what's|who's|he's|she's)\b/)`
   - Uses: `phrase` (lowercased)
   - Returns: `'contraction'`

2. **Linking patterns** (line 137)
   - Condition: `lower.match(/\b(want to|going to|got to|have to|need to)\b/)`
   - Uses: `phrase` (lowercased)
   - Returns: `'linking'`

3. **Elision patterns** (line 142)
   - Condition: `lower.includes('going to') || lower.includes('want to')`
   - Uses: `phrase` (lowercased)
   - Returns: `'elision'`
   - **Note:** Overlaps with linking but checked separately

4. **Weak forms** (line 146-151)
   - Condition: `hasFunctionWord && containsOnlyFunctionWords(lower)`
     - `hasFunctionWord`: any word in phrase is in FUNCTION_WORDS Set
     - `containsOnlyFunctionWords()`: ALL words are function words (no content words)
   - Uses: `phrase` (lowercased), FUNCTION_WORDS Set (lines 101-107)
   - Returns: `'weak_form'`
   - **Critical:** Only returns weak_form if phrase contains ONLY function words (not "grab a")

5. **Similar words** (line 154-163)
   - Condition: `actualSpan` exists AND both `lower` and `actualLower` are in same `similarPairs` array
   - Uses: `phrase` (lowercased), `actualSpan` (lowercased)
   - Similar pairs: `['a', 'the']`, `['an', 'a']`, `['is', 'it\'s']`, `['are', 'our']`, `['your', 'you\'re']`, `['their', 'there']`, `['to', 'too', 'two']`
   - Returns: `'similar_words'`

6. **Spelling** (line 165-171)
   - Condition: `actualSpan` exists AND `lower.length <= 6` AND `actualLower.length <= 6` AND `computeEditDistance(lower, actualLower) === 1`
   - Uses: `phrase` (lowercased), `actualSpan` (lowercased)
   - Edit distance: Levenshtein (substitution/deletion/insertion = 1 each)
   - Returns: `'spelling'`

7. **Speed chunking** (line 175-177)
   - Condition: `words.length >= 2`
   - Uses: `phrase` split into words
   - Returns: `'speed_chunking'`

8. **Default fallback** (line 179)
   - Returns: `'missed'`

### C3) Chunk mode vs Non-chunk mode

**Chunk mode trigger:** `hasChunk = Boolean(inSentence?.chunkDisplay)` (PhraseCard.tsx:169)

**In chunk mode:**
- **Meaning:** Shows `inSentence.chunkMeaning` if exists, else `meaningInContext` (PhraseCard.tsx:307-317)
- **"How it sounds":** Always shown (line 209) UNLESS `category === 'spelling'` (line 209)
  - If `isChunkOrientedSoundRule()` → shows `soundRule`
  - Else → shows generic: `"In fast speech, this part links together into one smooth chunk..."`
- **"In this sentence":**
  - Shows chunk line: `"{chunkDisplay}" → "{reducedForm}"` if both exist, else `"{highlighted}" links into "{chunkDisplay}"` (lines 384-397)
  - **NEVER** shows heardAs line (line 223)
- **Extra example heardAs:** NEVER shown (line 236-238)

**In non-chunk mode:**
- **Meaning:** Shows `meaningInContext` if not placeholder (lines 320-344)
- **"How it sounds":** Shown if `!isTautological` (line 209)
- **"In this sentence":**
  - Shows heardAs line: `"{highlighted}" often sounds like "{heardAs}"` if `!heardAsTautology` (lines 400-403)
  - Shows fallback: `"This word is often unstressed..."` if `heardAsTautology && !soundRuleTautology` (lines 405-408)
- **Extra example heardAs:** Shown if `!extraExampleTautology` (line 238)

---

## D) Rendering Rules (CRITICAL)

**File:** `components/PhraseCard.tsx`

### Category Badge
- **Condition:** `category !== undefined` (line 262)
- **Label:** `getCategoryLabel(category)` → maps to display string (lines 23-35)

### "What was said → What you typed" comparison
- **Condition:** `actualSpan !== undefined` (line 280)
- **Display:**
  - "What was said": `phrase` (expected)
  - "What you typed": 
    - If `type === 'missing'`: "(missed)"
    - If `type === 'substitution'`: `actualSpan` (strikethrough red)
    - If `type === 'extra'`: `actualSpan` (italic gray) + "(extra)"

### Meaning section
- **Chunk mode:** Shows if `chunkMeaning || meaningInContext` exists and non-empty (lines 307-317)
- **Non-chunk mode:** Shows if `meaningInContext` exists and is NOT a placeholder (lines 320-344)
  - Placeholder check: Contains strings like "this phrase carries meaning", "this small word is often spoken softly", etc.

### Reduced form display (chunk line)
- **Condition:** `showChunkLine = hasChunk && inSentence && inSentence.chunkDisplay` (line 227)
- **Display:**
  - If `chunkDisplay && reducedForm`: `"{chunkDisplay}" → "{reducedForm}"` (lines 386-390)
  - Else: `"{highlighted}" links into "{chunkDisplay}"` (lines 392-394)

### "How it sounds" section
- **Condition:** `showHowItSounds = category === 'spelling' ? false : (hasChunk ? true : !isTautological)` (line 209)
- **Hidden for:** spelling category (not a listening issue)
- **Shown in chunk mode:** Always (unless spelling)
- **Shown in non-chunk mode:** Only if `!isTautological`
- **Content:**
  - Chunk mode: `chunkModeSoundRule` if exists, else `soundRule` (line 352)
  - Non-chunk mode: `soundRule` (line 352)

### Tautology guard
**Location:** `components/PhraseCard.tsx:64-90, 185-201`

**Definition:**
- `heardAsTautology`: `inSentence && !hasChunk && isTautology(inSentence.heardAs, inSentence.highlighted)` (line 186)
- `soundRuleTautology`: `!hasChunk && containsTautologyPattern(soundRule)` (line 187)
- `isTautological`: `heardAsTautology || soundRuleTautology` (line 188)

**Tautology detection:**
- `isTautology(a, b)`: Normalizes both strings (lowercase, trim, remove quotes/punctuation), compares (line 64-66)
- `containsTautologyPattern(soundRule)`: Checks for patterns like `"X" can sound like "X"` or `"X" often sounds like "X"` (lines 71-90)

**Application:**
- Hides "How it sounds" section if tautological (non-chunk mode only)
- Shows fallback message: `"This word is often unstressed and easy to miss in fast speech."` (line 361)

### "In this sentence" quote
- **Condition:** `inSentence !== null/undefined` (line 366)
- **Always shows:** Full sentence quote in gray box (line 381)

### "Another example" section
- **Condition:** `showExtraExample = extraExample && !isRedundantExample(extraExample, phrase, inSentence?.highlighted)` (line 231)
- **Redundancy check:** `isRedundantExample()` returns true if:
  - `extraExample.sentence` is empty (line 127-129)
  - `extraExample.heardAs === target` (normalized) (line 141-142)
  - `extraExample.heardAs === highlighted` (normalized) (line 145-147)
- **HeardAs suffix:** Shown if `showExtraExampleHeardAs = hasChunk ? false : extraExample?.heardAs && !extraExampleTautology` (lines 236-238)

### Listening tip
- **Condition:** `tip !== undefined && tip !== null && tip !== ''` (line 441)
- **Always shown** if exists (no hiding logic)

---

## E) Known Guardrails & Fallbacks

### Guardrails

1. **Content-word guard** (TRUST > COVERAGE)
   - **Location:** `lib/practiceSteps.ts:534, 557-560, 579, 689, 701-703, 721`
   - **Rule:** Weak-form/chunk explanations NEVER shown if target contains content words
   - **Check:** `containsOnlyFunctionWords(target)` - all words must be in FUNCTION_WORDS Set
   - **Effect:** If `targetHasContentWord && category === 'weak_form'`, forces `category = 'missed'` and skips pattern-based feedback

2. **Tautology guard**
   - **Location:** `components/PhraseCard.tsx:64-90, 185-201`
   - **Rules:** See D) Rendering Rules above
   - **Effect:** Hides "How it sounds" if tautological (non-chunk mode)

3. **Spelling category guard**
   - **Location:** `components/PhraseCard.tsx:209`
   - **Rule:** `category === 'spelling'` → hides "How it sounds" section entirely
   - **Effect:** Spelling feedback never shows listening explanations

4. **Edit distance threshold**
   - **Location:** `lib/practiceSteps.ts:166`
   - **Rule:** Spelling only detected if `phrase.length <= 6 && actualSpan.length <= 6 && editDistance === 1`
   - **Effect:** Long words or multi-char differences → not spelling

5. **Pattern eligibility check**
   - **Location:** `lib/practiceSteps.ts:531, 687`
   - **Rule:** Pattern matching only runs if `category === 'weak_form' || 'missed'` AND `isEligibleForPatternMatching(target, patterns)`
   - **Effect:** Other categories (contraction, linking, etc.) don't get pattern-matched

6. **Chunk synthesis guard**
   - **Location:** `lib/practiceSteps.ts:579, 721`
   - **Rule:** Only synthesizes if `containsOnlyFunctionWords(target)` (same as content-word guard)
   - **Effect:** Content word phrases never get synthesized chunks

### Fallbacks

1. **Pattern source fallback**
   - **API error:** Falls back to `LISTENING_PATTERNS` (local)
   - **Empty API response:** Falls back to `LISTENING_PATTERNS`
   - **Pattern matching:** If `patterns` param empty/undefined → uses `LISTENING_PATTERNS`

2. **Category fallback**
   - **Default:** `'missed'` (final fallback in `detectCategory()`)

3. **Feedback generation fallbacks** (`lib/practiceSteps.ts:634-644, 779-789`)
   - Missing `meaningInContext`: `'This phrase carries meaning in context.'`
   - Missing `soundRule`: `'This phrase can sound different in fast speech.'`
   - Missing `extraExample.sentence`: `extraExample` set to `undefined` (section omitted)

4. **Meaning fallback** (`lib/practiceSteps.ts:348-350`)
   - Default: `'This phrase carries meaning but can be hard to catch in fast speech.'`

5. **SoundRule fallback** (`lib/practiceSteps.ts:373`)
   - Default: `'"${phrase}" can sound like "${heardAs}" when spoken quickly.'`
   - **Exception:** `category === 'spelling'` → returns empty string (but UI hides anyway via line 209)

### Thresholds

- **Edit distance:** 1 (for spelling detection)
- **Word length:** ≤ 6 chars (for spelling detection)
- **Replacement confidence:** 0.55 (in `alignmentConfidence.ts:60` - but not used in current feedback flow)
- **Pattern priority:** Higher number = better (used for tie-breaking)

---

## F) Pattern Matching Rules (MOST IMPORTANT)

**File:** `lib/listeningPatternMatcher.ts`

### Matching Algorithm

**Forward matching (`matchListeningPattern`):**
1. **Normalization:** Both pattern words and tokens compared via `.toLowerCase()` (line 77-78)
   - Case-insensitive matching
   - Punctuation: Already removed during tokenization (alignment phase)
   - Apostrophes: Preserved in tokens (e.g., "i'm" stays as single token)

2. **Pattern selection:**
   - Filters patterns where `words[0].toLowerCase() === focusLower` (line 49-51)
   - Sorts by:
     - **Primary:** Pattern length (longer wins) - `b.words.length - a.words.length`
     - **Secondary:** Priority (higher wins) - `b.priority - a.priority`

3. **Contiguous matching:**
   - Checks tokens starting at `targetIndex`
   - For `i in [0..pattern.words.length-1]`:
     - Compares `tokens[targetIndex + i]?.toLowerCase()` with `pattern.words[i].toLowerCase()`
     - If any mismatch → pattern fails
   - **No skipping:** Must match contiguously from `targetIndex`

4. **Output:** Returns FIRST matching pattern (after sorting) or `null`

**Backward matching (`matchListeningPatternBackward`):**
- Same logic but matches patterns ENDING with target word
- Calculates `startIndex = targetIndex - (patternLength - 1)`
- Used for verb chunks like "gonna go" (matches when "go" is target)

### When Pattern Matching Runs

**Condition:** `lib/practiceSteps.ts:531, 687`
- `category === 'weak_form' || 'missed'`
- AND `isEligibleForPatternMatching(target, patterns)` returns true
  - Checks if any pattern starts with first token of target (line 208-213)

### Pattern Hit Effects

**If pattern match found AND content-word guard passes:**
- `soundRule` = `patternMatch.soundRule` (from `pattern.howItSounds`)
- `tip` = `patternMatch.tip ?? tip` (preserves existing if pattern has no tip)
- `chunkDisplay` = `patternMatch.chunkDisplay`
- `reducedForm` = `patternMatch.reducedForm`

**If pattern match found BUT content-word guard fails:**
- `category` forced to `'missed'`
- **NO** override of soundRule/tip/chunkDisplay/reducedForm

### Function Words vs Content Words

**FUNCTION_WORDS Set** (`lib/practiceSteps.ts:101-107`):
```
'a', 'an', 'the', 'to', 'of', 'for', 'and', 'or', 'but', 'with', 'at', 'in', 'on',
'by', 'from', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had',
'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can',
'this', 'that', 'these', 'those', 'it', 'its', 'they', 'them', 'we', 'us', 'you',
'he', 'him', 'she', 'her', 'his', 'hers', 'their', 'our', 'your', 'my', 'me'
```

**Content word:** Any word NOT in FUNCTION_WORDS Set

**Rule:** Weak-form explanations ONLY allowed if `containsOnlyFunctionWords(phrase)` returns true (ALL words are function words)

### Reduced Form vs Chunk Display

- **chunkDisplay:** Canonical form (e.g., "want to") - always present in pattern
- **reducedForm:** Phonetic reduction (e.g., "wanna") - optional, only if pattern defines it
- **UI display:** If both exist → `"{chunkDisplay}" → "{reducedForm}"` (PhraseCard.tsx:386-389)
- **UI fallback:** If only chunkDisplay → `"{highlighted}" links into "{chunkDisplay}"` (line 392-394)

### Missing vs Substitution vs Insertion

**Determined by alignment (`lib/alignmentEngine.ts:190-279`):**
- **Missing (`'missing'`):** `op === 'del'` in DP alignment → `event.type = 'missing'`, `actualSpan = '(not heard)'`
- **Substitution (`'substitution'`):** `op === 'sub'` in DP alignment → `event.type = 'substitution'`, `actualSpan = userToken`
- **Extra (`'extra'`):** `op === 'ins'` in DP alignment → `event.type = 'extra'`, `actualSpan = userToken`

**Not used in categorization directly** - categorization uses `expectedSpan` and `actualSpan` strings, not event type

---

## G) Repro Examples (derive from code)

### Example 1: expected: "want to" typed: "wana"

**Alignment:** Creates `'substitution'` event with `expectedSpan="want"`, `actualSpan="wana"` (or single "want to" vs "wana" depending on tokenization)

**Category detection:**
1. Contractions: ❌
2. Linking: ❌ ("want to" but actualSpan exists, so check happens)
3. Elision: ✅ **MATCH** → `'elision'` (if "want to" in phrase)

**Wait - re-checking:** If phrase is "want" (single token), then:
- Contractions: ❌
- Linking: ❌ (no "want to" substring)
- Elision: ❌ (no "going to" or "want to")
- Weak form: ❌ ("want" not in FUNCTION_WORDS)
- Similar words: ❌
- **Spelling:** ✅ If "want".length ≤ 6 (4 chars) AND "wana".length ≤ 6 (4 chars) AND editDistance("want", "wana") = 1 → **`'spelling'`**

**Pattern matching:** Not run (category would be 'spelling' or 'elision', not 'weak_form'/'missed')

**UI output:**
- Category: `'spelling'` (if single token) or `'elision'` (if multi-word)
- "How it sounds": **HIDDEN** (spelling) or shown (elision)
- Chunk mode: No (no chunkDisplay set)
- Tip: `'You typed "wana". "want to" is the correct spelling.'` (spelling) or pattern tip (elision)

### Example 2: expected: "grab a" typed: "" (missed)

**Alignment:** Creates `'missing'` event(s) - either single "grab a" or two separate "grab" + "a"

**Category detection (if phrase="grab a"):**
1. Contractions: ❌
2. Linking: ❌
3. Elision: ❌
4. Weak form: **Check:** `hasFunctionWord = true` (has "a"), `containsOnlyFunctionWords("grab a") = false` (grab is content word) → ❌
5. Similar words: ❌ (no actualSpan)
6. Spelling: ❌ (no actualSpan)
7. Speed chunking: ✅ **MATCH** → `'speed_chunking'` (2 words)

**Pattern matching:** Would run (category is 'speed_chunking' which becomes 'missed' via fallback... wait, `speed_chunking` is returned before 'missed')

**Re-check:** Category is `'speed_chunking'`, not `'missed'`, so pattern matching NOT run (line 531 requires 'weak_form' or 'missed')

**UI output:**
- Category: `'speed_chunking'`
- "How it sounds": Shown (not spelling, not tautological)
- Chunk mode: No
- SoundRule: `'In fast speech, "grab a" is spoken as one smooth chunk, making boundaries unclear.'`
- Meaning: Fallback placeholder likely hidden by UI

### Example 3: expected: "want to" typed: "" (missed)

**Alignment:** Creates `'missing'` event(s)

**Category detection (phrase="want to"):**
1. Contractions: ❌
2. Linking: ✅ **MATCH** → `'linking'`

**Pattern matching:** Not run (category is 'linking', not 'weak_form'/'missed')

**UI output:**
- Category: `'linking'`
- "How it sounds": Shown
- Chunk mode: No (unless pattern matching somehow ran... but it shouldn't)

### Example 4: expected: "to" typed: "" (missed)

**Category detection:**
1-3: ❌
4. Weak form: `hasFunctionWord = true` (to is in FUNCTION_WORDS), `containsOnlyFunctionWords("to") = true` (only function word) → ✅ **MATCH** → `'weak_form'`

**Pattern matching:** Runs (category is 'weak_form')
- If pattern matches "to" → sets chunkDisplay/reducedForm/soundRule/tip

**UI output:**
- Category: `'weak_form'` or `'missed'` (if pattern hit with content-word guard... but "to" is function word only)
- "How it sounds": Shown (if not tautological)
- Chunk mode: Yes (if pattern hit and set chunkDisplay)

### Example 5: expected: "kind of" typed: "kinda"

**Alignment:** Creates `'substitution'` event with `expectedSpan="kind of"` or separate tokens

**Category detection (if phrase="kind of"):**
1-3: ❌
4. Weak form: `hasFunctionWord = true` ("of"), `containsOnlyFunctionWords("kind of") = false` ("kind" is content word) → ❌
5-6: ❌
7. Speed chunking: ✅ → `'speed_chunking'`

**Pattern matching:** Not run (category is 'speed_chunking')

**However:** If pattern matching DID run (hypothetically), and pattern "kind-of" exists with `reducedForm="kinda"`, would show chunk mode with `"{kind of}" → "{kinda}"`

**UI output:**
- Category: `'speed_chunking'`
- Chunk mode: Unlikely (pattern matching not run)

---

## H) File Map (for ChatGPT navigation)

- `app/api/listening-patterns/route.ts` → `GET()`, `convertSupabasePattern()`
- `lib/useListeningPatterns.ts` → `useListeningPatterns()` hook
- `lib/listeningPatterns.ts` → `LISTENING_PATTERNS` constant, `ListeningPattern` type
- `lib/listeningPatternMatcher.ts` → `matchListeningPattern()`, `matchListeningPatternBackward()`, `isEligibleForPatternMatching()`, `PatternMatchResult` interface
- `lib/practiceSteps.ts` → `extractPracticeSteps()`, `detectCategory()`, `generateHeardAs()`, `generateMeaningInContext()`, `generateSoundRule()`, `generateTip()`, `generateExtraExample()`, `FeedbackCategory` type, `FeedbackItem` interface, `PracticeStep` interface, `computeEditDistance()`, `isFunctionWord()`, `containsOnlyFunctionWords()`, `FUNCTION_WORDS` Set
- `lib/alignmentEngine.ts` → `alignTexts()`, `normalizeText()`, `tokenize()`, `AlignmentEvent` interface, `AlignmentResult` interface
- `lib/alignmentConfidence.ts` → `computeStringSimilarity()`, `levenshteinDistance()`, `isKnownReducedForm()`, `evaluateReplacement()`, `REPLACEMENT_CONFIDENCE_THRESHOLD`
- `lib/chunkSynthesizer.ts` → `synthesizeChunk()`, `shouldSynthesizeChunk()`, `isEligibleForChunkSynthesis()`
- `components/PhraseCard.tsx` → `PhraseCard()` component, `getCategoryLabel()`, `isTautology()`, `containsTautologyPattern()`, `isChunkOrientedSoundRule()`, `isRedundantExample()` - All rendering logic and visibility guards


