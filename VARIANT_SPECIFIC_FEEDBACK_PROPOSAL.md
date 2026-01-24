# Variant-Specific Pattern Feedback Implementation Proposal

## Current State Analysis

### Files That Query `listening_patterns`:

1. **`app/api/listening-patterns/route.ts`**
   - Queries `listening_patterns` table directly
   - Returns all active patterns with parent data
   - Does NOT join with `listening_pattern_variants` or `clip_pattern_spans`
   - Has fallback retry logic for missing columns (should be removed per requirements)

2. **`app/api/check-answer/route.ts`**
   - Does NOT query any database
   - Only performs text alignment (client-side logic)
   - Does NOT receive `clipId` parameter
   - Returns alignment events, tokens, stats

3. **`lib/practiceSteps.ts`**
   - Client-side pattern matching
   - Uses patterns from `/api/listening-patterns` or local fallback
   - Matches patterns based on token sequences
   - Does NOT know which patterns exist in the specific clip

### Files That Should Query `clip_pattern_spans`:

**NONE** - This table is not currently queried anywhere in the codebase.

## Problem Statement

When a user misses "gonna" in clip `diag-003`:
- The clip has pattern span: `pattern_key='gonna'`, `variant_id` pointing to variant with `written_form='going to'`, `spoken_form='gonna'`
- Current system matches generic "gonna" pattern and may show wrong explanation
- Need to show: "In natural speech, 'going to' sounds like 'gonna'" (variant-specific)
- Must NOT show: "want to → wanna" explanation (wrong variant)

## Required Changes

### 1. Update `/api/check-answer` to Accept `clipId` and Return Variant-Specific Feedback

**Current Flow:**
```
Client → POST /api/check-answer { transcript, userText }
       ← { events, tokens, stats, accuracyPercent }
Client → extractPracticeSteps(events, tokens) → matches patterns generically
```

**New Flow:**
```
Client → POST /api/check-answer { transcript, userText, clipId }
       ← { events, tokens, stats, accuracyPercent, patternFeedback[] }
Client → extractPracticeSteps(events, tokens, patternFeedback) → uses variant-specific explanations
```

### 2. Update `/api/listening-patterns` to Join Variants

**Current:** Returns patterns from `listening_patterns` only
**New:** Join with `listening_pattern_variants` to include variant data

### 3. Add TypeScript Types

Add types for new schema: `ListeningPatternVariant`, `ClipPatternSpan`, `PatternFeedback`

## Implementation Plan

### Step 1: Add TypeScript Types

**File:** `lib/types/patternFeedback.ts` (new file)

```typescript
export interface ListeningPatternVariant {
  id: string
  pattern_key: string
  written_form: string
  spoken_form: string
  explanation_short: string
  explanation_medium: string | null
  examples: { sentence: string }[] | null
  created_at: Date
  updated_at: Date
}

export interface ClipPatternSpan {
  id: string
  clip_id: string
  pattern_key: string
  variant_id: string | null // NEW FIELD
  ref_start: number
  ref_end: number
  word_start: number | null
  word_end: number | null
  confidence: string
  approved: boolean
  created_at: Date
}

export interface PatternFeedback {
  pattern_key: string
  written_form: string
  spoken_form: string
  explanation_short: string
  explanation_medium: string | null
  ref_start: number
  ref_end: number
}
```

### Step 2: Update `/api/check-answer` to Fetch Variant-Specific Feedback

**File:** `app/api/check-answer/route.ts`

**Changes:**
1. Accept `clipId` in request body
2. After alignment, detect which patterns from `clip_pattern_spans` were missed
3. Query `clip_pattern_spans` joined with `listening_pattern_variants` for missed patterns
4. Return `patternFeedback` array in response

**Key Logic:**
```typescript
// After alignment, check if any clip_pattern_spans were missed
if (clipId) {
  // Get all pattern spans for this clip
  const { data: patternSpans } = await supabase
    .from('clip_pattern_spans')
    .select(`
      pattern_key,
      variant_id,
      ref_start,
      ref_end
    `)
    .eq('clip_id', clipId)
    .eq('approved', true)
  
  // Check which patterns were missed (alignment shows missing/substitution in span range)
  const missedPatterns = patternSpans?.filter(span => {
    // Check if alignment events show missing/substitution in this span's token range
    const hasError = aligned.events.some(event => {
      if (event.type !== 'missing' && event.type !== 'substitution') return false
      const eventStart = event.refStart ?? event.phraseHint?.spanRefStart
      const eventEnd = event.refEnd ?? event.phraseHint?.spanRefEnd
      // Check if event overlaps with pattern span
      return eventStart <= span.ref_end && eventEnd >= span.ref_start
    })
    return hasError
  }) || []
  
  // Fetch variant-specific explanations for missed patterns
  if (missedPatterns.length > 0) {
    const variantIds = missedPatterns
      .map(p => p.variant_id)
      .filter((id): id is string => id !== null)
    
    if (variantIds.length > 0) {
      const { data: variants } = await supabase
        .from('listening_pattern_variants')
        .select('*')
        .in('id', variantIds)
      
      // Build patternFeedback array
      const patternFeedback = missedPatterns
        .filter(p => p.variant_id)
        .map(span => {
          const variant = variants?.find(v => v.id === span.variant_id)
          if (!variant) return null
          return {
            pattern_key: span.pattern_key,
            written_form: variant.written_form,
            spoken_form: variant.spoken_form,
            explanation_short: variant.explanation_short,
            explanation_medium: variant.explanation_medium,
            ref_start: span.ref_start,
            ref_end: span.ref_end,
          }
        })
        .filter((f): f is PatternFeedback => f !== null)
      
      // Add to response
      return NextResponse.json({
        ...existingResponse,
        patternFeedback,
      })
    }
  }
}
```

