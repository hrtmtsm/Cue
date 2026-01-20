# Curated Content Pivot - Minimal Refactor Plan

## Overview

Pivot from AI-generated content to curated content while keeping `alignmentEngine` and `practiceSteps` intact. Replace `/api/clips/generate` with diagnostic flow using fixed curated clips, then serve adaptive feed based on diagnostic results.

---

## 1. Proposed DB Schema

### Table 1: `curated_clips`

Stores pre-created clips that replace AI generation.

```sql
CREATE TABLE curated_clips (
  id TEXT PRIMARY KEY,                    -- e.g., 'diagnostic-1', 'practice-abc-123'
  transcript TEXT NOT NULL,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  focus TEXT[] NOT NULL,                  -- e.g., ['connected_speech', 'speed']
  situation TEXT,                         -- e.g., 'Daily Life', 'Work'
  target_style TEXT,                      -- e.g., 'Everyday conversations'
  length_sec INTEGER NOT NULL,
  clip_type TEXT NOT NULL DEFAULT 'practice' CHECK (clip_type IN ('diagnostic', 'practice')),
  metadata JSONB,                         -- Flexible storage for any extra data
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_curated_clips_type ON curated_clips(clip_type);
CREATE INDEX idx_curated_clips_difficulty ON curated_clips(difficulty);
CREATE INDEX idx_curated_clips_focus ON curated_clips USING GIN(focus);
```

**Key columns:**
- `id`: Unique identifier (can be human-readable like 'diagnostic-1')
- `clip_type`: `'diagnostic'` for fixed diagnostic set, `'practice'` for regular practice clips
- `focus`: Array of listening pattern focus areas (same format as existing `Clip.focus`)

### Table 2: `clip_pattern_spans`

Pre-annotated spans for each clip, marking where listening patterns appear.

```sql
CREATE TABLE clip_pattern_spans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id TEXT NOT NULL REFERENCES curated_clips(id) ON DELETE CASCADE,
  pattern_key TEXT NOT NULL REFERENCES listening_patterns(pattern_key),
  ref_start INTEGER NOT NULL,             -- Token start index in transcript
  ref_end INTEGER NOT NULL,               -- Token end index (exclusive)
  span_type TEXT NOT NULL DEFAULT 'pattern' CHECK (span_type IN ('pattern', 'chunk', 'weak_form')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_clip_pattern_spans_clip ON clip_pattern_spans(clip_id);
CREATE INDEX idx_clip_pattern_spans_pattern ON clip_pattern_spans(pattern_key);
```

**Purpose:** 
- Pre-mark where patterns like "gonna", "wanna" appear in each clip
- Enables `practiceSteps` to use pre-annotated data instead of runtime pattern matching (optional optimization)
- Can be populated manually or via a curation tool

**Usage in `practiceSteps`:**
- If `clip_pattern_spans` exists for a clip, use it to skip pattern matching
- Otherwise, fall back to existing runtime pattern matching (no breaking changes)

### Table 3: `diagnostic_results`

Stores user's diagnostic test results for adaptive feed selection.

```sql
CREATE TABLE diagnostic_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  clip_id TEXT NOT NULL REFERENCES curated_clips(id),
  accuracy_percent INTEGER NOT NULL CHECK (accuracy_percent >= 0 AND accuracy_percent <= 100),
  alignment_events JSONB NOT NULL,        -- Full alignment result from /api/check-answer
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_diagnostic_results_user ON diagnostic_results(user_id);
CREATE INDEX idx_diagnostic_results_clip ON diagnostic_results(clip_id);

-- Unique: one result per user per diagnostic clip
CREATE UNIQUE INDEX idx_diagnostic_results_user_clip ON diagnostic_results(user_id, clip_id);
```

**Purpose:**
- Store diagnostic test responses (fixed 3-5 clips all users take)
- Used by `/api/clips/feed` to select appropriate practice clips
- Alignment events stored for analysis without re-running alignment

### Existing Tables (Keep As-Is)

- **`clip_audio`**: Keep existing schema. Pre-populate with audio for all `curated_clips`.
- **`listening_patterns`**: No changes needed.

---

## 2. New API Routes & Responsibilities

### Route 1: `GET /api/clips/diagnostic`

**Replaces:** Onboarding completion call to `/api/clips/generate`

