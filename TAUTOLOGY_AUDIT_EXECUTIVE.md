# Tautology Issue - Executive Audit Report

## Executive Summary

1. **Root Cause:** `generateHeardAs()` in `lib/practiceSteps.ts:146` returns `lower` (original word) when no dictionary match exists, causing `heardAs === phrase` for 20+ common words including `"i"`, `"it"`, `"is"`, `"are"`, `"was"`, `"have"`, `"do"`, `"will"`, `"thinking"`, etc.

2. **Category Detection Gap:** `detectCategory()` in `lib/practiceSteps.ts:71` only recognizes 11 weak-form words (`['the', 'to', 'and', 'for', 'of', 'with', 'a', 'an', 'at', 'in', 'on']`), missing critical function words like `"i"`, `"it"`, `"is"`, `"are"`, `"was"`, `"were"`, `"have"`, `"has"`, `"do"`, `"does"`, `"will"`, `"would"`, `"should"`, `"could"`, `"can"`, causing default category `'missed'`.

3. **Missing Guards:** `generateSoundRule()` in `lib/practiceSteps.ts:220` and `PhraseCard.tsx:54` use `heardAs` directly without checking `heardAs === phrase`, producing tautologies: `"i" can sound like "i"` and `"i" often sounds like "i"`.

4. **Surface Form Loss:** Lowercasing at `lib/alignmentEngine.ts:63` (normalizeText) strips capitalization before tokenization, so "I" → "i" everywhere, and original casing is never preserved for UI display.

5. **Template Assumptions:** Hardcoded UI templates in `components/PhraseCard.tsx:43, 54` assume `heardAs` differs from `highlighted`, with no fallback for identical values, causing visible tautologies in production.

---

## Call Chain Diagram

```
/api/check-answer (route.ts)
  ↓
alignTexts(transcript, userText) [alignmentEngine.ts:99]
  ↓ normalizeText() → toLowerCase() [line 63] ⚠️ SURFACE FORM LOST
  ↓ tokenize() → split(' ') [line 76]
  ↓ returns: { refTokens: ["i", "was", "thinking"], ... }
  ↓
attachPhraseSpans(result) [phraseSpans.ts:43]
  ↓ returns: { ...events, phraseHint: {...} }
  ↓
extractPracticeSteps(events, refTokens, userTokens) [practiceSteps.ts:344]
  ↓
  detectCategory(target) [practiceSteps.ts:51]
    ├─ Check contractions → FALSE for "i"
    ├─ Check linking → FALSE
    ├─ Check elision → FALSE
    ├─ Check weakFormWords → FALSE ("i" NOT in array) ⚠️ MISSING
    ├─ Check similar_words → FALSE
    ├─ Check multi-word → FALSE
    └─ return 'missed' ⚠️ DEFAULT FALLBACK
  ↓
  generateHeardAs(target, 'missed') [practiceSteps.ts:101]
    ├─ Check contractions → FALSE
    ├─ Check linking → FALSE
    ├─ Check weak forms → FALSE (no mapping for "i") ⚠️ MISSING
    ├─ Check multi-word → FALSE
    └─ return lower ⚠️ FALLBACK → returns "i" (SAME AS INPUT)
  ↓
  generateSoundRule(target, 'missed', "i") [practiceSteps.ts:220]
    ├─ switch (category) → default case
    └─ return `"${phrase}" can sound like "${heardAs}"` ⚠️ TAUTOLOGY
  ↓
  step = {
    soundRule: '"i" can sound like "i" when spoken quickly.', ⚠️ TAUTOLOGY
    inSentence: {
      highlighted: "i",
      heardAs: "i" ⚠️ IDENTICAL
    }
  }
  ↓
PhraseCard({ feedbackItem: step }) [components/PhraseCard.tsx:19]
  ↓
  Line 43: {soundRule} → Renders: "i" can sound like "i" when spoken quickly. ⚠️ TAUTOLOGY
  ↓
  Line 54: "{highlighted}" often sounds like "{heardAs}"
    → Renders: "i" often sounds like "i" ⚠️ TAUTOLOGY
```

---

## Root Cause Analysis

### Branch 1: Category Detection Failure

**File:** `lib/practiceSteps.ts:51-96`  
**Function:** `detectCategory(phrase: string, actualSpan?: string)`

