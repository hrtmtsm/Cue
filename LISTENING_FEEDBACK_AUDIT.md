# Listening Feedback System - Audit Report

## 1. File Map + Key Functions

### API Layer
- **`app/api/check-answer/route.ts`** (Lines 1-45)
  - `POST()` - Main API handler
  - Calls: `alignTexts(transcript, userText)` → `attachPhraseSpans(base)`
  - Returns: `{ accuracyPercent, refTokens, userTokens, tokens, events, stats, transcript, userText }`

### Alignment Engine
- **`lib/alignmentEngine.ts`** (Lines 1-281)
  - `normalizeText(text: string)` (Line 60) - Lowercases, removes punctuation, merges contractions
  - `tokenize(text: string)` (Line 76) - Splits into tokens after normalization
  - `alignTexts(refText: string, userText: string)` (Line 99) - DP alignment, returns `AlignmentResult`

### Phrase Spans
- **`lib/phraseSpans.ts`** (Lines 1-83)
  - `attachPhraseSpans(result: AlignmentResult)` (Line 43) - Adds phrase hints from `PHRASE_PATTERNS`
  - `findBestSpan(refTokens, refIndex)` (Line 31) - Matches known phrase patterns

### Practice Steps Generation
- **`lib/practiceSteps.ts`** (Lines 1-500)
  - `extractPracticeSteps(events, refTokens, userTokens, maxSteps, fullTranscript)` (Line 344)
  - `detectCategory(phrase, actualSpan)` (Line 51) - Classifies feedback category
  - `generateHeardAs(phrase, category)` (Line 101) - Generates phonetic approximation
  - `generateMeaningInContext(phrase, fullSentence, category)` (Line 152) - Generates meaning text
  - `generateSoundRule(phrase, category, heardAs)` (Line 220) - Generates sound explanation
  - `generateExtraExample(phrase, category)` (Line 245) - Generates example sentence (can return undefined)

### Contraction Normalization
- **`lib/contractionNormalizer.ts`** (Lines 1-273)
  - `normalizeContractions(text: string)` (Line 167) - Merges split contractions before tokenization
  - `expandContraction(contraction: string)` (Line 250) - Expands "I'm" → "I am"

### UI Rendering
- **`app/(app)/practice/[clipId]/practice/page.tsx`** (Lines 1-324)
  - `extractPracticeSteps()` (Line 73) - Called with alignment data from sessionStorage
  - `<PhraseCard feedbackItem={current} />` (Line 282) - Renders feedback

- **`components/PhraseCard.tsx`** (Lines 1-84)
  - `PhraseCard(props)` (Line 19) - Main component
  - Lines 43, 54 - Renders `soundRule` and `inSentence.heardAs` (tautology locations)

---

## 2. Call Chain Diagram

