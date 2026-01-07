# Audio Generation & Playback Flow - End-to-End Documentation

## Overview
This document traces the complete pipeline from user action to audio playback, identifying all steps, file locations, and potential latency points.

---

## STEP-BY-STEP PIPELINE

### **PHASE 1: Initial Page Load & Metadata Check**

**1. User navigates to respond page**
- **File**: `app/(app)/practice/respond/page.tsx`
- **Function**: `RespondPageContent` component mounts
- **What it does**: Component initializes with `uiPhase='boot'` and `audioStatus='needs_generation'`
- **Sync/Blocking**: Synchronous (React render)

**2. useEffect hook triggers on clipId change**
- **File**: `app/(app)/practice/respond/page.tsx` (line ~258)
- **Function**: `useEffect(() => {...}, [effectiveClipId, storyId, storyClipId, clipId])`
- **What it does**: Resets state, loads transcript from story data or sessionStorage, sets `uiPhase='checking'`
- **Sync/Blocking**: Synchronous (state updates)

**3. loadAudioMetadata() async function called**
- **File**: `app/(app)/practice/respond/page.tsx` (line ~338)
- **Function**: `loadAudioMetadata`
- **What it does**: Calls `getAudioMetadata()` to check database for existing audio
- **Sync/Blocking**: Asynchronous (API call)

**4. Client-side API call to metadata endpoint**
- **File**: `lib/audioApi.ts` (line ~31)
- **Function**: `getAudioMetadata(clipId, transcript, variantKey)`
- **What it does**: Fetches Supabase session, builds auth headers, calls `/api/audio/metadata` endpoint
- **Sync/Blocking**: Asynchronous (network request)

**5. Server-side metadata API route**
- **File**: `app/api/audio/metadata/route.ts` (line ~5)
- **Function**: `GET /api/audio/metadata`
- **What it does**: Resolves userId (auth or dev guest), queries Supabase `clip_audio` table for existing audio record
- **Sync/Blocking**: Asynchronous (DB query)

**6. User resolution (auth check)**
- **File**: `lib/supabase/server.ts` (line ~50)
- **Function**: `resolveUserId(request)`
- **What it does**: Checks auth token, falls back to `DEV_GUEST_USER_ID` in dev mode
- **Sync/Blocking**: Synchronous (token parsing)

**7. Supabase database query**
- **File**: `app/api/audio/metadata/route.ts` (line ~49)
- **Function**: `supabaseAdmin.from('clip_audio').select().eq(...).single()`
- **What it does**: Queries `clip_audio` table by `user_id`, `clip_id`, `variant_key` to find existing audio
- **Sync/Blocking**: Asynchronous (network DB call)

**8. Hash validation check**
- **File**: `app/api/audio/metadata/route.ts` (line ~67)
- **Function**: Compares `audioRow.transcript_hash` with computed hash
- **What it does**: Validates transcript hasn't changed (forces regeneration if mismatch)
- **Sync/Blocking**: Synchronous (string comparison)

**9. Response returned to client**
- **File**: `app/api/audio/metadata/route.ts` (line ~104)
- **Function**: Returns JSON with `audioStatus` ('needs_generation' | 'generating' | 'ready' | 'error') and optional `audioUrl`
- **Sync/Blocking**: Synchronous (JSON serialization)

---

### **PHASE 2: Audio Generation (if needed)**

**10. Client receives metadata response**
- **File**: `lib/audioApi.ts` (line ~60)
- **Function**: `getAudioMetadata()` response handler
- **What it does**: Parses JSON response, returns `AudioMetadata` object
- **Sync/Blocking**: Synchronous (JSON parse)

**11. UI state update based on metadata**
- **File**: `app/(app)/practice/respond/page.tsx` (line ~342)
- **Function**: `loadAudioMetadata()` response handler
- **What it does**: Updates `practiceData` state based on `audioStatus`:
  - If `'ready'`: Sets `audioUrl` and `audioStatus='ready'`
  - If `'generating'`: Starts polling
  - If `'needs_generation'`: Auto-triggers `triggerGeneration()`
