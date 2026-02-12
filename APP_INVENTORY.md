# Cue App - Full Inventory Report

## 1. Architecture Map

### Practice Selection Flow
- **Route**: `app/[locale]/(app)/practice/select/page.tsx`
- **Component**: `PracticeSelectPage`
- **Data Fetch**: 
  - `lib/storyClient.ts` → `loadUserStories()` (localStorage)
  - `lib/storyRotation.ts` → `getNextUncompletedStory()` (localStorage)
  - `lib/quickStartSummary.ts` → `loadQuickStartSummary()` (localStorage)
  - `app/api/clips/feed/route.ts` → `POST /api/clips/feed` (Supabase)
- **DB Tables**: `curated_clips` (via feed API), `clip_audio` (audio status)

### Practice Session Flow
- **Route**: `app/[locale]/(app)/practice/respond/page.tsx`
- **Component**: `RespondPageContent`
- **Data Fetch**:
  - Story/clip data from localStorage (`userStories`)
  - `app/api/audio/metadata/route.ts` → `GET /api/audio/metadata` (Supabase `clip_audio`)
  - `app/api/audio/generate/route.ts` → `POST /api/audio/generate` (OpenAI TTS + Vercel Blob)
- **DB Tables**: `clip_audio`, `curated_clips`

### Review/Feedback Flow
- **Route**: `app/[locale]/(app)/practice/review/page.tsx`
- **Component**: Review page
- **Data Fetch**:
  - `app/api/check-answer/route.ts` → `POST /api/check-answer` (alignment + pattern matching)
  - `app/api/insight/route.ts` → `POST /api/insight` (LLM feedback generation)
  - `app/api/chunk/route.ts` → `POST /api/chunk` (chunk meaning lookup)
- **DB Tables**: `listening_patterns`, `clip_pattern_spans`, `curated_clips` (via RPC)

### Progress Tracking
- **Route**: `app/[locale]/(app)/progress/page.tsx`
- **Component**: `ProgressPage`
- **Data Fetch**: localStorage only (`completedStories`, `streak`)
- **DB Tables**: NONE (all client-side)

### Chunk Dictionary
- **Route**: `app/[locale]/(app)/practice/review/page.tsx` (embedded)
- **Component**: `components/ChunkDictionary.tsx`
- **Data Fetch**: `app/api/chunk/route.ts` → `POST /api/chunk` → Supabase RPC `get_chunk_hit`
- **DB Tables**: `clip_pattern_spans`, `listening_patterns` (via RPC)

---

## 2. DB Schema Summary

### `clip_audio`
- **Primary Key**: `id` (UUID)
- **Important Columns**: 
  - `user_id` (FK to `auth.users`)
  - `clip_id` (TEXT)
  - `variant_key` (TEXT, default 'clean_normal')
  - `transcript`, `transcript_hash`
  - `voice_profile` (TEXT, default 'alloy')
  - `audio_status` (TEXT: 'needs_generation'|'generating'|'ready'|'error')
  - `blob_path` (TEXT, Vercel Blob URL)
- **Unique Constraint**: `(user_id, clip_id, variant_key)`
- **Foreign Keys**: `user_id` → `auth.users(id)`
- **Usage**: Stores TTS-generated audio metadata per user/clip/variant

### `listening_patterns`
- **Primary Key**: `id` (UUID)
- **Important Columns**:
  - `pattern_key` (TEXT, UNIQUE)
  - `focus` (TEXT, main word)
  - `words` (TEXT[], array of words in pattern)
  - `chunk_display` (TEXT)
  - `reduced_form` (TEXT)
  - `how_it_sounds` (TEXT)
  - `tip` (TEXT)
  - `meaning_general` (TEXT, Layer 1 meaning)
  - `meaning_approved` (TEXT, Layer 2 meaning)
  - `meaning_status` (TEXT: 'none'|'general'|'approved'|'revoked')
  - `is_active` (BOOLEAN)
  - `priority` (INTEGER)
- **Foreign Keys**: None
- **Usage**: Reusable pattern definitions (e.g., "want to" → "wanna") with meanings

### `clip_pattern_spans`
- **Primary Key**: `id` (UUID)
- **Important Columns**:
  - `clip_id` (TEXT, FK to `curated_clips.id`)
  - `pattern_key` (TEXT, FK to `listening_patterns.pattern_key`)
  - `ref_start` (INTEGER, character start position)
  - `ref_end` (INTEGER, character end position)
  - `word_start`, `word_end` (INTEGER, optional token indices)
  - `confidence` (TEXT: 'high'|'medium'|'low')
  - `approved` (BOOLEAN)
