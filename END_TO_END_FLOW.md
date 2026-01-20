# Cue - End-to-End Flow Documentation

## 1. Overview

Cue is a Next.js 14 (App Router) mobile-first English listening practice app. Users practice listening comprehension through generated audio clips embedded in "stories" (sequences of 3-5 clips). The app generates content on-the-fly using OpenAI GPT-4o-mini for transcript generation and OpenAI TTS (tts-1) for audio synthesis. All audio is stored in Vercel Blob Storage, with metadata tracked in Supabase PostgreSQL. Practice sessions are analyzed using deterministic token-level alignment algorithms to provide granular feedback on missed words, spelling errors, and listening pattern difficulties. User progress and preferences are stored in localStorage (client-side state) with plans for Supabase-backed persistence. The app follows a trust-first philosophy: feedback explanations are only shown when patterns are confidently matched from a database of listening patterns, preventing incorrect or generic explanations.

---

## 2. Step-by-Step User Journey (Happy Path)

### Phase 1: Onboarding (3 steps)

**Step 1: Topic Selection** (`app/onboarding/topics/page.tsx`)
- User selects multiple listening difficulty topics
- Stored in `localStorage` via `lib/onboardingStore.ts`

**Step 2: Level Selection** (`app/onboarding/level/page.tsx`)
- User selects listening level
- Appends to onboarding data in localStorage

**Step 3: Ready Screen** (`app/onboarding/ready/page.tsx`)
- User clicks "Start practicing"
- Triggers `/api/clips/generate` POST request
  - **On-the-fly generation**: OpenAI GPT-4o-mini generates 3 transcripts (easy/medium/hard)
  - **On-the-fly generation**: OpenAI TTS generates 3 audio files (one per transcript)
  - Audio uploaded to Vercel Blob Storage
  - Clips saved to `localStorage` as `userClips`
  - Clips converted to Stories via `lib/clipToStoryConverter.ts` (groups clips by situation, 5 clips per story)
  - Stories saved to `localStorage` as `userStories`
- Redirects to `/practice/select`

### Phase 2: Practice Selection

**Step 4: Story Selection** (`app/(app)/practice/select/page.tsx`)
- Loads stories from `localStorage` (`userStories`) or falls back to mock data
- User selects a story
- Redirects to story detail page: `/practice/story/[id]`

**Step 5: Story Detail** (`app/(app)/practice/story/[id]/page.tsx`)
- Displays story title, clips list
- User clicks a clip → redirects to `/practice/respond?storyId=X&clipId=Y`

### Phase 3: Listening & Responding

**Step 6: Respond Page** (`app/(app)/practice/respond/page.tsx`)
- **Audio Loading Flow**:
  1. Component mounts with `audioStatus='needs_generation'`
  2. Calls `getAudioMetadata(clipId, transcript)` → `lib/audioApi.ts` → `GET /api/audio/metadata`
  3. API checks Supabase `clip_audio` table for existing audio
  4. If found and `status='ready'`, uses existing blob URL
  5. If not found or `status='generating'`, triggers audio generation:
     - Calls `generateAudio(clipId, transcript)` → `POST /api/audio/generate`
     - **On-the-fly generation**: OpenAI TTS (`tts-1` model, `alloy` voice) generates audio
     - Audio uploaded to Vercel Blob Storage
     - Row updated in Supabase `clip_audio` table (`status='ready'`, `blob_path` set)
     - Client polls `/api/audio/metadata` every 1s until `status='ready'`
  6. Audio URL loaded into `<audio>` element
- User listens to audio (can replay, slow down, loop)
- User types their response in textarea
- User clicks "Check Answer" → redirects to `/practice/review?storyId=X&clipId=Y&userText=...`

### Phase 4: Feedback & Analysis

**Step 7: Check Answer** (`app/api/check-answer/route.ts`)
- Receives `userText` and `transcript`
- **On-the-fly generation**: Token-level alignment via `lib/alignmentEngine.ts`
  - Uses dynamic programming (Levenshtein) to align reference vs user tokens
  - Produces alignment events: `correct`, `wrong`, `missing`, `extra`