**Execution for `phrase = "i"`:**
```typescript
lower = "i".toLowerCase().trim()  // → "i"

// Line 56: Check contractions
if ("i".match(/\b(you're|i'm|we're|...)\b/)) → FALSE ❌

// Line 61: Check linking
if ("i".match(/\b(want to|going to|...)\b/)) → FALSE ❌

// Line 66: Check elision
if ("i".includes('going to') || ...) → FALSE ❌

// Lines 71-74: Check weak forms
weakFormWords = ['the', 'to', 'and', 'for', 'of', 'with', 'a', 'an', 'at', 'in', 'on']
if (["i"].some(w => weakFormWords.includes(w))) → FALSE ❌
// ⚠️ "i" NOT IN ARRAY

// Line 78: Check similar words
if (actualSpan) { ... } → Skip if undefined

// Line 91: Check multi-word
if (words.length >= 2) → FALSE ❌

// Line 95: Default fallback
return 'missed' ⚠️ ALWAYS REACHED
```

**Critical Gap:** `weakFormWords` array (line 71) contains only 11 words, missing essential function words:
- **Pronouns:** `"i"`, `"it"`, `"we"`, `"he"`, `"she"`, `"they"`, `"this"`, `"that"`
- **Auxiliary verbs:** `"is"`, `"are"`, `"was"`, `"were"`, `"have"`, `"has"`, `"had"`, `"do"`, `"does"`, `"did"`
- **Modal verbs:** `"will"`, `"would"`, `"should"`, `"could"`, `"can"`, `"may"`, `"must"`

**Impact:** All these words default to `'missed'` category, triggering generic fallbacks.

---

### Branch 2: HeardAs Generation Failure

**File:** `lib/practiceSteps.ts:101-147`  
**Function:** `generateHeardAs(phrase: string, category: FeedbackCategory)`

**Execution for `phrase = "i"`, `category = 'missed'`:**
```typescript
lower = "i".toLowerCase().trim()  // → "i"

// Lines 105-122: Check contractions
contractions = { "you're": "yer", "i'm": "im", ... }
for (const [key, value] of Object.entries(contractions)) {
  if ("i".includes(key)) → FALSE ❌ (no contraction contains "i")
}

// Lines 125-129: Check linking patterns
if ("i".includes('want to')) → FALSE ❌
// ... all FALSE

// Lines 132-137: Check weak forms
if (lower === 'the') return "thuh" → FALSE ❌
if (lower === 'to') return "ta" → FALSE ❌
if (lower === 'and') return "n" → FALSE ❌
if (lower === 'for') return "fer" → FALSE ❌
if (lower === 'you') return "ya" → FALSE ❌
if (lower === 'they') return "thay" → FALSE ❌
// ⚠️ NO CHECK FOR "i"

// Lines 140-144: Check multi-word
words = ["i"]
if (words.length >= 2) → FALSE ❌

// Line 146: FALLBACK - NO GUARD
return lower  // ⚠️ RETURNS "i" (SAME AS INPUT)
```

**Critical Gap:** Weak forms mapping (lines 132-137) only handles 6 words, missing `"i"` and 20+ other function words.

**Fallback Behavior:** Returns original word unchanged when no match found, ensuring `heardAs === phrase`.

---

### Branch 3: Sound Rule Generation - No Tautology Guard

**File:** `lib/practiceSteps.ts:220-239`  
**Function:** `generateSoundRule(phrase: string, category: FeedbackCategory, heardAs: string)`

**Execution for `phrase = "i"`, `category = 'missed'`, `heardAs = "i"`:**
```typescript
lower = "i".toLowerCase().trim()  // → "i"

switch (category) {  // category = 'missed'
  case 'contraction': → SKIP ❌
  case 'linking': → SKIP ❌
  case 'elision': → SKIP ❌
  case 'weak_form': → SKIP ❌ (should handle "i" but category is 'missed')
  case 'similar_words': → SKIP ❌
  case 'speed_chunking': → SKIP ❌
  default:
    // Line 237: NO CHECK IF heardAs === phrase
    return `"${phrase}" can sound like "${heardAs}" when spoken quickly.`
    // ⚠️ PRODUCES: "i" can sound like "i" when spoken quickly.
}
```

**Critical Gap:** No guard to check if `heardAs === phrase` before using template. Default case always uses template even when values are identical.

---

### Branch 4: UI Rendering - Hardcoded Template Assumption

**File:** `components/PhraseCard.tsx:47-56`  
**Component:** `PhraseCard`

