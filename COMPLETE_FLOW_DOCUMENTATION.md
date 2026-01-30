# Complete Flow Documentation: Onboarding → Clip Generation → Device Updates

**Last Updated:** 2026-01-29  
**Version:** 1.0

---

## Overview

This document traces the complete user journey from landing on the app through onboarding, diagnostic testing, clip generation, story creation, and ongoing practice sessions.

---

## 1. ONBOARDING FLOW

### 1.1 Entry Points & Landing

**File:** `app/page.tsx`  
**Route:** `/`

**What happens:**
- User lands on the app intro page
- Authentication check (currently placeholder)
- Two paths:
  - **New user:** → `/auth` (signup flow)
  - **Returning user:** → `/practice/select` (if authenticated)

**Data stored:**
- None yet (user not registered)

---

### 1.2 Authentication & Profile

**Files:**
- `app/auth/page.tsx` - Auth choice (email/Google/Apple)
- `app/auth/signup/email/page.tsx` - Email signup
- `app/auth/login/page.tsx` - Login
- `app/auth/profile/page.tsx` - Name input

**Route Flow:**
```
/ → /auth → /auth/signup/email → /auth/profile
                              ↘
                                /auth/login
```

**What happens:**
1. User selects authentication method
2. User provides email/password (or social auth)
3. User enters first name and optional last name
4. Data saved to localStorage:
   - `userFirstName`: string
   - `userLastName`: string (optional)

**Data stored:**
- **localStorage:**
  - `userFirstName`: "John"
  - `userLastName`: "Doe"

**Navigation:**
- On success: → `/onboarding/welcome`

---

### 1.3 Welcome Page

**File:** `app/onboarding/welcome/page.tsx`  
**Route:** `/onboarding/welcome`

**What happens:**
- Displays personalized greeting: "Hello {firstName}! 👋"
- Brief message: "To get to know you better, let's start with some quick questions."
- "Let's go →" button navigates to diagnostic

**Data stored:**
- None (reads from localStorage)

**Navigation:**
- On continue: → `/onboarding/diagnosis`

---

### 1.4 Quick Start Diagnostic (3 Clips)

**File:** `app/onboarding/diagnosis/page.tsx`  
**Route:** `/onboarding/diagnosis`

#### Initialization Flow

```typescript
// 1. Load diagnostic clips (server-side fetch or localStorage cache)
const response = await fetch('/api/clips/diagnostic', {
  method: 'GET',
})

// API Route: app/api/clips/diagnostic/route.ts
// Fetches clips from Supabase where clip_type = 'diagnostic'
// Returns 3+ clips with CEFR levels (A1, A2, B1, B2)
```

**Diagnostic Clip Selection:**
- **Source:** Supabase `curated_clips` table
- **Filter:** `clip_type = 'diagnostic'`
- **Count:** 3 clips (defined by `DIAGNOSTIC_CLIP_COUNT`)
- **Ordering:** By `id ASC` (consistent results)

**Clip Structure:**
```typescript
interface DiagnosticClip {
  id: string
  transcript: string
  difficultyCefr: 'A1' | 'A2' | 'B1' | 'B2'
  focusAreas: string[]  // e.g., ['linking', 'reductions']
  situation?: string
  lengthSec?: number
  clipType: 'diagnostic'
}
```

#### User Experience

For each clip (1/3, 2/3, 3/3):
1. User plays audio (waveform visualization)
2. User types what they heard OR uses voice input (mic button)
3. User submits answer OR clicks "I couldn't catch it"
4. System calls `/api/check-answer` to evaluate response

**Answer Checking:**
```typescript
POST /api/check-answer
{
  clipId: string
  userInput: string
  transcript: string
  skipped: boolean
  clipType: 'diagnostic'
}

// Returns:
{
  accuracyPercent: number  // 0-100
  feedback: FeedbackStep[]  // Array of error categories
}
```

#### Result Storage (Per Clip)

**File:** `lib/quickStartSummary.ts`

```typescript
// Stored in localStorage after each clip
storeQuickStartClipResult({
  clipId: string
  skipped: boolean
  userInputLength: number
  accuracyPercent: number
})

// localStorage key: 'quickStartClipResults'
```

#### Diagnostic Completion

After all 3 clips:

**File:** `lib/quickStartSummary.ts` → `completeQuickStart()`

