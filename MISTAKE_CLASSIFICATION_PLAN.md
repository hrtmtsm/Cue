# Mistake Classification & Boundary Fixer Implementation Plan

## Current State

**Classification happens in:**
- `lib/textAlignment.ts` (lines 202-228): Classifies as 'missing', 'wrong', 'extra', 'correct'
- `lib/alignmentConfidence.ts` (lines 129-160): `evaluateReplacement()` determines if 'wrong' is substitution or should be split
- `app/[locale]/(app)/practice/review/page.tsx` (lines 1151-1156): Determines `isNotHeard` based on `event.type === 'missing'`
- `components/InsightCard.tsx` (lines 20-28): Uses `isNotHeard` to decide UI layout

**Chunk expansion happens in:**
- `app/[locale]/(app)/practice/review/page.tsx` (lines 853-949): `expandToListeningChunk()` function

## Required Changes

### 1. Explicit Classification: Deletion vs Substitution

**File**: `app/[locale]/(app)/practice/review/page.tsx`

**Change location**: Around line 1149-1156 where `isNotHeard` is determined

**Current code:**
```typescript
const actualSpan = event.actualSpan || ''
const isNotHeard = event.type === 'missing' || 
                  !actualSpan || 
                  actualSpan.trim() === '' ||
                  actualSpan.toLowerCase().includes('not heard') ||
                  actualSpan === '(not heard)'
const heardText = isNotHeard ? null : actualSpan
```

**New code:**
```typescript
// Explicit classification: deletion vs substitution
const actualSpan = event.actualSpan || ''
const isDeletion = event.type === 'missing' || 
                   !actualSpan || 
                   actualSpan.trim() === '' ||
                   actualSpan.toLowerCase().includes('not heard') ||
                   actualSpan === '(not heard)'

// For substitutions, check phonetic similarity
let isSubstitution = false
let isPhoneticallyPlausible = false

if (!isDeletion && event.type === 'substitution' && actualSpan) {
  isSubstitution = true
  // Check phonetic similarity using existing similarity function
  const { computeStringSimilarity } = require('@/lib/alignmentConfidence')
  const similarity = computeStringSimilarity(event.expectedSpan || '', actualSpan)
  // Also check known reductions
  const { isKnownReducedForm } = require('@/lib/alignmentConfidence')
  isPhoneticallyPlausible = similarity >= 0.55 || isKnownReducedForm(event.expectedSpan || '', actualSpan)
}

const heardText = (isSubstitution && isPhoneticallyPlausible) ? actualSpan : null
const isNotHeard = isDeletion || !isPhoneticallyPlausible
```

**Also update** the insight API call (line 1191) to pass explicit classification:
```typescript
body: JSON.stringify({
  missed_text: displayChunk,
  heard_text: heardText, // null for deletions, actualSpan only if phonetically plausible
  transcript: diffResult.transcript || currentPhrase.text,
  userText: diffResult.userText || userText,
  userLocale: locale,
  chunkRefStart: highlightStart,
  chunkRefEnd: highlightEnd,
  mistakeType: isDeletion ? 'deletion' : (isSubstitution ? 'substitution' : 'missing') // Explicit type
}),
```

### 2. Boundary Fixer for "What you missed"

**File**: `app/[locale]/(app)/practice/review/page.tsx`

**Change location**: `expandToListeningChunk` function (lines 853-949)

**Add new helper function** before `expandToListeningChunk`:
```typescript
/**
 * Fix chunk boundary to avoid ending with determiners/prepositions/aux verbs
 * Also keeps time expressions and idioms together
 * Max 7 tokens
 */
function fixChunkBoundary(
  tokens: string[],
  startIdx: number,
  endIdx: number
): { start: number; end: number } {
  if (tokens.length === 0 || startIdx >= tokens.length) {
    return { start: startIdx, end: endIdx }
  }

  // Determiners, prepositions, aux verbs that shouldn't end a chunk
  const WEAK_ENDINGS = new Set([
    'the', 'a', 'an', 'this', 'that', 'my', 'your', 'his', 'her', 'our', 'their', 'its',
    'to', 'of', 'at', 'in', 'on', 'for', 'with', 'by', 'from', 'about', 'into', 'onto',
    'is', 'are', 'was', 'were', 'am', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
    'can', 'must', 'shall'
  ])

  // Time expressions (keep together)
  const TIME_EXPRESSIONS = [
    'o\'clock', 'in the morning', 'in the afternoon', 'in the evening', 'at night',
    'today', 'tomorrow', 'yesterday', 'this week', 'next week', 'last week',
    'this month', 'next month', 'last month', 'this year', 'next year', 'last year',
    'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
    'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'
  ]

  // Idioms (keep together)
  const IDIOMS = [
    'kind of', 'sort of', 'a lot of', 'piece of cake', 'break a leg',
    'on the same page', 'by the way', 'for the time being', 'in the long run',
    'once in a blue moon', 'rain or shine'
  ]

  let fixedStart = startIdx
  let fixedEnd = Math.min(endIdx, tokens.length - 1)
  const maxTokens = 7

  // Step 1: Check for time expressions and idioms (keep together)
  const chunkText = tokens.slice(fixedStart, fixedEnd + 1).join(' ').toLowerCase()
  for (const expr of [...TIME_EXPRESSIONS, ...IDIOMS]) {
    if (chunkText.includes(expr.toLowerCase())) {
      // Find the expression in tokens
      const exprWords = expr.toLowerCase().split(/\s+/)
      for (let i = fixedStart; i <= fixedEnd - exprWords.length + 1; i++) {
        const candidate = tokens.slice(i, i + exprWords.length).join(' ').toLowerCase()
        if (candidate === expr.toLowerCase()) {
          // Expand to include full expression
          fixedStart = Math.min(fixedStart, i)
          fixedEnd = Math.max(fixedEnd, i + exprWords.length - 1)
          break
        }
      }
    }
  }

  // Step 2: Trim from end if it ends with weak word (unless it's part of time/idiom)
  while (fixedEnd > fixedStart && fixedEnd - fixedStart + 1 > 1) {
    const lastToken = tokens[fixedEnd]?.toLowerCase()
    if (lastToken && WEAK_ENDINGS.has(lastToken)) {
      // Check if removing it would break a time expression or idiom
      const withoutLast = tokens.slice(fixedStart, fixedEnd).join(' ').toLowerCase()
      const breaksExpression = [...TIME_EXPRESSIONS, ...IDIOMS].some(expr => {
        const exprLower = expr.toLowerCase()
        return chunkText.includes(exprLower) && !withoutLast.includes(exprLower)
      })
      
      if (!breaksExpression) {
        fixedEnd--
      } else {
        break // Keep the weak ending if it's part of an expression
      }
    } else {
      break // Not a weak ending, stop trimming
    }
  }

  // Step 3: Enforce max 7 tokens
  if (fixedEnd - fixedStart + 1 > maxTokens) {
    fixedEnd = fixedStart + maxTokens - 1
    // Re-trim from end if it ends with weak word
    while (fixedEnd > fixedStart && fixedEnd - fixedStart + 1 > 1) {
      const lastToken = tokens[fixedEnd]?.toLowerCase()
      if (lastToken && WEAK_ENDINGS.has(lastToken)) {
        fixedEnd--
      } else {
        break
      }
    }
  }

  return {
    start: Math.max(0, fixedStart),
    end: Math.min(tokens.length - 1, fixedEnd)
  }
}
```

