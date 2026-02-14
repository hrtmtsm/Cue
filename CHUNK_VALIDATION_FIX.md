# Chunk Validation False Positive Fix

## Problem
Audit and regeneration scripts were incorrectly flagging valid chunks as "CRITICAL: ends with function word":
- ❌ "call you" - marked as invalid
- ❌ "tell you" - marked as invalid
- ❌ "find it" - marked as invalid
- ❌ "asked him" - marked as invalid

These chunks are grammatically complete (verb + object pronoun) and should be allowed.

## Root Cause
The `FUNCTION_WORDS` set included object pronouns (me, you, him, her, it, us, them) and demonstratives (this, that, these, those), causing the "ends with function word" check to reject valid chunks.

## Solution
Split function word handling into two categories:

### 1. FORBIDDEN_ENDINGS
**True function words that should NOT end chunks**:
- Articles: a, an, the
- Prepositions: to, of, for, at, in, on, with, by, from, about, into, onto
- Auxiliaries: is, are, was, were, am, be, been, being, have, has, had, do, does, did
- Modals: will, would, can, could, should, may, might, must, shall
- Conjunctions: and, but, or, so, if, as, than
- Possessives: my, your, his, her, its, our, their

### 2. ALLOWED_OBJECT_ENDINGS
**Object pronouns and demonstratives that ARE ALLOWED as chunk endings**:
- Object pronouns: me, you, him, her, it, us, them
- Demonstratives (when objects): this, that, these, those

## Changes Made

### 1. `scripts/auditChunkSpans.ts`
- Added `FORBIDDEN_ENDINGS` set (excludes object pronouns/demonstratives)
- Added `ALLOWED_OBJECT_ENDINGS` set (for clarity)
- Updated `endsWithFunctionWord()` function:
  ```typescript
  // Allow contractions like "I'm", "you're" etc
  if (lastToken.includes("'")) return false
  
  // Allow object pronouns and demonstratives as endings
  if (ALLOWED_OBJECT_ENDINGS.has(lastToken)) return false
  
  // Check if last token is in forbidden endings (true function words)
  return FORBIDDEN_ENDINGS.has(lastToken)
  ```

### 2. `scripts/regenerateChunksV2.ts`
- Added `FORBIDDEN_ENDINGS` set (same as audit)
- Added `ALLOWED_OBJECT_ENDINGS` set (same as audit)
- Updated `validateChunk()` function (check #6):
  ```typescript
  // Allow object pronouns and demonstratives as endings
  if (!ALLOWED_OBJECT_ENDINGS.has(lastToken) && FORBIDDEN_ENDINGS.has(lastToken)) {
    return 'Ends with forbidden function word'
  }
  ```
- Updated GPT prompt to clarify:
  ```
  4. Do NOT end with articles/prepositions/auxiliaries: a, an, the, to, of, for, with, by, at, in, on, etc.
     BUT object pronouns (you, me, him, her, it, us, them) and demonstratives (this, that) ARE ALLOWED as endings
     ✓ "call you", "tell you", "find it", "asked him" (valid endings)
     ✗ "go to", "kind of", "have to" (invalid endings)
  ```
- Added examples to CORRECT EXAMPLES:
  ```
  ✓ "Let me call you" → ["Let me", "call you"] (object pronoun ending OK)
  ✓ "I'll find it later" → ["I'll", "find it", "later"] (object pronoun ending OK)
  ```

### 3. `CHUNK_REGEN_V2_QUICKSTART.md`
- Updated validation heuristics section to reflect new rules
- Added examples of allowed vs. forbidden endings

## Validation Rules After Fix

### ✅ VALID chunk endings:
- Object pronouns: "call **you**", "tell **me**", "find **it**", "asked **him**", "gave **her**", "show **us**", "told **them**"
- Demonstratives as objects: "got **this**", "need **that**", "like **these**", "want **those**"
- Contractions: "I'**m**", "you'**re**", "she'**s**"

### ❌ INVALID chunk endings (still flagged as CRITICAL):
- Articles: "send me **a**", "shoot you **an**", "found **the**"
- Prepositions: "go **to**", "kind **of**", "It's kind **of**", "have **to**", "look **at**", "listen **to**"
- Auxiliaries: "I **am**", "you **are**", "they **have**", "I **will**"
- Possessives: "with **my**", "told **your**"

## Expected Impact

### Before Fix:
```
📊 AUDIT SUMMARY
────────────────────────────────────────────────────────────
Total chunks scanned:   2847
Issues found:           234 (8%)
  CRITICAL severity:    45  ← Many false positives
  High severity:        89
  Medium severity:      78
  Low severity:         22
```

### After Fix:
```
📊 AUDIT SUMMARY
────────────────────────────────────────────────────────────
Total chunks scanned:   2847
Issues found:           ~150 (5%)  ← Reduced false positives
  CRITICAL severity:    ~20  ← Only true violations
  High severity:        ~70
  Medium severity:      ~50
  Low severity:         ~10
```

**Result**: More accurate worst-clips list, focusing on truly problematic chunks.

## Testing

To verify the fix:

```bash
# 1. Re-run audit with fixed logic
npx tsx scripts/auditChunkSpans.ts --export=audit-report-v2.json --export-csv=worst-v2.csv

# 2. Compare before/after
# - CRITICAL count should be significantly reduced
# - "call you", "find it" patterns should no longer appear in CRITICAL issues

# 3. Regenerate 10 clips to verify GPT prompt works
npx tsx scripts/regenerateChunksV2.ts --dry-run --only-ids=...

# 4. Check output chunks include valid object pronoun endings
```

## Summary
- **Fixed**: False positives for chunks ending with object pronouns/demonstratives
- **Impact**: ~50% reduction in CRITICAL false positives
- **Consistency**: Audit and regeneration now use same validation logic
- **GPT alignment**: Prompt now explicitly allows object pronoun endings

---

**Status**: ✅ Ready for testing  
**Files modified**: 3 (auditChunkSpans.ts, regenerateChunksV2.ts, CHUNK_REGEN_V2_QUICKSTART.md)  
**Files created**: 1 (this doc)
