# Onboarding & Routing Flow - End-to-End Map

## Overview
This document maps the complete user journey from first visit through authentication, onboarding, diagnostic test, and practice flow.

---

## 1. User Journey Map (Happy Path)

### Step 1: Landing Page
**Route:** `/`  
**File:** `app/page.tsx`  
**Condition to Enter:** None (public route)  
**Reads:**
- None (auth check is placeholder, always returns `false`)

**Writes:**
- None

**Next Route:**
- If authenticated (currently always false): `/practice`
- If not authenticated: `/auth`

**Key Logic:**
- `useEffect` checks auth status (placeholder - always `false`)
- CTA button links to `/auth` or `/practice` based on `isAuthenticated`

---

### Step 2: Auth Choice Page
**Route:** `/auth`  
**File:** `app/auth/page.tsx`  
**Condition to Enter:** None (public route)  
**Reads:**
- None

**Writes:**
- None

**Next Route:**
- Google/Apple (TODO): `/auth/profile`
- Email signup: `/auth/signup/email`
- Login link: `/auth/login`

**Key Logic:**
- Social auth buttons route directly to profile (not implemented)
- Email button routes to `/auth/signup/email`

---

### Step 3a: Email Signup (Alternative Path)
**Route:** `/auth/signup/email`  
**File:** `app/auth/signup/email/page.tsx`  
**Condition to Enter:** None (public route)  
**Reads:**
- None

**Writes:**
- None (signup is TODO - placeholder)

**Next Route:**
- After submit: `/auth/profile`

**Key Logic:**
- Form validation (email format, password length)
- Placeholder: setTimeout then redirect (no actual signup)

---

### Step 3b: Login (Alternative Path)
**Route:** `/auth/login`  
**File:** `app/auth/login/page.tsx`  
**Condition to Enter:** None (public route)  
**Reads:**
- None

**Writes:**
- None (login is TODO - placeholder)

**Next Route:**
- After submit: `/practice` (placeholder)
- Google/Apple: `/practice/select` (placeholder)

**Key Logic:**
- Form validation
- Placeholder: setTimeout then redirect (no actual login)

---

### Step 4: Profile Setup
**Route:** `/auth/profile`  
**File:** `app/auth/profile/page.tsx`  
**Condition to Enter:** None (public route)  
**Reads:**
- None

**Writes:**
- `localStorage.setItem('userFirstName', firstName)`

**Next Route:**
- After submit: `/onboarding/diagnosis`

**Key Logic:**
- Requires firstName (non-empty after trim)
- Stores firstName in localStorage
- Redirects to diagnostic (skips traditional onboarding questions)

**Assumptions:**
- Profile page is the entry point to onboarding
- No Supabase user profile creation yet (TODO)

---

### Step 5: Diagnostic Test
**Route:** `/onboarding/diagnosis`  
**File:** `app/onboarding/diagnosis/page.tsx`  
**Condition to Enter:**
- `localStorage.getItem('userFirstName')` exists (checked in `app/onboarding/layout.tsx`)

**Reads:**
- `localStorage.getItem('diagnosticClips')` (if exists)
- `localStorage.getItem('onboardingData')` (for CEFR level)
- API: `GET /api/clips/diagnostic` (if localStorage empty)

**Writes:**
- `localStorage.setItem('diagnosticClips', JSON.stringify(clips))` (on load)
- `localStorage.setItem('diagnosticResults', JSON.stringify(results))` (per clip via `storeDiagnosticResult()`)
- `localStorage.setItem('diagnosticSummary', JSON.stringify(summary))` (on completion via `completeDiagnostic()`)
- `localStorage.setItem('showClipsReadyOnce', '1')` (on completion)

**Next Route:**
- After 5 clips completed: `/practice/select`
- Between clips: stays on same page (advances clip index)

**Key Logic:**
- Loads 5 diagnostic clips (from localStorage or API)
- User listens and types response for each clip
- Minimum input: 3 characters (after trim)
- Calls `/api/check-answer` for each submission
- Extracts error categories from `practiceSteps`
- Stores result after each clip via `storeDiagnosticResult()`
- After 5 clips: calls `completeDiagnostic()` → builds summary → navigates to `/practice/select`

**Functions:**
- `storeDiagnosticResult()` - `lib/diagnosticSummary.ts:43`
- `isDiagnosticComplete()` - `lib/diagnosticSummary.ts:109`
- `completeDiagnostic()` - `lib/diagnosticSummary.ts:268`
- `getOnboardingData()` - `lib/onboardingStore.ts:15`