```typescript
// 1. Load all clip results
const results = loadQuickStartClipResults()

// 2. Build summary
const summary: QuickStartSummary = {
  version: 1
  createdAt: number
  missedRate: number        // 0..1, fraction of clips missed/skipped
  attemptAccuracy: number   // 0..100, average accuracy over attempted clips
  startingDifficulty: number // 15 | 25 | 35 | 55
}

// 3. Heuristic calculation:
if (missedRate >= 0.4) → startingDifficulty = 15
else if (attemptAccuracy >= 70) → startingDifficulty = 55
else if (attemptAccuracy >= 40) → startingDifficulty = 35
else → startingDifficulty = 25

// 4. Store summary in localStorage
localStorage.setItem('quickStartSummary', JSON.stringify(summary))

// 5. Set flag for "Clips Ready" modal
localStorage.setItem('showClipsReadyOnce', '1')

// 6. Clear individual clip results
clearQuickStartClipResults()
```

**Data stored:**
- **localStorage:**
  - `quickStartSummary`: QuickStartSummary object
  - `showClipsReadyOnce`: "1" (flag for modal)
  - `quickStartClipResults`: [] (cleared after summary built)

**Navigation:**
- On completion: → `/onboarding/situations`

---

### 1.5 Situation Selection

**File:** `app/onboarding/situations/page.tsx`  
**Route:** `/onboarding/situations`

**What happens:**
- User selects up to 2 practice situations:
  - 🏢 Work & meetings (`work_meetings`)
  - 🏠 Everyday conversations (`daily`)
  - ✈️ Travel & daily interactions (`travel`)
  - 📺 Videos & shows (`videos_shows`)
  - 🎤 Interviews & presentations (`interviews_presentations`)
  - 🌍 General listening (`general`)

**Data stored:**
- **localStorage:**
  ```typescript
  onboardingData: {
    situations: ['work_meetings', 'daily']  // Max 2 selections
  }
  ```

**File:** `lib/onboardingStore.ts` → `setOnboardingData()`

**Navigation:**
- On continue: → `/practice/select`
- On skip: → `/practice/select` (default: `['general']`)

---

### 1.6 Onboarding Data Persistence

**File:** `lib/onboardingStore.ts`

**Complete OnboardingData structure:**
```typescript
interface OnboardingData {
  listeningDifficulties: string[]
  preferredGenre?: string      // Legacy
  topics?: string[]             // Legacy
  level?: string                // Legacy
  purpose?: string              // Legacy
  tasteTopics?: string[]        // Legacy
  situations?: SituationKey[]   // NEW: max 2 selections
  version?: number
}
```

**Storage mechanism:**
```typescript
// Setter (called throughout onboarding)
setOnboardingData({ situations: ['work_meetings'] })

// Internally:
localStorage.setItem('onboardingData', JSON.stringify(data))

// Getter (called when generating clips)
const data = getOnboardingData()
// Returns normalized data (maps legacy fields to situations if needed)
```

---

## 2. CLIP GENERATION & STORY CREATION

### 2.1 Practice Select Page Load

**File:** `app/(app)/practice/select/page.tsx`  
**Route:** `/practice/select`

**Initialization Flow:**

```typescript
useEffect(() => {
  // 1. Load diagnostic summary (for analytics only)
  const diagnosticSummary = loadDiagnosticSummary()
  setSummary(diagnosticSummary)
  
  // 2. Check for "Clips Ready" modal flag
  if (localStorage.getItem('showClipsReadyOnce') === '1') {
    localStorage.removeItem('showClipsReadyOnce')
    setShowClipsReadyModal(true)
  }
  
  // 3. Try to load existing user stories
  let userStories = loadUserStories()
  
  // 4. If userStories exist, use them (skip feed logic)
  if (userStories.length > 0) {
    setStories(userStories)
    setIsHydrated(true)
    return  // EXIT EARLY
  }
  
  // 5. No userStories → Fetch adaptive feed
  const quickStartSummary = loadQuickStartSummary()
  
  if (quickStartSummary) {
    // Fetch clips based on quick start results
    fetchFeed(quickStartSummary)
  }
}, [])
```

---

### 2.2 Adaptive Feed Fetching

**What determines clip selection:**

1. **Quick Start Summary:**
   - `startingDifficulty`: 15, 25, 35, or 55
   - Mapped to CEFR level for feed API

2. **Onboarding Data:**
   - `situations`: User's preferred practice contexts
   - Used to filter clips by situation match

**Mapping startingDifficulty → CEFR:**
```typescript
const feedStartDifficulty = getFeedStartDifficulty(quickStartSummary)
// feedStartDifficulty = max(0, startingDifficulty - 20)

let cefr: 'A1' | 'A2' | 'B1' | 'B2'
if (feedStartDifficulty < 15) → cefr = 'A1'
else if (feedStartDifficulty < 25) → cefr = 'A2'
else if (feedStartDifficulty < 35) → cefr = 'B1'
else → cefr = 'B2'
```

