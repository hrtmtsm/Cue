# Feedback Generation & Rendering Logic - Audit Report

## A) Files + Component Tree

### Key Files Identified:

1. **Core Generation Logic:**
   - `lib/practiceSteps.ts` (lines 1-500)
     - `generateMeaningInContext()` - lines 152-215
     - `generateHeardAs()` - lines 101-147
     - `generateSoundRule()` - lines 220-239
     - `generateExtraExample()` - lines 245-320
     - `generateTip()` - lines 325-338
     - `detectCategory()` - lines 51-96
     - `extractPracticeSteps()` - lines 344-498

2. **UI Rendering:**
   - `components/PhraseCard.tsx` (lines 1-84)
     - Renders: Meaning, How it sounds, In this sentence, Another example
     - Conditional rendering based on presence of `inSentence` and `extraExample`

3. **Usage Locations:**
   - `app/(app)/practice/[clipId]/practice/page.tsx` (line 282)
     - Uses `<PhraseCard feedbackItem={current} />`
   - `app/(app)/practice/review/page.tsx`
     - Uses inline rendering (not PhraseCard) for summary view

4. **Audio Controls:**
   - `components/AudioControls.tsx` (lines 1-45)
     - Props: `onPlay`, `onSlow`, `onReplayChunk`, `isSlow`
     - Buttons: "Play", "Slow", "This part"
   - `app/(app)/practice/[clipId]/practice/page.tsx` (lines 226-239)
     - Handlers: `handlePlay()`, `handleSlow()`, `handleReplayChunk()`
     - Currently STUBS - not implemented

### Component Call Flow:

```
Review Page → /api/check-answer → alignTexts() → attachPhraseSpans()
  ↓
Practice Page → extractPracticeSteps(events, refTokens, userTokens)
  ↓
  → detectCategory()
  → generateHeardAs()
  → generateMeaningInContext()
  → generateSoundRule()
  → generateExtraExample()
  ↓
  → PhraseCard component
    → Conditional sections: {inSentence && ...}, {extraExample && ...}
```

---

## B) Code Extraction (Full Functions)

### File: `lib/practiceSteps.ts`