**Returns:** Fixed set of 3-5 diagnostic clips (same for all users).

```typescript
// Response shape (matches existing Clip type for compatibility)
{
  clips: Clip[]  // Same shape as /api/clips/generate response
}
```

**Implementation:**
```typescript
// app/api/clips/diagnostic/route.ts
export async function GET(request: NextRequest) {
  const supabase = getSupabaseAdminClient()
  
  // Fetch fixed diagnostic clips (clip_type='diagnostic')
  const { data: clips, error } = await supabase
    .from('curated_clips')
    .select('*')
    .eq('clip_type', 'diagnostic')
    .order('id')  // Consistent ordering
  
  if (error) throw error
  
  // Transform to Clip[] format (matches existing structure)
  const clipsFormatted = clips.map(c => ({
    id: c.id,
    text: c.transcript,
    difficulty: c.difficulty,
    focus: c.focus,
    situation: c.situation,
    lengthSec: c.length_sec,
    // Audio URL comes from clip_audio table (pre-generated)
  }))
  
  return NextResponse.json({ clips: clipsFormatted })
}
```

**Audio handling:** Diagnostic clips have pre-generated audio in `clip_audio` table. Client uses existing audio loading flow (`getAudioMetadata`).

### Route 2: `POST /api/diagnostic/submit`

**Purpose:** Store diagnostic test results.

**Request:**
```typescript
{
  clipId: string,
  userText: string,
  transcript: string,
  alignmentResult: { ... }  // Result from /api/check-answer
}
```

**Response:**
```typescript
{
  success: boolean,
  diagnosticResultId: string
}
```

**Implementation:**
- Calls `/api/check-answer` internally (or receives pre-computed alignment)
- Stores result in `diagnostic_results` table
- Returns success/failure

### Route 3: `GET /api/clips/feed`

**Purpose:** Returns adaptive feed of practice clips based on diagnostic results.

**Query params:**
- `limit?: number` (default: 10)
- `difficulty?: 'easy' | 'medium' | 'hard'` (optional filter)

**Returns:** Array of practice clips filtered by diagnostic results.

**Selection logic:**
1. If user has diagnostic results:
   - Find clips where user struggled (low accuracy on similar patterns)
   - Prefer clips with `focus` arrays that match struggling areas
   - Filter by difficulty if user performed better/worse on certain levels
2. If no diagnostic results (fallback):
   - Return default practice clips (medium difficulty, common focus areas)

**Implementation:**
```typescript
// app/api/clips/feed/route.ts
export async function GET(request: NextRequest) {
  const userId = await resolveUserId(request)
  const { searchParams } = new URL(request.url)
  const limit = parseInt(searchParams.get('limit') || '10', 10)
  
  const supabase = getSupabaseAdminClient()
  
  // Get user's diagnostic results
  const { data: diagnosticResults } = await supabase
    .from('diagnostic_results')
    .select('*')
    .eq('user_id', userId.userId)
  
  let clipsQuery = supabase
    .from('curated_clips')
    .select('*')
    .eq('clip_type', 'practice')
    .limit(limit)
  
  // Adaptive filtering based on diagnostic results
  if (diagnosticResults && diagnosticResults.length > 0) {
    // Extract struggling focus areas (e.g., accuracy < 70%)
    const strugglingAreas = diagnosticResults
      .filter(r => r.accuracy_percent < 70)
      .flatMap(r => {
        // Extract focus areas from clips (would need clip lookup)
        return [] // Simplified - would extract from clip metadata
      })
    
    // Filter clips by struggling areas (if any)
    if (strugglingAreas.length > 0) {
      clipsQuery = clipsQuery.contains('focus', strugglingAreas)
    }
  }
  
  const { data: clips } = await clipsQuery
  
  // Transform and return (same format as diagnostic)
  return NextResponse.json({ clips: clips.map(formatClip) })
}
```

### Route 4: Keep `/api/clips/generate` (Deprecated, Fallback)

**Option A:** Remove entirely (breaking change, but clean).

**Option B:** Keep as fallback, add deprecation warning:
```typescript
// app/api/clips/generate/route.ts
export async function POST(request: NextRequest) {
  console.warn('⚠️ /api/clips/generate is deprecated. Use /api/clips/diagnostic instead.')
  // Return error or fallback to old behavior
  return NextResponse.json(
    { error: 'This endpoint is deprecated. Use /api/clips/diagnostic instead.' },
    { status: 410 } // Gone
  )
}
```

