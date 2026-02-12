# Chunk-Level Insights Implementation Summary

## Implementation Locations

### Task A: Build display_chunk
**File**: `app/[locale]/(app)/practice/review/page.tsx`  
**Function**: `buildDisplayChunk()` (lines 837-929)  
**Called from**: `fetchMultipleInsights()` (line ~930)

**Logic**:
1. Check `patternFeedback` for overlapping span (character indices)
2. If match found: use `writtenForm` from DB pattern, convert char indices to token indices
3. Else: Expand `event.expectedSpan` with adjacent function words (`to`, `the`, `a`, etc.)
4. Ensure 2-6 words, return `{ display_chunk, highlight_start_token, highlight_end_token }`

### Task B: Extend /api/insight
**File**: `lib/coachingInsights.ts`  
**Function**: `generateCoachingInsight()` (lines 98-290)

**New Fields Added to `CoachingInsight` interface**:
- `display_chunk?: string`
- `highlight_start_token?: number`
- `highlight_end_token?: number`
- `how_it_sounds_text?: string`
- `example_text?: string`
- `cause_type?: 'weak_form' | 'linking' | 'chunk_blur' | 'phoneme_confusion'`

**Cause Type Rules** (lines 108-150):
- `weak_form`: Has function words AND single word
- `linking`: Has function words AND multi-word
- `chunk_blur`: Multi-word (>=2) without function words
- `phoneme_confusion`: Single word with close spelling (edit distance < 30%)

**LLM Prompt Updates** (lines 133-200):
- Added `display_chunk` and `cause_type` to prompt
- Instructs LLM to write `how_it_sounds_text` and `example_text` based on `cause_type`
- LLM does NOT choose cause - it's determined by rules

**Fallback Generation** (lines 218-250):
- If LLM doesn't provide new fields, generates fallback text based on `cause_type`

### Task C: Update UI
**File**: `app/[locale]/(app)/practice/review/page.tsx`  
**Location**: Insights modal render (lines ~1680-1720)

**New UI Sections**:
1. **"How it sounds"** section:
   - Shows `how_it_sounds_text`
   - Play button (stub: `console.log`)

2. **"Example"** section:
   - Shows `example_text`
   - Play button (stub: `console.log`)

## Dev Logs Added

### 1. Display Chunk Log
**Location**: `app/[locale]/(app)/practice/review/page.tsx` line ~930
```typescript
console.log('🎯 [Display Chunk] Built chunk:', {
  eventExpectedSpan: event.expectedSpan,
  display_chunk: chunkInfo.display_chunk,
  highlight_range: [chunkInfo.highlight_start_token, chunkInfo.highlight_end_token],
  hasPatternFeedback: !!diffResult.patternFeedback?.length,
  patternFeedbackCount: diffResult.patternFeedback?.length || 0
})
```

### 2. Cause Type Log
**Location**: `lib/coachingInsights.ts` line ~150
```typescript
console.log('🔍 [Insight] Determined cause_type:', {
  display_chunk: chunk,
  hasFunctionWords,
  isMultiWord,
  isCloseSpelling,
  cause_type,
  expected,
  actual,
  editDistance: distance
})
```

### 3. Modal Display Log
**Location**: `app/[locale]/(app)/practice/review/page.tsx` line ~1648
```typescript
console.log('🎯 [Insights Modal] Current insight:', {
  display_chunk: currentInsight.display_chunk,
  highlight_range: [currentInsight.highlight_start_token, currentInsight.highlight_end_token],
  cause_type: currentInsight.cause_type,
  how_it_sounds_text: currentInsight.how_it_sounds_text,
  example_text: currentInsight.example_text,
  // ... other fields
})
```

## Data Flow

1. **Event Selection**: Top 3 events selected via `prioritizeAndSelectTop3()`
2. **Build Display Chunk**: For each event, `buildDisplayChunk()` is called
   - Checks `diffResult.patternFeedback` first
   - Falls back to expanding with function words
3. **API Call**: `/api/insight` receives `display_chunk`, `highlight_start_token`, `highlight_end_token`
4. **Cause Type Determination**: Rules-based logic determines `cause_type`
5. **LLM Generation**: LLM writes `how_it_sounds_text` and `example_text` based on `cause_type`
6. **UI Display**: Modal shows new sections with play buttons (stubs)

## Example Output

### Input
- Event: `{ type: 'missing', expectedSpan: 'train', refStart: 4, refEnd: 4 }`
- patternFeedback: `[]` (empty)
- refTokens: `['I', 'need', 'to', 'get', 'to', 'the', 'train', 'station']`

### buildDisplayChunk Output
```typescript
{
  display_chunk: "to the train",  // Expanded with function words
  highlight_start_token: 3,       // "to"
  highlight_end_token: 6          // "train"
}
```

### cause_type Determination
- `hasFunctionWords`: true (contains "to", "the")
- `isMultiWord`: true (3 words)
- Result: `cause_type = 'linking'`

### LLM Output
```typescript
{
  how_it_sounds_text: "When 'to the train' is spoken quickly, the words connect together, making boundaries hard to hear.",
  example_text: "Example: 'to the train' appears in different contexts."
}
```

## Files Modified

1. `app/[locale]/(app)/practice/review/page.tsx`
   - Added `buildDisplayChunk()` function
   - Updated `fetchMultipleInsights()` to build and pass display_chunk
   - Updated UI to show new sections

2. `lib/coachingInsights.ts`
   - Extended `CoachingInsight` interface
   - Added cause_type determination logic
   - Updated LLM prompt
   - Added fallback generation for new fields

3. `app/api/insight/route.ts`
   - Updated to accept and pass new parameters

## Next Steps (TTS Implementation)

The play buttons currently log to console. To implement TTS:
1. Add TTS API call or use browser `speechSynthesis`
2. Replace `console.log` with actual TTS call
3. Pass `display_chunk` or `example_text` to TTS