```
Client (Review Page)
  ↓ POST /api/check-answer { transcript, userText }
  ↓
app/api/check-answer/route.ts:21
  ↓ alignTexts(transcript, userText)
  ↓
lib/alignmentEngine.ts:99
  ├─ normalizeText(transcript) [Line 60]
  │  ├─ .toLowerCase() ⚠️ CASING LOST
  │  ├─ .replace(/[^\w\s']/g, ' ') - Remove punctuation
  │  └─ normalizeContractions() [Line 70] ✅ MERGES CONTRACTIONS
  │
  ├─ tokenize(transcript) [Line 76]
  │  └─ split(' ') → ["i'm", "ready"] ✅ SINGLE TOKEN
  │
  └─ alignTokens(refTokens, userTokens) [DP alignment]
     └─ Returns: {
          refTokens: ["i'm", "ready"],
          userTokens: ["i'm", "ready"],
          tokens: AlignmentToken[],
          events: AlignmentEvent[]
        }
  ↓
lib/phraseSpans.ts:22 (attachPhraseSpans)
  ├─ findBestSpan(refTokens, event.refStart) [Line 31]
  │  └─ Matches PHRASE_PATTERNS (e.g., ["want", "to"])
  │  └─ Returns: { start, end, text: "i'm" } ✅ SINGLE TOKEN
  └─ Adds phraseHint to events
  ↓
API Response: {
  refTokens: ["i'm", "ready"],
  events: [{ phraseHint: { spanText: "i'm", ... }, ... }]
}
  ↓
Stored in sessionStorage: `alignment_${clipId}`
  ↓
app/(app)/practice/[clipId]/practice/page.tsx:126-152
  └─ Loads from sessionStorage
  ↓
app/(app)/practice/[clipId]/practice/page.tsx:73
  └─ extractPracticeSteps(events, refTokens, userTokens, 5, transcript)
  ↓
lib/practiceSteps.ts:344 (extractPracticeSteps)
  ├─ detectCategory(target) [Line 379]
  │  └─ Returns: 'contraction' | 'weak_form' | 'missed' | ...
  │
  ├─ generateHeardAs(target, category) [Line 380]
  │  ├─ Check contractions dict → "i'm" → "im" ✅
  │  ├─ Check linking → FALSE
  │  ├─ Check weak forms → FALSE
  │  └─ FALLBACK: return lower ⚠️ TAUTOLOGY SOURCE
  │
  ├─ generateMeaningInContext(target, fullSentence, category) [Line 393]
  │  ├─ Check contraction expansion → "I'm" → "I am" ✅
  │  ├─ Check contextMeanings dict → Partial match
  │  └─ FALLBACK: 'This phrase carries meaning but can be hard to catch...' ⚠️ PLACEHOLDER
  │
  ├─ generateSoundRule(target, category, heardAs) [Line 395]
  │  ├─ switch (category)
  │  └─ FALLBACK: `"${phrase}" can sound like "${heardAs}"` ⚠️ TAUTOLOGY IF heardAs === phrase
  │
  └─ generateExtraExample(target, category) [Line 381]
     ├─ Check examples dict → Exact match
     ├─ Check partial match → includes()
     └─ FALLBACK: return undefined ✅ CORRECT (omits section)
  ↓
PracticeStep object:
  {
    target: "i'm",
    category: 'contraction',
    heardAs: "im",
    meaningInContext: "I'm means \"I am\" - it describes a state or identity.",
    soundRule: "Contractions blend two words. \"i'm\" often sounds like \"im\" in fast speech.",
    inSentence: {
      highlighted: "i'm",
      heardAs: "im"
    },
    extraExample: { sentence: "I'm not sure about that.", heardAs: "im" }
  }
  ↓
app/(app)/practice/[clipId]/practice/page.tsx:282
  └─ <PhraseCard feedbackItem={current} />
  ↓
components/PhraseCard.tsx:19
  ├─ Line 43: {soundRule} → Renders: "Contractions blend two words. \"i'm\" often sounds like \"im\" in fast speech." ✅
  ├─ Line 54: "{highlighted}" often sounds like "{heardAs}"
  │  └─ Renders: "i'm" often sounds like "im" ✅
  └─ Line 62: {extraExample && ...} → Renders example ✅
```

**Note:** Contractions are PRESERVED as single tokens throughout the pipeline (normalized to "i'm", not split).

---

## 3. Data Structures Flow

### Input (API Request)
```typescript
POST /api/check-answer
Body: {
  transcript: "I'm ready",    // Original casing
  userText: "im ready"        // User input
}
```

### After Normalization
```typescript
normalizeText("I'm ready")
  → "i'm ready"  // Lowercased, contractions merged ✅
  
tokenize("i'm ready")
  → ["i'm", "ready"]  // Single tokens, contractions preserved ✅
```

### Alignment Result
```typescript
AlignmentResult {
  refTokens: ["i'm", "ready"],
  userTokens: ["im", "ready"],  // User typed "im" (no apostrophe)
  tokens: [
    { type: 'substitution', expected: "i'm", actual: "im", refIndex: 0, userIndex: 0 },
    { type: 'correct', expected: "ready", actual: "ready", refIndex: 1, userIndex: 1 }
  ],
  events: [
    {
      eventId: "...",
      type: 'substitution',
      refStart: 0,
      refEnd: 0,
      expectedSpan: "i'm",
      actualSpan: "im",
      phraseHint: {
        spanText: "i'm",
        spanRefStart: 0,
        spanRefEnd: 0
      }
    }
  ],
  stats: { correct: 1, substitutions: 1, missing: 0, extra: 0 }
}
```