#### 1. `generateHeardAs()` - Lines 101-147

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
  
  return lower // ⚠️ FALLBACK: return as-is - THIS IS THE TAUTOLOGY SOURCE
}
```

**Critical Issue Found (Line 146):** The fallback `return lower` causes tautologies when:
- Phrase is NOT in contractions dict
- Phrase is NOT a linking pattern
- Phrase is NOT a weak form (exact match required)
- Phrase is NOT multi-word (length < 2)

**Examples that trigger fallback:**
- `"it"` → NOT in weak forms (only 'the', 'to', 'and', 'for', 'you', 'they')
- `"thinking"` → NOT in any dict, single word → returns `"thinking"`
- `"about"` → NOT in any dict, single word → returns `"about"`

---

#### 2. `generateMeaningInContext()` - Lines 152-215

```typescript
function generateMeaningInContext(phrase: string, fullSentence: string, category: FeedbackCategory): string {
  const lower = phrase.toLowerCase().trim()
  
  // For contractions, expand them (e.g., "I'm" = "I am") and explain role
  if (category === 'contraction' && isContraction(phrase)) {
    const expanded = expandContraction(phrase)
    // Determine role based on the expanded form
    if (expanded.includes(' am ') || expanded.includes(' are ') || expanded.includes(' is ')) {
      return `${phrase} means "${expanded}" - it describes a state or identity.`
    } else if (expanded.includes(' will ')) {
      return `${phrase} means "${expanded}" - it shows future action or intention.`
    } else if (expanded.includes(' would ')) {
      return `${phrase} means "${expanded}" - it shows conditional or past habit.`
    } else if (expanded.includes(' have ') || expanded.includes(' has ')) {
      return `${phrase} means "${expanded}" - it shows completion or possession.`
    } else if (expanded.includes(' not ')) {
      return `${phrase} means "${expanded}" - it makes the statement negative.`
    } else {
      return `${phrase} means "${expanded}" - it combines two words into one sound.`
    }
  }
  
  // Context-aware meanings based on category and common phrases
  const contextMeanings: Record<string, string> = {
    'have you': 'Asking if someone did something.',
    'want to': 'Expressing desire or intention to do something.',
    'going to': 'Future plan or intention.',
    'you\'re': 'Describing someone or their state.',
    'i\'m': 'Describing yourself or your state.',
    'we\'re': 'Describing a group or situation.',
    'later': 'Referring to a time after now.',
    'the': 'Pointing to a specific thing.',
    'to': 'Showing direction or purpose.',
    'and': 'Connecting ideas together.',
    'for': 'Indicating purpose or recipient.',
    'with': 'Showing accompaniment or means.',
    'in the': 'Inside or within something specific.',
    'on the': 'Located on top of something specific.',
    'at the': 'Located near or at a specific place.',
  }
  
  // Check for exact matches first
  for (const [key, meaning] of Object.entries(contextMeanings)) {
    if (lower === key || lower.includes(key)) {  // ⚠️ ISSUE: includes() is too broad
      return meaning
    }
  }
  
  // Category-based fallbacks
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
      return 'This phrase carries meaning but can be hard to catch in fast speech.'  // ⚠️ PLACEHOLDER FALLBACK
  }
}
```

**Fallback Conditions for Placeholder:**
1. NOT a contraction with valid expansion
2. NOT in `contextMeanings` dict (exact match OR substring match via `includes()`)
3. Category is `'missed'` (default) OR unknown category

**Issue with `includes()` (Line 195):**
- `"thinking"` includes `"in"` → matches `"in the"` → WRONG!
- Should use exact match first, then substring only if intentional

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

**Tautology Issue:**
- When `heardAs === phrase` (fallback from `generateHeardAs`), this produces:
  - `"it" can sound like "it" when spoken quickly.`
  - `"thinking" can sound like "thinking" when spoken quickly.`

**Root Cause:** `generateSoundRule` blindly uses `heardAs` without checking if it's identical to `phrase`.

---

#### 4. `generateExtraExample()` - Lines 245-320

```typescript
function generateExtraExample(phrase: string, category: FeedbackCategory): { sentence: string; heardAs?: string } | undefined {
  const lower = phrase.toLowerCase().trim()
  
  // Template-based examples for common phrases - only real, meaningful examples
  const examples: Record<string, string> = {
    'later': "I'll see you later.",
    'you\'re': "You're doing great!",
    'i\'m': "I'm not sure about that.",
    'we\'re': "We're almost there.",
    'they\'re': "They're coming soon.",
    'it\'s': "It's a beautiful day.",
    'that\'s': "That's exactly right.",
    'don\'t': "Don't worry about it.",
    'can\'t': "I can't believe it.",
    'won\'t': "I won't do that.",
    'the': "The book is on the table.",
    'to': "I need to go now.",
    'and': "Come and see this.",
    'for': "This is for you.",
    'with': "Come with me.",
    'want to': "I want to learn more.",
    'going to': "I'm going to try again.",
    'have you': "Have you seen this before?",
    'in the': "It's in the box.",
    'on the': "Put it on the shelf.",
    'at the': "Meet me at the door.",
  }
  
  // Check for exact or partial match - prioritize exact matches
  // First check exact match (lowercased phrase must match key exactly)
  if (examples[lower]) {
    const heardAs = generateHeardAs(lower, category)
    return { sentence: examples[lower], heardAs }
  }
  
  // Then check if phrase contains any of our example keys
  for (const [key, example] of Object.entries(examples)) {
    if (lower.includes(key) || key.includes(lower)) {  // ⚠️ ISSUE: includes() can cause false matches
      const heardAs = generateHeardAs(key, category)
      return { sentence: example, heardAs }
    }
  }
  
  // For contractions, try to generate a reasonable example
  if (category === 'contraction') {
    const expanded = expandContraction(phrase)
    // Generate a simple sentence using the expanded form
    // This is still a real example, not a placeholder
    if (expanded !== phrase) {
      // Simple context-based example
      if (phrase.toLowerCase() === "i'm" || phrase.toLowerCase() === "im") {
        return { sentence: "I'm ready to start.", heardAs: generateHeardAs(phrase, category) }
      } else if (phrase.toLowerCase() === "you're" || phrase.toLowerCase() === "youre") {
        return { sentence: "You're doing well.", heardAs: generateHeardAs(phrase, category) }
      } else if (phrase.toLowerCase() === "don't" || phrase.toLowerCase() === "don't") {
        return { sentence: "Don't forget to call.", heardAs: generateHeardAs(phrase, category) }
      }
    }
  }
  
  // For common articles/prepositions, provide simple real examples
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
  
  // If no real example exists, return undefined (omit the section)
  return undefined  // ✅ GOOD: No placeholder, section is omitted
}
```

**Why `extraExample` is Missing:**
1. Phrase not in `examples` dict (exact match)
2. Phrase doesn't contain/contained-by any example key
3. NOT a contraction with hardcoded examples
4. NOT 'the', 'a', or 'an'

**Examples that return `undefined`:**
- `"thinking"` → Not in dict, no substring match, not contraction → `undefined`
- `"it"` → Not in dict (only 'it\'s' is there), no match → `undefined`
- `"about"` → Not in dict → `undefined`

---

#### 5. `detectCategory()` - Lines 51-96

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
  
  return 'missed'  // ⚠️ DEFAULT FALLBACK - triggers placeholder Meaning
}
```

