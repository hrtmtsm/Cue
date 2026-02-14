# Insight Modal Restoration Summary

## Goal
Restore high-quality feedback using constrained LLM output format + deterministic chunk expansion, without relying on DB patternFeedback.

## Implementation

### 1. Chunk Expansion Function

**File**: `app/[locale]/(app)/practice/review/page.tsx` (lines 838-935)

**Function**: `expandToListeningChunk(event, refTokens)`

**Priority Order**:
1. `event.phraseHint.spanText` (if available)
2. Deterministic expansion rules:
   - Rule 1: If noun preceded by article/determiner, include it ("train" → "the train")
   - Rule 2: Check infinitive/prep patterns ("get" → "to get to")
   - Rule 3: Compound nouns ("train" → "train station")
3. Fallback to `expectedSpan`

**Expansion Rules**:
- Articles: `the`, `a`, `an`, `this`, `that`, `my`, `your`, `his`, `her`, `our`, `their`, `its`
- Prep patterns: `to get to`, `for a second`, `at the`, `in the`, `on the`
- Max expansion: 2 tokens on each side

### 2. New API Schema

**File**: `app/api/insight/route.ts`

**Strict Schema**:
```typescript
type InsightCard = {
  missed_text: string
  heard_text?: string | null  // only if user typed something
  how_it_sounds: {
    compact: string          // e.g., "thətrain"
    tts_text: string
    speaking_rate: number    // e.g., 1.08
  }
  example: {
    text: string             // one short sentence
    tts_text: string
    speaking_rate: number
  }
}
```

**LLM Constraints**:
- Must output ONLY this schema
- No extra fields, no explanations
- For "compact", produce intuitive merged form (no strict IPA)
- Always include one example sentence

**Fallback**: If LLM fails, uses deterministic generation:
- `generateCompactForm()` - phonetic reduction
- `generateSimpleExample()` - context-aware examples

### 3. Updated UI Rendering

**File**: `app/[locale]/(app)/practice/review/page.tsx` (lines ~1870-2010)

**Behavior**:

**Missing/Not Heard Cases**:
- Shows: "✖ What you missed" + chunk text
- NO "You heard:" row
- Shows "How it sounds" + "One example" if data exists

**Substitution Cases**:
- Shows: "✖ 聞き取れなかった部分" + chunk text
- Shows: "You heard:" + heardText
- Shows: "Actual:" + missedText
- Shows "How it sounds" + "One example" if data exists

**Audio Playback**:
- "How it sounds" Play: Uses `how_it_sounds.tts_text` at `speaking_rate`
- "One example" Play: Uses `example.tts_text` at `speaking_rate`
- Falls back to browser `speechSynthesis` API

### 4. Data Flow

1. **Event Selection**: Top 3 events from `prioritizeAndSelectTop3()`
2. **Chunk Expansion**: `expandToListeningChunk()` computes chunkActual
3. **API Call**: `/api/insight` receives `missed_text` and `heard_text` (null if not heard)
4. **LLM Generation**: Constrained JSON output with strict schema
5. **UI Rendering**: Modal shows chunk + "How it sounds" + "One example"

## Files Modified

### 1. `app/[locale]/(app)/practice/review/page.tsx`
- Added `expandToListeningChunk()` function (lines 838-935)
- Updated `fetchMultipleInsights()` to use chunk expansion (lines ~980-1050)
- Updated modal rendering to use new schema (lines ~1870-2010)
- Added dev logs: `[InsightChunk]`, `[InsightLLM]`

### 2. `app/api/insight/route.ts`
- Complete rewrite to use strict schema
- Constrained LLM prompt
- Fallback generation functions
- No longer uses `generateCoachingInsight()` from `coachingInsights.ts`

## Dev Logs

**Location**: `app/[locale]/(app)/practice/review/page.tsx`

```typescript
console.log('[InsightChunk]', {
  originalExpectedSpan: event.expectedSpan,
  phraseHint: event.phraseHint?.spanText,
  expandedChunk: displayChunk,
  refStart: highlightStart,
  refEnd: highlightEnd,
  isNotHeard,
  heardText
})
```

**Location**: `app/[locale]/(app)/practice/review/page.tsx` (in fetchMultipleInsights)

```typescript
console.log('[InsightLLM]', {
  request: { missed_text: displayChunk, heard_text: heardText },
  response: {
    missed_text: insight.missed_text,
    has_how_it_sounds: !!insight.how_it_sounds,
    has_example: !!insight.example
  }
})
```

## Example Outputs

### Input: Missing "train" (with "the" before it)
- **Chunk Expansion**: "train" → "the train"
- **API Request**: `{ missed_text: "the train", heard_text: null }`
- **LLM Output**:
  ```json
  {
    "missed_text": "the train",
    "heard_text": null,
    "how_it_sounds": {
      "compact": "thətrain",
      "tts_text": "the train",
      "speaking_rate": 1.08
    },
    "example": {
      "text": "I missed the train this morning.",
      "tts_text": "I missed the train this morning.",
      "speaking_rate": 1.0
    }
  }
  ```
- **UI Display**:
  - "✖ What you missed: the train"
  - "How it sounds: 'the train' → 'thətrain'" + Play
  - "One example: I missed the train this morning." + Play

### Input: Missing "get" (within "to get to")
- **Chunk Expansion**: "get" → "to get to"
- **API Request**: `{ missed_text: "to get to", heard_text: null }`
- **LLM Output**:
  ```json
  {
    "missed_text": "to get to",
    "heard_text": null,
    "how_it_sounds": {
      "compact": "təgettə",
      "tts_text": "to get to",
      "speaking_rate": 1.08
    },
    "example": {
      "text": "I need to get to the office by nine.",
      "tts_text": "I need to get to the office by nine.",
      "speaking_rate": 1.0
    }
  }
  ```

### Input: Substitution (user typed "car" instead of "train")
- **Chunk Expansion**: "train" → "the train"
- **API Request**: `{ missed_text: "the train", heard_text: "car" }`
- **UI Display**:
  - "✖ 聞き取れなかった部分: the train"
  - "You heard: car"
  - "Actual: the train"
  - "How it sounds" + "One example"

## Acceptance Tests

### Test Case 1: Missing "train"
- ✅ Should display "the train" (not "train")
- ✅ No "You heard:" row
- ✅ "How it sounds" shows `"the train" → "thətrain"`
- ✅ Play buttons work

### Test Case 2: Missing "get"
- ✅ Should display "to get to" (not "get")
- ✅ No "You heard:" row
- ✅ "How it sounds" shows transformation
- ✅ Play buttons work

### Test Case 3: Substitution
- ✅ Shows "You heard:" + "Actual:"
- ✅ Chunk is expanded (not single token)
- ✅ All sections visible

## Key Improvements

1. **Chunk Expansion**: Single tokens always expand to natural chunks
2. **Strict Schema**: LLM output is constrained and predictable
3. **Better UX**: Missing cases don't show confusing "You heard" rows
4. **Audio Support**: TTS with speaking rates for natural playback
5. **No Regression**: Sections always visible when data exists

## Next Steps

1. **Testing**: Verify chunk expansion for various patterns
2. **Audio Snippet Replay**: Implement extraction using `replay_target.refStart/refEnd`
3. **TTS Integration**: When TTS infrastructure is ready, replace browser API
