# Quick Flow Summary

## 🎯 Complete User Journey

### 1️⃣ ONBOARDING (First Time User)

```
Landing Page → Auth → Profile → Welcome → Quick Start → Situations → Practice Select
    |            |        |         |           |             |              |
    /         /auth    /profile  /welcome   /diagnosis   /situations    /practice/select
                                              
    stores:     stores:            stores:        stores:
                userFirstName     quickStart     onboardingData
                                  Summary        .situations
```

### 2️⃣ CLIP GENERATION (After Onboarding)

```
Practice Select Page
    │
    ├─ Load userStories from localStorage
    │  └─ IF EXISTS: Use cached stories ✅
    │  └─ IF MISSING: ⬇️
    │
    ├─ Fetch Adaptive Feed
    │  └─ POST /api/clips/feed
    │      {
    │        cefr: 'A2',           ← from quickStartSummary
    │        situation: 'work',    ← from onboardingData
    │        limit: 10
    │      }
    │
    ├─ Convert Clips to Stories
    │  └─ Group by situation
    │  └─ 3 clips per story
    │  └─ Result: 3-4 stories
    │
    └─ Save to localStorage
       └─ localStorage.setItem('userStories', stories)
```

### 3️⃣ DAILY PRACTICE SESSION

```
Today's Practice Card
    │
    ├─ Daily Story = stories[0]
    │
    ├─ Check Completion
    │  └─ lastPracticeDate === today ? ✅ : 🔓
    │
    └─ Start Practice
        │
        └─ FOR EACH CLIP (1/3, 2/3, 3/3):
            │
            ├─ Generate/Fetch Audio
            │  └─ Check Supabase clip_audio table
            │  └─ If missing: POST /api/audio/generate
            │
            ├─ User Plays & Types/Speaks Answer
            │
            ├─ Check Answer
            │  └─ POST /api/check-answer
            │  └─ Returns: accuracyPercent + feedback
            │
            ├─ Show Results
            │
            └─ Next Clip or Complete Story
```

### 4️⃣ DEVICE PERSISTENCE

```
localStorage Keys:

┌─────────────────────────────────────────────────────┐
│ USER DATA                                           │
├─────────────────────────────────────────────────────┤
│ userFirstName: "John"                               │
│ userLastName: "Doe"                                 │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ ONBOARDING                                          │
├─────────────────────────────────────────────────────┤
│ onboardingData: {                                   │
│   situations: ['work_meetings', 'daily']            │
│ }                                                   │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ DIAGNOSTIC RESULTS                                  │
├─────────────────────────────────────────────────────┤
│ quickStartSummary: {                                │
│   missedRate: 0.33,                                 │
│   attemptAccuracy: 65.5,                            │
│   startingDifficulty: 35                            │
│ }                                                   │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ PRACTICE CONTENT                                    │
├─────────────────────────────────────────────────────┤
│ userStories: [                                      │
│   { id: 'story-1', clips: [...], situation: 'Work' }│
│   { id: 'story-2', clips: [...], situation: 'Daily'}│
│   { id: 'story-3', clips: [...], situation: 'Work' }│
│ ]                                                   │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ SESSION TRACKING                                    │
├─────────────────────────────────────────────────────┤
│ lastPracticeDate: "2026-01-29"                      │
│ streak: 5                                           │
└─────────────────────────────────────────────────────┘
```

---

## 🔄 UPDATE MECHANISMS

### When New Clips Are Generated

| Event | Trigger | Action |
|-------|---------|--------|
| **First time user** | After diagnostic | Fetch 10 clips → 3-4 stories |
| **Daily practice** | User opens app | Use cached stories (no fetch) |
| **All stories done** | Last clip complete | Fetch new adaptive feed |
| **Manual refresh** | User requests | Clear cache, re-fetch |

### Audio Generation Flow

```
User starts clip
    │
    ├─ Check Supabase clip_audio table
    │  └─ contentHash = SHA256(transcript + voiceMode + clipType)
    │
    ├─ IF EXISTS & status='ready':
    │  └─ Return signed URL (1 hour expiry)
    │
    └─ IF MISSING:
        └─ Generate via OpenAI TTS
        └─ Upload to Vercel Blob
        └─ Store metadata in Supabase
        └─ Return signed URL
```