**Category Detection for Examples:**

| Phrase | Category | Reason |
|--------|----------|--------|
| `"thinking"` | `'missed'` | Not contraction, not linking, not weak form, not multi-word, not substitution → DEFAULT |
| `"it"` | `'missed'` | NOT in `weakFormWords` array (only has: the, to, and, for, of, with, a, an, at, in, on) → DEFAULT |
| `"you're"` | `'contraction'` | Matches regex pattern |
| `"I'm"` | `'contraction'` | Matches regex pattern |

**Critical Gap:** `"it"` is a weak form but NOT in the `weakFormWords` array!

---

## C) Fallback Conditions - Detailed Analysis

### 1. Meaning Placeholder: "This phrase carries meaning but can be hard to catch in fast speech."

**Triggered when ALL of:**
- NOT a contraction with valid expansion (or expansion fails)
- NOT in `contextMeanings` dict (exact match OR substring via `includes()`)
- Category is `'missed'` (default) OR unknown

**Examples:**

#### Example 1: "thinking"
```typescript
phrase = "thinking"
category = detectCategory("thinking") // Returns 'missed' (not in any category)
lower = "thinking"

// Check contraction: NO (category is 'missed', not 'contraction')
// Check contextMeanings:
//   - Exact match: NO ("thinking" not in dict)
//   - includes() check: "thinking".includes("in") → matches "in the" → WRONG MATCH
//   But wait... let's check the actual code flow...
```

**Actual behavior:** `includes()` checks `"thinking".includes("in the")` → FALSE
But then checks reverse: `"in the".includes("thinking")` → FALSE
So no match → Falls through to category switch → `'missed'` → **PLACEHOLDER**

**Result:** `"This phrase carries meaning but can be hard to catch in fast speech."`

#### Example 2: "it"
```typescript
phrase = "it"
category = detectCategory("it") // Returns 'missed' (NOT in weakFormWords array!)
lower = "it"

// Check contraction: NO
// Check contextMeanings:
//   - Exact match: "it" not in dict (only has: have you, want to, going to, you're, i'm, we're, later, the, to, and, for, with, in the, on the, at the)
//   - includes(): "it".includes("in the") → FALSE
//   - Reverse: "in the".includes("it") → FALSE
//   No match → Falls through to category switch → 'missed' → PLACEHOLDER
```

**Result:** `"This phrase carries meaning but can be hard to catch in fast speech."`

**Issue:** `"it"` should be categorized as `'weak_form'` but it's NOT in the `weakFormWords` array!

#### Example 3: "you're"
```typescript
phrase = "you're"
category = detectCategory("you're") // Returns 'contraction' (matches regex)
lower = "you're"

// Check contraction: YES → expandContraction("you're") → "you are"
// Expanded includes ' are ' → Returns: "you're means \"you are\" - it describes a state or identity."
```

**Result:** `"you're means "you are" - it describes a state or identity."` ✅ GOOD

---

### 2. Sound Rule Tautology: `"${phrase}" can sound like "${heardAs}" when spoken quickly.`

**Triggered when:**
- Category is `'missed'` (default) OR unknown
- AND `heardAs === phrase` (from `generateHeardAs` fallback)

#### Example 1: "it"
```typescript
phrase = "it"
category = 'missed'
heardAs = generateHeardAs("it", 'missed')
  → NOT in contractions dict
  → NOT linking pattern
  → NOT weak form match (lower === 'the'? NO, === 'to'? NO, ...)
  → NOT multi-word (length === 1)
  → FALLBACK: return "it"  // Line 146

soundRule = generateSoundRule("it", 'missed', "it")
  → default case: `"it" can sound like "it" when spoken quickly.`  // TAUTOLOGY
```

#### Example 2: "thinking"
```typescript
phrase = "thinking"
category = 'missed'
heardAs = generateHeardAs("thinking", 'missed')
  → NOT in contractions
  → NOT linking
  → NOT weak form (exact match only)
  → NOT multi-word (single word)
  → FALLBACK: return "thinking"

soundRule = generateSoundRule("thinking", 'missed', "thinking")
  → default case: `"thinking" can sound like "thinking" when spoken quickly.`  // TAUTOLOGY
```