- **On-the-fly generation**: Phrase spans attached via `lib/phraseSpans.ts`
- Calculates `accuracyPercent` (correct tokens / total tokens)
- Returns JSON: `{ accuracyPercent, events, tokens, refTokens, userTokens }`

**Step 8: Review Page** (`app/(app)/practice/review/page.tsx`)
- Receives alignment data from check-answer API
- **On-the-fly generation**: Practice steps generated via `lib/practiceSteps.ts`
  - For each alignment event, extracts feedback items:
    - Category detection (`weak_form`, `spelling`, `missed`, `linking`, etc.)
    - Pattern matching against `listening_patterns` database
    - Meaning extraction (Layer 1: `meaning_general`, Layer 2: `meaning_approved`)
    - Parent pattern fallback (if child has no meaning but parent does)
    - Sound rule generation (`howItSounds`, `tip`)
    - Chunk synthesis (for missing function words like "to", "the")
- **On-the-fly generation**: Coaching insights via `lib/reviewSummary.ts`
  - Picks top issue category from alignment events
  - Generates summary text with example phrases
- Displays accuracy %, top coaching insight, practice steps list
- User clicks practice step → opens `PhraseCard` component with detailed feedback
- User clicks "Continue" → redirects to `/practice/[clipId]/practice` for phrase-by-phrase practice

**Step 9: Phrase Practice** (`app/(app)/practice/[clipId]/practice/page.tsx`)
- Loads phrase-by-phrase practice session
- User practices individual phrases with feedback
- Progress tracked in `localStorage` via `lib/clipLessonProgress.tsx`

---

## 3. On-the-Fly Generation Points

1. **Transcript Generation** (`app/api/clips/generate/route.ts`)
   - When: Onboarding completion
   - How: OpenAI GPT-4o-mini (`gpt-4o-mini` model, `temperature=0.8`)
   - Input: Clip profile (difficulty, topic, situation)
   - Output: Natural English sentence (10-20 words)

2. **Audio Generation** (`app/api/audio/generate/route.ts`)
   - When: First time a clip is accessed, or if audio not found in DB
   - How: OpenAI TTS (`tts-1` model, `alloy` voice)
   - Input: Transcript text
   - Output: MP3 audio file → uploaded to Vercel Blob Storage
   - Storage: Supabase `clip_audio` table tracks status and blob path

3. **Text Alignment** (`lib/alignmentEngine.ts` → `app/api/check-answer/route.ts`)
   - When: User submits answer
   - How: Dynamic programming (Levenshtein distance) token alignment
   - Input: Reference transcript, user input
   - Output: Alignment events (correct/wrong/missing/extra) with token indices

4. **Feedback Generation** (`lib/practiceSteps.ts`)
   - When: Review page loads with alignment events
   - How: Deterministic pattern matching against `listening_patterns` database
   - Input: Alignment events, reference tokens, user tokens, listening patterns
   - Output: Practice steps with categorized feedback (meaning, sound rules, tips)

5. **Coaching Insights** (`lib/reviewSummary.ts`)
   - When: Review page loads
   - How: Statistical analysis of alignment events (no LLM)
   - Input: Alignment events
   - Output: Top issue category and summary text

6. **Story Grouping** (`lib/clipToStoryConverter.ts`)
   - When: Onboarding completion (after clip generation)
   - How: Groups clips by `situation`, splits into stories (5 clips per story)
   - Input: Array of clips
   - Output: Array of stories

---

## 4. Architecture Map

### Frontend Pages (Next.js App Router)

- **Landing**: `app/page.tsx` → Intro screen
- **Onboarding**: 
  - `app/onboarding/topics/page.tsx` → Topic selection
  - `app/onboarding/level/page.tsx` → Level selection
  - `app/onboarding/ready/page.tsx` → Onboarding completion, clip generation trigger