- **Foreign Keys**: `clip_id` → `curated_clips(id)`, `pattern_key` → `listening_patterns(pattern_key)`
- **Usage**: Per-clip pattern spans linking transcript positions to pattern definitions

### `curated_clips`
- **Status**: Referenced but schema NOT FOUND in migrations
- **Usage**: Main clip content table (transcripts, metadata)
- **Note**: Schema likely exists in Supabase but not in codebase migrations

### `pattern_candidates`
- **Primary Key**: `id` (UUID)
- **Important Columns**:
  - `phrase_text` (TEXT)
  - `candidate_kind` (TEXT: 'listening'|'semantic')
  - `frequency` (INTEGER)
  - `example_clip_ids` (TEXT[])
  - `status` (TEXT: 'new'|'accepted'|'rejected')
- **Usage**: Candidate phrases for pattern extraction (not yet approved)

---

## 3. Current Logic

### Today's Practice Selection

**Steps:**
1. Load stories from localStorage (`userStories`) via `lib/storyClient.ts::loadUserStories()`
2. If no userStories, fetch from `/api/clips/feed` (based on CEFR level from `quickStartSummary`)
3. Convert feed clips to stories via `lib/clipToStoryConverter.ts::convertClipsToStories()`
4. Select next uncompleted story via `lib/storyRotation.ts::getNextUncompletedStory()`
   - Reads `completedStories` array from localStorage
   - Filters out completed story IDs
   - Returns first uncompleted story
   - If all completed, clears localStorage and starts over
5. Check daily completion: `lastPracticeDate` in localStorage vs today's date
6. Display daily story card with completion status

**Where implemented:**
- `app/[locale]/(app)/practice/select/page.tsx` (lines 160-198)
- `lib/storyRotation.ts` (all functions)
- `lib/storyClient.ts` (loadUserStories, saveUserStories)
- `app/api/clips/feed/route.ts` (feed generation)

**Business Rules:**
- One story per day (rotation-based)
- Completion tracked in localStorage (`completedStories` array)
- No DB persistence for completion
- Streak calculated from localStorage (`streak` key)

### Explore Topics

**Status**: NOT FOUND
- No `/explore` route found
- No topic/category browsing UI found
- No topic-based filtering in feed API
- Topics exist only in onboarding (`app/[locale]/onboarding/topics/page.tsx`) but not as browseable content

**Gap**: Explore feature does not exist yet

### Progress Tracking

**Steps:**
1. Load `streak` from localStorage (integer)
2. Load `completedStories` from localStorage (array of story IDs)
3. Calculate `totalSessions` = `completedStories.length`
4. Estimate `listeningMinutes` = `totalSessions * 3 clips * 10 seconds / 60`
5. Display stats: minutes, sessions, streak, total clips

**Where implemented:**
- `app/[locale]/(app)/progress/page.tsx` (lines 13-46)
- All data from localStorage (no DB)

**Business Rules:**
- Streak: manual increment (not auto-calculated from dates)
- Sessions: count of completed stories
- No per-clip completion tracking
- No time-based accuracy metrics
- No topic-based progress breakdown

### Chunk Meaning Resolution

**Steps:**
1. User clicks word/span in transcript on review page
2. Calculate `charIdx` (character index) from clicked word position
3. Call `lib/chunkApi.ts::fetchChunkHit(clipId, charIdx)`
4. API route `app/api/chunk/route.ts` calls Supabase RPC `get_chunk_hit(p_clip_id, p_char_idx)`
5. RPC queries `clip_pattern_spans` for spans containing `charIdx`:
   - Find spans where `ref_start <= charIdx < ref_end`
   - Join with `listening_patterns` on `pattern_key`
   - Return first match with: `chunk_display`, `gloss`, `translation_ja`, `pattern_kind`, span range
6. Display in `components/ChunkDictionary.tsx` popover

**Where implemented:**
- `app/[locale]/(app)/practice/review/page.tsx` (click handler, charIdx calculation)
- `lib/chunkApi.ts` (client helper)
- `app/api/chunk/route.ts` (API route)
- Supabase RPC: `get_chunk_hit` (NOT FOUND in migrations, must exist in Supabase)