#### Example 3: "you're"
```typescript
phrase = "you're"
category = 'contraction'
heardAs = generateHeardAs("you're", 'contraction')
  → "you're" in contractions dict → return "yer"

soundRule = generateSoundRule("you're", 'contraction', "yer")
  → contraction case: `Contractions blend two words. "you're" often sounds like "yer" in fast speech.`  // ✅ GOOD
```

---

### 3. Extra Example Missing

**Returns `undefined` when:**
- Phrase not in `examples` dict (exact match)
- Phrase doesn't contain/contained-by any example key
- NOT a contraction with hardcoded examples (only: "i'm", "you're", "don't")
- NOT 'the', 'a', or 'an'

#### Examples:
- `"thinking"` → Not in dict, no substring match → `undefined` → Section omitted ✅
- `"it"` → Not in dict (only 'it\'s' present), no match → `undefined` → Section omitted ✅
- `"you're"` → In dict → Returns `{ sentence: "You're doing great!", heardAs: "yer" }` ✅

**Note:** This is CORRECT behavior - no placeholder templates are used. Section is simply omitted if no real example exists.

---

## D) Audio / Play Logic Audit

### Current Audio Controls Implementation:

#### File: `components/AudioControls.tsx` (Lines 1-45)

```typescript
type AudioControlsProps = {
  onPlay: () => void          // Play whole sentence
  onSlow: () => void          // Slow playback toggle
  onReplayChunk: () => void   // "This part" - replay specific phrase
  isSlow?: boolean
}
```

**Current Props:**
- `onPlay`: Callback for "Play" button
- `onSlow`: Callback for "Slow" toggle
- `onReplayChunk`: Callback for "This part" button
- `isSlow`: Boolean state for slow mode

**No Audio Data Passed:** The component receives only callbacks, no actual audio URLs, timestamps, or phrase spans.

---

#### File: `app/(app)/practice/[clipId]/practice/page.tsx` (Lines 226-239)

```typescript
const handlePlay = () => {
  analytics.play_sentence()
  // Stub: hook this to audio playback later  // ⚠️ NOT IMPLEMENTED
}

const handleSlow = () => {
  setIsSlow((v) => !v)
  analytics.play_slow()
  // ⚠️ Only toggles state, doesn't actually change playback rate
}

const handleReplayChunk = () => {
  analytics.replay_chunk()
  // Stub: hook this to segment replay later  // ⚠️ NOT IMPLEMENTED
}
```

**Current State:**
- ❌ All handlers are STUBS
- ❌ No audio URL available in component
- ❌ No timestamps/segments for phrase replay
- ❌ No playback rate control implemented
- ✅ `isSlow` state exists but doesn't affect playback

---

### Audio Data Available in Practice Page:

From `current` (PracticeStep/FeedbackItem):
```typescript
{
  target: "thinking",           // The phrase
  inSentence: {
    original: "I was thinking about it.",  // Full sentence
    highlighted: "thinking",               // Target phrase
    heardAs: "thinking"                    // Phonetic approximation
  },
  // ❌ NO audioUrl
  // ❌ NO timestamps (start/end in audio)
  // ❌ NO segment data
}
```

**Missing Data for Audio Playback:**
1. Audio URL (whole sentence)
2. Timestamp range for phrase segment (startMs, endMs)
3. Audio element reference
4. Playback rate control

---

### Review Page Audio Implementation (Reference):

File: `app/(app)/practice/review/page.tsx` (Lines 410-456)

```typescript
// Audio playback state
const [isPlaying, setIsPlaying] = useState(false)
const [isSlow, setIsSlow] = useState(false)
const [isLooping, setIsLooping] = useState(false)
const audioRef = useRef<HTMLAudioElement | null>(null)

// Audio URL from currentPhrase
useEffect(() => {
  if (typeof window === 'undefined' || !currentPhrase.audioUrl) return

  audioRef.current = new Audio(currentPhrase.audioUrl)  // ✅ Uses audioUrl
  audioRef.current.addEventListener('ended', () => {
    if (isLooping) {
      audioRef.current?.play()
    } else {
      setIsPlaying(false)
    }
  })

  return () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
  }
}, [currentPhrase.audioUrl, isLooping])

const handlePlayPause = () => {
  if (!audioRef.current) return

  if (isPlaying) {
    audioRef.current.pause()
    setIsPlaying(false)
  } else {
    audioRef.current.playbackRate = isSlow ? 0.75 : 1.0  // ✅ Playback rate control
    audioRef.current.play()
    setIsPlaying(true)
  }
}

const handleSlow = () => {
  setIsSlow(!isSlow)
  if (audioRef.current && isPlaying) {
    audioRef.current.playbackRate = !isSlow ? 0.75 : 1.0  // ✅ Updates playback rate
  }
}
```