**API Call:**

**File:** `app/api/clips/feed/route.ts`

```typescript
POST /api/clips/feed
{
  cefr: 'A2'
  preferredGenre: 'work_meetings'
  limit: 10
}

// Database query:
supabase
  .from('curated_clips')
  .select('*')
  .eq('clip_type', 'practice')
  .eq('cefr', 'A2')
  .limit(10)

// Returns: Clip[]
```

**Clip Structure:**
```typescript
interface Clip {
  id: string
  transcript: string
  difficultyCefr: 'A1' | 'A2' | 'B1' | 'B2'
  focusAreas: string[]  // e.g., ['linking', 'connected_speech']
  situation?: string    // e.g., 'Work', 'Daily Life'
  lengthSec?: number    // ~10-20 seconds
  clipType: 'practice'
}
```

---

### 2.3 Story Conversion

**File:** `lib/clipToStoryConverter.ts` → `convertClipsToStories()`

**Algorithm:**

1. **Group clips by situation:**
   ```typescript
   const clipsBySituation = new Map<string, Clip[]>()
   // Example: { 'Work': [clip1, clip2, ...], 'Daily Life': [...] }
   ```

2. **Create stories from grouped clips:**
   ```typescript
   const clipsPerStory = 3  // Changed from 5 for better distribution
   
   for (const [situation, situationClips] of clipsBySituation) {
     // Split into chunks of 3 clips each
     for (let i = 0; i < situationClips.length; i += 3) {
       const storyClips = situationClips.slice(i, i + 3)
       
       // Convert to StoryClip format
       const storyClipsConverted: StoryClip[] = storyClips.map((clip, index) => ({
         id: clip.id,
         startMs: index * 15000,  // ~15 seconds per clip
         endMs: startMs + (clip.lengthSec * 1000),
         transcript: clip.text,
         audioUrl: clip.audioUrl,
         audioStatus: 'needs_generation',
         focusSkill: clip.focus?.[0] || 'connected_speech'
       }))
       
       // Create story
       stories.push({
         id: `user-story-${storyIndex}`,
         title: generateStoryTitle(situation, firstClip),
         context: generateStoryContext(situation, 3),
         tags: [situation, ...focusSkills],
         difficulty: mostCommonDifficulty,
         durationSec: totalDuration,
         clips: storyClipsConverted,
         situation: situation
       })
       
       storyIndex++
     }
   }
   ```

**Expected Results:**
- **Input:** 10 clips from feed API
- **Output:** 3-4 stories (each with 3 clips)
- **Situations:** Varied based on user preferences

**Example:**
```typescript
// If user selected: ['work_meetings', 'daily']
// Feed returns: 5 work clips + 5 daily clips
// Stories created:
[
  { id: 'user-story-1', situation: 'Work', clips: [clip1, clip2, clip3] },
  { id: 'user-story-2', situation: 'Work', clips: [clip4, clip5, clip6] },
  { id: 'user-story-3', situation: 'Daily Life', clips: [clip7, clip8, clip9] },
  { id: 'user-story-4', situation: 'Daily Life', clips: [clip10] }  // Partial
]
```

---

### 2.4 Story Persistence

**File:** `lib/storyClient.ts`

```typescript
// Save stories to localStorage
saveUserStories(stories)

// Internally:
localStorage.setItem('userStories', JSON.stringify(stories))

// Structure:
userStories: Story[] = [
  {
    id: 'user-story-1',
    title: 'Work Conversation',
    context: 'Practice with 3 clips from work conversations...',
    tags: ['Work', 'Connected Speech'],
    difficulty: 'medium',
    durationSec: 45,
    clips: [...],
    situation: 'Work'
  },
  // ... more stories
]
```

**localStorage keys after onboarding:**
```typescript
{
  // User data
  'userFirstName': 'John',
  'userLastName': 'Doe',
  
  // Onboarding data
  'onboardingData': {
    situations: ['work_meetings', 'daily']
  },
  
  // Quick start results
  'quickStartSummary': {
    version: 1,
    createdAt: 1738188000000,
    missedRate: 0.33,
    attemptAccuracy: 65.5,
    startingDifficulty: 35
  },
  
  // Practice content
  'userStories': [
    { id: 'user-story-1', ... },
    { id: 'user-story-2', ... },
    { id: 'user-story-3', ... }
  ],
  
  // Session tracking
  'lastPracticeDate': '2026-01-29',
  'streak': 5
}
```

---

## 3. DAILY PRACTICE SESSION

### 3.1 Daily Story Selection

