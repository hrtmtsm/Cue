# Practice Page Architecture & Error Handling

This document provides a comprehensive overview of the practice page components, clip data fetching, validation logic, database schema, and navigation flow.

---

## 1. Practice Page Component - "Practice not available" Error

### Location
**File**: `app/[locale]/(app)/practice/respond/page.tsx`

### Error Display Component
```typescript
{/* Story/clip validation error */}
{errorMessage && errorMessage.includes('not available') && (
  <div className="p-4 bg-red-50 border border-red-200 rounded-lg space-y-3">
    <div className="flex items-start gap-2">
      <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="text-body-small text-red-800 font-medium">Practice not available</p>
        <p className="text-xs text-red-700 mt-1">{errorMessage}</p>
      </div>
    </div>
    <Link
      href={storyId ? `/${locale}/practice/story/${storyId}` : `/${locale}/practice/select`}
      className="block w-full py-2 px-4 bg-blue-600 text-white rounded-lg font-medium text-center active:bg-blue-700 transition-colors"
    >
      {storyId ? 'Back to Story' : 'Back to Practice'}
    </Link>
  </div>
)}
```

**Lines**: 1758-1775

### Error Trigger Points

#### A) Story Not Found in DB (Lines 556-563)
```typescript
if (storyId && storyClipId) {
  const { story } = getStoryByIdClientDbOnly(storyId)
  if (!story) {
    // Story not found in DB - show error
    setErrorMessage('This story is not available. Please select a different practice.')
    setUiPhase('error')
  }
}
```

#### B) Clip Missing dbClipId (Lines 544-555)
```typescript
if (clip && !clip.dbClipId) {
  // Clip exists but missing dbClipId - show error
  setErrorMessage('This clip is not available. Please select a different practice.')
  setUiPhase('error')
}
```

#### C) Validation Before Navigation (Lines 1611-1635)
```typescript
const handleCheckAnswer = (e?: React.MouseEvent) => {
  // ... input validation ...
  
  if (storyId && storyClipId) {
    // Validate story and clip before navigation
    const { story } = getStoryByIdClientDbOnly(storyId)
    if (!story) {
      setErrorMessage('This story is not available. Please select a different practice.')
      return
    }
    
    const clip = story.clips.find(c => c.id === storyClipId)
    if (!clip) {
      setErrorMessage('This clip is not available. Please select a different practice.')
      return
    }
    
    if (!clip.dbClipId) {
      setErrorMessage('This clip is not available. Please select a different practice.')
      return
    }
    
    // Proceed with navigation only if valid
  }
}
```

---

## 2. Code That Fetches Clip Data for Practice Session

### A) API Endpoint: Fetch User Clips
**File**: `app/api/clips/user/route.ts`

```typescript
export async function GET(request: NextRequest) {
  // Resolve userId (authenticated user or dev guest)
  const { userId } = await resolveUserId(request)
  
  // Get Supabase admin client
  const supabaseAdmin = getSupabaseAdminClient()
  
  // Fetch clips from curated_clips for this user
  const { data: clipsData, error: fetchError } = await supabaseAdmin
    .from('curated_clips')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  
  // Transform to Clip format
  const clips: Clip[] = clipsData.map((dbClip: any) => {
    return {
      id: dbClip.id,
      text: dbClip.transcript,
      title: dbClip.title || 'Practice Clip',
      audioUrl: dbClip.audio_url || '',
      focus: dbClip.focus_areas || [],
      targetStyle: dbClip.target_style || 'Everyday conversations',
      situation: situationMap[dbClip.situation || ''] || 'Daily Life',
      lengthSec: dbClip.length_sec || 15,
      difficulty: dbClip.difficulty as 'easy' | 'medium' | 'hard' | undefined,
      createdAt: dbClip.created_at || new Date().toISOString(),
    }
  })
  
  return NextResponse.json({ clips })
}
```

### B) Practice/Select Page - Fetch and Convert Stories
**File**: `app/[locale]/(app)/practice/select/page.tsx`

**Lines**: 231-291

```typescript
// Step 1.5: Fetch clips from database and convert to stories
const fetchAndConvertStories = async () => {
  try {
    // Fetch clips from API
    const response = await fetch('/api/clips/user')
    const { clips } = await response.json()
    
    // Convert clips to stories
    const generatedStories = convertClipsToStories(clips)
    
    // Enrich with dbClipId (clips from curated_clips already have IDs)
    const enrichedStories = generatedStories.map(story => ({
      ...story,
      clips: story.clips.map(clip => ({
        ...clip,
        dbClipId: clip.id, // Use clip.id as dbClipId
      })),
    }))
    
    // Save to localStorage
    saveUserStories(enrichedStories)
    
    return enrichedStories
  } catch (error) {
    console.error('❌ [SELECT] Failed to fetch and convert stories:', error)
    return null
  }
}
```