- **Sync/Blocking**: Synchronous (state update)

**12. Auto-trigger generation (if needed)**
- **File**: `app/(app)/practice/respond/page.tsx` (line ~211)
- **Function**: `triggerGeneration(clipId, transcript, storyId)`
- **What it does**: Sets `audioStatus='generating'`, calls `generateAudio()` API
- **Sync/Blocking**: Asynchronous (API call)

**13. Client-side generation API call**
- **File**: `lib/audioApi.ts` (line ~94)
- **Function**: `generateAudio(clipId, transcript, variantKey)`
- **What it does**: Fetches Supabase session, builds auth headers, calls `POST /api/audio/generate`
- **Sync/Blocking**: Asynchronous (network request)

**14. Server-side generation API route**
- **File**: `app/api/audio/generate/route.ts` (line ~11)
- **Function**: `POST /api/audio/generate`
- **What it does**: Main entry point for audio generation request
- **Sync/Blocking**: Asynchronous (full pipeline)

**15. User resolution (auth check)**
- **File**: `app/api/audio/generate/route.ts` (line ~22)
- **Function**: `resolveUserId(request)`
- **What it does**: Resolves userId (authenticated or dev guest)
- **Sync/Blocking**: Synchronous (token parsing)

**16. Request validation**
- **File**: `app/api/audio/generate/route.ts` (line ~42)
- **Function**: Validates `clipId` and `transcript` in request body
- **What it does**: Returns 400 if missing required fields
- **Sync/Blocking**: Synchronous (validation)

**17. Transcript hash generation**
- **File**: `app/api/audio/generate/route.ts` (line ~67)
- **Function**: `generateTextHash(transcript)`
- **What it does**: Computes hash for transcript integrity checking
- **Sync/Blocking**: Synchronous (string hashing)

**18. Check for existing audio in database**
- **File**: `app/api/audio/generate/route.ts` (line ~75)
- **Function**: `supabaseAdmin.from('clip_audio').select().eq(...).single()`
- **What it does**: Queries database to see if audio already exists (may have hash mismatch)
- **Sync/Blocking**: Asynchronous (DB query)

**19. Upsert audio record with 'generating' status**
- **File**: `app/api/audio/generate/route.ts` (line ~110)
- **Function**: `supabaseAdmin.from('clip_audio').upsert({audio_status: 'generating'})`
- **What it does**: Creates or updates database record with status='generating' before TTS call
- **Sync/Blocking**: Asynchronous (DB write)

**20. OpenAI TTS API call**
- **File**: `app/api/audio/generate/route.ts` (line ~172)
- **Function**: `openai.audio.speech.create({model: 'tts-1', voice: 'alloy', input: transcript})`
- **What it does**: Calls OpenAI TTS API to generate audio from transcript text
- **Sync/Blocking**: Asynchronous (external API call - **LIKELY LATENCY POINT**)

**21. Receive audio ArrayBuffer from OpenAI**
- **File**: `app/api/audio/generate/route.ts` (line ~178)
- **Function**: `response.arrayBuffer()`
- **What it does**: Converts OpenAI response stream to ArrayBuffer
- **Sync/Blocking**: Asynchronous (stream read)

**22. Upload audio to Vercel Blob Storage**
- **File**: `app/api/audio/generate/route.ts` (line ~222)
- **Function**: `put(blobPath, audioArrayBuffer, {access: 'public', contentType: 'audio/mpeg'})`
- **What it does**: Uploads audio file to Vercel Blob Storage at path `audio/{userId}/{clipId}/{variantKey}.mp3`
- **Sync/Blocking**: Asynchronous (network upload - **LIKELY LATENCY POINT**)

**23. Receive blob URL from Vercel**
- **File**: `app/api/audio/generate/route.ts` (line ~235)
- **Function**: `blob.url` (returned from `put()`)
- **What it does**: Gets public URL for uploaded audio file
- **Sync/Blocking**: Synchronous (property access)