### Practice Step (FeedbackItem)
```typescript
PracticeStep {
  id: "event-...",
  target: "i'm",
  expectedSpan: "i'm",
  actualSpan: "im",
  refStart: 0,
  refEnd: 0,
  type: 'substitution',
  category: 'contraction',
  meaningInContext: "I'm means \"I am\" - it describes a state or identity.",
  soundRule: "Contractions blend two words. \"i'm\" often sounds like \"im\" in fast speech.",
  inSentence: {
    original: "i'm ready",
    highlighted: "i'm",
    heardAs: "im"
  },
  extraExample: {
    sentence: "I'm not sure about that.",
    heardAs: "im"
  },
  tip: "Listen for the apostrophe sound - it blends the words together."
}
```

---

## 4. Tautology Code Paths

### Path 1: generateHeardAs() Fallback

**File:** `lib/practiceSteps.ts:101-147`  
**Function:** `generateHeardAs(phrase: string, category: FeedbackCategory)`

**Fallback Location:** Line 146
```typescript
// ... all checks fail ...
return lower  // ⚠️ RETURNS ORIGINAL WORD
```

**Trigger Conditions:**
1. Phrase NOT in contractions dict (Lines 105-122)
2. Phrase NOT a linking pattern (Lines 125-129)
3. Phrase NOT in weak forms mapping (Lines 132-137)
   - Only handles: 'the', 'to', 'and', 'for', 'you', 'they'
4. Phrase is single word (NOT multi-word) (Lines 140-144)

**Result:** `heardAs === phrase` (identical)

---

### Path 2: generateSoundRule() Default Case

**File:** `lib/practiceSteps.ts:220-239`  
**Function:** `generateSoundRule(phrase: string, category: FeedbackCategory, heardAs: string)`

**Tautology Location:** Line 237
```typescript
default:
  return `"${phrase}" can sound like "${heardAs}" when spoken quickly.`
  // ⚠️ NO CHECK: if (heardAs === phrase)
```

**Trigger Conditions:**
1. Category is `'missed'` (default fallback from detectCategory)
2. OR category is unknown/unsupported
3. AND `heardAs === phrase` (from generateHeardAs fallback)

**Result:** `"i" can sound like "i" when spoken quickly.`

---

### Path 3: PhraseCard UI Template

**File:** `components/PhraseCard.tsx:47-56`  
**Component:** `PhraseCard`

**Tautology Location:** Line 54
```typescript
<div className="text-sm text-gray-600">
  <span>"{inSentence.highlighted}"</span> often sounds like <span>"{inSentence.heardAs}"</span>
  // ⚠️ HARDCODED TEMPLATE - NO CHECK IF heardAs === highlighted
</div>
```

**Trigger Conditions:**
1. `inSentence` exists (not null)
2. `inSentence.heardAs === inSentence.highlighted` (from generateHeardAs fallback)
3. No conditional rendering to detect identical values

**Result:** `"i" often sounds like "i"`

---

### 5 Concrete Examples

| Word | Category | HeardAs | Sound Rule Output | UI Output | Root Cause |
|------|----------|---------|-------------------|-----------|------------|
| `"i"` | `'missed'` | `"i"` | `"i" can sound like "i" when spoken quickly.` | `"i" often sounds like "i"` | NOT in weakFormWords, NOT in heardAs mapping → fallback |
| `"it"` | `'missed'` | `"it"` | `"it" can sound like "it" when spoken quickly.` | `"it" often sounds like "it"` | NOT in weakFormWords, NOT in heardAs mapping → fallback |
| `"is"` | `'missed'` | `"is"` | `"is" can sound like "is" when spoken quickly.` | `"is" often sounds like "is"` | NOT in weakFormWords, NOT in heardAs mapping → fallback |
| `"are"` | `'missed'` | `"are"` | `"are" can sound like "are" when spoken quickly.` | `"are" often sounds like "are"` | NOT in weakFormWords, NOT in heardAs mapping → fallback |
| `"thinking"` | `'missed'` | `"thinking"` | `"thinking" can sound like "thinking" when spoken quickly.` | `"thinking" often sounds like "thinking"` | Content word, NOT in any dict, single word → fallback |

