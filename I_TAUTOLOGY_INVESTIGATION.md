# "i" Tautology Investigation - Audit Report

## A) Code + Call Sites

### File: `lib/practiceSteps.ts`

#### 1. `detectCategory()` - Lines 51-96

```typescript
function detectCategory(phrase: string, actualSpan?: string): FeedbackCategory {
  const lower = phrase.toLowerCase().trim()
  const actualLower = actualSpan?.toLowerCase().trim() || ''
  
  // Contractions
  if (lower.match(/\b(you're|i'm|we're|they're|it's|that's|what's|who's|he's|she's)\b/)) {
    return 'contraction'
  }
  
  // Linking patterns (want to, going to, got to)
  if (lower.match(/\b(want to|going to|got to|have to|need to)\b/)) {
    return 'linking'
  }
  
  // Elision patterns (going to → gonna)
  if (lower.includes('going to') || lower.includes('want to')) {
    return 'elision'
  }
  
  // Weak forms (function words)
  const weakFormWords = ['the', 'to', 'and', 'for', 'of', 'with', 'a', 'an', 'at', 'in', 'on']
  const words = lower.split(/\s+/)
  if (words.some(w => weakFormWords.includes(w))) {
    return 'weak_form'
  }
  
  // Similar words (if substitution)
  if (actualSpan) {
    const similarPairs = [
      ['a', 'the'], ['an', 'a'], ['is', 'it\'s'], ['are', 'our'],
      ['your', 'you\'re'], ['their', 'there'], ['to', 'too', 'two']
    ]
    for (const pair of similarPairs) {
      if (pair.includes(lower) && pair.includes(actualLower)) {
        return 'similar_words'
      }
    }
  }
  
  // Multi-word phrases often chunked
  if (words.length >= 2) {
    return 'speed_chunking'
  }
  
  return 'missed'  // ⚠️ DEFAULT FALLBACK
}
```

**Weak Forms Array (Line 71):** `['the', 'to', 'and', 'for', 'of', 'with', 'a', 'an', 'at', 'in', 'on']`
**Missing:** `'i'`, `'it'`, `'is'`, `'are'`, `'was'`, `'were'`, `'have'`, `'has'`, `'had'`, `'do'`, `'does'`, `'did'`, `'will'`, `'would'`, `'should'`, `'could'`, `'can'`, `'may'`, `'must'`, `'be'`, `'been'`, `'being'`, etc.

---

#### 2. `generateHeardAs()` - Lines 101-147

```typescript
function generateHeardAs(phrase: string, category: FeedbackCategory): string {
  const lower = phrase.toLowerCase().trim()
  
  // Contractions
  const contractions: Record<string, string> = {
    "you're": "yer",
    "i'm": "im",
    "we're": "wer",
    "they're": "ther",
    "it's": "its",
    "that's": "thats",
    "what's": "whats",
    "who's": "whos",
    "he's": "hes",
    "she's": "shes"
  }
  
  for (const [key, value] of Object.entries(contractions)) {
    if (lower.includes(key)) {
      return value
    }
  }
  
  // Linking patterns
  if (lower.includes('want to')) return "wanna"
  if (lower.includes('going to')) return "gonna"
  if (lower.includes('got to')) return "gotta"
  if (lower.includes('have to')) return "hafta"
  if (lower.includes('need to')) return "needa"
  
  // Weak forms
  if (lower === 'the') return "thuh"
  if (lower === 'to') return "ta"
  if (lower === 'and') return "n"
  if (lower === 'for') return "fer"
  if (lower === 'you') return "ya"
  if (lower === 'they') return "thay"
  
  // Multi-word phrases - approximate blend
  const words = lower.split(/\s+/)
  if (words.length >= 2) {
    // Simple approximation: join first sounds
    return words.map(w => w.charAt(0)).join('') + "..."
  }
  
  return lower // ⚠️ FALLBACK: return as-is - TAUTOLOGY SOURCE
}
```

**Weak Forms Mapping (Lines 132-137):**
- `'the'` → `"thuh"`
- `'to'` → `"ta"`
- `'and'` → `"n"`
- `'for'` → `"fer"`
- `'you'` → `"ya"`
- `'they'` → `"thay"`