**File:** `app/(app)/practice/select/page.tsx`

```typescript
useEffect(() => {
  if (!isHydrated || stories.length === 0) return

  // Select ONE story for today's session (first = highest scored)
  const daily = stories[0]

  // Check daily completion
  const today = new Date().toISOString().split('T')[0]
  const lastPracticeDate = localStorage.getItem('lastPracticeDate')
  const completed = lastPracticeDate === today

  setDailyStory(daily)
  setCompletedToday(completed)
}, [isHydrated, stories])
```

**What determines "today's story":**
- **First story in array** (stories are sorted by situation priority)
- **One story per day** (not randomized daily)
- **Completion tracked by date** (`lastPracticeDate`)

**UI Display:**
```
┌─────────────────────────────────┐
│  🎯 Today's Practice            │
│  Build your ear, one clip       │
│  at a time.                     │
│                                 │
│  ⏱️ Quick session • ~1 minute   │
│  📚 3 short clips               │
│                                 │
│  [Start Practice →]             │
└─────────────────────────────────┘

✅ Completed!  OR  ⏰ {hoursLeft}h {minutesLeft}m until reset
```

---

### 3.2 Practice Session Flow

**Navigation:** `/practice/select` → `/practice/story/[id]` → `/practice/respond`

**Story Detail Page (Optional):**
- **File:** `app/(app)/practice/story/[id]/page.tsx`
- **Shows:** Story overview, clips preview
- **Navigation:** → `/practice/respond?storyId={id}&clipIndex=0`

**Respond Page:**
- **File:** `app/(app)/practice/respond/page.tsx`
- **Route:** `/practice/respond?storyId={id}&clipIndex={n}`

**Clip Practice Loop:**
```typescript
// For each clip in story (0, 1, 2):
1. Load clip data from story
2. Generate/fetch audio (if needed)
3. User plays audio
4. User types/speaks answer
5. User submits
6. Check answer via API
7. Show feedback/results
8. Move to next clip (clipIndex++)

// After all clips:
9. Show story completion
10. Update lastPracticeDate
11. Navigate back to /practice/select
```

---

### 3.3 Audio Generation Flow

**When audio is needed:**

**File:** `app/(app)/practice/respond/page.tsx`

```typescript
useEffect(() => {
  if (!practiceData) return
  if (audioStatus !== 'needs_generation') return
  
  // 1. Check if audio exists in database
  const metadata = await getAudioMetadata(clipId, 'clean_normal', 'practice')
  
  if (metadata?.audioUrl && metadata.status === 'ready') {
    // Audio already exists, use it
    setPracticeData(prev => ({
      ...prev,
      audioUrl: metadata.audioUrl,
      audioStatus: 'ready'
    }))
    return
  }
  
  // 2. Generate new audio
  const result = await generateAudio(clipId, transcript, 'clean_normal', 'practice')
  
  if (result.success && result.audioUrl) {
    setPracticeData(prev => ({
      ...prev,
      audioUrl: result.audioUrl,
      audioStatus: 'ready'
    }))
  }
}, [practiceData, audioStatus])
```

**Audio Generation API:**

**File:** `app/api/audio/generate/route.ts`

```typescript
POST /api/audio/generate
{
  clipId: string
  transcript: string
  voiceMode: 'clean_normal'
  clipType: 'practice'
}

// Process:
1. Compute contentHash = SHA256(transcript + voiceMode + clipType)
2. Check if audio already exists in Supabase (by contentHash)
3. If exists and status='ready': return existing URL
4. Generate new audio via OpenAI TTS API
5. Upload audio to Vercel Blob storage
6. Store metadata in Supabase clip_audio table
7. Return signed URL (1 hour expiry)

// Returns:
{
  success: true
  audioUrl: 'https://blob.vercel-storage.com/...'
  contentHash: '...'
}
```

**Database Schema:**

**Table:** `clip_audio` (Supabase)

```sql
CREATE TABLE clip_audio (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  clip_id TEXT NOT NULL,
  clip_type TEXT NOT NULL,  -- 'practice' | 'diagnostic' | 'story'
  content_hash TEXT NOT NULL UNIQUE,
  audio_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ready',  -- 'ready' | 'generating' | 'error'
  voice_mode TEXT DEFAULT 'clean_normal',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_clip_audio_user_id ON clip_audio(user_id);
CREATE INDEX idx_clip_audio_clip_id ON clip_audio(clip_id);
CREATE INDEX idx_clip_audio_content_hash ON clip_audio(content_hash);
```

---

### 3.4 Answer Checking & Feedback

**API Route:** `app/api/check-answer/route.ts`