**Route Guard:**
- `app/onboarding/layout.tsx:18` checks for `userFirstName`
- If missing → redirects to `/auth/profile`

---

### Step 6: Practice Select (Story List)
**Route:** `/practice/select`  
**File:** `app/(app)/practice/select/page.tsx`  
**Condition to Enter:** None (no explicit guard)  
**Reads:**
- `localStorage.getItem('userStories')` (priority 1)
- `localStorage.getItem('diagnosticSummary')` (for adaptive feed)
- `localStorage.getItem('diagnosticClips')` (fallback conversion)
- `localStorage.getItem('userClips')` (fallback conversion)
- `localStorage.getItem('showClipsReadyOnce')` (for modal)
- `localStorage.getItem('userFirstName')` (for back button)
- API: `GET /api/clips/feed?cefr=...&weakness=...&situation=...` (if diagnosticSummary exists)

**Writes:**
- `localStorage.setItem('userClips', JSON.stringify(clips))` (if feed fetched)
- `localStorage.setItem('userStories', JSON.stringify(stories))` (if feed fetched or converted)
- `localStorage.removeItem('showClipsReadyOnce')` (after showing modal)

**Next Route:**
- Click story: `/practice/story/[id]`

**Key Logic:**
- **Priority 1:** Load `userStories` from localStorage (if exists, use it and skip feed)
- **Priority 2:** If `diagnosticSummary` exists:
  - Fetch adaptive feed from `/api/clips/feed` with CEFR, weaknessRank, topicPrefs
  - Convert feed clips to stories
  - Sort stories by `weaknessRank` (weighted scoring)
  - Save to localStorage
- **Priority 3:** Fallback: Convert `diagnosticClips` or `userClips` to stories
- **Priority 4:** Fallback: Use `mockStories`
- Shows "Clips Ready" modal if `showClipsReadyOnce === '1'`

**Functions:**
- `loadDiagnosticSummary()` - `lib/diagnosticSummary.ts:290`
- `getOnboardingData()` - `lib/onboardingStore.ts:15`
- `convertClipsToStories()` - `lib/clipToStoryConverter.ts`
- `loadUserStories()` - `lib/storyClient.ts`
- `saveUserStories()` - `lib/storyClient.ts`

---

### Step 7: Story Detail
**Route:** `/practice/story/[id]`  
**File:** `app/(app)/practice/story/[id]/page.tsx`  
**Condition to Enter:** None (no explicit guard)  
**Reads:**
- `localStorage.getItem('userClips')` (for clip data)
- `localStorage.getItem('cue_done_{storyId}_{clipId}')` (completion state)
- `getStoryByIdClient()` - `lib/storyClient.ts`

**Writes:**
- `localStorage.setItem('cue_done_{storyId}_{clipId}', 'true')` (on clip completion)

**Next Route:**
- Click clip: `/practice/respond?clipId=...&storyId=...`
- Back: `/practice/select`

**Key Logic:**
- Loads story by ID from `userStories` or `mockStories`
- Shows list of clips in story
- Tracks completion per clip via localStorage keys

---

### Step 8: Practice Respond
**Route:** `/practice/respond?clipId=...&storyId=...`  
**File:** `app/(app)/practice/respond/page.tsx`  
**Condition to Enter:** None (no explicit guard)  
**Reads:**
- Query params: `clipId`, `storyId`, `focusInsightId`
- `localStorage.getItem('userClips')` (for clip transcript)
- Audio metadata from `/api/audio/metadata`

**Writes:**
- Audio generation via `/api/audio/generate` (if needed)
- Progress tracking (via `ClipLessonProgressProvider`)

**Next Route:**
- After submit: `/practice/review?clipId=...&storyId=...`

**Key Logic:**
- Loads clip transcript
- Generates/loads audio
- User listens and types response
- Calls `/api/check-answer` on submit
- Navigates to review page

---

### Step 9: Practice Review
**Route:** `/practice/review?clipId=...&storyId=...`  
**File:** `app/(app)/practice/review/page.tsx`  
**Condition to Enter:** None (no explicit guard)  
**Reads:**
- Query params: `clipId`, `storyId`
- Alignment result from `/api/check-answer` (passed via navigation state or re-fetched)

**Writes:**
- If diagnostic mode: `storeDiagnosticResult()` (via `lib/diagnosticSummary.ts:43`)
- If diagnostic complete: `completeDiagnostic()` → `diagnosticSummary` in localStorage

**Next Route:**
- After review: `/practice/story/[id]` (back to story)
- If diagnostic complete: `/practice/select` (redirect)

