# Pattern Seed Data Fix Summary

## Changes Made

### 1. Fixed `want-to` Pattern (`lib/listeningPatterns.ts`)
**Line 38:** Changed `chunkDisplay` from `'want-to'` to `'wanna'`
- ✅ Pattern already had correct `words: ['want', 'to']` (2 words)
- ✅ Updated `chunkDisplay` to reflect the actual sound reduction

### 2. Added Validation (`scripts/seedListeningPatterns.ts`)
**Lines 36-56:** Added `validatePattern()` function
- ✅ Validates word count matches pattern id structure
- ✅ Example: `"want-to"` (2 parts) must have 2 words
- ✅ Example: `"want-to-go"` (3 parts) must have 3 words
- ✅ Throws error with clear message if mismatch detected

**Lines 130-138:** Integrated validation into seed process
- ✅ Validates each pattern before conversion
- ✅ Stops seed process if validation fails

### 3. Verified Idempotency (`scripts/seedListeningPatterns.ts`)
**Lines 201-222:** Upsert logic is already idempotent
- ✅ Uses `onConflict: 'pattern_key'` to handle duplicates
- ✅ Updates existing records instead of creating duplicates
- ✅ Safe to re-run multiple times

## Verification Checklist

- ✅ `want-to` pattern has exactly 2 words: `['want', 'to']`
- ✅ `want-to` pattern has `chunkDisplay: 'wanna'`
- ✅ `want-to-go` pattern exists separately with 3 words: `['want', 'to', 'go']`
- ✅ Seed script is idempotent (uses `onConflict: 'pattern_key'`)
- ✅ Validation catches word count mismatches
- ✅ No duplicate patterns created on re-seed

## Commands

### Re-seed the Database

```bash
# 1. Dry run first (verify changes without writing)
npm run seed:patterns

# 2. Actually write to database
npm run seed:patterns -- --yes
```

### Verify API Response

```bash
# Get patterns and check want-to pattern
curl -s http://localhost:3000/api/listening-patterns | python3 -m json.tool | grep -A 10 '"id": "want-to"'
```

**Expected output:**
```json
{
    "id": "want-to",
    "words": ["want", "to"],
    "chunkDisplay": "wanna",
    "howItSounds": "In casual speech, \"want to\" often sounds like \"wanna\".",
    "tip": "The \"t\" between \"want\" and \"to\" disappears in fast speech.",
    "priority": 100
}
```

### Full API Response Preview

```bash
curl -s http://localhost:3000/api/listening-patterns | python3 -m json.tool | head -40
```

**Expected:** Array of patterns, with `want-to` showing 2 words and `chunkDisplay: "wanna"`

## Files Modified

1. **`lib/listeningPatterns.ts`** (line 38)
   - Changed `chunkDisplay: 'want-to'` → `chunkDisplay: 'wanna'`

2. **`scripts/seedListeningPatterns.ts`** (lines 36-56, 130-138)
   - Added `validatePattern()` function
   - Integrated validation into seed process

## Testing Validation

To test that validation works, you can temporarily break a pattern:

```typescript
// In lib/listeningPatterns.ts, temporarily change:
{
  id: 'want-to',
  words: ['want', 'to', 'go'], // Wrong: 3 words but id suggests 2
  // ...
}
```

Then run:
```bash
npm run seed:patterns
```

**Expected:** Error message:
```
❌ Error processing pattern want-to: Pattern "want-to" has 3 words but id suggests 2 words. Words: [want, to, go], Id parts: [want, to]
```

## Notes

- The `want-to-go` pattern already exists separately (lines 75-81 in `listeningPatterns.ts`)
- Validation ensures consistency between pattern id structure and word count
- Upsert logic ensures no duplicates are created on re-seed
- All existing functionality remains intact (no UI changes)


