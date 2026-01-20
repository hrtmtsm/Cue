# Tautology Guard - Implementation Summary

## Patch Summary

**File Changed:** `components/PhraseCard.tsx`

**Lines Added:** ~70 (helper functions + logic + conditional rendering)
**Lines Modified:** ~20 (conditional rendering blocks)
**Total Impact:** Minimal diff, UI-only changes

---

## Implementation Details

### 1. Helper Functions (Lines 19-55)

**`normalizeText(s: string)`**
- Lowercases, trims, collapses whitespace
- Used for case-insensitive, whitespace-tolerant comparison

**`isTautology(a: string, b: string)`**
- Checks if two strings are identical after normalization
- Used to detect `heardAs === highlighted` cases

**`containsTautologyPattern(soundRule: string)`**
- Detects tautology patterns in soundRule text using regex
- Patterns: `"X" can sound like "X"` and `"X" often sounds like "X"`
- Normalizes extracted phrases before comparison

### 2. Tautology Detection (Lines 68-93)

**`heardAsTautology`**
- Checks if `normalize(inSentence.heardAs) === normalize(inSentence.highlighted)`
- Only runs when `inSentence` exists

**`soundRuleTautology`**
- Checks if soundRule contains tautology pattern
- Uses regex to extract quoted phrases and compares them

**`isTautological`**
- OR of both conditions
- Controls visibility of "How it sounds" section

**Dev Guard (Lines 74-81)**
- Logs warning in development mode only (`NODE_ENV === 'development'`)
- Includes phrase, heardAs, highlighted, and soundRule snippet
- No production impact

### 3. Conditional Rendering Logic (Lines 83-93)

**`showHowItSounds`**
- `!isTautological` - Hide if ANY tautology detected

**`showHeardAsLine`**
- `inSentence && !heardAsTautology` - Hide if heardAs === highlighted

**`showFallbackInHowItSounds`**
- `isTautological && inSentence` - Show fallback in "How it sounds" section

**`showFallbackInSentence`**
- `heardAsTautology && !soundRuleTautology && inSentence` - Show fallback in "In this sentence" section ONLY if not already shown

### 4. UI Rendering Changes (Lines 105-139)

**"How it sounds" Section:**
- Conditionally rendered: `{showHowItSounds && ...}` (Line 106)
- Fallback shown when: `{showFallbackInHowItSounds && ...}` (Line 114)
- Fallback message: "This word is often unstressed and easy to miss in fast speech."

**"In this sentence" heardAs Line:**
- Conditionally rendered: `{showHeardAsLine && ...}` (Line 128)
- Fallback shown when: `{showFallbackInSentence && ...}` (Line 134)
- Fallback message: "This word is often unstressed and easy to miss in fast speech."

---

## Which Conditions Hide Which Sections

### "How it sounds" Section

**Hidden when:**
- `isTautological = true` (either condition):
  - `heardAsTautology = true` (when `normalize(inSentence.heardAs) === normalize(inSentence.highlighted)`)
  - OR `soundRuleTautology = true` (when soundRule contains pattern like `"X" can sound like "X"`)

**Shown when:**
- `isTautological = false` (normal case)

**Fallback shown when:**
- `isTautological && inSentence` (any tautology detected AND we have context)

---

### "In this sentence" heardAs Line

**Hidden when:**
- `heardAsTautology = true` (when `normalize(inSentence.heardAs) === normalize(inSentence.highlighted)`)

**Shown when:**
- `heardAsTautology = false` (when heardAs !== highlighted, normal case)

**Fallback shown when:**
- `heardAsTautology && !soundRuleTautology && inSentence`
- Condition: Only show fallback in "In this sentence" if:
  - heardAs is tautological (heardAs === highlighted)
  - BUT soundRule is NOT tautological (to avoid duplicate fallback)
  - AND inSentence exists

---

## Example Scenarios

### Scenario 1: `"i"` with `heardAs="i"`, `highlighted="i"`, `soundRule="i" can sound like "i"`

**Result:**
- "How it sounds" section: **HIDDEN** (replaced by fallback)
- Fallback in "How it sounds": **SHOWN** ✓
- heardAs line: **HIDDEN**
- Fallback in "In this sentence": **HIDDEN** (already shown)

**UI Output:**
```
Meaning
[meaning text]

How it sounds
This word is often unstressed and easy to miss in fast speech.

In this sentence
"[original sentence]"
[no heardAs line]
```

---

### Scenario 2: `"i'm"` with `heardAs="im"`, `highlighted="i'm"`, `soundRule="i'm" often sounds like "im"`

**Result:**
- "How it sounds" section: **SHOWN** ✓ (normal soundRule)
- Fallback: **HIDDEN**
- heardAs line: **SHOWN** ✓
- Fallback in "In this sentence": **HIDDEN**

**UI Output:**
```
Meaning
[meaning text]

How it sounds
Contractions blend two words. "i'm" often sounds like "im" in fast speech.

In this sentence
"[original sentence]"
"i'm" often sounds like "im"
```

---

### Scenario 3: Edge case - Only heardAs tautology (soundRule not detected as tautological)

**Conditions:** `heardAs="i"`, `highlighted="i"`, `soundRule="some other text"`

**Result:**
- "How it sounds" section: **HIDDEN** (isTautological is true because heardAsTautology is true)
- Fallback in "How it sounds": **SHOWN** ✓
- heardAs line: **HIDDEN**
- Fallback in "In this sentence": **HIDDEN** (already shown in "How it sounds")

---

## Testing / Dev Guard

**Development Mode:**
- Console warning logged when tautology detected
- Format: `⚠️ [PhraseCard] Tautology detected: { phrase, heardAs, highlighted, soundRule }`
- Only in `NODE_ENV === 'development'`
- No performance impact in production

**Manual Verification:**
1. Test with phrase "i" → Should show fallback, hide tautology
2. Test with phrase "i'm" → Should show normal soundRule and heardAs line
3. Test with phrase "it" → Should show fallback, hide tautology

---

## Backward Compatibility

✅ **Legacy mode:** No `inSentence` object → All tautology checks skip (backward compatible)
✅ **No breaking changes:** Legacy props still supported
✅ **Minimal diff:** Only UI rendering logic changed, no data structure changes

---

## Files Modified

1. **`components/PhraseCard.tsx`**
   - Added helper functions (normalizeText, isTautology, containsTautologyPattern)
   - Added tautology detection logic
   - Added conditional rendering for "How it sounds" section
   - Added conditional rendering for "In this sentence" heardAs line
   - Added fallback messages
   - Added dev guard (development mode logging)

**No changes to:**
- `lib/practiceSteps.ts` (generation logic unchanged)
- Any other files

---

END OF SUMMARY