**Missing:** `'i'`, `'it'`, `'is'`, `'are'`, `'was'`, `'were'`, `'have'`, `'has'`, `'a'`, `'an'`, `'in'`, `'on'`, `'at'`, `'of'`, `'with'`, etc.

---

#### 3. `generateSoundRule()` - Lines 220-239

```typescript
function generateSoundRule(phrase: string, category: FeedbackCategory, heardAs: string): string {
  const lower = phrase.toLowerCase().trim()
  
  switch (category) {
    case 'contraction':
      return `Contractions blend two words. "${phrase}" often sounds like "${heardAs}" in fast speech.`
    case 'linking':
      return `Words link together at boundaries. "${phrase}" blends into "${heardAs}" when spoken quickly.`
    case 'elision':
      return `Some sounds are dropped in casual speech. "${phrase}" becomes "${heardAs}".`
    case 'weak_form':
      return `Function words like "${phrase}" are often unstressed and reduced to "${heardAs}".`
    case 'similar_words':
      return `"${phrase}" can sound similar to other words when spoken quickly.`
    case 'speed_chunking':
      return `In fast speech, "${phrase}" is spoken as one smooth chunk, making boundaries unclear.`
    default:
      return `"${phrase}" can sound like "${heardAs}" when spoken quickly.`  // ⚠️ TAUTOLOGY WHEN heardAs === phrase
  }
}
```

**Tautology Templates:**
- Line 225: `"${phrase}" often sounds like "${heardAs}"` (contraction case)
- Line 237: `"${phrase}" can sound like "${heardAs}"` (default case)

---

#### 4. `extractPracticeSteps()` - Lines 379-401

```typescript
const category = detectCategory(target, actualSpan)
const heardAs = generateHeardAs(target, category)
const extraExample = generateExtraExample(target, category)
const tip = generateTip(category, target)

const step: PracticeStep = {
  // ...
  soundRule: generateSoundRule(target, category, heardAs),
  // ...
  inSentence: {
    original: fullSentence,
    highlighted: target,
    heardAs,  // ⚠️ Direct assignment from generateHeardAs()
  },
  // ...
}
```

---

### File: `components/PhraseCard.tsx`

#### UI Rendering - Lines 40-56

```typescript
{/* How it sounds in fast speech */}
<div className="mt-4">
  <div className="text-sm font-medium text-gray-500 mb-1">How it sounds</div>
  <div className="text-base text-gray-900">{soundRule}</div>  {/* Line 43 - Renders: "i" can sound like "i" */}
</div>

{/* NEW: In this sentence section */}
{inSentence && (
  <div className="mt-4 pt-4 border-t border-gray-100">
    <div className="text-sm font-medium text-gray-500 mb-2">In this sentence</div>
    <div className="text-base text-gray-900 mb-2">
      <span className="italic">"{inSentence.original}"</span>
    </div>
    <div className="text-sm text-gray-600">
      <span className="font-medium">"{inSentence.highlighted}"</span> often sounds like <span className="font-medium">"{inSentence.heardAs}"</span>
      {/* Line 54 - Renders: "i" often sounds like "i" */}
    </div>
  </div>
)}
```

**Exact UI Strings Produced:**
- Line 43: `"i" can sound like "i" when spoken quickly.` (from `soundRule`)
- Line 54: `"i" often sounds like "i"` (hardcoded template)

---

### File: `lib/alignmentEngine.ts`

#### Tokenization and Lowercasing - Lines 59-79

```typescript
export function normalizeText(text: string): string {
  // STEP 1: Basic normalization (lowercase, remove punctuation, keep apostrophes, collapse spaces)
  let normalized = text
    .toLowerCase()  // ⚠️ "I" → "i" happens here
    .replace(/[^\w\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  
  // STEP 2: Merge contractions AFTER basic cleaning but BEFORE tokenization
  normalized = normalizeContractions(normalized)
  
  // STEP 3: Collapse spaces again
  return normalized.replace(/\s+/g, ' ').trim()
}

export function tokenize(text: string): string[] {
  const n = normalizeText(text)
  return n ? n.split(' ').filter(t => t.length > 0) : []
}
```