---

## 📊 QUICK START ALGORITHM

```javascript
// After 3 diagnostic clips:

missedRate = (skipped + noInput) / 3
attemptAccuracy = average(accuracyPercent) for attempted clips

if (missedRate >= 0.4)           → startingDifficulty = 15 (A1)
else if (attemptAccuracy >= 70)  → startingDifficulty = 55 (B2)
else if (attemptAccuracy >= 40)  → startingDifficulty = 35 (B1)
else                             → startingDifficulty = 25 (A2)

feedStartDifficulty = max(0, startingDifficulty - 20)

// Map to CEFR for feed API:
if (feedStartDifficulty < 15)   → cefr = 'A1'
else if (< 25)                   → cefr = 'A2'
else if (< 35)                   → cefr = 'B1'
else                             → cefr = 'B2'
```

---

## 🗂️ KEY FILES QUICK REFERENCE

### Onboarding Pages
- `/` - Landing
- `/auth/profile` - Name input
- `/onboarding/welcome` - Greeting
- `/onboarding/diagnosis` - Quick Start (3 clips)
- `/onboarding/situations` - Situation selection

### Practice Pages
- `/practice/select` - Daily practice card
- `/practice/story/[id]` - Story detail
- `/practice/respond` - Clip practice

### API Routes
- `GET /api/clips/diagnostic` - Fetch diagnostic clips
- `POST /api/clips/feed` - Fetch adaptive feed
- `POST /api/check-answer` - Check user answer
- `POST /api/audio/generate` - Generate TTS audio
- `GET /api/audio/url` - Get signed audio URL

### Data Modules
- `lib/onboardingStore.ts` - Onboarding data
- `lib/quickStartSummary.ts` - Quick start results
- `lib/storyClient.ts` - Story management
- `lib/clipToStoryConverter.ts` - Clips → Stories
- `lib/audioApi.ts` - Audio generation/fetching

---

## 🐛 Common Issues & Fixes

### No stories showing
```bash
# Check localStorage
localStorage.getItem('userStories')
localStorage.getItem('quickStartSummary')
localStorage.getItem('onboardingData')

# If missing, clear and restart onboarding:
localStorage.clear()
# Navigate to /onboarding/welcome
```

### Audio not playing
```bash
# Check Supabase clip_audio table
SELECT * FROM clip_audio WHERE clip_id = 'your-clip-id';

# Check Vercel Blob storage
# Verify audioUrl in response is valid HTTPS URL
```

### Diagnostic not completing
```bash
# After each clip, check:
localStorage.getItem('quickStartClipResults')
# Should have 1, 2, then 3 items

# After 3rd clip:
localStorage.getItem('quickStartSummary')
# Should exist with startingDifficulty
```

---

## 🎯 Data Flow at a Glance

```
ONBOARDING DATA FLOW:
localStorage.onboardingData.situations
    ↓
POST /api/clips/feed { cefr, situation }
    ↓
Supabase.curated_clips (WHERE clip_type='practice')
    ↓
Clips[] → convertClipsToStories() → Stories[]
    ↓
localStorage.userStories
    ↓
Practice Select Page (daily story = stories[0])
```

```
AUDIO GENERATION FLOW:
practiceData.audioStatus = 'needs_generation'
    ↓
getAudioMetadata(clipId, voiceMode, clipType)
    ↓
Supabase.clip_audio (check contentHash)
    ↓
IF EXISTS: return audioUrl
IF MISSING:
    ↓
POST /api/audio/generate
    ↓
OpenAI TTS API → Vercel Blob → Supabase.clip_audio
    ↓
return audioUrl (signed, 1 hour expiry)
```

```
ANSWER CHECKING FLOW:
userInput (text or speech-to-text)
    ↓
POST /api/check-answer { clipId, userInput, transcript }
    ↓
Fuzzy word matching + error categorization
    ↓
{ accuracyPercent, feedback: [...] }
    ↓
Show feedback UI (correct/incorrect words, explanations)
```

---

**For detailed documentation, see:** `COMPLETE_FLOW_DOCUMENTATION.md`



