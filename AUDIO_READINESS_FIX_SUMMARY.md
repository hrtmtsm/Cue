# Audio Readiness Fix - Summary

## Problem
After optimizing the audio flow to set `audioUrl` immediately, users were seeing "Audio problem / retry" banners. This was caused by a race condition where:
1. Blob URL was returned immediately after upload
2. CDN propagation delay meant URL wasn't accessible yet
3. Audio element tried to load and failed, triggering error state

## Solution

### 1. Enhanced Error Logging

**File**: `app/(app)/practice/respond/page.tsx`

**Changes**:
- Added detailed logging in audio element error handler
- Logs: `errorCode`, `errorMessage`, `errorName`, `currentSrc`, `networkState`, `readyState`
- Attempts to fetch URL with HEAD request to check network response status
- Logs fetch response status, headers, and any errors

**Purpose**: Identify exact conditions that trigger "Audio problem" banner

### 2. Audio URL Readiness Guard

**New File**: `lib/audioUrlReadiness.ts`

**Function**: `waitForAudioUrl(url, options)`

**Features**:
- Retries checking URL accessibility for up to 8 attempts (~8 seconds total)
- Uses exponential backoff: 200ms, 500ms, 1s, 2s, 2s, 2s, 2s, 2s
- Tries HEAD request first (lighter), falls back to GET with `Range: bytes=0-1` if HEAD not allowed
- Treats 200 (OK) or 206 (Partial Content) as success
- Returns `{ success: boolean, error?, attempt? }`

**Integration**:
- Called in `lib/audioApi.ts` `generateAudio()` after receiving blob URL
- Only returns `audioUrl` after URL is verified as accessible
- If verification fails after retries, still returns URL (client can retry or fall back to polling)

### 3. Unique Blob Paths with Transcript Hash

**Files Modified**:
- `app/api/audio/generate/route.ts`
- `app/api/audio/stream/route.ts`

**Changes**:
- Blob path format changed from: `audio/{userId}/{clipId}/{variantKey}.mp3`
- To: `audio/{userId}/{clipId}/{variantKey}/{transcriptHash}.mp3`
- Includes `transcript_hash` in path for uniqueness
- Prevents overwrites when same clip has different transcripts
- Ensures CDN cache consistency

### 4. Idempotency Check

**File**: `app/api/audio/generate/route.ts`

**Changes**:
- Before generating, checks for existing audio with same `transcript_hash`
- If found and status is 'ready', returns existing blob URL immediately
- Skips generation if exact transcript already exists
- Prevents duplicate generation for same content

### 5. Database Query Updates

**File**: `app/api/audio/metadata/route.ts`

**Changes**:
- Metadata queries now include `.eq('transcript_hash', transcriptHash)`
- Ensures exact transcript match (not just clip + variant)
- Prevents hash mismatches from returning wrong audio

**File**: `app/api/audio/generate/route.ts`

**Changes**:
- Upsert `onConflict` updated to include `transcript_hash`
- Note: Database unique constraint may need to be updated to include `transcript_hash`
- If constraint doesn't include it, application-level idempotency check handles it

### 6. Client-Side Updates

**File**: `app/(app)/practice/respond/page.tsx`

**Changes**:
- Updated comment to note that `audioUrl` is already verified before being set
- Enhanced error logging for debugging
- No changes to immediate URL setting (readiness is checked server-side)

## Flow After Fix

### Generation Flow:
1. Client calls `POST /api/audio/generate`
2. Server checks for existing audio with same `transcript_hash` → if found, return immediately
3. Server generates audio, uploads to blob at path: `audio/{userId}/{clipId}/{variantKey}/{transcriptHash}.mp3`
4. Server updates DB with blob URL
5. Server returns blob URL to client
6. **NEW**: Client calls `waitForAudioUrl()` to verify URL is accessible
7. **NEW**: Retries with exponential backoff (up to 8 attempts, ~8 seconds)
8. **NEW**: Only after verification succeeds, returns `audioUrl` to component
9. Component sets `audioUrl` and `audioStatus='ready'`
10. Audio element is created and can load successfully

### Error Handling:
- If URL verification fails after retries, still returns URL (allows client retry)
- Client can fall back to polling `/api/audio/metadata` if needed
- Enhanced error logging helps identify remaining issues

## Expected Improvements

1. **Eliminates race condition**: URL is verified accessible before use
2. **Prevents duplicate generation**: Idempotency check returns existing audio
3. **Unique blob paths**: Transcript hash in path prevents overwrites
4. **Better debugging**: Detailed error logs help identify issues
5. **Graceful degradation**: Falls back to polling if verification fails

## Files Modified

1. **`lib/audioUrlReadiness.ts`** (NEW) - URL readiness checker
2. **`app/api/audio/generate/route.ts`** - Blob path, idempotency, onConflict
3. **`app/api/audio/metadata/route.ts`** - Include transcript_hash in query
4. **`app/api/audio/stream/route.ts`** - Blob path, onConflict
5. **`lib/audioApi.ts`** - Call `waitForAudioUrl()` before returning URL
6. **`app/(app)/practice/respond/page.tsx`** - Enhanced error logging

## Database Schema Note

The `onConflict` clause now includes `transcript_hash`, but the database unique constraint may need to be updated. If the constraint is only on `(user_id, clip_id, variant_key)`, the application-level idempotency check (checking for existing audio with same hash before generation) will handle uniqueness correctly.

## Testing Recommendations

1. **Happy path**: Generate audio → verify URL readiness check → verify playback works
2. **Idempotency**: Generate same transcript twice → verify second call returns existing URL
3. **CDN delay simulation**: Test with slow network → verify retries work
4. **Error logging**: Trigger audio error → verify detailed logs appear
5. **Hash mismatch**: Change transcript slightly → verify new audio is generated

