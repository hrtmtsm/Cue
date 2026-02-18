# Audio Processing Guide - Natural Conversation Effects

## ✅ Currently Implemented

### 1. **Speed Adjustment** (via OpenAI TTS `speed` parameter)
- **Status**: ✅ Implemented
- **Location**: `lib/audioProcessing.ts` → `getNaturalConversationSpeed()`
- **Applied in**:
  - `app/api/audio/generate/route.ts`
  - `app/api/audio/stream/route.ts`
  - `app/api/clips/generate/route.ts`

**Speed Values:**
- `clean_normal`: **1.25x** (natural conversation pace, faster than TOEIC 1.0)
- `clean_fast`: **1.35x** (for advanced learners)
- `clean_slow`: **0.9x** (slightly slower for easier listening)

**Why 1.25x?**
- TOEIC-level speech (1.0x) sounds robotic and too slow for natural conversation
- 1.25-1.5x matches real-world speaking pace
- Makes TTS feel more conversational and less mechanical

---

## 🚧 Advanced Effects (Require Additional Setup)

The following effects require **ffmpeg** or an external audio processing service:

### 2. **Subtle Background Noise** (~2% volume)
**Goal**: Add very quiet ambient noise to make audio feel less sterile

**Implementation Options:**

#### Option A: ffmpeg (Local Development)
```bash
# Install ffmpeg
brew install ffmpeg  # macOS
apt-get install ffmpeg    # Linux
```

Then use in `lib/audioProcessing.ts`:
```typescript
// Add pink noise at 2% volume
ffmpeg -i input.mp3 -filter_complex \
  "[0:a]volume=0.98[main]; \
   anoisesrc=duration=10:color=pink:seed=42[noise]; \
   [noise]volume=0.02[noise_quiet]; \
   [main][noise_quiet]amix=inputs=2:duration=first" \
  output.mp3
```

#### Option B: External Service (Vercel/Production)
- Use a serverless function with ffmpeg layer
- Or use a dedicated audio processing API (e.g., Cloudinary, AWS MediaConvert)
- Or process client-side using Web Audio API

#### Option C: Web Audio API (Client-Side)
Process audio in the browser after receiving from server:
```typescript
// In client component
const audioContext = new AudioContext()
const source = audioContext.createBufferSource()
const gainNode = audioContext.createGain()
// Add pink noise buffer at 2% volume
```

---

### 3. **Smooth Clip Boundaries** (Crossfade 0.1-0.2s)
**Goal**: Add short crossfade at start/end to prevent choppy transitions

**Implementation:**
```bash
ffmpeg -i input.mp3 -af \
  "afade=t=in:st=0:d=0.15,afade=t=out:st=0:d=0.15" \
  output.mp3
```

**When to apply:**
- When concatenating multiple clips into a story
- At the start/end of each clip for smoother transitions

---

### 4. **EQ Adjustment** (Reduce high frequencies -3dB at 3kHz+)
**Goal**: Make audio warmer, less robotic

**Implementation:**
```bash
ffmpeg -i input.mp3 -af \
  "highpass=f=3000,aecho=0.8:0.88:60:0.4" \
  output.mp3
```

**Alternative (more precise):**
```bash
ffmpeg -i input.mp3 -af \
  "equalizer=f=3000:width_type=h:width=2000:g=-3" \
  output.mp3
```

---

### 5. **Light Compression**
**Goal**: Even out volume levels for more natural feel

**Implementation:**
```bash
ffmpeg -i input.mp3 -af \
  "acompressor=threshold=-18dB:ratio=3:attack=5:release=50" \
  output.mp3
```

**Parameters:**
- `threshold=-18dB`: Start compressing above -18dB
- `ratio=3`: 3:1 compression ratio (gentle)
- `attack=5ms`: Fast attack
- `release=50ms`: Quick release

---

## 🎯 Recommended Implementation Strategy

### Phase 1: ✅ Speed Adjustment (Current)
- Already implemented via OpenAI's `speed` parameter
- No additional dependencies needed
- Works everywhere (local, Vercel, production)

### Phase 2: Advanced Effects (Future)
**For Vercel/Serverless:**
1. **Option A**: Use a separate audio processing service
   - Deploy a serverless function with ffmpeg layer
   - Process audio after OpenAI generation, before upload to blob
   
2. **Option B**: Client-side processing
   - Use Web Audio API in browser
   - Process audio after receiving from server
   - Trade-off: Uses client CPU, but no server processing needed

3. **Option C**: Pre-process in batch
   - Process all audio files in batch job
   - Store processed versions in blob storage
   - Serve pre-processed audio to users

---

## 📝 Code Structure

Current implementation:
```
lib/audioProcessing.ts
  └── getNaturalConversationSpeed() ✅

app/api/audio/generate/route.ts
  └── Uses speed parameter ✅

app/api/audio/stream/route.ts
  └── Uses speed parameter ✅

app/api/clips/generate/route.ts
  └── Uses speed parameter ✅
```

Future structure (with ffmpeg):
```
lib/audioProcessing.ts
  ├── getNaturalConversationSpeed() ✅
  ├── processAudioWithFFmpeg() 🚧
  └── processAudioStreamWithFFmpeg() 🚧
```

---

## 🧪 Testing

To test the current speed adjustment:
1. Generate audio with `clean_normal` variant
2. Compare with previous 1.0x speed
3. Should sound more natural and conversational

To test advanced effects (when implemented):
1. Generate audio with all effects enabled
2. Compare A/B: with vs without effects
3. Verify audio still sounds clear and natural

---

## 📚 References

- [OpenAI TTS Speed Parameter](https://platform.openai.com/docs/guides/text-to-speech)
- [FFmpeg Audio Filters](https://ffmpeg.org/ffmpeg-filters.html)
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