**Key Logic:**
- Shows alignment results and feedback
- If `clipId.startsWith('diagnostic-')`: extracts categories and stores diagnostic result
- Checks `isDiagnosticComplete(5)` → if true, completes diagnostic and redirects

---

## 2. Routing & Gating Rules

### Source of Truth: "Where to Send User Next"

**Primary Sources:**
1. **Client-side redirects** (`router.push()`)
   - Most navigation is client-side via Next.js `useRouter()`
   - No middleware.ts found
   - No server-side redirects

2. **Layout guards** (`app/onboarding/layout.tsx`)
   - Checks `userFirstName` in localStorage
   - Guards `/onboarding/genre` and `/onboarding/ready` (requires `onboardingData.listeningDifficulties`)

3. **Page-level guards** (in `useEffect`)
   - `app/(app)/practice/select/page.tsx` checks for existing stories
   - `app/onboarding/diagnosis/page.tsx` loads clips on mount

### Conditions/Flags Used

#### Authentication Status
- **Check:** `localStorage.getItem('userFirstName')`
- **Location:** `app/onboarding/layout.tsx:18`
- **Purpose:** Gate onboarding pages
- **Note:** No actual Supabase auth check yet (TODO)

#### Profile Completion
- **Check:** `localStorage.getItem('userFirstName')`
- **Location:** `app/onboarding/layout.tsx:18`, `app/(app)/practice/select/page.tsx:86`
- **Purpose:** Determine if user has completed profile setup

#### Onboarding Data
- **Check:** `localStorage.getItem('onboardingData')`
- **Location:** `app/onboarding/layout.tsx:27`
- **Structure:** `{ listeningDifficulties: string[], preferredGenre?: string, topics?: string[], level?: string }`
- **Purpose:** Gate `/onboarding/genre` and `/onboarding/ready` (requires `listeningDifficulties`)

#### Diagnostic Completion
- **Check:** `isDiagnosticComplete(expectedCount)` - `lib/diagnosticSummary.ts:109`
- **Location:** `app/onboarding/diagnosis/page.tsx:412`, `app/(app)/practice/review/page.tsx` (if diagnostic mode)
- **Purpose:** Determine if 5 clips completed
- **Storage:** `localStorage.getItem('diagnosticResults')` (array of results)

#### Diagnostic Summary
- **Check:** `loadDiagnosticSummary()` - `lib/diagnosticSummary.ts:290`
- **Location:** `app/(app)/practice/select/page.tsx:62`
- **Purpose:** Fetch adaptive feed if summary exists
- **Storage:** `localStorage.getItem('diagnosticSummary')`

#### Skip Onboarding / Dev Mode
- **Feature Flag:** `USE_DIAGNOSTIC = true` in `app/onboarding/ready/page.tsx:18`
- **Purpose:** Toggle between diagnostic flow and AI generation flow
- **Note:** Currently always uses diagnostic flow

#### Guest Mode
- **Check:** `resolveUserId()` - `lib/supabase/server.ts:83`
- **Purpose:** API routes use dev guest UUID if no auth user
- **Storage:** No localStorage, uses server-side dev guest UUID

---

## 3. Onboarding Questions Status

### Current State: **SKIPPED** (Traditional Questions Not Shown)

**Why:**
- Profile page (`/auth/profile`) redirects directly to `/onboarding/diagnosis` after firstName
- No traditional onboarding question pages are visited in the happy path

### Onboarding Question Pages (Exist but Not Used in Happy Path)

#### `/onboarding/topics`
**File:** `app/onboarding/topics/page.tsx`  
**Status:** Not shown in happy path  
**Condition to Show:** Would require routing from profile → topics (currently skipped)  
**Data:**
- Reads: `getOnboardingData().topics`
- Writes: `setOnboardingData({ topics: Array.from(selectedTopics) })`
- Options: `['work', 'casual', 'tech', 'travel', 'culture']`
- Next: `/onboarding/level`

#### `/onboarding/level`
**File:** `app/onboarding/level/page.tsx`  
**Status:** Not shown in happy path  
**Condition to Show:** Would require routing from topics → level (currently skipped)  
**Data:**
- Reads: `getOnboardingData().level`
- Writes: `setOnboardingData({ level: selectedLevel })`
- Options: `['starting', 'comfortable', 'confident', 'not-sure']`
- Next: `/onboarding/ready`