- **Practice**:
  - `app/(app)/practice/select/page.tsx` → Story selection
  - `app/(app)/practice/story/[id]/page.tsx` → Story detail
  - `app/(app)/practice/respond/page.tsx` → Audio playback + text input
  - `app/(app)/practice/review/page.tsx` → Feedback display
  - `app/(app)/practice/[clipId]/practice/page.tsx` → Phrase-by-phrase practice

### API Routes (Server-side)

- `app/api/clips/generate/route.ts` → OpenAI GPT-4o-mini transcript generation + TTS audio generation
- `app/api/audio/generate/route.ts` → OpenAI TTS audio generation (standalone)
- `app/api/audio/metadata/route.ts` → Supabase query for audio status
- `app/api/audio/url/route.ts` → Signed Vercel Blob URL generation
- `app/api/check-answer/route.ts` → Text alignment algorithm
- `app/api/listening-patterns/route.ts` → Supabase query for listening patterns (with parent pattern joins)

### Core Libraries

- **Alignment & Feedback**:
  - `lib/alignmentEngine.ts` → Levenshtein-based token alignment
  - `lib/practiceSteps.ts` → Feedback item generation from alignment events
  - `lib/listeningPatternMatcher.ts` → Pattern matching against database
  - `lib/accuracyCalculator.ts` → Accuracy score calculation (0..1)
- **Audio**:
  - `lib/audioApi.ts` → Client-side audio API wrappers
  - `lib/audioGenerationQueue.ts` → Queue for concurrent audio generation (concurrency=2)
  - `lib/audioHash.ts` → Transcript hash generation for idempotency
- **Content Generation**:
  - `lib/clipToStoryConverter.ts` → Clip-to-story conversion
  - `lib/clipProfileMapper.ts` → Onboarding → clip profile mapping
  - `lib/clipGenerationParams.ts` → Speech rate and focus parameter calculation
- **State Management**:
  - `lib/onboardingStore.ts` → Onboarding data (localStorage)
  - `lib/storyClient.ts` → Story loading/saving (localStorage)
  - `lib/userPreferences.ts` → Listening profile and practice events (localStorage)
  - `lib/clipLessonProgress.tsx` → Practice session progress (localStorage)
- **Coaching**:
  - `lib/reviewSummary.ts` → Top issue selection and summary generation
  - `lib/coachingInsights.ts` → (Legacy) OpenAI-based insight generation (unused in current flow)

### Database (Supabase PostgreSQL)

- **`clip_audio`** table (`supabase/migrations/001_create_clip_audio.sql`)
  - Stores audio metadata: `clip_id`, `transcript`, `transcript_hash`, `variant_key`, `audio_status`, `blob_path`, `user_id`
  - Indexed on `(user_id, clip_id, variant_key, transcript_hash)` for idempotency
- **`listening_patterns`** table (`supabase/migrations/002_create_listening_patterns.sql`)
  - Stores listening patterns: `pattern_key`, `words[]`, `chunk_display`, `reduced_form`, `meaning_general`, `meaning_approved`, `parent_pattern_key`
  - Self-referencing foreign key: `parent_pattern_key` → `pattern_key`
  - Indexed on `pattern_key` (unique), `parent_pattern_key`

### External Services

- **OpenAI API**:
  - GPT-4o-mini: Transcript generation (`/api/clips/generate`)
  - TTS (tts-1): Audio synthesis (`/api/audio/generate`)
- **Vercel Blob Storage**: Audio file storage (public access)
- **Supabase**: PostgreSQL database, authentication (planned but not fully integrated)

### Client State (localStorage)

- `onboardingData` → User onboarding selections
- `userClips` → Generated clips array
- `userStories` → Stories converted from clips
- `userPreferences` → Listening profile (confidence, tolerances)
- `practiceEvents` → Practice session history (accuracy, replays, time)
- `clipLessonProgress` → Current practice session progress

### Components