**Execution:**
```typescript
// Line 43: "How it sounds" section
<div className="text-base text-gray-900">{soundRule}</div>
// ⚠️ DIRECTLY RENDERS: "i" can sound like "i" when spoken quickly.

// Lines 47-56: "In this sentence" section
{inSentence && (
  <div>
    <div className="text-sm text-gray-600">
      <span>"{inSentence.highlighted}"</span> often sounds like <span>"{inSentence.heardAs}"</span>
      // ⚠️ HARDCODED TEMPLATE - NO CHECK IF heardAs === highlighted
      // PRODUCES: "i" often sounds like "i"
    </div>
  </div>
)}
```

**Critical Gap:** Hardcoded template at line 54 assumes `heardAs !== highlighted`, with no conditional rendering for identical values.

---

### Branch 5: Lowercasing Loss of Surface Form

**File:** `lib/alignmentEngine.ts:59-79`  
**Function:** `normalizeText(text: string)` → `tokenize(text: string)`

**Execution:**
```typescript
// Line 63: Lowercasing happens BEFORE tokenization
export function normalizeText(text: string): string {
  let normalized = text
    .toLowerCase()  // ⚠️ "I" → "i" IMMEDIATELY
    .replace(/[^\w\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  // ...
}

// Line 76: Tokenization uses normalized (lowercase) text
export function tokenize(text: string): string[] {
  const n = normalizeText(text)  // Already lowercase
  return n ? n.split(' ').filter(t => t.length > 0) : []
}
```

**Impact:**
- Original transcript: `"I was thinking"`
- After normalization: `"i was thinking"`
- Tokens: `["i", "was", "thinking"]`
- `FeedbackItem.target` = `"i"` (always lowercase)
- UI displays: `"i"` (never "I")

**Critical Gap:** Surface form capitalization is lost during alignment phase and never restored for UI display. User sees lowercase even when transcript had proper capitalization.

---

## Tautology-Trigger Tokens

### Complete List (20+ confirmed cases)

#### Function Words (Should be Weak Forms but Missing):

**Pronouns (7):**
- `"i"` - NOT in weakFormWords, NO heardAs mapping → `heardAs = "i"`
- `"it"` - NOT in weakFormWords, NO heardAs mapping → `heardAs = "it"`
- `"we"` - NOT in weakFormWords, NO heardAs mapping → `heardAs = "we"`
- `"he"` - NOT in weakFormWords, NO heardAs mapping → `heardAs = "he"`
- `"she"` - NOT in weakFormWords, NO heardAs mapping → `heardAs = "she"`
- `"they"` - In weakFormWords check but NO mapping (only checks: the, to, and, for, you, they) → Actually HAS mapping → `"thay"` ✅ **WORKS**
- `"this"` - NOT in weakFormWords, NO heardAs mapping → `heardAs = "this"`
- `"that"` - NOT in weakFormWords, NO heardAs mapping → `heardAs = "that"`

**Auxiliary Verbs (10):**
- `"is"` - NOT in weakFormWords, NO heardAs mapping → `heardAs = "is"`
- `"are"` - NOT in weakFormWords, NO heardAs mapping → `heardAs = "are"`
- `"was"` - NOT in weakFormWords, NO heardAs mapping → `heardAs = "was"`
- `"were"` - NOT in weakFormWords, NO heardAs mapping → `heardAs = "were"`
- `"have"` - NOT in weakFormWords, NO heardAs mapping → `heardAs = "have"`
- `"has"` - NOT in weakFormWords, NO heardAs mapping → `heardAs = "has"`
- `"had"` - NOT in weakFormWords, NO heardAs mapping → `heardAs = "had"`
- `"do"` - NOT in weakFormWords, NO heardAs mapping → `heardAs = "do"`
- `"does"` - NOT in weakFormWords, NO heardAs mapping → `heardAs = "does"`
- `"did"` - NOT in weakFormWords, NO heardAs mapping → `heardAs = "did"`

**Modal Verbs (6):**
- `"will"` - NOT in weakFormWords, NO heardAs mapping → `heardAs = "will"`
- `"would"` - NOT in weakFormWords, NO heardAs mapping → `heardAs = "would"`
- `"should"` - NOT in weakFormWords, NO heardAs mapping → `heardAs = "should"`
- `"could"` - NOT in weakFormWords, NO heardAs mapping → `heardAs = "could"`
- `"can"` - NOT in weakFormWords, NO heardAs mapping → `heardAs = "can"`
- `"must"` - NOT in weakFormWords, NO heardAs mapping → `heardAs = "must"`

#### Content Words (Should have Different Explanation):