**Business Rules:**
- One meaning per span (first match wins)
- Meanings come from `listening_patterns.meaning_general` or `meaning_approved` (based on `meaning_status`)
- Spans are per-clip (not shared across clips)
- Pattern definitions are reusable (shared across clips)

### TTS/Audio

**Storage:**
- **Primary**: Vercel Blob Storage
  - Path: `audio/{userId}/{clipId}/{variantKey}.mp3`
  - Public URLs (no signed URLs needed)
- **Metadata**: Supabase `clip_audio` table
  - Stores `blob_path` (https URL to Vercel Blob)
  - Tracks `audio_status`, `voice_profile`, `variant_key`

**Generation Pipeline:**
1. Client calls `lib/audioApi.ts::generateAudio(clipId, transcript, variantKey)`
2. API route `app/api/audio/generate/route.ts`:
   - Checks existing audio in `clip_audio` table (by `user_id`, `clip_id`, `variant_key`)
   - If exists and hash matches, return existing `blob_path`
   - Otherwise, upsert row with `audio_status='generating'`
   - Call OpenAI TTS API (`openai.audio.speech.create()`)
   - Upload audio buffer to Vercel Blob Storage
   - Update `clip_audio` with `blob_path` and `audio_status='ready'`
3. Queue system: `lib/audioGenerationQueue.ts` (concurrency=2, priority queuing)

**Voice/Speed Selection:**
- **Voice**: Rotated from `['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']` (6 voices)
  - Selection: `voice = VOICES[hash(clipId + userId + day) % VOICES.length]`
  - Stored in `clip_audio.voice_profile`
- **Speed**: Based on `variant_key`:
  - `clean_slow`: 0.85x
  - `clean_normal`: 1.0x (default)
  - Speed applied via OpenAI TTS API `speed` parameter (if supported) or client `playbackRate`

**Where implemented:**
- `app/api/audio/generate/route.ts` (generation)
- `app/api/audio/stream/route.ts` (streaming, background upload)
- `app/api/audio/metadata/route.ts` (status lookup)
- `lib/audioApi.ts` (client helpers)
- `lib/audioGenerationQueue.ts` (queue system)

**Business Rules:**
- One audio per `(user_id, clip_id, variant_key)` combination
- Hash-based idempotency (same transcript hash = reuse existing audio)
- Voice randomized per clip but stable per day
- Speed controlled by `variant_key` (not user preference)

---

## 4. Gaps / Problems

### 1. Premium Gating for Explore
**Blockers:**
- Explore feature doesn't exist (no route/UI)
- No user subscription/tier table in DB
- No premium check middleware/helpers
- No topic-based content organization

**Required:**
- Create `user_subscriptions` table (tier, status, expires_at)
- Create `/explore` route with topic browsing
- Add premium check before topic access
- Organize clips by topic/category in DB

### 2. Canonical Chunk Meaning
**Blockers:**
- Meanings stored per-pattern (`listening_patterns.meaning_general/meaning_approved`)
- Multiple patterns can match same phrase (e.g., "want to" vs "going to")
- No canonical "phrase meaning" table
- `clip_pattern_spans` links to patterns, not canonical meanings

**Required:**
- Create `canonical_chunks` table (phrase_text, meaning, examples)
- Update `clip_pattern_spans` to reference canonical chunk
- Ensure one meaning per phrase across all clips
- Migration to map existing patterns to canonical chunks

### 3. Multi-Voice / Multi-Speed TTS
**Blockers:**
- Voice selection is deterministic (hash-based, not user choice)
- Speed only via `variant_key` (not runtime selection)
- No user preference storage for voice/speed
- Audio generated per variant, not per voice

**Required:**
- Add `user_preferences` table (preferred_voice, preferred_speed)
- Generate audio per `(clip_id, voice, speed)` combination
- Update `clip_audio` unique constraint to include `voice_profile`
- Add UI for voice/speed selection
- Regenerate audio when preferences change

### 4. Progress Tracking in DB
**Blockers:**
- All progress in localStorage (not persistent)
- No per-clip completion tracking
- No accuracy metrics
- No topic-based progress

**Required:**
- Create `user_progress` table (user_id, clip_id, completed_at, accuracy, attempts)
- Create `user_sessions` table (user_id, story_id, completed_at, clips_completed)
- Migrate localStorage data to DB
- Add progress aggregation queries

### 5. Story Completion Not Persisted
**Blockers:**
- Story completion only in localStorage
- No DB table for story completion
- Can't sync across devices
- No completion history