**All trigger the same root cause:** `generateHeardAs()` fallback at line 146 returns `lower` (original word).

---

## 5. Why "I'm" Becomes "i" and "m" - Analysis

### Current Behavior: "I'm" is PRESERVED (NOT split)

**Evidence:**
1. **Normalization preserves contractions:**
   - `lib/alignmentEngine.ts:70` calls `normalizeContractions()`
   - `lib/contractionNormalizer.ts:167` merges contractions BEFORE tokenization
   - Result: `"I'm"` → `"i'm"` (lowercased but preserved as single token)

2. **Tokenization splits on spaces only:**
   - `lib/alignmentEngine.ts:76` → `split(' ')`
   - Result: `["i'm", "ready"]` (single token, NOT `["i", "m", "ready"]`)

3. **Phrase spans preserve single tokens:**
   - `lib/phraseSpans.ts:40` → `refTokens[refIndex]` (returns single token)
   - Result: `phraseHint.spanText = "i'm"` (single token)

**Conclusion:** "I'm" is NOT split into "i" and "m" in the current system. Contractions are preserved as single tokens throughout the pipeline.

### If User Sees "i" and "m" Separately

**Possible Causes:**
1. **User input had space:** User typed `"i m"` (with space) → Tokenized as `["i", "m"]`
   - User input: `"i m ready"` → `userTokens: ["i", "m", "ready"]`
   - Alignment creates substitution: `expected: "i'm"` vs `actual: "i m"` (or separate tokens)

2. **Alignment mismatch:** Alignment engine treats user's `"i m"` as two tokens vs reference `"i'm"` as one token
   - Creates separate alignment events for "i" and "m"

3. **Review page display:** Review page may render tokens separately in diff view
   - `app/(app)/practice/review/page.tsx:674-695` - Diff rendering loops through tokens individually

**But in practice steps:** `extractPracticeSteps()` uses `event.expectedSpan` which is `"i'm"` (single token from refTokens), so feedback cards should show "i'm" as one unit.

---

## 6. Casing Loss Analysis

### Where Casing is Lost

**Location 1: Normalization (lib/alignmentEngine.ts:63)**
```typescript
export function normalizeText(text: string): string {
  let normalized = text
    .toLowerCase()  // ⚠️ "I'm" → "i'm" (IMMEDIATELY)
    // ...
}
```

**Impact:**
- Original: `"I'm ready"`
- After normalization: `"i'm ready"`
- Tokens: `["i'm", "ready"]` (all lowercase)
- `FeedbackItem.target` = `"i'm"` (lowercase)
- UI displays: `"i'm"` (never "I'm")

**Never Restored:**
- No capitalization logic anywhere in pipeline
- Surface form is permanently lost after normalization

---

## 7. "Another Example" Generation Logic

### File: `lib/practiceSteps.ts:245-320`

### Matching Logic (Exact Order)

**Step 1: Exact Match (Lines 275-278)**
```typescript
if (examples[lower]) {
  const heardAs = generateHeardAs(lower, category)
  return { sentence: examples[lower], heardAs }
}
```
- Checks if lowercased phrase exactly matches a key in `examples` dict
- 21 entries in dict: 'later', 'you\'re', 'i\'m', 'we\'re', 'they\'re', 'it\'s', 'that\'s', 'don\'t', 'can\'t', 'won\'t', 'the', 'to', 'and', 'for', 'with', 'want to', 'going to', 'have you', 'in the', 'on the', 'at the'

**Step 2: Partial Match (Lines 281-286)**
```typescript
for (const [key, example] of Object.entries(examples)) {
  if (lower.includes(key) || key.includes(lower)) {  // ⚠️ BIDIRECTIONAL
    const heardAs = generateHeardAs(key, category)
    return { sentence: example, heardAs }
  }
}
```
- Checks if phrase contains example key OR key contains phrase
- **Issue:** `includes()` is too broad (e.g., "thinking".includes("in") → matches "in the")