**Content Nouns/Verbs (10+):**
- `"thinking"` - Content word, NOT in any dict → `heardAs = "thinking"` → Tautology
- `"about"` - Content word (preposition used as content), NOT in any dict → `heardAs = "about"` → Tautology
- `"something"` - Content word, NOT in any dict → `heardAs = "something"` → Tautology
- `"anything"` - Content word, NOT in any dict → `heardAs = "anything"` → Tautology
- `"everything"` - Content word, NOT in any dict → `heardAs = "everything"` → Tautology
- `"nothing"` - Content word, NOT in any dict → `heardAs = "nothing"` → Tautology
- `"someone"` - Content word, NOT in any dict → `heardAs = "someone"` → Tautology
- `"anyone"` - Content word, NOT in any dict → `heardAs = "anyone"` → Tautology
- `"everyone"` - Content word, NOT in any dict → `heardAs = "everyone"` → Tautology
- `"today"` - Content word, NOT in any dict → `heardAs = "today"` → Tautology

**Total:** 30+ tokens confirmed to produce tautologies under current logic.

---

### Token Classes (Patterns):

**Pattern 1: Missing Weak Forms (23 tokens)**
- All pronouns except `"you"`, `"they"` (have partial mappings)
- All auxiliary verbs (is, are, was, were, have, has, had, do, does, did)
- All modal verbs (will, would, should, could, can, must, may)
- **Trigger:** `detectCategory()` → `'missed'` (not in weakFormWords) → `generateHeardAs()` → fallback → `heardAs === phrase`

**Pattern 2: Content Words (10+ tokens)**
- Any noun/verb/adjective not in dictionaries
- **Trigger:** Single word, NOT in any dict → `detectCategory()` → `'missed'` → `generateHeardAs()` → fallback → `heardAs === phrase`

**Pattern 3: Uncommon Prepositions (10+ tokens)**
- Prepositions beyond basic 6: `from`, `by`, `about`, `into`, `onto`, `upon`, `over`, `under`, `between`, `among`, `during`, `through`, `across`, `behind`, `beside`, `beyond`, `within`, `without`, `against`, `toward`
- **Trigger:** NOT in weakFormWords (only has: `at`, `in`, `on`, `of`, `for`, `with`) → `'missed'` → fallback → tautology

---

## UX Implications

### 1. Visible Tautologies in Production

**Locations:**
- `components/PhraseCard.tsx:43` - "How it sounds" section
  - **Renders:** `"i" can sound like "i" when spoken quickly.`
  - **User sees:** Meaningless tautology that provides no value

- `components/PhraseCard.tsx:54` - "In this sentence" section
  - **Renders:** `"i" often sounds like "i"`
  - **User sees:** Redundant statement that confuses rather than educates

**Impact:**
- **User Trust:** Reduces credibility - system appears broken
- **Learning Value:** Zero - provides no pronunciation guidance
- **Engagement:** Users may skip these cards as unhelpful
- **Accessibility:** Screen readers announce: "i can sound like i" - confusing for visually impaired users

---

### 2. Surface Form Loss (Capitalization)

**Issue:** All words displayed in lowercase regardless of original transcript capitalization.

**Example:**
- Transcript: `"I was thinking about it."`
- Tokens: `["i", "was", "thinking", "about", "it"]`
- UI displays: `"i"` (not "I")
- User sees: Lowercase everywhere, even for proper nouns and sentence-starting words

**Impact:**
- **Visual Clarity:** Loss of grammatical cues (proper nouns, sentence starts)
- **Professional Appearance:** Looks unpolished, inconsistent with proper English
- **Learning:** Users don't see proper capitalization patterns

**Where Lost:**
- `lib/alignmentEngine.ts:63` - `normalizeText()` lowercases immediately
- Never restored anywhere in the pipeline

---

### 3. Category Misclassification

**Issue:** Critical function words misclassified as `'missed'` instead of `'weak_form'`.

**Impact:**
- **Sound Explanations:** Generic `"can sound like X"` instead of weak-form specific: `"often unstressed and reduced to X"`
- **Meaning Explanations:** Generic placeholder: `"This phrase carries meaning but can be hard to catch in fast speech."` instead of context-specific explanations for function words
- **Learning Opportunity Lost:** Users don't learn about weak forms, stress patterns, or vowel reduction

---

### 4. Missing Pronunciation Guidance

**Issue:** For 30+ common words, system provides no pronunciation guidance whatsoever.