**Required:**
- Create `user_story_completions` table (user_id, story_id, completed_at)
- Update `lib/storyRotation.ts` to read from DB
- Add completion sync on login

---

## 5. Minimal Change Plan (Ship Fast)

### For Premium Gating Explore

**DB Changes:**
```sql
-- Migration: 010_add_user_subscriptions.sql
CREATE TABLE user_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'premium')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired')),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Migration: 011_add_topic_to_clips.sql
ALTER TABLE curated_clips ADD COLUMN IF NOT EXISTS topic TEXT;
CREATE INDEX IF NOT EXISTS idx_curated_clips_topic ON curated_clips(topic);
```

**API Changes:**
- `app/api/clips/feed/route.ts`: Add `topic` filter parameter
- `lib/supabase/server.ts`: Add `isPremiumUser(userId)` helper

**UI Changes:**
- Create `app/[locale]/(app)/explore/page.tsx` (topic grid)
- Add premium gate component
- Update navigation to include Explore link

### For Canonical Chunk Meaning

**DB Changes:**
```sql
-- Migration: 012_create_canonical_chunks.sql
CREATE TABLE canonical_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phrase_text TEXT NOT NULL UNIQUE,
  meaning TEXT NOT NULL,
  examples TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migration: 013_link_spans_to_canonical.sql
ALTER TABLE clip_pattern_spans ADD COLUMN IF NOT EXISTS canonical_chunk_id UUID REFERENCES canonical_chunks(id);
CREATE INDEX IF NOT EXISTS idx_spans_canonical ON clip_pattern_spans(canonical_chunk_id);
```

**API Changes:**
- `app/api/chunk/route.ts`: Update RPC to return canonical meaning
- Create migration script to map existing patterns to canonical chunks

**UI Changes:**
- `components/ChunkDictionary.tsx`: Display canonical meaning (no changes needed, just data)

### For Multi-Voice / Multi-Speed TTS

**DB Changes:**
```sql
-- Migration: 014_add_user_preferences.sql
CREATE TABLE user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  preferred_voice TEXT DEFAULT 'alloy',
  preferred_speed NUMERIC DEFAULT 1.0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migration: 015_update_clip_audio_constraint.sql
-- Drop old constraint, add voice to unique constraint
ALTER TABLE clip_audio DROP CONSTRAINT IF EXISTS clip_audio_user_id_clip_id_variant_key_key;
ALTER TABLE clip_audio ADD CONSTRAINT clip_audio_unique UNIQUE(user_id, clip_id, variant_key, voice_profile);
```

**API Changes:**
- `app/api/audio/generate/route.ts`: Read user preferences, generate per voice/speed
- `app/api/audio/metadata/route.ts`: Filter by user preferences

**UI Changes:**
- Add voice/speed selector in `components/ClipPlayer.tsx`
- Save preferences on change

### Data Migration Approach

1. **Progress Migration:**
   - Read localStorage on login
   - Upsert to `user_progress` and `user_sessions` tables
   - Keep localStorage as cache (read DB first, fallback to localStorage)

2. **Canonical Chunks Migration:**
   - Script: `scripts/migrateToCanonicalChunks.ts`
   - Group patterns by `chunk_display`
   - Create canonical entries
   - Update `clip_pattern_spans.canonical_chunk_id`

3. **Audio Regeneration:**
   - Not needed immediately (generate on-demand when user changes preferences)
   - Add background job later to pre-generate common voice/speed combinations

---

## Files Changed Summary

**Key Files:**
- `lib/storyRotation.ts` - Story completion logic (localStorage)
- `lib/storyClient.ts` - Story loading/saving (localStorage)
- `app/api/clips/feed/route.ts` - Feed generation (Supabase)
- `app/api/chunk/route.ts` - Chunk meaning lookup (RPC)
- `app/api/audio/generate/route.ts` - TTS generation (OpenAI + Vercel Blob)
- `app/[locale]/(app)/progress/page.tsx` - Progress display (localStorage only)
- `components/ChunkDictionary.tsx` - Chunk meaning UI

**Missing Files:**
- Explore route/page (NOT FOUND)
- User subscriptions table (NOT FOUND)
- Canonical chunks table (NOT FOUND)
- User preferences table (NOT FOUND)
- Progress DB tables (NOT FOUND)
- `get_chunk_hit` RPC function definition (NOT FOUND in migrations)