**24. Update database record to 'ready' status**
- **File**: `app/api/audio/generate/route.ts` (line ~240)
- **Function**: `supabaseAdmin.from('clip_audio').update({audio_status: 'ready', blob_path: blobUrl})`
- **What it does**: Updates database record with status='ready' and stores blob URL
- **Sync/Blocking**: Asynchronous (DB write)

**25. Return success response to client**
- **File**: `app/api/audio/generate/route.ts` (line ~274)
- **Function**: Returns JSON `{success: true, clipId, transcriptHash, blobPath: blobUrl}`
- **What it does**: Sends success response with blob URL
- **Sync/Blocking**: Synchronous (JSON serialization)

**26. Client receives generation response**
- **File**: `lib/audioApi.ts` (line ~135)
- **Function**: `generateAudio()` response handler
- **What it does**: Parses response, waits 500ms, then calls `getAudioMetadata()` to fetch final URL
- **Sync/Blocking**: Asynchronous (includes 500ms delay + metadata fetch)

**27. Start polling for status update**
- **File**: `app/(app)/practice/respond/page.tsx` (line ~169)
- **Function**: `startPolling(clipId, transcript)`
- **What it does**: Sets up `setInterval` to poll `/api/audio/metadata` every 1 second until status='ready'
- **Sync/Blocking**: Asynchronous (recurring interval)

**28. Polling loop - metadata check**
- **File**: `app/(app)/practice/respond/page.tsx` (line ~174)
- **Function**: `setInterval(async () => { await getAudioMetadata(...) }, 1000)`
- **What it does**: Repeatedly calls metadata API every 1 second to check if audio is ready
- **Sync/Blocking**: Asynchronous (recurring network calls)

**29. Polling detects 'ready' status**
- **File**: `app/(app)/practice/respond/page.tsx` (line ~178)
- **Function**: Polling handler checks `metadata.audioStatus === 'ready'`
- **What it does**: Stops polling interval, updates state with `audioUrl` and `audioStatus='ready'`
- **Sync/Blocking**: Synchronous (state update)

---

### **PHASE 3: Audio Playback**

**30. Audio element creation**
- **File**: `app/(app)/practice/respond/page.tsx` (line ~402)
- **Function**: `useEffect(() => {...}, [practiceData?.audioUrl, ...])`
- **What it does**: Creates new `Audio()` element with `audioUrl` when status='ready' and URL exists
- **Sync/Blocking**: Synchronous (DOM element creation)

**31. Audio element event listeners**
- **File**: `app/(app)/practice/respond/page.tsx` (line ~438)
- **Function**: Adds 'play', 'pause', 'ended', 'error', 'loadeddata' event listeners
- **What it does**: Sets up event handlers to sync React state with audio playback state
- **Sync/Blocking**: Synchronous (event binding)

**32. User clicks Play button**
- **File**: `app/(app)/practice/respond/page.tsx` (line ~523)
- **Function**: `handlePlayPause()`
- **What it does**: Calls `audioRef.current.play()` if not playing, or `pause()` if playing
- **Sync/Blocking**: Asynchronous (browser audio API)

**33. Browser loads audio from URL**
- **File**: Browser native
- **Function**: HTML5 Audio element `play()` method
- **What it does**: Fetches audio file from Vercel Blob URL, buffers, and starts playback
- **Sync/Blocking**: Asynchronous (network fetch + decode - **LIKELY LATENCY POINT**)

**34. Audio playback starts**
- **File**: Browser native
- **Function**: Audio 'play' event fires
- **What it does**: Browser triggers 'play' event, React handler sets `isPlaying=true`
- **Sync/Blocking**: Synchronous (event callback)

---

## EXTERNAL DEPENDENCIES

