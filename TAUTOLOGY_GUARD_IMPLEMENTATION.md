# Tautology Guard Implementation - Summary

## Changes Made

### File: `components/PhraseCard.tsx`

**Added helper functions (Lines 19-55):**
- `normalizeText(s: string)` - Lowercase, trim, collapse whitespace
- `isTautology(a: string, b: string)` - Check if two strings are identical after normalization
- `containsTautologyPattern(soundRule: string)` - Detect tautology patterns in soundRule text

**Added tautology detection logic (Lines 68-93):**
- `heardAsTautology` - Checks if `inSentence.heardAs === inSentence.highlighted`
- `soundRuleTautology` - Checks if soundRule contains tautology pattern (e.g., `"i" can sound like "i"`)
- `isTautological` - OR of both conditions
- Dev guard: Logs warning in development mode when tautology detected

**Modified rendering logic (Lines 105-139):**
- Conditional rendering for "How it sounds" section
- Fallback message shown when tautology detected
- Conditional rendering for "In this sentence" heardAs line
- Fallback message in "In this sentence" section (only if not already shown)

---

## Logic Explanation

### Tautology Detection

**Condition 1: `heardAsTautology`**
- Triggered when: `inSentence` exists AND `normalize(inSentence.heardAs) === normalize(inSentence.highlighted)`
- Example: `heardAs = "i"`, `highlighted = "i"` → Tautology detected

**Condition 2: `soundRuleTautology`**
- Triggered when: `soundRule` contains pattern like `"X" can sound like "X"` or `"X" often sounds like "X"`
- Example: `"i" can sound like "i" when spoken quickly.` → Tautology detected

### Section Visibility Rules

**"How it sounds" Section:**
- **Hidden when:** `isTautological` (either `heardAsTautology` OR `soundRuleTautology`)
- **Shown when:** `!isTautological` (normal case)

**Fallback in "How it sounds" Section:**
- **Shown when:** `isTautological && inSentence` (any tautology detected, and we have context)
- **Message:** "This word is often unstressed and easy to miss in fast speech."

**"In this sentence" heardAs Line:**
- **Hidden when:** `heardAsTautology` (when heardAs === highlighted)
- **Shown when:** `!heardAsTautology` (normal case)

**Fallback in "In this sentence" Section:**
- **Shown when:** `heardAsTautology && !soundRuleTautology && inSentence`
- **Condition:** Only show if heardAs is tautological BUT soundRule is NOT tautological (to avoid duplicate fallback)
- **Message:** "This word is often unstressed and easy to miss in fast speech."

---

## Example Scenarios

### Scenario 1: `"i"` → `heardAs = "i"`, `soundRule = "i" can sound like "i"`

**Conditions:**
- `heardAsTautology = true` (heardAs === highlighted)
- `soundRuleTautology = true` (pattern detected)
- `isTautological = true`

**Result:**
- "How it sounds" section: **HIDDEN** (tautological soundRule)
- Fallback in "How it sounds": **SHOWN** ("This word is often unstressed...")
- heardAs line: **HIDDEN** (heardAs === highlighted)
- Fallback in "In this sentence": **HIDDEN** (already shown in "How it sounds")

**UI Output:**
```
Meaning
[meaning text]

How it sounds
This word is often unstressed and easy to miss in fast speech.

In this sentence
"[original sentence]"
[no heardAs line - hidden]
```

---

### Scenario 2: `"i'm"` → `heardAs = "im"`, `soundRule = "i'm" often sounds like "im"`

**Conditions:**
- `heardAsTautology = false` (heardAs !== highlighted: "im" !== "i'm")
- `soundRuleTautology = false` (no tautology pattern: "i'm" !== "im")
- `isTautological = false`

**Result:**
- "How it sounds" section: **SHOWN** (normal soundRule)
- Fallback in "How it sounds": **HIDDEN** (not tautological)
- heardAs line: **SHOWN** (heardAs !== highlighted)
- Fallback in "In this sentence": **HIDDEN** (not tautological)

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

### Scenario 3: `"it"` → `heardAs = "it"`, `soundRule = "it" can sound like "it"` (BUT soundRule check fails somehow)

**Conditions:**
- `heardAsTautology = true` (heardAs === highlighted)
- `soundRuleTautology = false` (pattern not detected - edge case)
- `isTautological = true` (because heardAsTautology is true)

**Result:**
- "How it sounds" section: **HIDDEN** (isTautological is true)
- Fallback in "How it sounds": **SHOWN** ("This word is often unstressed...")
- heardAs line: **HIDDEN** (heardAs === highlighted)
- Fallback in "In this sentence": **HIDDEN** (already shown in "How it sounds")

**UI Output:**
```
Meaning
[meaning text]

How it sounds
This word is often unstressed and easy to miss in fast speech.

In this sentence
"[original sentence]"
[no heardAs line - hidden]
```

---

## Edge Cases Handled

1. **Legacy mode:** No `inSentence` object → All tautology checks skip (backward compatible)
2. **Missing data:** `inSentence` exists but no `heardAs`/`highlighted` → Handled by normalization (empty strings normalize to empty)
3. **Whitespace differences:** `"i "` vs `"i"` → Normalized to same value
4. **Case differences:** `"I"` vs `"i"` → Normalized to same value
5. **Pattern matching:** Regex handles quoted strings with spaces correctly

---

## Testing Notes

**Dev Guard:**
- Logs warning in development mode when tautology detected
- Includes phrase, heardAs, highlighted, and soundRule snippet
- Only runs in `NODE_ENV === 'development'`
- No performance impact in production

**Test Cases (Manual Verification):**
1. Phrase "i" with `heardAs="i"`, `highlighted="i"` → Should show fallback, hide tautology
2. Phrase "i'm" with `heardAs="im"`, `highlighted="i'm"` → Should show normal soundRule and heardAs line
3. Phrase "it" with `soundRule="it" can sound like "it"` → Should show fallback, hide tautology

---

## Patch Summary

**Files Changed:** 1
- `components/PhraseCard.tsx` (Lines 19-139 modified/added)

**Lines Added:** ~70
**Lines Modified:** ~20
**Lines Removed:** ~10

**Breaking Changes:** None (backward compatible with legacy mode)

---

END OF SUMMARY