**Step 3: Contraction Fallback (Lines 289-303)**
```typescript
if (category === 'contraction') {
  const expanded = expandContraction(phrase)
  if (expanded !== phrase) {
    if (phrase.toLowerCase() === "i'm" || phrase.toLowerCase() === "im") {
      return { sentence: "I'm ready to start.", heardAs: generateHeardAs(phrase, category) }
    } else if (phrase.toLowerCase() === "you're" || phrase.toLowerCase() === "youre") {
      return { sentence: "You're doing well.", heardAs: generateHeardAs(phrase, category) }
    } else if (phrase.toLowerCase() === "don't" || phrase.toLowerCase() === "dont") {
      return { sentence: "Don't forget to call.", heardAs: generateHeardAs(phrase, category) }
    }
  }
}
```
- Only handles 3 contractions: "i'm", "you're", "don't"
- Other contractions (we're, they're, it's, etc.) fall through

**Step 4: Article/Preposition Fallback (Lines 306-316)**
```typescript
const words = lower.split(/\s+/)
if (words.length === 1) {
  const word = words[0]
  if (word === 'the') {
    return { sentence: "The book is on the table.", heardAs: generateHeardAs(word, category) }
  } else if (word === 'a') {
    return { sentence: "A cat is here.", heardAs: generateHeardAs(word, category) }
  } else if (word === 'an') {
    return { sentence: "An apple is on the table.", heardAs: generateHeardAs(word, category) }
  }
}
```
- Only handles 3 words: 'the', 'a', 'an'
- All other single words fall through

**Step 5: Return undefined (Line 319)**
```typescript
return undefined  // ✅ CORRECT - Omits section if no real example
```

---

### When "Another Example" is Missing

**Returns `undefined` when:**
1. Phrase NOT in examples dict (exact match fails)
2. Phrase doesn't contain/contained-by any example key (partial match fails)
3. NOT a contraction with hardcoded examples (only 3 contractions supported)
4. NOT 'the', 'a', or 'an'

**Examples that return `undefined`:**
- `"thinking"` → Not in dict, no partial match, not contraction, not article → `undefined`
- `"it"` → Not in dict (only 'it\'s'), no match → `undefined`
- `"about"` → Not in dict, no match → `undefined`
- `"is"` → Not in dict, no match → `undefined`
- `"we're"` → Contraction but NOT in hardcoded list (only "i'm", "you're", "don't") → Falls through → `undefined`

**UI Behavior:**
- `components/PhraseCard.tsx:60` → `{extraExample && ...}` (conditional rendering)
- If `extraExample === undefined`, section is omitted ✅ CORRECT (no placeholder)

---

### Template-Like Examples (Not an Issue)

**Current behavior is CORRECT:**
- No placeholder templates are generated
- Section is simply omitted if no real example exists
- Examples in dict are real sentences, not templates

**Example dict entries are real sentences:**
- `'i\'m': "I'm not sure about that."` ✅ Real sentence
- `'don\'t': "Don't worry about it."` ✅ Real sentence
- `'the': "The book is on the table."` ✅ Real sentence

**No templates like:**
- ❌ `"Use X in another sentence."`
- ❌ `"Here's another example using X."`

These were removed in recent changes (see validation at `lib/practiceSteps.ts:416, 489`).

---

## 8. Placeholder Meaning Text

### File: `lib/practiceSteps.ts:152-215`

### Fallback Chain

**Step 1: Contraction Expansion (Lines 156-172)**
```typescript
if (category === 'contraction' && isContraction(phrase)) {
  const expanded = expandContraction(phrase)
  // Returns: "I'm means \"I am\" - it describes a state or identity."
}
```
- Works for contractions with valid expansion ✅

**Step 2: Context Meanings Dict (Lines 175-198)**
```typescript
const contextMeanings: Record<string, string> = {
  'have you': 'Asking if someone did something.',
  'want to': 'Expressing desire or intention to do something.',
  // ... 15 entries total
}

for (const [key, meaning] of Object.entries(contextMeanings)) {
  if (lower === key || lower.includes(key)) {  // ⚠️ includes() is too broad
    return meaning
  }
}
```
- Only 15 entries in dict
- **Issue:** `includes()` check is bidirectional and too broad

**Step 3: Category-Based Fallbacks (Lines 201-214)**
```typescript
switch (category) {
  case 'contraction':
    return 'This contraction combines two words into one sound.'
  case 'linking':
    return 'These words connect together when spoken quickly.'
  case 'weak_form':
    return 'This small word is often spoken softly and can be hard to hear.'
  case 'similar_words':
    return 'This word can sound like another similar word in fast speech.'
  case 'speed_chunking':
    return 'These words flow together as one chunk in natural speech.'
  default:
    return 'This phrase carries meaning but can be hard to catch in fast speech.'  // ⚠️ PLACEHOLDER
}
```

### Placeholder Trigger Conditions

**Returns placeholder when:**
1. NOT a contraction with valid expansion
2. NOT in contextMeanings dict (exact match AND includes() check both fail)
3. Category is `'missed'` (default fallback) OR unknown category

**Examples that trigger placeholder:**
- `"thinking"` → Not contraction, not in dict, category='missed' → PLACEHOLDER
- `"it"` → Not contraction, not in dict, category='missed' → PLACEHOLDER
- `"is"` → Not contraction, not in dict, category='missed' → PLACEHOLDER

---

## 9. Failure Modes Table

| Symptom | Root Cause | File/Function | Line(s) |
|---------|------------|---------------|---------|
| `"i" can sound like "i"` | `generateHeardAs()` returns original word when no mapping found | `lib/practiceSteps.ts:generateHeardAs()` | 146 |
| `"i" often sounds like "i"` | Hardcoded template assumes `heardAs !== highlighted` | `components/PhraseCard.tsx:PhraseCard()` | 54 |
| `"thinking"` → placeholder meaning | NOT in contextMeanings dict, category='missed' | `lib/practiceSteps.ts:generateMeaningInContext()` | 213 |
| `"it"` → missing "Another example" | NOT in examples dict, not contraction fallback, not article | `lib/practiceSteps.ts:generateExtraExample()` | 319 |
| "I'm" displayed as "i'm" | Lowercasing at normalization, never restored | `lib/alignmentEngine.ts:normalizeText()` | 63 |
| `"i"` categorized as 'missed' | NOT in weakFormWords array (only 11 words) | `lib/practiceSteps.ts:detectCategory()` | 71-74 |
| `"is"` → tautology | NOT in weakFormWords, NOT in heardAs mapping | `lib/practiceSteps.ts:generateHeardAs()` | 132-137, 146 |
| `"thinking".includes("in")` → matches "in the" | `includes()` check is too broad in contextMeanings | `lib/practiceSteps.ts:generateMeaningInContext()` | 195 |
| `"we're"` → missing example | Only 3 contractions in fallback (i'm, you're, don't) | `lib/practiceSteps.ts:generateExtraExample()` | 295-300 |

---

## Summary

### Tautology Root Cause
- **Location:** `lib/practiceSteps.ts:146` - `generateHeardAs()` fallback
- **Condition:** Phrase NOT in any dictionary (contractions, linking, weak forms)
- **Result:** Returns `lower` (original word) → `heardAs === phrase`
- **UI Impact:** Templates at `PhraseCard.tsx:43, 54` produce tautologies

### Contraction Preservation
- **Status:** ✅ Contractions are PRESERVED (NOT split)
- **Normalization:** `lib/alignmentEngine.ts:70` merges contractions before tokenization
- **Result:** "I'm" → "i'm" (single token throughout pipeline)

### Casing Loss
- **Location:** `lib/alignmentEngine.ts:63` - `normalizeText()` lowercases immediately
- **Impact:** Surface form permanently lost, UI always shows lowercase

### Missing Examples
- **Status:** ✅ CORRECT behavior (omits section if no real example)
- **Logic:** `lib/practiceSteps.ts:319` returns `undefined`
- **UI:** Conditional rendering omits section (no placeholder)

### Placeholder Meaning
- **Location:** `lib/practiceSteps.ts:213` - Default case fallback
- **Condition:** NOT in contextMeanings dict, category='missed'
- **Result:** Generic placeholder text

---

END OF AUDIT