**Update `expandToListeningChunk` function** to use boundary fixer:
```typescript
function expandToListeningChunk(
  event: any,
  refTokens: string[]
): { chunkText: string; chunkRefStart: number; chunkRefEnd: number } {
  // Priority A: Use phraseHint if available
  if (event.phraseHint?.spanText) {
    const hintStart = event.phraseHint.spanRefStart ?? event.refStart ?? 0
    const hintEnd = event.phraseHint.spanRefEnd ?? event.refEnd ?? hintStart
    
    // Apply boundary fixer to phraseHint range
    const fixed = fixChunkBoundary(refTokens, hintStart, hintEnd)
    
    return {
      chunkText: refTokens.slice(fixed.start, fixed.end + 1).join(' '),
      chunkRefStart: fixed.start,
      chunkRefEnd: fixed.end
    }
  }

  const startToken = event.refStart ?? 0
  const endToken = event.refEnd ?? startToken
  const expectedSpan = event.expectedSpan || ''
  const expectedLower = expectedSpan.toLowerCase().trim()

  // ... existing expansion rules (articles, prep patterns, compound nouns) ...

  // After all expansion rules, apply boundary fixer
  const fixed = fixChunkBoundary(refTokens, expandedStart, expandedEnd)

  const chunkText = refTokens.slice(fixed.start, fixed.end + 1).join(' ')

  return {
    chunkText: chunkText || expectedSpan,
    chunkRefStart: fixed.start,
    chunkRefEnd: fixed.end
  }
}
```

### 3. Update InsightCard to Use Explicit Classification

**File**: `components/InsightCard.tsx`

**Change location**: Lines 20-28 (isNotHeard determination)

**Current code:**
```typescript
const isNotHeard = eventType === 'missing' || 
                  heardText === null || 
                  !heardText ||
                  (typeof heardText === 'string' && (
                    heardText.trim() === '' ||
                    heardText === '(not heard)' ||
                    heardText.toLowerCase().includes('not heard')
                  ))
```

**New code:**
```typescript
// Explicit classification: deletion vs substitution
// Deletion: show ONLY "What you missed"
// Substitution: show "You heard / Actual" ONLY if phonetically plausible
const isDeletion = eventType === 'missing' || 
                   heardText === null || 
                   !heardText ||
                   (typeof heardText === 'string' && (
                     heardText.trim() === '' ||
                     heardText === '(not heard)' ||
                     heardText.toLowerCase().includes('not heard')
                   ))

// If substitution but not phonetically plausible, treat as deletion
const isNotHeard = isDeletion
```

**Note**: The `heardText` is already set correctly by the review page (null for deletions, actualSpan only if phonetically plausible), so the UI logic is already correct. This change just makes the intent explicit.

---

## Summary of File Changes

1. **`app/[locale]/(app)/practice/review/page.tsx`**
   - Add `fixChunkBoundary()` helper function
   - Update `expandToListeningChunk()` to use boundary fixer
   - Update classification logic (lines 1149-1156) to explicitly classify deletion vs substitution
   - Add phonetic similarity check for substitutions
   - Pass `mistakeType` to insight API

2. **`components/InsightCard.tsx`**
   - Update `isNotHeard` determination to be explicit about deletion vs substitution
   - (UI already works correctly, just making intent clear)

---

## Testing

**Test cases:**

1. **Deletion**: User misses "the train" → Should show ONLY "WHAT YOU MISSED: the train"
2. **Substitution (phonetically similar)**: User types "tren" for "train" → Should show "YOU HEARD: tren" / "ACTUAL: train"
3. **Substitution (not phonetically similar)**: User types "car" for "train" → Should show ONLY "WHAT YOU MISSED: train" (treat as deletion)
4. **Boundary fixer**: "I need a table for two" → If "for two" is missed, should show "a table" (not ending with "for")
5. **Time expression**: "at seven o'clock" → If "o'clock" is missed, should keep "seven o'clock" together
6. **Max 7 tokens**: Long phrase should be truncated to 7 tokens max
