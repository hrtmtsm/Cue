# Tautology Guard Implementation - Summary

## Patch Diff

### File: `components/PhraseCard.tsx`

**Lines 19-55:** Added helper functions
- `normalizeText(s: string)` - Normalizes text for comparison (lowercase, trim, collapse whitespace)
- `isTautology(a: string, b: string)` - Checks if two strings are identical after normalization
- `containsTautologyPattern(soundRule: string)` - Detects tautology patterns in soundRule text using regex

**Lines 68-93:** Added tautology detection logic
- Detects `heardAs === highlighted` tautology
- Detects tautology patterns in `soundRule` text
- Dev guard: Logs warning in development mode

**Lines 105-139:** Modified rendering logic
- Conditional rendering for "How it sounds" section
- Fallback message shown when tautology detected
- Conditional rendering for "In this sentence" heardAs line
- Fallback message in "In this sentence" section (only if not already shown)

---

## Which Conditions Hide Which Sections

### "How it sounds" Section

**Hidden when:**
- `isTautological = true` (either condition):
  - `heardAsTautology = true` (when `normalize(inSentence.heardAs) === normalize(inSentence.highlighted)`)
  - OR `soundRuleTautology = true` (when soundRule contains pattern like `"X" can sound like "X"`)

**Shown when:**
- `isTautological = false` (normal case - neither condition is true)

**Fallback shown when:**
- `isTautological && inSentence` (any tautology detected AND we have context)
- Fallback message: "This word is often unstressed and easy to miss in fast speech."

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
- Fallback message: "This word is often unstressed and easy to miss in fast speech."

---

## Example Scenarios

### Scenario 1: "i" with `heardAs="i"`, `highlighted="i"`, `soundRule="i" can sound like "i"`

**Conditions:**
- `heardAsTautology = true` ✓
- `soundRuleTautology = true` ✓
- `isTautological = true` ✓

**Result:**
- "How it sounds" section: **HIDDEN** (replaced by fallback)
- Fallback in "How it sounds": **SHOWN**
- heardAs line: **HIDDEN**
- Fallback in "In this sentence": **HIDDEN** (already shown in "How it sounds")

**UI:**
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

### Scenario 2: "i'm" with `heardAs="im"`, `highlighted="i'm"`, `soundRule="i'm" often sounds like "im"`

**Conditions:**
- `heardAsTautology = false` (heardAs !== highlighted: "im" !== "i'm")
- `soundRuleTautology = false` (no tautology: "i'm" !== "im")
- `isTautological = false`

**Result:**
- "How it sounds" section: **SHOWN** (normal soundRule)
- Fallback in "How it sounds": **HIDDEN**
- heardAs line: **SHOWN**
- Fallback in "In this sentence": **HIDDEN**

**UI:**
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

### Scenario 3: "it" with `heardAs="it"`, `highlighted="it"`, `soundRule="it" can sound like "it"`

**Conditions:**
- `heardAsTautology = true` ✓
- `soundRuleTautology = true` ✓
- `isTautological = true` ✓

**Result:**
- "How it sounds" section: **HIDDEN** (replaced by fallback)
- Fallback in "How it sounds": **SHOWN**
- heardAs line: **HIDDEN**
- Fallback in "In this sentence": **HIDDEN** (already shown)

**UI:**
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

## Implementation Notes

1. **Normalization:** Uses `normalizeText()` to handle case-insensitive, whitespace-tolerant comparison
2. **Pattern Detection:** Regex patterns handle quoted strings with spaces correctly
3. **Backward Compatibility:** Legacy mode (no `inSentence`) skips all tautology checks
4. **Dev Guard:** Logs warning in development mode only (no production impact)
5. **Minimal Diff:** UI-only changes, no modifications to generation logic in `lib/practiceSteps.ts`

---

END OF SUMMARY