---

## 3. Data Flow

### Flow A: Diagnostic (Onboarding)

```
1. User completes onboarding (topics/level selection)
   ↓
2. Frontend: app/onboarding/ready/page.tsx calls GET /api/clips/diagnostic
   ↓
3. API returns fixed 3-5 diagnostic clips (same for all users)
   ↓
4. Frontend navigates to diagnostic test page (new: /onboarding/diagnostic)
   OR
   Frontend reuses /practice/respond with special "diagnostic" mode
   ↓
5. User practices each diagnostic clip:
   - Audio loads from clip_audio (pre-generated)
   - User types answer
   - Frontend calls POST /api/check-answer (unchanged)
   - Frontend calls POST /api/diagnostic/submit with result
   ↓
6. After all diagnostic clips completed:
   - Diagnostic results stored in diagnostic_results table
   - Frontend navigates to /practice/select (now shows adaptive feed)
```

### Flow B: Adaptive Feed (Post-Diagnostic)

```
1. User navigates to /practice/select
   ↓
2. Frontend calls GET /api/clips/feed?limit=10
   ↓
3. API queries diagnostic_results for user
   ↓
4. API filters curated_clips based on:
   - Struggling focus areas (low accuracy on specific patterns)
   - Difficulty preferences (based on diagnostic performance)
   ↓
5. API returns filtered practice clips
   ↓
6. Frontend displays clips/stories (converted via existing clipToStoryConverter)
   ↓
7. User practices clips (existing flow unchanged):
   - /practice/respond → /practice/review → /practice/[clipId]/practice
```

### Flow C: Audio Loading (Pre-Generated)

```
1. User accesses clip (diagnostic or practice)
   ↓
2. Frontend calls getAudioMetadata(clipId, transcript)
   ↓
3. API checks clip_audio table:
   - If exists and status='ready': return blob URL immediately
   - If missing: trigger /api/audio/generate (fallback for new clips)
   ↓
4. Audio plays (no waiting for generation)
```

**Pre-population strategy:**
- Run script: `npm run seed:audio` (new script)
- Script reads all `curated_clips`, generates audio via `/api/audio/generate`
- Stores in `clip_audio` table with `user_id` = system user (or public user)

---

## 4. Migration Plan (5 Steps)

### Step 1: Create Database Tables (Non-Breaking)

**File:** `supabase/migrations/009_create_curated_content.sql`

```sql
-- Create curated_clips table
CREATE TABLE curated_clips (...);

-- Create clip_pattern_spans table
CREATE TABLE clip_pattern_spans (...);

-- Create diagnostic_results table
CREATE TABLE diagnostic_results (...);
```

**Run:**
```bash
supabase db push --linked
```

**Impact:** Zero (tables empty, no existing code references them yet)

---

### Step 2: Seed Diagnostic Clips (Non-Breaking)

**File:** `scripts/seedDiagnosticClips.ts`

```typescript
// Manually curated set of 3-5 diagnostic clips
const diagnosticClips = [
  {
    id: 'diagnostic-1',
    transcript: 'I\'m gonna grab some coffee before the meeting.',
    difficulty: 'easy',
    focus: ['connected_speech'],
    situation: 'Work',
    target_style: 'Everyday conversations',
    length_sec: 12,
    clip_type: 'diagnostic',
  },
  {
    id: 'diagnostic-2',
    transcript: 'We should have thought about this earlier, but it\'s kinda late now.',
    difficulty: 'medium',
    focus: ['connected_speech', 'reductions'],
    situation: 'Daily Life',
    length_sec: 15,
    clip_type: 'diagnostic',
  },
  // ... 1-3 more
]

// Upsert to curated_clips table
```

**Run:**
```bash
npm run seed:diagnostic
```

**Impact:** Zero (diagnostic API route not created yet)

---

### Step 3: Create New API Routes (Backward Compatible)

**Files:**
- `app/api/clips/diagnostic/route.ts` (new)
- `app/api/clips/feed/route.ts` (new)
- `app/api/diagnostic/submit/route.ts` (new)

**Keep:** `/api/clips/generate` unchanged (still works for existing users)