### Step 3: Update `/api/listening-patterns` to Join Variants

**File:** `app/api/listening-patterns/route.ts`

**Changes:**
1. Remove fallback retry logic (lines 159-204)
2. Add JOIN with `listening_pattern_variants`
3. Return variants as nested array in pattern object

**Key Query:**
```typescript
// Fetch patterns with variants
const { data: patterns, error } = await supabase
  .from('listening_patterns')
  .select(`
    id,
    pattern_key,
    words,
    chunk_display,
    reduced_form,
    how_it_sounds,
    tip,
    priority,
    is_active,
    meaning_general,
    meaning_approved,
    meaning_status,
    parent_pattern_key,
    category,
    spoken_form,
    heard_as,
    examples,
    explanation_short,
    explanation_medium,
    listening_pattern_variants (
      id,
      written_form,
      spoken_form,
      explanation_short,
      explanation_medium,
      examples
    )
  `)
  .eq('is_active', true)
  .order('priority', { ascending: false })
```

### Step 4: Update Client-Side Pattern Matching to Use Variant Feedback

**File:** `lib/practiceSteps.ts`

**Changes:**
1. Accept `patternFeedback?: PatternFeedback[]` parameter
2. When matching a pattern, check if variant-specific feedback exists
3. Prefer variant-specific explanation over generic pattern explanation

**Key Logic:**
```typescript
export function extractPracticeSteps(
  events: AlignmentEvent[],
  refTokens: string[],
  userTokens: string[],
  maxSteps: number = 5,
  fullTranscript?: string,
  patterns?: ListeningPattern[],
  patternFeedback?: PatternFeedback[] // NEW PARAMETER
): PracticeStep[] {
  // ... existing code ...
  
  // When matching a pattern, check for variant-specific feedback
  if (patternMatch && patternFeedback) {
    const variantFeedback = patternFeedback.find(f => 
      f.pattern_key === matchedPattern.id &&
      f.ref_start <= span.spanRefStart &&
      f.ref_end >= span.spanRefEnd
    )
    
    if (variantFeedback) {
      // Use variant-specific explanation
      soundRule = variantFeedback.explanation_short || variantFeedback.explanation_medium || soundRule
      // Use variant's written_form as the "canonical" form
      chunkDisplay = variantFeedback.written_form
      heardAs = variantFeedback.spoken_form
    }
  }
}
```

### Step 5: Update Client Calls to Pass `clipId`

**Files:**
- `app/(app)/practice/review/page.tsx`
- `app/onboarding/diagnosis/page.tsx`
- `app/(app)/practice/respond/page.tsx` (if it calls check-answer)

**Changes:**
```typescript
// Before
body: JSON.stringify({
  transcript: transcript,
  userText: userAnswer,
})

// After
body: JSON.stringify({
  transcript: transcript,
  userText: userAnswer,
  clipId: clipId || storyClipId, // Add clipId
})
```

## Questions to Resolve

1. **Pattern Detection Timing:**
   - Should pattern detection happen server-side in `/api/check-answer`?
   - Or should we return `patternFeedback` and let client-side `extractPracticeSteps` use it?

2. **Missing `variant_id` Handling:**
   - What should we do if `clip_pattern_spans.variant_id` is `null`?
   - Fall back to generic pattern explanation?

3. **Multiple Patterns in Same Span:**
   - If multiple patterns overlap (e.g., "gonna" and "weak_to"), which takes priority?
   - User requirement: "prioritize by CEFR level, position, pattern priority"

4. **Database Schema:**
   - Are `listening_pattern_variants` and `clip_pattern_spans` tables already created?
   - Do they have the exact schema shown in the user's requirements?

## Testing Checklist

1. ✅ Test with clip `diag-003` that has "gonna" pattern
2. ✅ Verify feedback shows "going to → gonna" not "want to → wanna"
3. ✅ Test with clip that has multiple patterns
4. ✅ Test with clip that has pattern with `variant_id = null`
5. ✅ Test with clip that has no `clip_pattern_spans` (fallback to generic patterns)
6. ✅ Verify `/api/listening-patterns` returns variants correctly
7. ✅ Verify client-side pattern matching uses variant feedback when available