**Lowercasing Happens:**
1. **Alignment phase:** `lib/alignmentEngine.ts:63` - `normalizeText()` lowercases input
2. **Practice steps:** `lib/practiceSteps.ts:52, 102, 153, 221, 246` - All generators lowercase immediately

**Surface Form Storage:**
- `FeedbackItem.target` - Stores original surface form (could be "I" or "i" depending on source)
- `FeedbackItem.inSentence.highlighted` - Uses `target` directly (preserves surface form)
- But `generateHeardAs()` and `generateSoundRule()` always lowercase input

---

## B) Exact Path for phrase="i"

### Step 1: Input Processing

**Input:** `phrase = "i"` (or `"I"` from transcript, already lowercased by alignment)

**Location:** `lib/practiceSteps.ts:379` (in `extractPracticeSteps()`)

---

### Step 2: Category Detection

**Function Call:** `detectCategory("i", actualSpan)`  
**Location:** `lib/practiceSteps.ts:379`

**Execution Path:**
```typescript
lower = "i".toLowerCase().trim()  // → "i"

// Check contractions (Line 56)
if ("i".match(/\b(you're|i'm|we're|...)\b/)) → FALSE (no match)

// Check linking (Line 61)
if ("i".match(/\b(want to|going to|...)\b/)) → FALSE

// Check elision (Line 66)
if ("i".includes('going to') || "i".includes('want to')) → FALSE

// Check weak forms (Lines 71-74)
weakFormWords = ['the', 'to', 'and', 'for', 'of', 'with', 'a', 'an', 'at', 'in', 'on']
words = ["i"]
words.some(w => weakFormWords.includes(w)) → FALSE ("i" NOT in array)

// Check similar words (Lines 78-87)
if (actualSpan) { ... } → Skip if no actualSpan

// Check multi-word (Lines 91-93)
if (words.length >= 2) → FALSE (single word)

// Default fallback (Line 95)
return 'missed'  // ⚠️ RETURNS 'missed'
```

**Result:** `category = 'missed'`

---

### Step 3: HeardAs Generation

**Function Call:** `generateHeardAs("i", 'missed')`  
**Location:** `lib/practiceSteps.ts:380`

**Execution Path:**
```typescript
lower = "i".toLowerCase().trim()  // → "i"

// Check contractions (Lines 105-122)
for (const [key, value] of Object.entries(contractions)) {
  if ("i".includes(key)) → FALSE (no contraction contains "i" as substring)
}

// Check linking patterns (Lines 125-129)
if ("i".includes('want to')) → FALSE
// ... all FALSE

// Check weak forms (Lines 132-137)
if (lower === 'the') → FALSE
if (lower === 'to') → FALSE
if (lower === 'and') → FALSE
if (lower === 'for') → FALSE
if (lower === 'you') → FALSE
if (lower === 'they') → FALSE
// ⚠️ NO CHECK FOR 'i'

// Check multi-word (Lines 140-144)
words = ["i"]
if (words.length >= 2) → FALSE

// Fallback (Line 146)
return lower  // ⚠️ RETURNS "i"
```

**Result:** `heardAs = "i"` (same as input)

---

### Step 4: Sound Rule Generation

**Function Call:** `generateSoundRule("i", 'missed', "i")`  
**Location:** `lib/practiceSteps.ts:395`

**Execution Path:**
```typescript
lower = "i".toLowerCase().trim()  // → "i"

switch (category) {  // category = 'missed'
  case 'contraction': → SKIP
  case 'linking': → SKIP
  case 'elision': → SKIP
  case 'weak_form': → SKIP
  case 'similar_words': → SKIP
  case 'speed_chunking': → SKIP
  default:
    return `"${phrase}" can sound like "${heardAs}" when spoken quickly.`
    // ⚠️ RETURNS: "i" can sound like "i" when spoken quickly.
}
```

**Result:** `soundRule = '"i" can sound like "i" when spoken quickly.'` ✅ TAUTOLOGY

---

### Step 5: Step Object Creation

**Location:** `lib/practiceSteps.ts:397-401`

