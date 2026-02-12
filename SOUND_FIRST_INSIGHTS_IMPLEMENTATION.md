# Sound-First Insights Implementation

## Summary

Simplified the "Why this is hard" modal to be **sound-first**, removing reading-heavy sections and focusing on:
1. **Heard vs Actual** comparison
2. **How it sounds** display (with Play button if audio available)
3. **One example** sentence (with Play button if audio available)

## Files Modified

### 1. `lib/coachingInsights.ts`

**Interface Updates**:
- Added `how_it_sounds_display?: string` - Format: `"train station" → "trenstation"`
- Added `how_it_sounds_audio_url?: string | null` - TTS audio URL (TODO: implement)
- Added `example_sentence?: string | null` - Single example sentence (replaces array)
- Added `example_audio_url?: string | null` - Example audio URL (TODO: implement)
- Marked `title`, `why_this_happens_here`, `try_this`, `example_sentences` as "Not displayed" in comments

**LLM Prompt Updates** (lines 197-220):
- Changed prompt to request `how_it_sounds_display` in format: `"written" → "spoken"`
- Changed prompt to request `example_sentence` (single, not array)
- Instructs LLM to generate sound-focused display strings

**Fallback Generation** (lines 352-394):
- Generates `how_it_sounds_display` based on `cause_type`:
  - `weak_form`: `"to the" → "t' th'"`
  - `linking`: `"get to" → "getto"`
  - `chunk_blur`: `"train station" → "trenstation"`
  - `phoneme_confusion`: `"train" → "tran"` (uses actualSpan if available)

### 2. `app/[locale]/(app)/practice/review/page.tsx`

**UI Simplification** (lines 1750-1810):
- **Removed**:
  - Card title (`<h3>` with `title`)
  - "なぜこうなるのか" / "Why this happens" section
  - "試してみよう" / "Try this" section
  - "More examples" list (multiple examples)
  
- **Added**:
  - **Section A: Comparison**
    - ❌ You heard: `what_you_might_have_heard || '(not heard)'`
    - ✅ Actual: `what_it_was`
  
  - **Section B: How it sounds**
    - 👂 How it sounds: `how_it_sounds_display` (monospace font)
    - ▶ Play button (only shown if `how_it_sounds_audio_url` exists)
  
  - **Section C: One example**
    - 🔁 One example: `example_sentence`
    - ▶ Play button (only shown if `example_audio_url` exists)

## Fields Used vs Not Displayed

### ✅ Currently Displayed
- `what_you_might_have_heard` - Section A: "You heard"
- `what_it_was` - Section A: "Actual"
- `how_it_sounds_display` - Section B: "How it sounds"
- `how_it_sounds_audio_url` - Section B: Play button visibility
- `example_sentence` - Section C: "One example"
- `example_audio_url` - Section C: Play button visibility
- `replay_target` - Used for transcript highlighting (unchanged)

### ❌ No Longer Displayed (but still generated)
- `title` - Removed from UI (still in response for internal use)
- `why_this_happens_here` - Removed from UI
- `try_this` - Removed from UI
- `example_sentences` - Removed from UI (replaced by single `example_sentence`)

### 🔄 Legacy Fields (kept for backward compatibility)
- `how_it_sounds_text` - Legacy, not displayed
- `example_text` - Legacy, not displayed

## Dev Logs

**Location**: `app/[locale]/(app)/practice/review/page.tsx` line 1756

```typescript
console.log('🎯 [Insights Modal] Current insight:', {
  what_it_was: currentInsight.what_it_was,
  what_you_might_have_heard: currentInsight.what_you_might_have_heard,
  display_chunk: currentInsight.display_chunk,
  highlight_range: [...],
  cause_type: currentInsight.cause_type,
  how_it_sounds_display: currentInsight.how_it_sounds_display,
  how_it_sounds_audio_url: currentInsight.how_it_sounds_audio_url,
  example_sentence: currentInsight.example_sentence,
  example_audio_url: currentInsight.example_audio_url,
  replay_target: currentInsight.replay_target,
})
```

## Example Output

### Input
- Event: `{ type: 'missing', expectedSpan: 'train station', refStart: 6, refEnd: 7 }`
- cause_type: `'chunk_blur'`

### Output
```typescript
{
  what_you_might_have_heard: "(not heard)",
  what_it_was: "train station",
  how_it_sounds_display: "\"train station\" → \"trainstation\"",
  how_it_sounds_audio_url: null, // TODO: TTS
  example_sentence: "I need to get to the train station on time.",
  example_audio_url: null, // TODO: TTS
  // ... other fields (not displayed)
}
```

### UI Display
```
❌ You heard: (not heard)
✅ Actual: train station

👂 How it sounds:
"train station" → "trainstation"
[No Play button - audio_url is null]

🔁 One example:
"I need to get to the train station on time."
[No Play button - audio_url is null]
```

## TODO: Audio Implementation

**Locations marked with `// TODO: Implement TTS`**:
1. `lib/coachingInsights.ts` line 414, 416 - Set `how_it_sounds_audio_url` and `example_audio_url`
2. `app/[locale]/(app)/practice/review/page.tsx` line ~1795, ~1810 - Implement audio playback

**When implementing**:
- Generate TTS audio for `display_chunk` or `how_it_sounds_display` spoken form
- Generate TTS audio for `example_sentence`
- Store audio URLs in response
- Update Play button handlers to use `new Audio(url).play()`

## Acceptance Criteria ✅

- ✅ Removed: "なぜこうなるのか", "試してみよう", "More examples", titles
- ✅ Added: Heard vs Actual comparison
- ✅ Added: "How it sounds" display with Play button (hidden if no audio)
- ✅ Added: One example with Play button (hidden if no audio)
- ✅ Carousel navigation still works
- ✅ Transcript highlighting unchanged (uses `replay_target`)
- ✅ No runtime errors
- ✅ TypeScript passes