#### `/onboarding/genre`
**File:** `app/onboarding/genre/page.tsx`  
**Status:** Not shown in happy path  
**Condition to Show:** Requires `onboardingData.listeningDifficulties` (set by diagnostic)  
**Data:**
- Reads: `getOnboardingData().preferredGenre`
- Writes: `setOnboardingData({ preferredGenre: selected })`
- Options: `['Everyday conversations', 'Work & meetings', 'Social conversations', 'Travel & daily interactions', 'Videos & shows']`
- Next: `/onboarding/level-select`

#### `/onboarding/level-select`
**File:** `app/onboarding/level-select/page.tsx`  
**Status:** Not shown in happy path  
**Condition to Show:** Requires routing from genre → level-select (currently skipped)  
**Data:**
- Reads: `getUserPreferences().userLevel` (different store than onboardingData)
- Writes: `setUserPreferences({ userLevel })`
- Options: `['Beginner', 'Intermediate', 'Advanced', 'Not sure']`
- Next: `/onboarding/ready`

### How Onboarding Data is Used Later

**Storage:** `localStorage.getItem('onboardingData')`  
**Structure:**
```typescript
{
  listeningDifficulties: string[],  // Set by diagnostic (not traditional questions)
  preferredGenre?: string,          // Optional, from genre page
  topics?: string[],                // Optional, from topics page
  level?: string                    // Optional, from level page
}
```

**Usage:**
1. **Diagnostic Summary:** `level` is used to determine CEFR level (`lib/diagnosticSummary.ts:425`)
2. **Adaptive Feed:** `topics[0]` is used as `preferredGenre` for `/api/clips/feed` (`app/(app)/practice/select/page.tsx:115`)
3. **Content Selection:** Not currently used for clip generation (diagnostic flow uses curated clips)

**Assumptions:**
- Traditional onboarding questions (topics, level) are optional/skipped
- Diagnostic test replaces traditional "listening difficulties" question
- `listeningDifficulties` is populated by diagnostic results (error categories)

---

## 4. Flowchart-Style Outline