### C) Respond Page - Load Transcript from Story
**File**: `app/[locale]/(app)/practice/respond/page.tsx`

**Lines**: 535-564

```typescript
if (storyId && storyClipId) {
  // Use DB-only lookup - mock stories not allowed in practice flows
  const { story } = getStoryByIdClientDbOnly(storyId)
  if (story) {
    const clip = story.clips.find(c => c.id === storyClipId)
    if (clip && clip.dbClipId) {
      // Only use clips that have dbClipId (DB-backed)
      transcript = clip.transcript
      foundClip = true
    }
  }
}
```

---

## 3. Audio URL / Clip Availability Validation

### A) Audio Metadata API
**File**: `app/api/audio/metadata/route.ts`

**Purpose**: Checks if audio exists and is ready for playback

```typescript
export async function GET(request: NextRequest) {
  const userId = await resolveUserId(request)
  const clipId = searchParams.get('clipId')
  const variantKey = searchParams.get('variantKey') || 'clean_normal'
  const transcript = searchParams.get('transcript')
  
  const supabaseAdmin = getSupabaseAdminClient()
  const transcriptHash = transcript ? generateTextHash(transcript) : null
  
  // Try exact match with transcript_hash first
  if (transcript && transcriptHash) {
    const exactMatch = await supabaseAdmin
      .from('clip_audio')
      .select('*')
      .eq('user_id', userId)
      .eq('clip_id', clipId)
      .eq('variant_key', variantKey)
      .eq('transcript_hash', transcriptHash)
      .single()
  }
  
  // Fallback: find latest ready audio
  if (!audioRow) {
    const fallbackQuery = supabaseAdmin
      .from('clip_audio')
      .select('*')
      .eq('user_id', userId)
      .eq('clip_id', clipId)
      .eq('variant_key', variantKey)
      .eq('audio_status', 'ready')
      .order('updated_at', { ascending: false })
      .limit(1)
  }
  
  // Validate blob_path is https URL (not blob: URL)
  if (audioRow.audio_status === 'ready' && audioRow.blob_path) {
    if (audioRow.blob_path.startsWith('blob:')) {
      // Invalid - ignore and return needs_generation
      return NextResponse.json({
        audioStatus: 'needs_generation',
      })
    } else if (audioRow.blob_path.startsWith('https://')) {
      audioUrl = audioRow.blob_path
    }
  }
  
  return NextResponse.json({
    clipId,
    transcript,
    transcriptHash,
    audioStatus: audioRow.audio_status,
    audioUrl,
  })
}
```

### B) Audio URL API
**File**: `app/api/audio/url/route.ts`

**Purpose**: Returns audio URL if ready, or status if not ready

```typescript
export async function GET(request: NextRequest) {
  const userId = await resolveUserId(request)
  const clipId = searchParams.get('clipId')
  const variantKey = searchParams.get('variantKey') || 'clean_normal'
  
  const supabaseAdmin = getSupabaseAdminClient()
  
  // Fetch clip_audio
  const { data: audioRow, error } = await supabaseAdmin
    .from('clip_audio')
    .select('*')
    .eq('user_id', userId)
    .eq('clip_id', clipId)
    .eq('variant_key', variantKey)
    .single()
  
  if (error || !audioRow) {
    return NextResponse.json(
      { error: 'Audio not found', status: 'needs_generation' },
      { status: 404 }
    )
  }
  
  // If status !== ready → return status
  if (audioRow.audio_status !== 'ready') {
    return NextResponse.json({
      status: audioRow.audio_status,
      clipId,
    })
  }
  
  // Return audio URL if ready
  // ... construct https URL from blob_path ...
}
```

### C) Client-Side Audio Validation
**File**: `lib/audioApi.ts`

```typescript
export async function getAudioMetadata(
  clipId: string,
  transcript: string,
  variantKey: string = 'clean_normal'
): Promise<AudioMetadata> {
  const response = await fetch(
    `/api/audio/metadata?clipId=${encodeURIComponent(clipId)}&variantKey=${encodeURIComponent(variantKey)}&transcript=${encodeURIComponent(transcript)}`,
    { headers }
  )
  
  if (response.ok) {
    const data = await response.json()
    return {
      clipId: data.clipId,
      transcript: data.transcript,
      transcriptHash: data.transcriptHash,
      audioStatus: data.audioStatus as AudioStatus,
      audioUrl: data.audioUrl,
      variantKey: data.variantKey,
    }
  }
  
  // If API call fails, return needs_generation
  return {
    clipId,
    transcript,
    transcriptHash,
    audioStatus: 'needs_generation',
  }
}
```