```typescript
inSentence: {
  original: fullSentence,  // e.g., "I was thinking about it."
  highlighted: target,     // "i" (original surface form, could be "I")
  heardAs,                 // "i" (from generateHeardAs)
}
```

---

### Step 6: UI Rendering

**Location:** `components/PhraseCard.tsx:43, 54`

**Rendered Output:**

1. **"How it sounds" section (Line 43):**
   ```html
   <div className="text-base text-gray-900">"i" can sound like "i" when spoken quickly.</div>
   ```

2. **"In this sentence" section (Line 54):**
   ```html
   <span>"i"</span> often sounds like <span>"i"</span>
   ```

**Both produce tautologies.**

---

## C) Why Tautology Happens - Explicit Branch Explanation

### Root Cause Chain:

1. **Category Detection Failure:**
   - `"i"` is NOT in `weakFormWords` array (Line 71)
   - Array only contains: `['the', 'to', 'and', 'for', 'of', 'with', 'a', 'an', 'at', 'in', 'on']`
   - Missing common function words: `'i'`, `'it'`, `'is'`, `'are'`, `'was'`, `'were'`, `'have'`, `'has'`, `'do'`, `'does'`, `'will'`, `'would'`, `'should'`, `'could'`, `'can'`, etc.
   - Result: Category defaults to `'missed'`

2. **HeardAs Generation Failure:**
   - `generateHeardAs()` only handles 6 weak forms: `'the'`, `'to'`, `'and'`, `'for'`, `'you'`, `'they'`
   - No mapping for `'i'`
   - Multi-word check fails (single word)
   - Fallback (Line 146): `return lower` → Returns `"i"` (same as input)

3. **Sound Rule Generation - No Guard:**
   - `generateSoundRule()` does NOT check if `heardAs === phrase`
   - Uses `heardAs` directly in template string
   - Default case produces: `"${phrase}" can sound like "${heardAs}"`
   - When `heardAs === phrase`, results in: `"i" can sound like "i"`

4. **UI Template - No Guard:**
   - `PhraseCard.tsx:54` hardcodes: `often sounds like "{inSentence.heardAs}"`
   - No check if `heardAs === highlighted`
   - Results in: `"i" often sounds like "i"`

---

### Explicit Fallback Branches:

**Branch 1: Category Detection**
```typescript
// lib/practiceSteps.ts:71-74
const weakFormWords = ['the', 'to', 'and', 'for', 'of', 'with', 'a', 'an', 'at', 'in', 'on']
if (words.some(w => weakFormWords.includes(w))) {
  return 'weak_form'  // ⚠️ NEVER REACHED for "i"
}
// ...
return 'missed'  // ⚠️ ALWAYS REACHED for "i"
```

**Branch 2: HeardAs Generation**
```typescript
// lib/practiceSteps.ts:132-137
if (lower === 'the') return "thuh"
if (lower === 'to') return "ta"
// ... no check for 'i'
// ...
// lib/practiceSteps.ts:146
return lower  // ⚠️ ALWAYS REACHED for "i" → returns "i"
```

**Branch 3: Sound Rule Generation**
```typescript
// lib/practiceSteps.ts:236-237
default:
  return `"${phrase}" can sound like "${heardAs}" when spoken quickly.`
  // ⚠️ NO CHECK: if (heardAs === phrase) → produce different message
```

**Branch 4: UI Rendering**
```typescript
// components/PhraseCard.tsx:54
<span>"{inSentence.highlighted}"</span> often sounds like <span>"{inSentence.heardAs}"</span>
// ⚠️ NO CHECK: if (heardAs === highlighted) → omit or use generic message
```

---

## D) List of Other Tautology-Trigger Tokens

### All Tokens That Will Cause Tautology:

Based on the code logic, ANY token that:
1. Is NOT in `weakFormWords` array
2. Is NOT in contractions dict
3. Is NOT a linking pattern
4. Is NOT multi-word (length === 1)
5. Is NOT in `generateHeardAs()` weak forms mapping

Will fall through to `return lower` in `generateHeardAs()` (Line 146), causing `heardAs === phrase`.