**Expected Behavior:**
- `"i"` → Should explain: "Often unstressed and sounds like 'uh' or 'ah' in fast speech"
- `"it"` → Should explain: "Often unstressed, sounds like 'it' with reduced vowel /ɪ/ or 't' at word boundaries"
- `"is"` → Should explain: "Often reduced to 's' or 'z' in contractions (it's, that's)"

**Current Behavior:**
- `"i"` → `"i" can sound like "i"` (tautology)
- `"it"` → `"it" can sound like "it"` (tautology)
- `"is"` → `"is" can sound like "is"` (tautology)

**Impact:**
- **Learning Gap:** Users miss critical pronunciation patterns for most common English words
- **Comprehension:** No guidance on why these words are hard to hear (weak forms, stress patterns)

---

## Data Gaps for Context-Aware Feedback

### Current Data Available:

**From Alignment:**
- `refTokens: string[]` - Lowercased token sequence: `["i", "was", "thinking"]`
- `userTokens: string[]` - Lowercased user input tokens
- `events: AlignmentEvent[]` - Token-level alignment (missing, substitution, extra)
- `phraseHint: { spanText, spanRefStart, spanRefEnd }` - Phrase spans for known patterns

**From FeedbackItem:**
- `target: string` - Lowercased target phrase: `"i"`
- `fullSentence: string` - Full transcript (lowercased): `"i was thinking"`
- `category: FeedbackCategory` - Current category: `'missed'` (often wrong)

---

### Missing Data for Context-Aware Feedback:

#### 1. Phonetic/Phonological Data

**Current:** None
**Needed:**
- **IPA transcription** for target word/phrase: `"i"` → `/aɪ/` (stressed) or `/ɪ/` (unstressed)
- **Phonetic spelling approximation:** `"i"` → `"ai"` (stressed) or `"uh"` (unstressed)
- **Weak form variant:** `"i"` → `"uh"`, `"it"` → `"t"`, `"is"` → `"s"`
- **Stress pattern:** Stressed vs unstressed for this occurrence
- **Syllable structure:** Monosyllabic vs polysyllabic

**Impact:** Cannot generate meaningful pronunciation hints without phonetic data.

---

#### 2. Contextual Stress/Prosody Data

**Current:** None
**Needed:**
- **Word stress in sentence:** Is "i" stressed or unstressed in this context?
- **Sentence stress pattern:** Which words are emphasized?
- **Phrase boundaries:** Where do phrases begin/end?
- **Intonation pattern:** Rising vs falling intonation

**Example:**
- `"I think I can do it."` → First "I" is stressed (/aɪ/), second "I" is unstressed (/ɪ/ or /ə/)
- System currently treats both as identical: `"i" can sound like "i"`

**Impact:** Cannot explain context-dependent pronunciation variations.

---

#### 3. Neighboring Token Context

**Current:** `fullSentence: string` (full transcript), `target: string` (isolated phrase)
**Needed:**
- **Previous token:** What word comes before the target?
- **Next token:** What word comes after the target?
- **Phrase boundaries:** Is target at phrase start/end/middle?
- **Word boundaries:** Is target connected to neighbors?

**Example:**
- `"went to"` → Linking: `"went"` + `"to"` → sounds like `"wento"` or `"wenta"`
- `"a lot of"` → Linking: `"a"` + `"lot"` + `"of"` → `"alotta"`
- `"it is"` → Linking: `"it"` + `"is"` → `"itis"` or `"it's"`

**Impact:** Cannot detect or explain linking, flapping, or elision phenomena that depend on neighboring words.

---

#### 4. Timestamp/Alignment Data

**Current:** None
**Needed:**
- **Word-level timestamps:** Start/end time for each token in audio
- **Phrase-level timestamps:** Start/end time for target phrase
- **Phoneme-level alignment:** Precise boundaries for sounds

**Example:**
- `target: "thinking"`, `startMs: 1234`, `endMs: 1567`
- Can extract audio segment for "This part" replay
- Can analyze duration to detect stress (stressed = longer, unstressed = shorter)

**Impact:** Cannot implement phrase-level audio replay or duration-based stress detection.

---

#### 5. Audio Metadata

**Current:** `audioUrl: string` (if available from clip data, not in FeedbackItem)
**Needed:**
- **Audio URL:** Where to fetch audio for this sentence/phrase
- **Audio duration:** Total sentence duration
- **Segment boundaries:** Start/end times for phrase within audio
- **Playback capabilities:** Can we play specific segments?

**Impact:** Cannot implement "Play this sentence" or "Play this part" buttons in PhraseCard.

---

#### 6. Grammatical/Semantic Context

