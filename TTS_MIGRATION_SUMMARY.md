# TTS Migration Summary: Browser TTS → OpenAI TTS

## Files Changed

### 1. **`app/api/tts/route.ts`** (NEW)
- OpenAI TTS API endpoint
- Input: `{ text, mode: "normal" | "slow_clear", voiceSeed?, cacheKey? }`
- Output: `audio/mpeg` binary response
- Features:
  - Voice randomization from curated list: `['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']`
  - In-memory LRU cache (max 100 items)
  - Cache key generation from text + mode + voice
  - Uses OpenAI `tts-1` model
  - Returns audio with proper headers

### 2. **`app/[locale]/(app)/practice/review/page.tsx`** (MODIFIED)
- **Removed**: All `speechSynthesis` and `SpeechSynthesisUtterance` usage
- **Added**: OpenAI TTS integration for "Why this was hard" modal
- **Added**: Normal / Slow & Clear mode selection buttons
- **Added**: Loading states for TTS playback
- **Fixed**: Fallback card behavior with proper logging

#### Key Changes:
- Replaced `handleHowItSoundsPlay()` and `handleExamplePlay()` to call `/api/tts`
- Added state: `howItSoundsMode`, `exampleMode`, `isLoadingHowItSounds`, `isLoadingExample`, `currentAudio`
- Added Normal/Slow & Clear buttons for both "How it sounds" and "One example" sections
- Audio playback uses `Audio()` with blob URLs from TTS API
- Playback rate adjustment: Normal = 1.2x, Slow & Clear = 0.9x
- Dev-only fallback to browser TTS if OpenAI TTS fails

#### Fallback Card Fix:
- Only shows when `aiInsights.length === 0 && !insightLoading && !hasEvents`
- Added console.warn logging with reason codes
- Prevents showing fallback when real mistakes exist

## Audio Behavior

### "Compared to what you heard" Section
- **Unchanged**: Still uses `currentPhrase.audioUrl` via HTMLAudioElement
- Simple ▶ Play / 🐢 Slow buttons
- No TTS integration (as requested)

### "Why this was hard" Modal
- **"How it sounds"**: Uses OpenAI TTS with Normal/Slow & Clear modes
- **"One example"**: Uses OpenAI TTS with Normal/Slow & Clear modes
- Voice randomized per play
- Natural, fast pace (1.2x for normal, 0.9x for slow)
- Loading states during TTS generation

## Testing Locally

### Prerequisites
1. Ensure `OPENAI_API_KEY` is set in `.env.local`
2. Run `npm install` to ensure `openai` package is installed

### Test Steps
1. Start dev server: `npm run dev`
2. Navigate to practice review page
3. Submit an answer to trigger the "Why this was hard" modal
4. Test "How it sounds" playback:
   - Click "▶ Normal" - should play at faster pace
   - Click "🐢 Slow & Clear" - should play at slower pace
   - Verify voice sounds natural and randomized
5. Test "One example" playback:
   - Same behavior as above
6. Verify "Compared to what you heard" still uses original audio
7. Check console for any errors or fallback warnings

### Expected Behavior
- TTS audio should sound natural and conversational
- Normal mode: faster pace (1.2x playback rate)
- Slow & Clear mode: slower pace (0.9x playback rate)
- Voice should vary between plays
- Loading indicator shows while fetching TTS
- No browser TTS fallback in production (only dev)

### Debugging
- Check browser console for TTS API errors
- Check network tab for `/api/tts` requests
- Verify cache hits (subsequent plays should be faster)
- Check fallback card logging (dev mode only)

## Caching Strategy

- **Cache Key**: SHA256 hash of `text:mode:voice`
- **Storage**: In-memory Map (LRU eviction at 100 items)
- **Cache Headers**: `Cache-Control: public, max-age=31536000, immutable`
- **Cache Hit**: Returns immediately without API call
- **Cache Miss**: Calls OpenAI API, stores result, returns audio

## Voice Selection

- **Random**: Each play selects a random voice from the curated list
- **Deterministic**: If `voiceSeed` is provided, uses MD5 hash to select voice
- **Available Voices**: `['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']`

## Error Handling

- **OpenAI API Error**: Returns 503 with error message
- **Missing API Key**: Returns 503
- **Invalid Input**: Returns 400 with error message
- **Dev Fallback**: If OpenAI TTS fails in development, falls back to browser TTS (with warning)

## Performance Considerations

- First play: ~500ms-1s (API call + audio generation)
- Cached play: <50ms (immediate return)
- Audio blob cleanup: Automatic via `URL.revokeObjectURL()` on audio end/error