**Impact:** Minimal (new routes don't affect existing flow)

---

### Step 4: Pre-Generate Audio for Diagnostic Clips (Background)

**File:** `scripts/preGenerateDiagnosticAudio.ts`

```typescript
// For each diagnostic clip:
// 1. Call /api/audio/generate with clip transcript
// 2. Wait for audio_status='ready'
// 3. Verify blob_path exists
```

**Run:**
```bash
npm run seed:diagnostic-audio
```

**Impact:** Zero (just populates `clip_audio` table)

---

### Step 5: Update Frontend (Feature Flag for Gradual Rollout)

**File:** `app/onboarding/ready/page.tsx`

**Before:**
```typescript
// Call /api/clips/generate
const response = await fetch('/api/clips/generate', { ... })
```

**After:**
```typescript
// Feature flag: use diagnostic if enabled
const USE_DIAGNOSTIC = process.env.NEXT_PUBLIC_USE_DIAGNOSTIC === 'true'

if (USE_DIAGNOSTIC) {
  // New flow: diagnostic
  const response = await fetch('/api/clips/diagnostic')
  const { clips } = await response.json()
  
  // Store diagnostic clips in localStorage
  localStorage.setItem('diagnosticClips', JSON.stringify(clips))
  
  // Navigate to diagnostic test (new page)
  router.push('/onboarding/diagnostic')
} else {
  // Old flow: generation (still works)
  const response = await fetch('/api/clips/generate', { ... })
  // ... existing code
}
```

**New Page:** `app/onboarding/diagnostic/page.tsx`
- Displays diagnostic clips one-by-one
- After completion, calls `/api/diagnostic/submit` for each
- Then navigates to `/practice/select` (which now uses `/api/clips/feed`)

**Impact:** Zero if feature flag is `false` (default). Can enable gradually.

---

## 5. Minimal Changes Summary

### Files to Create:
1. `supabase/migrations/009_create_curated_content.sql` (3 tables)
2. `app/api/clips/diagnostic/route.ts` (replaces generation for onboarding)
3. `app/api/clips/feed/route.ts` (adaptive feed)
4. `app/api/diagnostic/submit/route.ts` (store results)
5. `scripts/seedDiagnosticClips.ts` (seed 3-5 diagnostic clips)
6. `scripts/preGenerateDiagnosticAudio.ts` (pre-generate audio)
7. `app/onboarding/diagnostic/page.tsx` (diagnostic test UI)

### Files to Modify:
1. `app/onboarding/ready/page.tsx` (add feature flag, route to diagnostic)
2. `app/(app)/practice/select/page.tsx` (call `/api/clips/feed` instead of localStorage)

### Files to Keep Unchanged:
- ✅ `lib/alignmentEngine.ts` (no changes)
- ✅ `lib/practiceSteps.ts` (no changes, optionally uses `clip_pattern_spans` if available)
- ✅ `lib/listeningPatternMatcher.ts` (no changes)
- ✅ `app/api/check-answer/route.ts` (no changes)
- ✅ `components/PhraseCard.tsx` (no changes)

---

## 6. Rollout Strategy

### Phase 1: Infrastructure (Week 1)
- Step 1: Create tables
- Step 2: Seed diagnostic clips
- Step 3: Pre-generate audio

### Phase 2: API Routes (Week 1)
- Step 4: Create new API routes
- Test with Postman/curl

### Phase 3: Frontend (Week 2)
- Step 5: Add feature flag
- Build diagnostic page
- Update practice/select to use feed API

### Phase 4: Gradual Rollout
- Enable feature flag for 10% of users
- Monitor errors, performance
- Increase to 50%, then 100%

### Phase 5: Cleanup (Week 3)
- Remove `/api/clips/generate` (or keep as fallback)
- Remove feature flag
- Remove old localStorage clip storage

---

## 7. Benefits

1. **Pre-generated audio:** No TTS latency on first clip access
2. **Consistent diagnostic:** All users take same test for fair comparison
3. **Adaptive feed:** Practice clips tailored to user's weaknesses
4. **Maintainable:** Curated content easier to quality-control than AI generation
5. **No breaking changes:** Existing `alignmentEngine` and `practiceSteps` untouched

---

## 8. Future Enhancements (Out of Scope)

- Admin UI for curating clips
- Automated pattern span annotation tool
- A/B testing different diagnostic sets
- User-specific clip recommendations based on practice history