```
┌─────────────────────────────────────────────────────────────────┐
│ STEP 1: Landing Page                                            │
│ Route: /                                                         │
│ File: app/page.tsx                                               │
│ Condition: None (public)                                         │
│ Reads: None                                                      │
│ Writes: None                                                     │
│ Next: /auth (if not authenticated)                               │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STEP 2: Auth Choice                                             │
│ Route: /auth                                                     │
│ File: app/auth/page.tsx                                          │
│ Condition: None (public)                                         │
│ Reads: None                                                      │
│ Writes: None                                                     │
│ Next: /auth/signup/email OR /auth/login OR /auth/profile        │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STEP 3: Profile Setup                                           │
│ Route: /auth/profile                                            │
│ File: app/auth/profile/page.tsx                                 │
│ Condition: None (public)                                        │
│ Reads: None                                                     │
│ Writes: localStorage['userFirstName'] = firstName               │
│ Next: /onboarding/diagnosis                                     │
│ Functions: handleSubmit() → router.push('/onboarding/diagnosis')│
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STEP 4: Diagnostic Test                                         │
│ Route: /onboarding/diagnosis                                    │
│ File: app/onboarding/diagnosis/page.tsx                        │
│ Condition: localStorage['userFirstName'] exists                 │
│   Guard: app/onboarding/layout.tsx:18                          │
│ Reads:                                                          │
│   - localStorage['diagnosticClips']                            │
│   - localStorage['onboardingData'] (for CEFR)                 │
│   - API: GET /api/clips/diagnostic (if localStorage empty)    │
│ Writes:                                                         │
│   - localStorage['diagnosticClips'] (on load)                 │
│   - localStorage['diagnosticResults'] (per clip)              │
│   - localStorage['diagnosticSummary'] (on completion)          │
│   - localStorage['showClipsReadyOnce'] = '1' (on completion) │
│ Next: /practice/select (after 5 clips)                         │
│ Functions:                                                      │
│   - storeDiagnosticResult() - lib/diagnosticSummary.ts:43     │
│   - completeDiagnostic() - lib/diagnosticSummary.ts:268        │
│   - getOnboardingData() - lib/onboardingStore.ts:15            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STEP 5: Practice Select (Story List)                            │
│ Route: /practice/select                                         │
│ File: app/(app)/practice/select/page.tsx                       │
│ Condition: None (no explicit guard)                             │
│ Reads:                                                          │
│   - localStorage['userStories'] (priority 1)                   │
│   - localStorage['diagnosticSummary'] (for feed)                │
│   - localStorage['showClipsReadyOnce'] (for modal)             │
│   - API: GET /api/clips/feed?cefr=...&weakness=... (if summary)│
│ Writes:                                                         │
│   - localStorage['userClips'] (if feed fetched)                 │
│   - localStorage['userStories'] (if feed/converted)             │
│   - localStorage.removeItem('showClipsReadyOnce')              │
│ Next: /practice/story/[id]                                     │
│ Functions:                                                      │
│   - loadDiagnosticSummary() - lib/diagnosticSummary.ts:290     │
│   - getOnboardingData() - lib/onboardingStore.ts:15           │
│   - convertClipsToStories() - lib/clipToStoryConverter.ts      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STEP 6: Story Detail                                            │
│ Route: /practice/story/[id]                                    │
│ File: app/(app)/practice/story/[id]/page.tsx                  │
│ Condition: None (no explicit guard)                            │
│ Reads:                                                          │
│   - localStorage['userClips']                                  │
│   - localStorage['cue_done_{storyId}_{clipId}']                │
│ Writes:                                                         │
│   - localStorage['cue_done_{storyId}_{clipId}'] = 'true'       │
│ Next: /practice/respond?clipId=...&storyId=...                │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STEP 7: Practice Respond                                        │
│ Route: /practice/respond?clipId=...&storyId=...               │
│ File: app/(app)/practice/respond/page.tsx                     │
│ Condition: None (no explicit guard)                             │
│ Reads:                                                          │
│   - Query params: clipId, storyId                              │
│   - localStorage['userClips']                                  │
│   - API: /api/audio/metadata                                    │
│ Writes:                                                         │
│   - API: /api/audio/generate (if needed)                        │
│ Next: /practice/review?clipId=...&storyId=...                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STEP 8: Practice Review                                         │
│ Route: /practice/review?clipId=...&storyId=...                 │
│ File: app/(app)/practice/review/page.tsx                       │
│ Condition: None (no explicit guard)                            │
│ Reads:                                                          │
│   - Query params: clipId, storyId                               │
│   - API: /api/check-answer (or navigation state)                │
│ Writes:                                                         │
│   - localStorage['diagnosticResults'] (if diagnostic mode)      │
│   - localStorage['diagnosticSummary'] (if diagnostic complete)  │
│ Next: /practice/story/[id] OR /practice/select (if complete)  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. Key Assumptions & Notes

### Assumptions
1. **Authentication:** Currently placeholder - no actual Supabase auth check
2. **Onboarding Questions:** Traditional questions (topics, level) are skipped in happy path
3. **Diagnostic Flow:** Always used (`USE_DIAGNOSTIC = true`)
4. **Guest Mode:** API routes use dev guest UUID if no auth user
5. **Route Guards:** Only `app/onboarding/layout.tsx` has explicit guards
6. **Practice Pages:** No explicit guards - accessible without completing onboarding

### Data Flow Summary

**localStorage Keys Used:**
- `userFirstName` - Profile completion flag
- `onboardingData` - Onboarding answers (JSON)
- `diagnosticClips` - Diagnostic clip data (JSON array)
- `diagnosticResults` - Per-clip diagnostic results (JSON array)
- `diagnosticSummary` - Final diagnostic summary (JSON)
- `showClipsReadyOnce` - One-time modal flag ('1')
- `userClips` - Practice clips (JSON array)
- `userStories` - Practice stories (JSON array)
- `cue_done_{storyId}_{clipId}` - Clip completion flags

**API Endpoints:**
- `GET /api/clips/diagnostic` - Fetch diagnostic clips
- `GET /api/clips/feed?cefr=...&weakness=...&situation=...` - Adaptive feed
- `POST /api/check-answer` - Check user input alignment
- `GET /api/audio/metadata` - Get audio metadata
- `POST /api/audio/generate` - Generate audio

**Supabase Tables (Referenced but not fully integrated):**
- `curated_clips` - Diagnostic and practice clips
- `clip_audio` - Audio generation tracking
- `listening_patterns` - Pattern matching data
- `diagnostic_results` - (Schema exists but not used - using localStorage instead)

---

## 6. Unclear Areas / Questions

1. **Onboarding Questions:** Why do `/onboarding/topics`, `/onboarding/level`, `/onboarding/genre` exist if they're not used in happy path?
2. **Route Guards:** Why are practice pages (`/practice/*`) not gated behind onboarding completion?
3. **Diagnostic vs Traditional:** Is the diagnostic test meant to replace traditional onboarding questions entirely?
4. **Auth Integration:** When will Supabase auth be fully integrated? Currently all auth is localStorage-based.
5. **Onboarding Data Usage:** `listeningDifficulties` is populated by diagnostic, but traditional questions would populate `topics` and `level` - how are these reconciled?