### Confirmed Tautology Cases (10+):

| Token | Category | HeardAs | Sound Rule Output | Reason |
|-------|----------|---------|-------------------|--------|
| `"i"` | `'missed'` | `"i"` | `"i" can sound like "i"` | NOT in weakFormWords, NOT in heardAs mapping |
| `"it"` | `'missed'` | `"it"` | `"it" can sound like "it"` | NOT in weakFormWords, NOT in heardAs mapping |
| `"is"` | `'missed'` | `"is"` | `"is" can sound like "is"` | NOT in weakFormWords, NOT in heardAs mapping |
| `"are"` | `'missed'` | `"are"` | `"are" can sound like "are"` | NOT in weakFormWords, NOT in heardAs mapping |
| `"was"` | `'missed'` | `"was"` | `"was" can sound like "was"` | NOT in weakFormWords, NOT in heardAs mapping |
| `"were"` | `'missed'` | `"were"` | `"were" can sound like "were"` | NOT in weakFormWords, NOT in heardAs mapping |
| `"have"` | `'missed'` | `"have"` | `"have" can sound like "have"` | NOT in weakFormWords, NOT in heardAs mapping |
| `"has"` | `'missed'` | `"has"` | `"has" can sound like "has"` | NOT in weakFormWords, NOT in heardAs mapping |
| `"had"` | `'missed'` | `"had"` | `"had" can sound like "had"` | NOT in weakFormWords, NOT in heardAs mapping |
| `"do"` | `'missed'` | `"do"` | `"do" can sound like "do"` | NOT in weakFormWords, NOT in heardAs mapping |
| `"does"` | `'missed'` | `"does"` | `"does" can sound like "does"` | NOT in weakFormWords, NOT in heardAs mapping |
| `"did"` | `'missed'` | `"did"` | `"did" can sound like "did"` | NOT in weakFormWords, NOT in heardAs mapping |
| `"will"` | `'missed'` | `"will"` | `"will" can sound like "will"` | NOT in weakFormWords, NOT in heardAs mapping |
| `"would"` | `'missed'` | `"would"` | `"would" can sound like "would"` | NOT in weakFormWords, NOT in heardAs mapping |
| `"should"` | `'missed'` | `"should"` | `"should" can sound like "should"` | NOT in weakFormWords, NOT in heardAs mapping |
| `"could"` | `'missed'` | `"could"` | `"could" can sound like "could"` | NOT in weakFormWords, NOT in heardAs mapping |
| `"can"` | `'missed'` | `"can"` | `"can" can sound like "can"` | NOT in weakFormWords, NOT in heardAs mapping |
| `"thinking"` | `'missed'` | `"thinking"` | `"thinking" can sound like "thinking"` | Content word, NOT in any dict, single word |
| `"about"` | `'missed'` | `"about"` | `"about" can sound like "about"` | Content word, NOT in any dict, single word |
| `"something"` | `'missed'` | `"something"` | `"something" can sound like "something"` | Content word, NOT in any dict, single word |

### Function Words Missing from `weakFormWords` Array:

**Auxiliary/Modal Verbs:**
- `'is'`, `'are'`, `'was'`, `'were'`
- `'have'`, `'has'`, `'had'`
- `'do'`, `'does'`, `'did'`
- `'will'`, `'would'`, `'should'`, `'could'`, `'can'`, `'may'`, `'must'`

**Pronouns:**
- `'i'`, `'it'`, `'we'`, `'he'`, `'she'`, `'they'`, `'this'`, `'that'`, `'these'`, `'those'`

**Prepositions (partial):**
- Currently has: `'at'`, `'in'`, `'on'`, `'of'`, `'for'`, `'with'`
- Missing: `'from'`, `'by'`, `'about'`, `'into'`, `'onto'`, `'upon'`, `'over'`, `'under'`, `'between'`, `'among'`, `'during'`, `'through'`, `'across'`, `'behind'`, `'beside'`, `'besides'`, `'beyond'`, `'within'`, `'without'`, `'against'`, `'toward'`, `'towards'`

**Articles:**
- Has: `'a'`, `'an'`
- Missing: None (complete)