```typescript
POST /api/check-answer
{
  clipId: string
  userInput: string
  transcript: string
  skipped: boolean
  clipType: 'practice'
}

// Process:
1. Normalize both strings (lowercase, trim)
2. Calculate word-level accuracy (fuzzy matching)
3. Identify error categories:
   - linking (e.g., "would you" → "would-ju")
   - weak_form (e.g., "can" → "c'n")
   - elision (e.g., "next door" → "nex door")
   - contraction (e.g., "I am" → "I'm")
   - similar_words (e.g., "their" vs "there")
   - spelling
   - missed (completely wrong/missing)
4. Generate feedback steps

// Returns:
{
  accuracyPercent: 75.5
  feedback: [
    {
      type: 'weak_form',
      expected: 'can',
      userSaid: 'can't',
      explanation: '...',
      timestamp: 5.2
    },
    // ... more feedback
  ]
}
```

---

## 4. DEVICE PERSISTENCE & UPDATES

### 4.1 localStorage Keys & Purpose

**Complete localStorage map:**

| Key | Type | Purpose | Update Trigger |
|-----|------|---------|---------------|
| `userFirstName` | string | User's first name | Auth/onboarding |
| `userLastName` | string | User's last name | Auth/onboarding |
| `onboardingData` | Object | Onboarding selections | Each onboarding step |
| `diagnosticClips` | Clip[] | Cached diagnostic clips | Once per diagnostic |
| `quickStartClipResults` | QuickStartClipResult[] | Per-clip results | After each diagnostic clip |
| `quickStartSummary` | QuickStartSummary | Diagnostic summary | After 3rd clip |
| `diagnosticSummary` | DiagnosticSummary | Legacy (analytics only) | After diagnostic |
| `userStories` | Story[] | Practice stories | After feed fetch |
| `lastPracticeDate` | string (YYYY-MM-DD) | Last practice completion | After story completion |
| `streak` | string | Current streak | Daily practice |
| `showClipsReadyOnce` | "1" | Flag for modal | After diagnostic |

---

### 4.2 Sync Strategy (localStorage ↔ Supabase)

**Current implementation:**

1. **Onboarding data:**
   - **Source:** localStorage only (not synced to Supabase yet)
   - **Reason:** MVP simplicity

2. **Diagnostic/Quick Start results:**
   - **Source:** localStorage only
   - **Reason:** Used for initial feed seeding, then cached

3. **User stories:**
   - **Source:** localStorage (cached)
   - **Original source:** Supabase `curated_clips` → API → localStorage
   - **Reason:** Avoid re-fetching on every visit

4. **Audio metadata:**
   - **Source:** Supabase `clip_audio` table (authoritative)
   - **Cached in:** localStorage (optional, via audioUrl)
   - **Reason:** Audio generation is expensive, must persist

5. **Practice events:**
   - **Source:** TBD (should be Supabase in production)
   - **Current:** localStorage only

**Authentication flow (future):**
```typescript
// On app load:
const { data: { user } } = await supabase.auth.getUser()

if (user) {
  // Fetch user data from Supabase
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', user.id)
    .single()
  
  // Sync to localStorage
  localStorage.setItem('userFirstName', profile.first_name)
  
  // Fetch user stories/progress from Supabase
  // ...
}
```

---

### 4.3 Daily Clip Updates

**How clips update:**

**Current system:**
- **Stories are fetched ONCE** after diagnostic
- **No daily rotation** (same stories until user refreshes/resets)
- **Daily session selection:** First story in array

**Planned update mechanism:**

```typescript
// On app load (if user has stories already):
1. Check lastFeedFetchDate in localStorage
2. If lastFeedFetchDate < today - 7 days:
   - Fetch new adaptive feed
   - Append new stories to existing userStories
   - Remove oldest completed stories
3. Re-sort stories by:
   - Incomplete stories first
   - Situation priority
   - Difficulty match
```

**Rotation triggers (planned):**
- **Weekly refresh:** Fetch new stories every 7 days
- **Story completion:** When user completes all stories, fetch more
- **Manual refresh:** User can request new stories

---

### 4.4 App Reopening Flow

**Sequence when user reopens app:**