- `components/PhraseCard.tsx` → Individual phrase feedback card (3-layer meaning system)
- `components/AudioWaveLine.tsx` → Audio waveform visualization
- `components/ClipPlayer.tsx` → Audio playback controls
- `components/ClipTopBar.tsx` → Clip header with title
- `components/PracticeProgress.tsx` → Progress bar for practice sessions

---

## 5. Known Fragility / TODOs

### Fragility Points

1. **Audio Generation Latency**
   - Issue: First-time audio generation requires OpenAI TTS call (~2-5s)
   - Mitigation: Client polls `/api/audio/metadata` every 1s until ready
   - Risk: User waits on "generating" state if TTS fails or times out

2. **localStorage as Source of Truth**
   - Issue: User stories and clips stored only in browser localStorage
   - Risk: Data lost if localStorage cleared or user switches devices
   - TODO: Migrate to Supabase-backed storage with user authentication

3. **Spelling Detection Logic**
   - Issue: Spelling category requires `actualSpan` to contain user input, but placeholder "(not heard)" can break detection
   - Recent Fix: Prioritized `userTokens` extraction over `event.actualSpan`
   - Risk: Still fragile if `userStart`/`userEnd` indices are incorrect

4. **Pattern Matching Trust Gate**
   - Issue: Content-word guard prevents incorrect weak-form explanations, but relies on function word detection
   - Risk: False positives if function word set is incomplete

5. **Audio Status Polling**
   - Issue: Client polls every 1s for audio readiness (inefficient)
   - TODO: Implement WebSocket or server-sent events for real-time status updates

6. **Transcript Hash Idempotency**
   - Issue: Audio generation uses transcript hash to avoid duplicates, but hash collisions theoretically possible
   - Mitigation: Combined with `(user_id, clip_id, variant_key)` ensures uniqueness per user/clip/variant

### TODO Items (From Code Audit)

1. **Authentication Integration** (`app/page.tsx:11`)
   - TODO: Replace placeholder auth check with Supabase auth

2. **Feedback Page Redirection** (`app/(app)/practice/feedback/page.tsx:113`)
   - TODO: Remove redirect stub; feedback flow moved to review page

3. **Audio Refactor Status** (`AUDIO_REFACTOR_STATUS.md`)
   - TODO: Remove automatic browser TTS fallbacks
   - TODO: Update components to use DB status exclusively (remove localStorage audio cache)

4. **Story Generation** (`STORY_GENERATION_ANALYSIS.md`)
   - TODO: Generate 15-24 clips instead of 3 to produce 5-8 stories
   - Current: 3 clips → 1 story (suboptimal user experience)

5. **Meaning Layer System**
   - TODO: Seed more `meaning_general` values for common patterns
   - Current: Only 9 patterns have general meanings (gonna, wanna, gotta, etc.)

6. **Debug Logging**
   - Multiple files contain `process.env.NODE_ENV === 'development'` debug logs
   - TODO: Consolidate or remove for production

7. **Parent Pattern Fallback**
   - Recent fix: Added parent pattern lookup for spelling cases
   - TODO: Verify parent fallback works for all categories (not just spelling)

### Architecture Debt

1. **Mock Data Fallbacks**
   - `mockStoryData.ts`, `mockPracticeData` in multiple files
   - Risk: Mock data may be used in production if localStorage/DB fails
   - TODO: Remove mock data, add proper error handling

2. **Audio Queue Concurrency**
   - Current: Hardcoded `concurrency=2` in `audioGenerationQueue.ts`
   - TODO: Make configurable or scale based on user plan

3. **Supabase Client Initialization**
   - Placeholder clients created if env vars missing (`lib/supabase/server.ts:22`)
   - Risk: Silent failures if Supabase not configured
   - TODO: Fail fast with clear error messages

4. **Progress Tracking**
   - Multiple progress tracking mechanisms (`clipLessonProgress.tsx`, `userPreferences.ts`)
   - TODO: Unify into single source of truth