**Content Words (should NOT be weak forms):**
- `'thinking'`, `'about'`, `'something'`, `'anything'`, `'everything'`, `'nothing'`, etc.
- These are content words and should have different explanations (not weak-form reduction)

---

## E) Tokenization / Casing Issues

### Lowercasing Happens At:

1. **Alignment Phase** (`lib/alignmentEngine.ts:63`):
   ```typescript
   export function normalizeText(text: string): string {
     let normalized = text
       .toLowerCase()  // ⚠️ "I" → "i" here
       // ...
   }
   ```
   - Input: `"I was thinking"` → Output: `"i was thinking"`
   - Tokens: `["i", "was", "thinking"]`

2. **Practice Steps Generation** (`lib/practiceSteps.ts`):
   - Line 52: `detectCategory()` → `const lower = phrase.toLowerCase().trim()`
   - Line 102: `generateHeardAs()` → `const lower = phrase.toLowerCase().trim()`
   - Line 153: `generateMeaningInContext()` → `const lower = phrase.toLowerCase().trim()`
   - Line 221: `generateSoundRule()` → `const lower = phrase.toLowerCase().trim()`
   - Line 246: `generateExtraExample()` → `const lower = phrase.toLowerCase().trim()`

   **Every generator function lowercases input immediately.**

### Surface Form Storage:

**What Gets Stored:**
- `FeedbackItem.target` - Original surface form from alignment tokens
  - Source: `refTokens[event.refStart]` or `event.expectedSpan`
  - These are already lowercased from `normalizeText()` → `tokenize()`
  - Example: If transcript is `"I was thinking"`, tokens are `["i", "was", "thinking"]`
  - So `target = "i"` (lowercase)

- `FeedbackItem.inSentence.highlighted` - Uses `target` directly (Line 399)
  - Preserves whatever form `target` has (usually lowercase)

- `FeedbackItem.inSentence.original` - Full sentence (could be original casing if stored separately)
  - Currently: `fullSentence` from `extractPracticeSteps()` param
  - Usually already lowercased from alignment

**Does System Ever Store "I" vs "i"?**

**Answer: NO** - By the time tokens reach `extractPracticeSteps()`:
- All tokens are lowercased from `tokenize()` → `normalizeText()`
- Surface form is lost during alignment phase
- UI displays lowercase "i" even if original transcript had "I"

**Evidence:**
- `lib/alignmentEngine.ts:63` lowercases before tokenization
- `lib/alignmentEngine.ts:100` uses `tokenize(refText)` which returns lowercase tokens
- `refTokens` array contains lowercase strings: `["i", "was", "thinking"]`
- `FeedbackItem.target` comes from `refTokens` or `event.expectedSpan` (both lowercase)

---

## F) Design Intent Analysis

### What is `heardAs` Intended to Represent?

Based on existing mappings in `generateHeardAs()`:

**Current Patterns:**

1. **Weak Form Approximations** (phonetic spelling):
   - `"the"` → `"thuh"` (schwa sound)
   - `"to"` → `"ta"` (reduced vowel)
   - `"and"` → `"n"` (elision)
   - `"for"` → `"fer"` (vowel reduction)
   - `"you"` → `"ya"` (vowel reduction)
   - `"they"` → `"thay"` (vowel reduction)

2. **Contraction Blends** (phonetic approximation):
   - `"you're"` → `"yer"` (blended)
   - `"i'm"` → `"im"` (blended, no apostrophe)
   - `"we're"` → `"wer"` (blended)

3. **Linking Patterns** (casual speech):
   - `"want to"` → `"wanna"` (linking + reduction)
   - `"going to"` → `"gonna"` (linking + reduction)

4. **Multi-word Approximation** (fallback):
   - `"want to go"` → `"w..."` (first letters only, generic)

**Intended Semantics:**
- `heardAs` is meant to be a **phonetic spelling approximation** (not IPA)
- Shows how the word/phrase sounds in fast/casual speech
- Uses simplified English orthography (e.g., "thuh", "ta", "ya")
- NOT IPA symbols (e.g., `/ðə/`, `/tə/`, `/jə/`)
- NOT phonemic transcription (e.g., "ai" for "I")