```typescript
// 1. Landing page (/) checks authentication
const hasCompletedSignup = !!localStorage.getItem('userFirstName')

if (hasCompletedSignup) {
  // Redirect to /practice/select
  router.push('/practice/select')
} else {
  // Show intro/auth flow
}

// 2. Practice Select page loads
const userStories = loadUserStories()

if (userStories.length > 0) {
  // Use cached stories
  setStories(userStories)
} else {
  // Re-fetch feed (requires quickStartSummary + onboardingData)
  const quickStartSummary = loadQuickStartSummary()
  const onboardingData = getOnboardingData()
  
  if (quickStartSummary && onboardingData.situations) {
    fetchFeed(quickStartSummary, onboardingData)
  } else {
    // Missing data - redirect to onboarding
    router.push('/onboarding/welcome')
  }
}

// 3. Check daily completion
const today = new Date().toISOString().split('T')[0]
const lastPracticeDate = localStorage.getItem('lastPracticeDate')
const completedToday = lastPracticeDate === today

// 4. Select daily story
const dailyStory = stories[0]
```

---

## 5. VISUAL FLOW DIAGRAM

```
┌─────────────────────────────────────────────────────────────────┐
│                         LANDING PAGE                            │
│                          (app/page.tsx)                         │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ├─── New User ───────────────────────┐
                       │                                    │
                       ▼                                    │
           ┌───────────────────────┐                       │
           │   AUTH FLOW           │                       │
           │   /auth               │                       │
           │   /auth/signup/email  │                       │
           │   /auth/profile       │                       │
           └──────────┬────────────┘                       │
                      │                                    │
                      │ stores: userFirstName              │
                      ▼                                    │
           ┌───────────────────────┐                       │
           │   WELCOME PAGE        │                       │
           │   /onboarding/welcome │                       │
           └──────────┬────────────┘                       │
                      │                                    │
                      │ "Let's go →"                       │
                      ▼                                    │
           ┌───────────────────────────┐                   │
           │   QUICK START DIAGNOSTIC  │                   │
           │   /onboarding/diagnosis   │                   │
           │   • 3 clips               │                   │
           │   • Audio + text input    │                   │
           │   • Accuracy measurement  │                   │
           └──────────┬────────────────┘                   │
                      │                                    │
                      │ Builds quickStartSummary           │
                      │ (missedRate, attemptAccuracy)      │
                      ▼                                    │
           ┌───────────────────────┐                       │
           │   SITUATION SELECT    │                       │
           │   /onboarding/         │                       │
           │   situations          │                       │
           │   • Choose up to 2    │                       │
           └──────────┬────────────┘                       │
                      │                                    │
                      │ stores: onboardingData.situations  │
                      ▼                                    │
           ┌───────────────────────────────────────┐       │
           │   PRACTICE SELECT PAGE                │◄──────┘
           │   /practice/select                    │
           │                                       │   Returning User
           │   ┌─────────────────────────────┐    │
           │   │ Load userStories from       │    │
           │   │ localStorage                │    │
           │   └─────────┬───────────────────┘    │
           │             │                        │
           │             ├── IF EXISTS ───────┐   │
           │             │                     │   │
           │             ▼                     │   │
           │   ┌─────────────────────────┐    │   │
           │   │ Use cached stories      │    │   │
           │   │ Select daily story      │    │   │
           │   └─────────┬───────────────┘    │   │
           │             │                     │   │
           │             │                     │   │
           │             └── IF MISSING ───────┤   │
           │                                   │   │
           │             ┌─────────────────────┘   │
           │             ▼                         │
           │   ┌─────────────────────────────┐    │
           │   │ Fetch Adaptive Feed         │    │
           │   │ POST /api/clips/feed        │    │
           │   │ {                           │    │
           │   │   cefr: 'A2',               │    │
           │   │   situation: 'work'         │    │
           │   │ }                           │    │
           │   └─────────┬───────────────────┘    │
           │             │                         │
           │             ▼                         │
           │   ┌─────────────────────────────┐    │
           │   │ Convert Clips to Stories    │    │
           │   │ lib/clipToStoryConverter.ts │    │
           │   │ • Group by situation        │    │
           │   │ • 3 clips per story         │    │
           │   └─────────┬───────────────────┘    │
           │             │                         │
           │             ▼                         │
           │   ┌─────────────────────────────┐    │
           │   │ Save to localStorage        │    │
           │   │ localStorage.setItem(       │    │
           │   │   'userStories',            │    │
           │   │   stories                   │    │
           │   │ )                           │    │
           │   └─────────┬───────────────────┘    │
           │             │                         │
           │             ▼                         │
           │   ┌─────────────────────────────┐    │
           │   │ Display Today's Practice    │    │
           │   │ • Daily story (stories[0])  │    │
           │   │ • Check completion status   │    │
           │   └─────────────────────────────┘    │
           └───────────────┬───────────────────────┘
                           │
                           │ "Start Practice →"
                           ▼
                ┌─────────────────────┐
                │   STORY DETAIL      │
                │   /practice/story/  │
                │   [id]              │
                └──────────┬──────────┘
                           │
                           │ "Practice →"
                           ▼
                ┌──────────────────────────────┐
                │   PRACTICE RESPOND PAGE      │
                │   /practice/respond          │
                │   ?storyId=X&clipIndex=0     │
                │                              │
                │   FOR EACH CLIP (0, 1, 2):   │
                │   ┌──────────────────────┐   │
                │   │ 1. Load clip data    │   │
                │   └──────────┬───────────┘   │
                │              ▼               │
                │   ┌──────────────────────┐   │
                │   │ 2. Generate/fetch    │   │
                │   │    audio             │   │
                │   │    • Check Supabase  │   │
                │   │    • POST /api/audio/│   │
                │   │      generate        │   │
                │   └──────────┬───────────┘   │
                │              ▼               │
                │   ┌──────────────────────┐   │
                │   │ 3. User plays audio  │   │
                │   │ 4. User types/speaks │   │
                │   │ 5. User submits      │   │
                │   └──────────┬───────────┘   │
                │              ▼               │
                │   ┌──────────────────────┐   │
                │   │ 6. Check answer      │   │
                │   │    POST /api/        │   │
                │   │    check-answer      │   │
                │   └──────────┬───────────┘   │
                │              ▼               │
                │   ┌──────────────────────┐   │
                │   │ 7. Show feedback     │   │
                │   └──────────┬───────────┘   │
                │              ▼               │
                │   ┌──────────────────────┐   │
                │   │ 8. Next clip or      │   │
                │   │    complete story    │   │
                │   └──────────┬───────────┘   │
                └──────────────┼───────────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │ STORY COMPLETION     │
                    │ • Update lastPractice│
                    │   Date               │
                    │ • Increment streak   │
                    │ • Show results       │
                    └──────────┬───────────┘
                               │
                               │ "Continue"
                               ▼
                    Back to PRACTICE SELECT PAGE
```

