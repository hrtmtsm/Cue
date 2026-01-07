# Audio Pipeline Refactor - Implementation Status

## ✅ Completed

### 1. Database Schema
- Created `supabase/migrations/001_create_clip_audio.sql`
- Table: `clip_audio` with all required fields
- RLS policies enabled (users can only access their own audio)
- Indexes for performance
- Auto-update `updated_at` trigger

### 2. Supabase Client Setup
- `lib/supabase/server.ts` - Server-side client with service role
- `lib/supabase/client.ts` - Client-side client with anon key
- `getAuthUser()` helper for API route authentication

### 3. API Routes
- `POST /api/audio/generate` - Generates audio, stores in Vercel Blob, updates DB
- `GET /api/audio/url` - Returns signed URL for audio (1 hour expiry)
- Both routes verify authentication
- Hash validation on generation
- Error handling and status updates

### 4. Client API Utilities
- `lib/audioApi.ts` - Client-side functions:
  - `getAudioMetadata()` - Fetches audio status from DB
  - `generateAudio()` - Triggers audio generation
  - Hash validation on fetch
  - Integrity checks (hash mismatch → force regeneration)

### 5. Queue System Updated
- `lib/audioGenerationQueue.ts` - Now uses new API
- Removed localStorage storage (DB is source of truth)
- Still supports concurrency=2 and priority queuing

## 🔄 Remaining Tasks

### 1. Update Components to Use DB Status
**Files to update:**
- `app/(app)/practice/story/[id]/page.tsx` - Fetch audioStatus from DB instead of localStorage
- `app/(app)/practice/respond/page.tsx` - Fetch audioStatus from DB
- `components/ClipPlayer.tsx` - Use DB status

**Changes needed:**
- Replace `getClipAudioData()` calls with `getAudioMetadata()` from `lib/audioApi.ts`
- Remove localStorage as source of truth (keep only for caching if needed)
- Update all `audioStatus` state to come from DB

### 2. Remove Automatic Browser TTS Fallbacks
**Files to update:**
- `app/(app)/practice/respond/page.tsx` - Remove automatic `voiceMode='device'` fallback
- `components/ClipPlayer.tsx` - Remove automatic TTS fallback
- Keep device voice as **manual accessibility option only**

**Changes needed:**
- Remove all `audio.onerror` handlers that set `voiceMode='device'`
- Remove all `audio.play().catch()` handlers that switch to device voice
- Keep "Use device voice" button as explicit user choice

### 3. Environment Variables Required
Add to `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
BLOB_READ_WRITE_TOKEN=your_vercel_blob_token
OPENAI_API_KEY=your_openai_key
```

### 4. Run Migration
```bash
# Apply migration to Supabase
supabase migration up
# Or use Supabase dashboard to run the SQL
```

## 📋 Implementation Notes

### Hash Validation
- `transcript_hash` is computed using `generateTextHash()` from `lib/audioHash.ts`
- On fetch: if stored hash !== current hash → force `needs_generation`
- On generation: hash is stored with audio record

### Storage Structure
- Vercel Blob path: `audio/{user_id}/{clip_id}/{variant_key}.mp3`
- Signed URLs expire in 1 hour
- Public access for now (can be made private with signed URLs only)

### Status Flow
1. `needs_generation` → User triggers or auto-queued
2. `generating` → API sets this, queue processes
3. `ready` → Audio uploaded, URL available
4. `error` → Generation/upload failed (after retries)

### Authentication
- All API routes require Bearer token
- Client uses Supabase session token
- Server uses service role for DB operations

## 🚀 Next Steps

1. **Install dependencies:**
   ```bash
   npm install @supabase/supabase-js @vercel/blob
   ```

2. **Set up Supabase:**
   - Create project
   - Run migration SQL
   - Get URL and keys

3. **Set up Vercel Blob:**
   - Enable in Vercel dashboard
   - Get read/write token

4. **Update components** (see Remaining Tasks above)

5. **Test end-to-end:**
   - Story page loads clips
   - Audio generates on open
   - Hash validation works
   - No localStorage dependency

## ⚠️ Breaking Changes

- **localStorage is no longer source of truth** - All audio status comes from DB
- **No automatic TTS fallback** - Device voice is manual only
- **Authentication required** - All audio operations need auth
- **No filesystem writes** - All audio in Vercel Blob