### **TTS Provider**
- **Service**: OpenAI TTS API
- **Model**: `tts-1`
- **Voice**: `alloy` (default)
- **Endpoint**: `openai.audio.speech.create()`
- **File**: `app/api/audio/generate/route.ts` (line ~172)
- **Auth**: `OPENAI_API_KEY` environment variable

### **Storage Provider**
- **Service**: Vercel Blob Storage
- **Package**: `@vercel/blob` (v0.19.0)
- **Method**: `put(blobPath, buffer, options)`
- **File**: `app/api/audio/generate/route.ts` (line ~222)
- **Auth**: `BLOB_READ_WRITE_TOKEN` environment variable
- **Path Format**: `audio/{userId}/{clipId}/{variantKey}.mp3`
- **Access**: Public (no signed URLs needed)

### **Database**
- **Service**: Supabase (PostgreSQL)
- **Table**: `clip_audio`
- **Schema Fields**: `user_id`, `clip_id`, `variant_key`, `transcript`, `transcript_hash`, `audio_status`, `blob_path`, `voice_profile`, `updated_at`
- **File**: `app/api/audio/generate/route.ts` (line ~110, ~240)
- **Auth**: `SUPABASE_SERVICE_ROLE_KEY` (admin client)

### **Queue/Background Workers**
- **Status**: None found
- **Note**: All generation happens synchronously in API route handler

### **Webhooks**
- **Status**: None found
- **Note**: Client uses polling (1-second interval) to check generation status

---

## WHERE LATENCY LIKELY ACCUMULATES

### **Top 5 Suspected Latency Points (in order of suspicion):**

1. **OpenAI TTS API call** (Step 20)
   - **Location**: `app/api/audio/generate/route.ts` (line ~172)
   - **Reason**: External API call to OpenAI, network round-trip, TTS processing time
   - **Typical Duration**: 2-4 seconds for short transcripts

2. **Vercel Blob Storage upload** (Step 22)
   - **Location**: `app/api/audio/generate/route.ts` (line ~222)
   - **Reason**: Network upload of audio file (typically 50-200KB), upload speed dependent
   - **Typical Duration**: 0.5-2 seconds depending on file size and network

3. **Polling delay before detection** (Step 28)
   - **Location**: `app/(app)/practice/respond/page.tsx` (line ~174)
   - **Reason**: 1-second polling interval means up to 1 second delay before client detects 'ready' status
   - **Typical Duration**: 0-1 second (average 0.5 seconds)

4. **Client-side 500ms delay after generation** (Step 26)
   - **Location**: `lib/audioApi.ts` (line ~140)
   - **Reason**: Hardcoded `setTimeout(resolve, 500)` before fetching metadata
   - **Typical Duration**: 500ms (fixed)

5. **Database queries** (Steps 7, 18, 19, 24)
   - **Location**: Multiple Supabase queries throughout pipeline
   - **Reason**: Network round-trips to Supabase, query execution time
   - **Typical Duration**: 50-200ms per query (cumulative ~200-600ms)

### **Additional Considerations:**

- **Audio file download on first play** (Step 33): Browser must fetch and buffer audio from Vercel Blob URL before playback can start. This is separate from generation latency but affects perceived responsiveness.
- **Multiple metadata checks**: Initial check (Step 4) + polling (Step 28) = multiple DB queries that add up.

---

## SUMMARY

**Total Steps**: 34 steps from page load to audio playback

**Synchronous Steps**: ~15 (state updates, validation, hash computation)
**Asynchronous Steps**: ~19 (API calls, DB queries, file uploads, polling)

**Critical Path for Generation**:
1. Metadata check (Steps 4-9) → ~200-400ms
2. Generation trigger (Steps 12-13) → ~50ms
3. OpenAI TTS (Step 20) → **2-4 seconds** ⚠️
4. Vercel Blob upload (Step 22) → **0.5-2 seconds** ⚠️
5. DB update (Step 24) → ~100-200ms
6. Client polling detection (Steps 27-29) → **0-1 second** ⚠️

**Estimated Total Latency**: **3-7 seconds** from generation trigger to playback-ready state.