### D) ClipPlayer Component - Audio Status Check
**File**: `components/ClipPlayer.tsx`

**Lines**: 32-55

```typescript
const audioStatus = clip.audioStatus ?? 'needs_generation'

useEffect(() => {
  // Check if needs generation
  if (audioStatus === 'needs_generation') {
    return // Skip Audio creation
  }
  
  // Only create Audio if status is 'ready' and audioUrl is non-empty
  if (audioStatus !== 'ready' || !clip.audioUrl) {
    return // Not ready
  }
  
  // Create Audio element
  const audio = new Audio(clip.audioUrl)
  // ... event handlers ...
}, [audioStatus, clip.audioUrl])
```

---

## 4. Database Schema for Clips

### A) curated_clips Table

**Inferred from import scripts** (`scripts/importCuratedClips.ts`, `scripts/import-clips-v2.ts`):

```sql
-- Inferred schema (not found in migrations, but used in code)
CREATE TABLE curated_clips (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  transcript TEXT NOT NULL,
  cefr TEXT, -- 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'
  situation TEXT, -- 'Work' | 'Daily Life' | 'Social' | 'Travel' | 'Media'
  focus_areas TEXT[] OR JSON, -- Array of focus areas
  length_sec NUMERIC,
  clip_type TEXT DEFAULT 'practice',
  approved BOOLEAN DEFAULT false,
  title TEXT,
  target_style TEXT,
  difficulty TEXT, -- 'easy' | 'medium' | 'hard'
  audio_url TEXT, -- Optional: direct audio URL
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Fields used in code**:
- `id` - Clip identifier (e.g., "clip-practice-292")
- `user_id` - Owner of the clip
- `transcript` - The spoken text
- `cefr` - CEFR level
- `situation` - Situation category
- `focus_areas` - Array of listening focus areas
- `length_sec` - Duration in seconds
- `clip_type` - Type (usually 'practice')
- `approved` - Whether clip is approved for use
- `title` - Optional title
- `target_style` - Style category
- `difficulty` - Difficulty level
- `audio_url` - Optional direct audio URL (may be null)

### B) clip_audio Table

**File**: `supabase/migrations/001_create_clip_audio.sql`

```sql
CREATE TABLE IF NOT EXISTS clip_audio (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  clip_id TEXT NOT NULL,
  transcript TEXT NOT NULL,
  transcript_hash TEXT NOT NULL,
  variant_key TEXT NOT NULL DEFAULT 'clean_normal',
  voice_profile TEXT DEFAULT 'alloy',
  audio_status TEXT NOT NULL DEFAULT 'needs_generation' 
    CHECK (audio_status IN ('needs_generation', 'generating', 'ready', 'error')),
  blob_path TEXT, -- Must be https:// URL, never blob: URL
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Unique constraint: one audio per user/clip/variant combination
  UNIQUE(user_id, clip_id, variant_key)
);

-- Indexes
CREATE INDEX idx_clip_audio_user_clip ON clip_audio(user_id, clip_id);
CREATE INDEX idx_clip_audio_status ON clip_audio(audio_status);
CREATE INDEX idx_clip_audio_hash ON clip_audio(transcript_hash);
```

**Key Fields**:
- `clip_id` - References `curated_clips.id`
- `audio_status` - Status enum: 'needs_generation', 'generating', 'ready', 'error'
- `blob_path` - HTTPS URL to audio file (never blob: URL)
- `variant_key` - Audio variant (e.g., 'clean_normal')
- `transcript_hash` - Hash of transcript for matching

**RLS Policies**:
- Users can only view/insert/update/delete their own audio

---

## 5. "Back to Story" Button Handler & Story Selection Logic

### A) Respond Page - Back Button Handler
**File**: `app/[locale]/(app)/practice/respond/page.tsx`

**Lines**: 1680-1689

```typescript
const handleBack = () => {
  // Show exit confirmation modal instead of navigating directly
  setShowExitModal(true)
}