**Current Design Intent:**
- Category-based approximations (weak form, contraction, linking)
- Dictionary-driven (hardcoded mappings)
- Fallback to original word when no mapping exists (causes tautology)

---

## G) Design Recommendations (NO Implementation)

### 1. What Should `heardAs` Represent?

**Option A: Phonetic Spelling (Current Intent - Keep)**
- Pros: Easy to read, no special symbols needed
- Cons: Inconsistent, requires large dictionary
- Example: `"i"` → `"ai"` or `"i"` → `"uh"` (unstressed)

**Option B: IPA Symbols**
- Pros: Standardized, precise
- Cons: Requires special fonts, learning curve for users
- Example: `"i"` → `/aɪ/` (stressed) or `/ɪ/` (unstressed)

**Option C: Category-Based Generic Descriptions**
- Pros: No tautology, always meaningful
- Cons: Less specific
- Example: `"i"` → `"[reduced vowel]"` or `"[unstressed]"`

**Recommendation:** **Keep phonetic spelling (Option A)** but:
- Add guard: If no mapping exists, use category-based generic description
- Never return the original word as `heardAs`
- Expand dictionary with common function words

---

### 2. Should Explanations Come From Hardcoded Dict vs LLM?

**Current Approach: Hardcoded Dictionary**
- Pros: Fast, predictable, no API costs
- Cons: Limited coverage, maintenance burden, tautologies for unknown words

**LLM/OpenAI Approach (Recommended by User)**
- Pros: Context-aware, covers all words, no tautologies, can explain nuances
- Cons: API costs, latency, requires schema design

**Recommendation:** **Hybrid Approach**
- Use hardcoded dictionary for common function words (fast path)
- Fall back to OpenAI for unknown words/phrases (slow path)
- Cache OpenAI responses to reduce costs
- Use structured output schema (below)

---

### 3. Proposed OpenAI JSON Schema

```typescript
interface PronunciationFeedback {
  // Core meaning
  meaning_in_context: string
  // "I" as subject pronoun introduces the speaker or refers to oneself.
  
  // Sound category classification
  sound_category: 
    | "weak_form"           // Function word reduction (I → /ɪ/ or /ə/)
    | "vowel_reduction"     // Vowel sound changes (I → /aɪ/ stressed, /ɪ/ unstressed)
    | "elision"             // Sounds dropped (and → n)
    | "linking"             // Words blend (want to → wanna)
    | "contraction"         // Word combinations (I'm, you're)
    | "content_word"        // Full content word (thinking, about)
    | "stress_shift"        // Stress pattern changes
  
  // Pronunciation hint (phonetic spelling, NOT IPA)
  pronunciation_hint: string
  // "ai" (when stressed) or "uh" (when unstressed)
  
  // How it sounds in the specific sentence context
  in_sentence_heard_as: string
  // "uh" (if unstressed in context) or "ai" (if stressed)
  
  // Listening tip (actionable advice)
  listening_tip?: string
  // "In this position, 'I' is usually unstressed and sounds like 'uh'. Listen for the reduced vowel."
  
  // Transfer example (another sentence using the word)
  extra_example?: {
    sentence: string
    heard_as: string
    context_note?: string
  }
  // {
  //   sentence: "I think I can do it.",
  //   heard_as: "ai ... uh",
  //   context_note: "First 'I' is stressed, second 'I' is unstressed."
  // }
}
```

**OpenAI Prompt Template:**
```
You are a pronunciation coach helping English learners understand how words sound in fast speech.

Word/Phrase: "{phrase}"
Full Sentence: "{fullSentence}"
Context: The word "{phrase}" appeared at position {start}-{end} in the sentence.

Provide pronunciation feedback using this JSON schema:
{
  "meaning_in_context": "Brief explanation of what this word means in this sentence (1-2 sentences).",
  "sound_category": "weak_form|vowel_reduction|elision|linking|contraction|content_word|stress_shift",
  "pronunciation_hint": "Phonetic spelling approximation (e.g., 'thuh', 'ta', 'ya', 'ai') - use simple English spelling, NOT IPA.",
  "in_sentence_heard_as": "How it sounds in THIS specific sentence (phonetic spelling).",
  "listening_tip": "Actionable tip for listening practice (optional).",
  "extra_example": {
    "sentence": "Another example sentence using the word.",
    "heard_as": "How it sounds in this example (phonetic spelling).",
    "context_note": "Note about stress/context differences (optional)."
  }
}

Constraints:
- pronunciation_hint and in_sentence_heard_as MUST be different from the original word (no tautologies).
- Use simple English phonetic spelling (e.g., "thuh" not "/ðə/").
- Keep meaning_in_context under 2 sentences.
- Only include extra_example if it adds value (different context/stress pattern).
```

