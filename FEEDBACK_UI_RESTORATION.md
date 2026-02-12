# Feedback UI Restoration - Previous Explanatory Behavior

## Summary

Restored the previous, more explanatory feedback behavior that focuses on spoken chunks rather than single tokens. The UI now prioritizes pedagogical clarity over technical correctness.

## Core Changes

### 1. Removed "You heard / Actual" Rows

**Before**: Confusing comparison rows showing "(not heard)" vs actual text  
**After**: Removed entirely - the red box already communicates the mistake

**Rationale**: These rows add zero learning value and confuse users. The red "聞き取れなかった部分" box is sufficient.

### 2. Chunk Selection Priority (CRITICAL FIX)

**Priority Order**:
1. `event.phraseHint.spanText` - Spoken chunk from phrase detection
2. `patternFeedback` overlapping span - DB pattern match
3. Expanded span using neighbors - Function words attached
4. `expectedSpan` - Last resort only

**NEVER use**:
- `actualSpan` for display text
- Single-token `expectedSpan` if it belongs to a multi-word phrase

**Implementation**: Updated `fetchMultipleInsights()` to check `phraseHint.spanText` first before building expanded chunks.

### 3. "How it sounds" Section - Only if Meaningful

**Before**: Always showed, sometimes identical (`"train" → "train"`)

**After**: 
- Only shows if there's a meaningful transformation
- Uses phonetic notation: `"the train" → "thə-train"` (not `"thuh train"`)
- Hyphens show word blending in fast speech
- If no transformation, section is omitted entirely

**Phonetic Rules**:
- `the` → `thə` (schwa notation)
- `to` → `tə`
- `of` → `əv`
- Multi-word chunks joined with hyphens: `"to get to" → "tə-get-tə"`

### 4. Example Section - One Natural Sentence

**Before**: Generic examples like "Take the train."

**After**:
- Context-aware natural examples
- `"get to"` → `"I need to get to the office by nine."`
- `"the train"` → `"I missed the train this morning."`
- `"gonna"` → `"I'm gonna finish this project today."`
- Exactly ONE example (no "More examples")

### 5. Removed Sections

**Deleted**:
- "親しみやすいタイトル" (friendly titles)
- "優しい発音のアドバイス" (gentle pronunciation advice)
- "なぜこうなるのか" (why this happens)
- "試してみよう" (try this)
- "More examples" list

**Rationale**: These duplicate information and weaken clarity. Less output is better than wrong output.

## Final UI Structure (LOCKED)

Each insight card renders ONLY:

1. **❌ 聞き取れなかった部分**
   - Spoken chunk (string)
   - Must include articles and function words
   - Example: `"the train"` NOT `"train"`

2. **👂 How it sounds** (optional, only if meaningful)
   - `"written form" → "spoken perception"`
   - Only shown if transformation exists
   - Example: `"the train" → "thə-train"`

3. **🔁 One example**
   - One natural sentence
   - Play button (TTS)

## Files Modified

### 1. `app/[locale]/(app)/practice/review/page.tsx`

**UI Changes** (lines ~1752-1860):
- Removed "You heard / Actual" comparison row
- Added validation: only show "How it sounds" if meaningful transformation
- Updated chunk text selection to prioritize `display_chunk` (which uses phraseHint)

**Insight Generation** (lines ~980-1045):
- Updated to prioritize `phraseHint.spanText` first
- Falls back to `buildDisplayChunk()` if no phraseHint
- Ensures spoken chunks are always used, not single tokens

### 2. `lib/howItSounds.ts`

**Phonetic Improvements**:
- Changed to use schwa notation (`ə`) instead of full vowels
- Multi-word chunks joined with hyphens to show blending
- Examples:
  - `"the train" → "thə-train"` (not `"thuh train"`)
  - `"to get to" → "tə-get-tə"` (not `"tuh get tuh"`)

### 3. `lib/coachingInsights.ts`

**Example Generation** (lines ~517-560):
- Improved to generate natural, context-aware examples
- No more generic "Take the train."
- Examples match how chunks appear in natural speech

## Acceptance Criteria ✅

- ✅ "train" alone NEVER appears if "the train" was spoken
- ✅ "get" alone NEVER appears if "to get to" was spoken
- ✅ Red box shows spoken chunk (includes articles/function words)
- ✅ "You heard / Actual" rows removed
- ✅ "How it sounds" only shows if meaningful transformation
- ✅ Phonetic notation uses schwa and hyphens
- ✅ One natural example sentence
- ✅ No explanation sections
- ✅ No friendly titles
- ✅ UI matches previous screenshots more than current

## Example Outputs

### Input: Event with `phraseHint.spanText = "the train"`

**Red Box**: `"the train"` (NOT `"train"`)  
**How it sounds**: `"the train" → "thə-train"` (meaningful transformation)  
**Example**: `"I missed the train this morning."`

### Input: Event with `expectedSpan = "get"` but part of "to get to"

**Red Box**: `"to get to"` (expanded chunk, NOT `"get"`)  
**How it sounds**: `"to get to" → "tə-get-tə"`  
**Example**: `"I need to get to the office by nine."`

### Input: Event with no meaningful transformation

**Red Box**: `"train station"`  
**How it sounds**: (omitted - no transformation)  
**Example**: `"The train station is nearby."`

## Testing

### Manual Test Steps

1. Navigate to Practice → Review page
2. Submit an answer that misses a chunk like "the train"
3. Click "💡 Why did I miss this?"
4. Verify:
   - Red box shows "the train" (not "train")
   - No "You heard / Actual" rows
   - "How it sounds" shows `"the train" → "thə-train"`
   - One natural example sentence
   - No explanation sections

### Edge Cases

- Single word that's truly standalone: Should show as-is
- No phraseHint available: Should expand using neighbors
- No meaningful transformation: Should omit "How it sounds"
- Missing example: Should not show example section

## Data Flow

1. **Event Selection**: Top 3 events from `prioritizeAndSelectTop3()`
2. **Chunk Selection**:
   - Check `event.phraseHint.spanText` first
   - If missing, use `buildDisplayChunk()` (patternFeedback or expanded)
   - Never use single-token if part of phrase
3. **Insight Generation**: `/api/insight` receives `display_chunk`
4. **UI Rendering**:
   - Red box: `display_chunk` (spoken chunk)
   - "How it sounds": Only if meaningful transformation
   - Example: One natural sentence

## Next Steps

1. **Audio Snippet Replay**: Implement extraction using `replay_target.refStart/refEnd`
2. **TTS Integration**: When ready, set `how_it_sounds_audio_url` and `example_audio_url`
3. **Testing**: Verify all edge cases and chunk selection priority