**What Works in Review Page:**
- ✅ Audio URL from `currentPhrase.audioUrl`
- ✅ HTML5 Audio element with ref
- ✅ Playback rate control (0.75x for slow)
- ✅ Loop functionality
- ❌ No phrase-level segment replay (only whole sentence)

---

### What's Needed for PhraseCard Play Buttons:

#### 1. Play "In this sentence" (whole sentence):
- Audio URL (from clip/transcript)
- Playback rate (normal/slow)
- Audio element reference

#### 2. Play "This part" (phrase segment):
- Audio URL
- Timestamp range (startMs, endMs) for the phrase
- **MISSING:** Timestamp extraction logic (align phrase to audio segment)
- Playback rate control

#### 3. Play "Another example" (generated sentence):
- **MISSING:** TTS (Text-to-Speech) infrastructure
- No current implementation for generating audio from text
- Would need: TTS API call or client-side TTS

---

### Open Questions / Risks:

1. **Timestamp Extraction:** How do we map phrase spans to audio timestamps?
   - Option A: Word-level timestamps from alignment API
   - Option B: Estimate based on character/word position (inaccurate)
   - Option C: Use phoneme-level alignment (requires API)

2. **Audio URL Source:** Where does practice page get audio URL?
   - Review page uses `currentPhrase.audioUrl`
   - Practice page doesn't have access to `currentPhrase`
   - Need to pass audio URL from Review → Practice (via query params or sessionStorage)

3. **TTS for Examples:** No infrastructure exists for generating audio from example sentences.
   - Would need: OpenAI TTS, browser TTS (Web Speech API), or pre-generated examples

4. **Segment Replay:** Current audio infrastructure only supports whole-sentence playback.
   - Would need: Audio slicing or seeking to specific timestamps

---

## Summary: Root Causes

### Tautology Issue (`"it" sounds like "it"`):

**Root Cause Chain:**
1. `"it"` is NOT in `weakFormWords` array → categorized as `'missed'`
2. `generateHeardAs("it", 'missed')` → No matches → Returns `"it"` (fallback)
3. `generateSoundRule("it", 'missed', "it")` → Default case → `"it" can sound like "it"`

**Fix Required:**
- Add `"it"` to `weakFormWords` array OR
- Add special case for `"it"` in `generateHeardAs` OR
- Check if `heardAs === phrase` in `generateSoundRule` and use generic fallback

### Meaning Placeholder Issue:

**Root Cause:**
- `contextMeanings` dict is too small (only 15 entries)
- `"it"`, `"thinking"`, `"about"`, etc. not in dict
- Category `'missed'` triggers generic placeholder
- `includes()` check could cause false matches but doesn't in practice

**Fix Required:**
- Expand `contextMeanings` dict OR
- Use category-based meanings for `'weak_form'` (should catch "it") OR
- Improve category detection (add "it" to weak forms)

### Missing "Another example":

**Root Cause:**
- `generateExtraExample()` returns `undefined` for unknown phrases
- This is CORRECT behavior (no placeholders)
- Section is conditionally rendered: `{extraExample && ...}`

**Status:** ✅ Working as designed - sections are omitted if no real example exists.

---

## Recommendations (Not Implemented - Investigation Only):

1. **Fix Tautology:**
   - Add `"it"` to `weakFormWords` array
   - OR: Add `if (heardAs === phrase)` check in `generateSoundRule` and use generic explanation
   - OR: Expand `generateHeardAs` with more weak forms

2. **Fix Meaning Placeholders:**
   - Expand `contextMeanings` dict with common function words
   - OR: Use category-based meaning templates (not just fallback)
   - Fix category detection for "it" (should be `'weak_form'`)

3. **Audio Implementation:**
   - Pass audio URL from Review → Practice (query param or sessionStorage)
   - Implement timestamp extraction (word-level alignment from API)
   - Implement segment replay (audio seeking/slicing)
   - For TTS examples: Add Web Speech API or OpenAI TTS integration

---

END OF AUDIT