const handleConfirmExit = () => {
  // Always navigate to practice select page when exiting
  router.push(`/${locale}/practice/select`)
}
```

**Back Button in Error State** (Lines 1768-1773):
```typescript
<Link
  href={storyId ? `/${locale}/practice/story/${storyId}` : `/${locale}/practice/select`}
  className="block w-full py-2 px-4 bg-blue-600 text-white rounded-lg font-medium text-center active:bg-blue-700 transition-colors"
>
  {storyId ? 'Back to Story' : 'Back to Practice'}
</Link>
```

### B) Story Selection Logic - Practice/Select Page
**File**: `app/[locale]/(app)/practice/select/page.tsx`

**Lines**: 630-640

```typescript
const handleStartPractice = () => {
  if (dailyStory) {
    // Navigate to story detail page, which redirects to first clip
    router.push(`/${locale}/practice/story/${dailyStory.id}?clipIndex=0`)
  }
}
```

### C) Story Detail Page - Redirect to Respond
**File**: `app/[locale]/(app)/practice/story/[id]/page.tsx`

**Lines**: 15-51

```typescript
export default function StoryRedirectPage() {
  const params = useParams()
  const storyId = params.id as string | undefined
  
  useEffect(() => {
    if (!storyId) {
      router.replace(`/${locale}/practice/select`)
      return
    }
    
    // Get clipIndex from query, default 0
    const clipIndexParam = searchParams.get('clipIndex')
    const index = clipIndexParam ? parseInt(clipIndexParam, 10) : 0
    
    const { story } = getStoryByIdClient(storyId)
    const clips = story?.clips || []
    
    if (!story || clips.length === 0) {
      router.replace(`/${locale}/practice/select`)
      return
    }
    
    const safeIndex = index >= 0 && index < clips.length ? index : 0
    const targetClip = clips[safeIndex]
    
    // Redirect to respond page with story and clip IDs
    router.replace(
      `/${locale}/practice/respond?storyId=${storyId}&clipId=${targetClip.id}&clipIndex=${safeIndex}`
    )
  }, [storyId, searchParams, router, locale])
}
```

### D) Navigation Flow Summary

```
Practice Select Page
  ↓ (user clicks "Start Practice")
Story Detail Page (/practice/story/[id])
  ↓ (redirects automatically)
Respond Page (/practice/respond?storyId=...&clipId=...)
  ↓ (user clicks "Check Answer")
Review Page (/practice/review?storyId=...&clipId=...)
  ↓ (user clicks "Back" or error occurs)
Practice Select Page OR Story Detail Page
```

### E) Story Lookup Functions

**File**: `lib/storyClient.ts`

**getStoryByIdClientDbOnly** (Lines 86-105):
```typescript
export function getStoryByIdClientDbOnly(storyId: string): { story: Story | null; source: 'user' | 'none' } {
  if (!storyId) return { story: null, source: 'none' }
  
  // Only return user stories (DB-backed)
  const userStories = loadUserStories() // From localStorage
  if (userStories.length > 0) {
    const fromUser = userStories.find(s => s.id === storyId) || null
    if (fromUser) {
      return { story: fromUser, source: 'user' }
    }
  }
  
  return { story: null, source: 'none' }
}
```

**loadUserStories** (Lines 12-27):
```typescript
export function loadUserStories(): Story[] {
  if (typeof window === 'undefined') return []
  
  try {
    const stored = window.localStorage.getItem('userStories')
    if (!stored) return []
    
    const parsed = JSON.parse(stored)
    if (!Array.isArray(parsed)) return []
    
    return parsed as Story[]
  } catch (error) {
    console.error('❌ [StoryClient] Error loading userStories from localStorage:', error)
    return []
  }
}
```

---

## Summary

### Key Points:

1. **Error Display**: "Practice not available" error is shown in respond page when story/clip validation fails
2. **Clip Fetching**: Clips are fetched from `curated_clips` table via `/api/clips/user` endpoint
3. **Audio Validation**: Audio availability is checked via `/api/audio/metadata` which queries `clip_audio` table
4. **Database Schema**: 
   - `curated_clips` - Stores clip metadata (transcript, situation, focus areas, etc.)
   - `clip_audio` - Stores audio generation status and URLs (one per user/clip/variant)
5. **Navigation**: Story selection → Story detail (redirect) → Respond page → Review page → Back to select/story

### Critical Validation Points:

- Story must exist in localStorage (`userStories`)
- Clip must have `dbClipId` field (references `curated_clips.id`)
- Audio must have `audio_status = 'ready'` in `clip_audio` table
- Audio URL must be `https://` (never `blob:`)

---

## 6. Debugging: Clip ID Preservation & Validation