---

## 6. DATA FLOW SUMMARY

### 6.1 localStorage → Supabase Sync Plan

**Phase 1: MVP (Current)**
- localStorage is source of truth for:
  - Onboarding data
  - User stories
  - Quick start summary
  - Practice completion
- Supabase is source of truth for:
  - Curated clips (diagnostic + practice)
  - Audio metadata (clip_audio table)

**Phase 2: Production (Planned)**
```typescript
// On signup/login:
1. Create user profile in Supabase
2. Store onboarding data in `user_profiles` table
3. Sync quick start summary to `user_progress` table
4. Fetch user stories from `user_stories` table

// On practice completion:
1. Update `lastPracticeDate` in Supabase
2. Increment streak in `user_progress`
3. Sync to localStorage for offline access

// On app load:
1. Fetch user data from Supabase (if authenticated)
2. Merge with localStorage (handle conflicts)
3. Use Supabase as source of truth
```

---

### 6.2 Update Mechanisms

**What triggers new content:**

| Event | Trigger | Action |
|-------|---------|--------|
| First time user | After diagnostic | Fetch adaptive feed (10 clips) |
| Daily practice | User opens app | Select next story from cached array |
| Story completion | All clips done | Move to next story, update `lastPracticeDate` |
| All stories completed | User finishes last story | Fetch new adaptive feed |
| Weekly refresh | 7 days since last fetch | Fetch additional stories, append to array |
| Manual refresh | User requests | Clear `userStories`, re-fetch feed |

---

### 6.3 Audio Caching Strategy

**Audio lifecycle:**

```typescript
1. Clip created in Supabase (curated_clips)
2. User starts practice → audio needs generation
3. Check: Does audio exist in clip_audio table?
   - YES → Return signed URL (1 hour expiry)
   - NO → Generate new audio
4. Generate audio:
   - Call OpenAI TTS API
   - Upload to Vercel Blob
   - Store metadata in clip_audio table
5. Return audio URL to client
6. Client caches URL temporarily (in component state)
7. On next visit:
   - Check clip_audio table again
   - If exists and status='ready', use cached audio
   - Audio persists forever (or until manually deleted)
```

**Audio expiry:**
- **Signed URLs:** 1 hour (security)
- **Blob storage:** Forever (unless manually deleted)
- **Database metadata:** Forever
- **Client cache:** Session only (cleared on page refresh)

---

## 7. KEY FILES REFERENCE

### 7.1 Onboarding