**Current:** `fullSentence: string` (lowercased, no parsing)
**Needed:**
- **Part of speech:** Is target a noun, verb, pronoun, preposition, etc.?
- **Syntactic role:** Subject, object, verb, modifier?
- **Semantic function:** Function word vs content word classification
- **Sentence structure:** Simple, complex, compound?

**Example:**
- `"it"` as pronoun vs `"it"` as dummy subject → different explanations
- `"to"` as preposition vs infinitive marker → different weak forms

**Impact:** Cannot provide grammatically-aware pronunciation explanations.

---

#### 7. Speech Rate/Timing Data

**Current:** None
**Needed:**
- **Speaking rate:** Words per minute, syllables per second
- **Pause boundaries:** Where are pauses in speech?
- **Rhythm pattern:** Stress-timed vs syllable-timed rhythm
- **Tempo variations:** Where does speaker slow down/speed up?

**Impact:** Cannot explain timing-related phenomena (fast speech, slow speech, pauses).

---

#### 8. Surface Form Preservation

**Current:** All lowercase after normalization
**Needed:**
- **Original casing:** Preserve "I" vs "i" from transcript
- **Proper noun detection:** Identify names, places that should be capitalized
- **Sentence start:** Identify sentence-initial words for capitalization

**Impact:** Loss of visual grammatical cues, professional appearance.

---

## Data Gap Summary

| Data Type | Current | Needed | Impact |
|-----------|---------|--------|--------|
| Phonetic/Phonological | ❌ None | IPA/phonetic spelling, weak forms | Cannot generate pronunciation hints |
| Contextual Stress | ❌ None | Stressed/unstressed per occurrence | Cannot explain context-dependent pronunciation |
| Neighboring Tokens | ❌ Only full sentence | Previous/next tokens, boundaries | Cannot detect linking/flapping/elision |
| Timestamps | ❌ None | Word/phrase-level start/end times | Cannot implement segment replay |
| Audio Metadata | ❌ Optional (not in FeedbackItem) | Audio URL, duration, segment boundaries | Cannot play audio for examples |
| Grammatical Context | ❌ None | POS, syntactic role, semantic function | Cannot provide grammatically-aware explanations |
| Speech Rate/Timing | ❌ None | WPM, pauses, rhythm patterns | Cannot explain timing-related phenomena |
| Surface Form | ❌ Lost | Original casing, proper nouns | Loss of visual clarity, professional appearance |

---

## Recommendations (Design Only - No Implementation)

### 1. Immediate Fixes (Guard Logic)

**Add tautology guards:**
- In `generateHeardAs()`: Never return original word if no mapping found → use category-based generic description
- In `generateSoundRule()`: Check `if (heardAs === phrase)` → use alternative template
- In `PhraseCard.tsx`: Check `if (heardAs === highlighted)` → render alternative message or omit section

### 2. Dictionary Expansion (Quick Fix)

**Expand `weakFormWords` array:**
- Add all pronouns, auxiliary verbs, modal verbs (30+ words)
- Add mappings in `generateHeardAs()` for weak forms
- Pros: Fast, no API costs, works offline
- Cons: Still incomplete, maintenance burden

### 3. LLM Integration (Long-term Solution)

**Use OpenAI for context-aware feedback:**
- Input: `phrase`, `fullSentence`, `category`, `neighbors`
- Output: Structured JSON with `pronunciation_hint`, `in_sentence_heard_as`, `listening_tip`, `extra_example`
- Cache responses (key: phrase + context hash)
- Fall back to dictionary for common words (fast path)
- Pros: Complete coverage, context-aware, no tautologies
- Cons: API costs, latency, requires error handling

### 4. Phonetic Data Integration

**Add phonetic analysis:**
- Use phonetic dictionaries (CMU Pronouncing Dictionary, IPA databases)
- Generate IPA/phonetic spelling for all words
- Detect weak forms automatically from phonetic patterns
- Store weak form variants (stressed vs unstressed)

### 5. Context-Aware Analysis

**Add neighboring token analysis:**
- Detect linking: `"went to"` → `"wento"`
- Detect flapping: `"water"` → `"wadder"`
- Detect elision: `"and"` → `"n"` between words
- Use phrase boundaries to determine stress patterns

### 6. Surface Form Preservation

**Preserve casing through pipeline:**
- Store original casing separately from normalized tokens
- Restore casing for UI display based on context (sentence start, proper nouns)
- Use sentence parsing to determine proper capitalization

---

END OF AUDIT