### A) convertClipsToStories Function Analysis

**File**: `lib/clipToStoryConverter.ts`

**Key Finding**: The function **preserves clip IDs correctly** but **does NOT set dbClipId**.

**Lines 56-69** (Main conversion):
```typescript
const storyClipsConverted: StoryClip[] = storyClips.map((clip, index) => {
  return {
    id: clip.id,  // ✅ Preserves clip.id
    startMs,
    endMs,
    transcript: clip.text,
    audioUrl: clip.audioUrl,
    audioStatus: clip.audioUrl ? 'ready' : 'needs_generation',
    focusSkill: clip.focus?.[0] || 'connected_speech',
    // ❌ dbClipId is NOT set here
  }
})
```

**Lines 125-137** (Fallback conversion):
```typescript
const storyClipsConverted: StoryClip[] = clips.map((clip, index) => {
  return {
    id: clip.id,  // ✅ Preserves clip.id
    // ❌ dbClipId is NOT set here either
  }
})
```

**Issue**: `convertClipsToStories` only sets `id`, not `dbClipId`. The `dbClipId` is added later in practice/select page (line 260-263).

### B) /api/clips/user Response Validation

**File**: `app/api/clips/user/route.ts`

**Lines 103-115** (Transformation):
```typescript
return {
  id: dbClip.id,  // ✅ Uses dbClip.id from database
  text: dbClip.transcript,
  // ... other fields
}
```

**Added Validation** (Lines 58-67):
- Checks for NULL or empty `id` fields before transformation
- Filters out invalid clips
- Logs warnings for clips with invalid IDs

**Response Format**:
```json
{
  "clips": [
    {
      "id": "clip-practice-292",  // Must be non-empty string
      "text": "transcript...",
      // ... other fields
    }
  ]
}
```

### C) Debug Logging in Respond Page

**File**: `app/[locale]/(app)/practice/respond/page.tsx`

**Lines 539-555** (Added comprehensive logging):
```typescript
const clip = story.clips.find(c => c.id === storyClipId)

// DEBUG: Log clip details when checking dbClipId
console.log('🔍 [RespondPage] Clip validation check:', {
  storyId,
  storyClipId,
  clipFound: !!clip,
  clipId: clip?.id,
  clipDbClipId: clip?.dbClipId,
  clipKeys: clip ? Object.keys(clip) : [],
  clipFull: clip ? JSON.stringify(clip, null, 2) : null,
  allClipIds: story.clips.map(c => ({ id: c.id, dbClipId: c.dbClipId })),
})

if (clip && !clip.dbClipId) {
  console.error('❌ [RespondPage] Clip missing dbClipId:', {
    storyId,
    storyClipId: clip.id,
    clipId: clip.id,
    dbClipId: clip.dbClipId,
    transcript: clip.transcript?.substring(0, 30) + '...',
    allClipFields: Object.keys(clip),
    clipObject: clip,
  })
}
```

### D) Database Validation Script

**File**: `scripts/checkCuratedClipsIds.ts` (NEW)

**Purpose**: Check for NULL or empty `id` fields in `curated_clips` table

**Usage**:
```bash
npx tsx scripts/checkCuratedClipsIds.ts
```

**Checks**:
1. NULL or empty `id` fields
2. Duplicate IDs
3. Sample of valid IDs

**Output**:
- Lists all clips with invalid IDs
- Reports duplicate IDs
- Shows summary statistics

### E) Potential Issues & Solutions

#### Issue 1: dbClipId Not Set During Conversion
**Problem**: `convertClipsToStories` doesn't set `dbClipId`, only `id`

**Solution**: Already handled in practice/select page (line 260-263) where `dbClipId: clip.id` is set after conversion.

#### Issue 2: Clip ID May Be NULL in Database
**Problem**: Some clips in `curated_clips` may have NULL or empty `id` fields

**Solution**: 
- Added validation in `/api/clips/user` to filter out invalid clips
- Added script to check database for invalid IDs
- Added logging to identify when this occurs

#### Issue 3: ID Mismatch Between clip.id and dbClipId
**Problem**: `clip.id` (story clip ID) may differ from `clip.dbClipId` (database clip ID)

**Current Behavior**:
- In practice/select page: `dbClipId: clip.id` (assumes they're the same)
- This is correct IF `clip.id` from `convertClipsToStories` matches the database `id`

**Verification Needed**:
- Check if `convertClipsToStories` preserves the original `clip.id` from database
- Verify that `clip.id` in StoryClip matches `curated_clips.id`
