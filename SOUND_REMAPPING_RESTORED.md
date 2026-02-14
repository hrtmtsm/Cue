# Sound Remapping ("Cue Punch") Restored

## Summary

Restored the core "Cue punch" - sound remapping - to the simplified insights modal. The "How it sounds" section now shows meaningful phonetic approximations instead of repeating the actual phrase.

## Key Fixes

### 1. Phonetic Approximation Generation

**Problem**: `how_it_sounds_display` was showing `"the train" → "the train"` (identical, not helpful)

**Solution**: Enhanced fallback generation with cause-type-specific rules:

- **weak_form**: `"the train" → "th' train"` (function word reduction)
- **linking**: `"get to" → "getto"` (word blending)
- **chunk_blur**: `"train station" → "trenstation"` (sound blending with vowel changes)
- **phoneme_confusion**: `"train" → "tran"` (similar sound approximation)

**Validation**: Ensures `how_it_sounds_display` is NEVER identical to the actual phrase.

### 2. Short Examples (7-10 words max)

**Problem**: Examples were too long (15+ words)

**Solution**:
- Enforced 7-10 word maximum
- Generated minimal, focused examples:
  - `"the train"` → `"Take the train."`
  - `"to get to"` → `"I need to get to work."`
- Truncated longer examples automatically

### 3. Better "Not Heard" Label

**Problem**: Showed `"(not heard)"` which is technical

**Solution**: Changed to `"You missed it (no sound caught)"` - more user-friendly

### 4. Stricter LLM Constraints

**Updated Prompt** (`lib/coachingInsights.ts` lines 247-270):
- Must include → arrow
- Must be <= 40 characters
- Must NOT be identical to actual phrase
- Use simple phonetic spelling (NO IPA)
- Examples provided for each cause_type

## Files Modified

### 1. `lib/coachingInsights.ts`

**Enhanced Fallback Generation** (lines 422-516):
- `generatePhoneticApproximation()` helper function
- Cause-type-specific phonetic rules
- Validation to ensure difference from original
- Length enforcement (max 40 chars)

**Short Example Generation** (lines 517-540):
- Context-aware examples (train, get to, etc.)
- Automatic truncation to 10 words max
- Minimal, focused sentences

**LLM Prompt Updates** (lines 247-270):
- Stricter constraints on `how_it_sounds_display`
- Required format with → arrow
- Max length enforcement
- No IPA, simple phonetic spelling

### 2. `app/[locale]/(app)/practice/review/page.tsx`

**UI Improvements** (lines 1772-1830):
- Better "not heard" label: `"You missed it (no sound caught)"`
- Fallback validation for `how_it_sounds_display` (ensures it's always different)
- Visual enhancement: `how_it_sounds_display` in gray background box
- Example length validation in UI

## Example Output

### Input
- Event: `{ expectedSpan: "the train", cause_type: "weak_form" }`

### Output
```typescript
{
  what_you_might_have_heard: "(not heard)",
  what_it_was: "the train",
  how_it_sounds_display: "\"the train\" → \"th' train\"",
  example_sentence: "Take the train.",
  // ...
}
```

### UI Display
```
❌ You heard: You missed it (no sound caught)
✅ Actual: the train

👂 How it sounds:
"the train" → "th' train"
[Play button hidden - no audio URL]

🔁 One example:
"Take the train."
[Play button hidden - no audio URL]
```

## Validation Rules

1. **`how_it_sounds_display` must be different from actual**:
   - Normalized comparison (removes spaces, quotes)
   - If identical, forces reduction (e.g., adds `th'`, `t'`)
   - Always includes → arrow format

2. **Example sentence length**:
   - Max 10 words
   - Auto-truncated if longer
   - Focused on the chunk, not explanations

3. **LLM output validation**:
   - Checks for → arrow presence
   - Validates length <= 40 chars
   - Ensures difference from original

## Phonetic Approximation Rules

### weak_form
- `"the"` → `"th'"`
- `"to"` → `"t'"`
- `"a"` → `"uh"`
- `"an"` → `"uhn"`
- `"of"` → `"uhv"`

### linking
- Removes spaces: `"get to"` → `"getto"`
- Blends words together

### chunk_blur
- Blends words: `"train station"` → `"trainstation"`
- Vowel changes: `ai` → `e` (train → tren)
- Common fast speech patterns

### phoneme_confusion
- Uses `actualSpan` if available
- Otherwise shows similar sound approximation

## Acceptance Criteria ✅

- ✅ `how_it_sounds_display` is NEVER identical to actual phrase
- ✅ Examples are 7-10 words max
- ✅ Better label for "(not heard)" case
- ✅ Phonetic approximations are meaningful (not just original text)
- ✅ LLM prompt enforces strict constraints
- ✅ Fallback generation produces valid sound remaps
- ✅ UI validates and shows fallback if needed

## Next Steps

1. **TTS Integration**: When audio infrastructure is ready, set `how_it_sounds_audio_url` and `example_audio_url`
2. **Play Button**: Implement audio playback when URLs are available
3. **Testing**: Verify phonetic approximations for various cause types and chunks