---

### 4. Fix Tautology Guard Logic

**Recommendation: Add Guards in Multiple Places**

**Guard 1: `generateHeardAs()` - Never Return Original**
```typescript
// Pseudo-code (NOT implementation)
function generateHeardAs(phrase: string, category: FeedbackCategory): string {
  // ... existing checks ...
  
  // If no mapping found, use category-based fallback
  if (/* no matches */) {
    switch (category) {
      case 'weak_form':
        return "[unstressed]"  // Generic description
      case 'content_word':
        return "[full form]"  // Generic description
      default:
        return "[reduced]"  // Generic description
    }
  }
  
  // NEVER: return lower  // ❌ REMOVE THIS
}
```

**Guard 2: `generateSoundRule()` - Check for Tautology**
```typescript
// Pseudo-code (NOT implementation)
function generateSoundRule(phrase: string, category: FeedbackCategory, heardAs: string): string {
  // Check if tautology
  if (heardAs.toLowerCase().trim() === phrase.toLowerCase().trim()) {
    // Use category-based explanation instead
    switch (category) {
      case 'weak_form':
        return `Function words like "${phrase}" are often unstressed and reduced in fast speech.`
      case 'content_word':
        return `Content words like "${phrase}" can be hard to catch when spoken quickly.`
      default:
        return `"${phrase}" can be challenging to hear in fast speech.`
    }
  }
  
  // Otherwise use existing templates
  // ...
}
```

**Guard 3: UI Rendering - Conditional Display**
```typescript
// Pseudo-code (NOT implementation)
{inSentence.heardAs !== inSentence.highlighted && (
  <div>
    <span>"{inSentence.highlighted}"</span> often sounds like <span>"{inSentence.heardAs}"</span>
  </div>
)}
{inSentence.heardAs === inSentence.highlighted && (
  <div>
    "{inSentence.highlighted}" is often unstressed and can be hard to hear.
  </div>
)}
```

---

### 5. Expand Dictionary vs Use LLM

**Dictionary Expansion (Quick Fix):**
- Add 30+ common function words to `weakFormWords` array
- Add 30+ mappings to `generateHeardAs()` weak forms section
- Pros: Fast, no API costs, works offline
- Cons: Still incomplete, maintenance burden

**LLM Integration (Long-term Solution):**
- Use OpenAI for unknown words/phrases
- Cache responses (key: phrase + context)
- Fall back to dictionary for common words (fast path)
- Pros: Complete coverage, context-aware, no tautologies
- Cons: API costs (~$0.001 per call), latency (~200ms), requires error handling

**Recommendation: Hybrid**
1. **Phase 1 (Quick):** Expand dictionary + add guards (fixes immediate tautologies)
2. **Phase 2 (Long-term):** Integrate OpenAI for unknown words with caching

---

## Summary

**Root Cause:** `"i"` (and many other function words) are not in the `weakFormWords` array or `generateHeardAs()` mappings, causing fallback to `return lower`, which produces `heardAs === phrase`.

**Tautology Triggers:** Any single-word token not in dictionaries falls through to fallback.

**Fix Strategy:**
1. Add guards to prevent `heardAs === phrase`
2. Expand dictionary OR use LLM for unknown words
3. Use category-based generic descriptions as fallback (never return original word)

**Design Direction:**
- Keep phonetic spelling approach (not IPA)
- Use LLM with structured output for context-aware explanations
- Implement hybrid: dictionary (fast) + LLM (fallback)

---

END OF INVESTIGATION


