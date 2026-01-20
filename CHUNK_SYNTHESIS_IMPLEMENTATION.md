# Dynamic Chunk Synthesis for Missed "to" - Implementation Summary

## Changes Made

### 1. `lib/practiceSteps.ts` - Added Dynamic Chunk Synthesis

**Location 1: phraseHintEvents loop (Lines 420-435)**
```typescript
// Dynamic chunk synthesis for missed "to"
// If pattern matching didn't find a chunk, try to synthesize one from context
if (!chunkDisplay && target.toLowerCase() === 'to' && (event.type === 'missing' || category === 'weak_form' || category === 'missed')) {
  const right1 = span.spanRefEnd < refTokens.length ? refTokens[span.spanRefEnd]?.toLowerCase() : null
  const right2 = span.spanRefEnd + 1 < refTokens.length ? refTokens[span.spanRefEnd + 1]?.toLowerCase() : null
  
  if (right1) {
    // If right1 is an article and right2 exists, create 3-word chunk
    if ((right1 === 'the' || right1 === 'a' || right1 === 'an') && right2) {
      chunkDisplay = `to-${right1}-${right2}`
    } else {
      // Otherwise create 2-word chunk
      chunkDisplay = `to-${right1}`
    }
  }
}
```

**Location 2: otherEvents loop (Lines 533-550)**
```typescript
// Dynamic chunk synthesis for missed "to" (in other events loop)
// Check if the original target (before expansion) was "to"
if (!chunkDisplay && target.toLowerCase() === 'to' && (event.type === 'missing' || category === 'weak_form' || category === 'missed')) {
  // For single-token events, refEnd is inclusive (same as refStart)
  // So the next token is at refEnd + 1
  const right1 = event.refEnd + 1 < refTokens.length ? refTokens[event.refEnd + 1]?.toLowerCase() : null
  const right2 = event.refEnd + 2 < refTokens.length ? refTokens[event.refEnd + 2]?.toLowerCase() : null
  
  if (right1) {
    // If right1 is an article and right2 exists, create 3-word chunk
    if ((right1 === 'the' || right1 === 'a' || right1 === 'an') && right2) {
      chunkDisplay = `to-${right1}-${right2}`
    } else {
      // Otherwise create 2-word chunk
      chunkDisplay = `to-${right1}`
    }
  }
}
```

### 2. `components/PhraseCard.tsx` - Updated UI Text

**Changed chunk display line (Line 228):**
- **Before:** `"to" often sounds like "to-the-park"`
- **After:** `"to" links into "to-the-park"`

This better reflects that "to" is linking into a chunk, not just "sounding like" something.

---

## Logic Explanation

### Chunk Synthesis Rules

1. **Trigger Conditions:**
   - `target.toLowerCase() === 'to'`
   - `event.type === 'missing'` OR `category === 'weak_form'` OR `category === 'missed'`
   - Pattern matching didn't already find a chunk (`!chunkDisplay`)

2. **Context Extraction:**
   - **phraseHintEvents:** Uses `span.spanRefEnd` (exclusive end) → `refTokens[spanRefEnd]` is the next token
   - **otherEvents:** Uses `event.refEnd + 1` (inclusive end for single token) → `refTokens[refEnd + 1]` is the next token

3. **Chunk Building:**
   - If `right1` is an article (`the`, `a`, `an`) AND `right2` exists → `to-${right1}-${right2}` (3-word chunk)
   - Otherwise → `to-${right1}` (2-word chunk)

### Example: "I went to the park yesterday"

**Input:**
- `refTokens = ['i', 'went', 'to', 'the', 'park', 'yesterday']`
- `target = 'to'`
- `spanRefEnd = 3` (exclusive) or `event.refEnd = 2` (inclusive)

**Processing:**
- `right1 = refTokens[3] = 'the'` (phraseHintEvents) or `refTokens[3] = 'the'` (otherEvents)
- `right2 = refTokens[4] = 'park'`
- `right1 === 'the'` AND `right2` exists → `chunkDisplay = 'to-the-park'` ✓

**Output:**
- `chunkDisplay = 'to-the-park'`
- UI shows: `"to" links into "to-the-park"`

---

## Acceptance Tests

### Test 1: "I went to the park yesterday"
- **Input:** `target="to"`, `refTokens=['i', 'went', 'to', 'the', 'park', 'yesterday']`
- **Expected:** `chunkDisplay="to-the-park"`
- **Result:** ✓ Passes

### Test 2: "I want to go"
- **Input:** `target="to"`, `refTokens=['i', 'want', 'to', 'go']`
- **Expected:** `chunkDisplay="to-go"`
- **Result:** ✓ Passes (2-word chunk, no article)

### Test 3: "I went to a store"
- **Input:** `target="to"`, `refTokens=['i', 'went', 'to', 'a', 'store']`
- **Expected:** `chunkDisplay="to-a-store"`
- **Result:** ✓ Passes (3-word chunk with article)

---

## Code Diff Summary

**Files Modified:**
1. `lib/practiceSteps.ts` - Added chunk synthesis logic in two places (phraseHintEvents and otherEvents loops)
2. `components/PhraseCard.tsx` - Changed UI text from "often sounds like" to "links into"

**Lines Added:** ~30 lines
**Lines Modified:** 1 line (UI text)

---

END OF SUMMARY


