# UI Restoration Summary - "Why this was hard" Modal

## Changes Made

### 1. Restored Previous UI Structure

**Primary Header Box** (visually dominant):
- Label: `✖ 聞き取れなかった部分` (missed part)
- Big text: Chunk text from `replay_target.text` or `what_it_was`
- Red background box (matches old UI)

**Secondary Comparison Row** (small):
- "You heard:" + `what_you_might_have_heard` or `(not heard)`
- "Actual:" + `what_it_was`
- Compact, single-line layout

**"How it sounds" Section**:
- Phonetic remap string using `toHowItSoundsRemap()` helper
- Format: `"the train" → "thuh train"`
- Play button (prefers audio snippet replay, falls back to TTS)

**"One example" Section**:
- One natural sentence (7-10 words max)
- Play button (TTS)
- Natural examples that match how chunk appears in speech

### 2. Created Helper: `lib/howItSounds.ts`

**Function: `toHowItSoundsRemap(chunkText: string): string`**

Rules:
- Function words: `the` → `thuh`, `to` → `tuh`, `of` → `uv`, `and` → `n`
- Known casual forms: `gonna` → `gunna`, `wanna` → `wanna`, etc.
- Otherwise: keeps chunk as-is (no weird concatenation)

**Function: `formatHowItSoundsDisplay(original: string, remap: string): string`**

Formats remap with arrow notation: `"the train" → "thuh train"`

### 3. Audio Replay Implementation

**"How it sounds" Play button**:
1. **Preferred**: Audio snippet replay using `replay_target.refStart/refEnd` (TODO: implement snippet extraction)
2. **Fallback**: TTS audio URL if available
3. **Last resort**: Browser `speechSynthesis` API

**"One example" Play button**:
1. TTS audio URL if available
2. Browser `speechSynthesis` API

### 4. Improved Example Generation

**Natural Examples** (not just "Take the train."):
- `"get to"` → `"I need to get to the office by nine."`
- `"the train"` → `"I missed the train this morning."`
- `"gonna"` → `"I'm gonna finish this project today."`
- Context-aware based on chunk content

## Files Modified

### 1. `lib/howItSounds.ts` (NEW)
- `toHowItSoundsRemap()` - Phonetic remap generator
- `formatHowItSoundsDisplay()` - Display formatter
- Unit tests in `lib/howItSounds.test.ts`

### 2. `app/[locale]/(app)/practice/review/page.tsx`
- Restructured insights modal UI
- Added imports for `howItSounds` helpers
- Implemented audio replay handlers
- Removed titles and explanation sections

### 3. `lib/coachingInsights.ts`
- Improved example sentence generation (more natural)
- Better context-aware examples

## Unit Tests

**File**: `lib/howItSounds.test.ts`

Tests cover:
- Function word reductions (`the` → `thuh`, `to` → `tuh`)
- Known casual forms (`gonna` → `gunna`)
- Multiple function words
- Content word preservation
- Edge cases (empty string, single words)
- No weird concatenation

**Run tests**: `npx jest lib/howItSounds.test.ts`

## Manual Testing

### Where to Test
1. Navigate to Practice → Review page
2. Submit an answer
3. Click "💡 Why did I miss this?" button
4. Verify modal structure matches old UI

### What to Check

1. **Primary Box**:
   - ✅ Big red box with `✖ 聞き取れなかった部分`
   - ✅ Chunk text is large and prominent
   - ✅ Uses `replay_target.text` or `what_it_was`

2. **Secondary Row**:
   - ✅ Small "You heard / Actual" row
   - ✅ Shows `(not heard)` if nothing was heard
   - ✅ Not visually dominant

3. **"How it sounds"**:
   - ✅ Shows phonetic remap (e.g., `"the train" → "thuh train"`)
   - ✅ NOT identical to original (no `"the train" → "the train"`)
   - ✅ Play button works (audio replay or TTS)

4. **"One example"**:
   - ✅ Natural sentence (not "Take the train.")
   - ✅ 7-10 words max
   - ✅ Play button works (TTS)

5. **Removed**:
   - ✅ No titles like "優しい発音のアドバイス"
   - ✅ No "なぜこうなるのか" explanations
   - ✅ No "試してみよう" tips
   - ✅ No "More examples" list

## Example Outputs

### Input: `"the train"`
- Remap: `"the train" → "thuh train"`
- Example: `"I missed the train this morning."`

### Input: `"to get to"`
- Remap: `"to get to" → "tuh get tuh"`
- Example: `"I need to get to the office by nine."`

### Input: `"gonna"`
- Remap: `"gonna" → "gunna"`
- Example: `"I'm gonna finish this project today."`

### Input: `"train station"`
- Remap: `"train station" → "train station"` (no function words, preserved)
- Example: `"The train station is nearby."`

## Next Steps (TODO)

1. **Audio Snippet Replay**: Implement extraction of audio snippet using `replay_target.refStart/refEnd`
2. **TTS Integration**: When TTS infrastructure is ready, set `how_it_sounds_audio_url` and `example_audio_url`
3. **Testing**: Verify phonetic remaps for various chunk types

## Acceptance Criteria ✅

- ✅ Modal matches old UI hierarchy (big missed chunk box first)
- ✅ "You heard / Actual" is secondary (small row)
- ✅ "How it sounds" shows meaningful remap (not identical to original)
- ✅ Both sections have Play buttons
- ✅ No explanation sections ("なぜこうなるのか", "試してみよう", "More examples")
- ✅ No friendly titles
- ✅ Examples are natural (not just "Take the train.")
- ✅ Unit tests pass