| File | Route | Purpose |
|------|-------|---------|
| `app/page.tsx` | `/` | Landing page |
| `app/auth/page.tsx` | `/auth` | Auth choice |
| `app/auth/profile/page.tsx` | `/auth/profile` | Name input |
| `app/onboarding/welcome/page.tsx` | `/onboarding/welcome` | Welcome message |
| `app/onboarding/diagnosis/page.tsx` | `/onboarding/diagnosis` | Quick Start (3 clips) |
| `app/onboarding/situations/page.tsx` | `/onboarding/situations` | Situation selection |

### 7.2 Data Management

| File | Purpose |
|------|---------|
| `lib/onboardingStore.ts` | Onboarding data storage |
| `lib/quickStartSummary.ts` | Quick start results & summary |
| `lib/diagnosticSummary.ts` | Legacy diagnostic (analytics only) |
| `lib/storyClient.ts` | Story loading/saving |
| `lib/clipStorage.ts` | Clip data management |
| `lib/clipToStoryConverter.ts` | Clips → Stories conversion |

### 7.3 API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/clips/diagnostic` | GET | Fetch diagnostic clips |
| `/api/clips/feed` | POST | Fetch adaptive practice feed |
| `/api/clips/generate` | POST | Generate clips via OpenAI (legacy) |
| `/api/check-answer` | POST | Check user answer, return feedback |
| `/api/audio/generate` | POST | Generate audio via TTS |
| `/api/audio/url` | GET | Get signed audio URL |
| `/api/audio/metadata` | GET | Get audio status from DB |

### 7.4 Practice Session

| File | Route | Purpose |
|------|-------|---------|
| `app/(app)/practice/select/page.tsx` | `/practice/select` | Daily story selection |
| `app/(app)/practice/story/[id]/page.tsx` | `/practice/story/[id]` | Story detail |
| `app/(app)/practice/respond/page.tsx` | `/practice/respond` | Clip practice |

---

## 8. FUTURE IMPROVEMENTS

### 8.1 Planned Features

1. **True daily rotation:**
   - Rotate daily story automatically at midnight
   - Shuffle story order to keep content fresh

2. **Adaptive difficulty:**
   - Track user performance over time
   - Adjust CEFR level dynamically
   - Fetch harder/easier clips based on accuracy

3. **Situation-based progression:**
   - User completes "Work" track → unlock "Social" track
   - Progress visualization per situation

4. **Supabase sync:**
   - Move all localStorage data to Supabase
   - Enable cross-device sync
   - Real-time progress updates

5. **Offline support:**
   - Pre-cache audio files
   - Allow practice without internet
   - Sync results when online

### 8.2 Technical Debt

1. **Audio generation:**
   - Implement audio pre-generation for common clips
   - Reduce latency for first-time users

2. **localStorage limits:**
   - localStorage has ~5-10MB limit
   - Need to prune old stories/audio URLs

3. **Error handling:**
   - Add retry logic for failed API calls
   - Better user-facing error messages

4. **Performance:**
   - Lazy-load stories (don't fetch all at once)
   - Implement pagination for story list

---

## 9. DEBUGGING CHECKLIST

**If user has no stories:**
1. Check `localStorage.userStories` exists
2. Check `localStorage.quickStartSummary` exists
3. Check `localStorage.onboardingData.situations` exists
4. Try fetching feed manually: `POST /api/clips/feed`

**If audio not playing:**
1. Check `clip_audio` table for clip_id
2. Check `audioStatus` in component state
3. Verify Vercel Blob storage has file
4. Check signed URL expiry

**If diagnostic not saving:**
1. Check `localStorage.quickStartClipResults` after each clip
2. Verify `/api/check-answer` returns valid response
3. Check `completeQuickStart()` was called after 3rd clip

**If navigation broken:**
1. Check onboarding sequence: welcome → diagnosis → situations → select
2. Verify `router.push()` calls in each page
3. Check `localStorage` persistence between pages

---

## 10. GLOSSARY

| Term | Definition |
|------|------------|
| **Quick Start** | 3-clip diagnostic to assess user level (replaces full diagnostic) |
| **Story** | Group of 3 clips with shared situation/theme |
| **Situation** | Practice context (work, daily, travel, etc.) |
| **CEFR** | Common European Framework of Reference (A1, A2, B1, B2) |
| **Adaptive Feed** | Clips selected based on user's quick start results |
| **startingDifficulty** | User's initial level (15, 25, 35, or 55) |
| **missedRate** | Fraction of diagnostic clips missed/skipped |
| **attemptAccuracy** | Average accuracy over attempted clips |
| **clipType** | 'diagnostic' | 'practice' | 'story' |
| **voiceMode** | 'clean_normal' | 'clean_slow' | 'device' (browser TTS) |
| **contentHash** | SHA256 hash of transcript + voiceMode + clipType |

---

**End of Documentation**


