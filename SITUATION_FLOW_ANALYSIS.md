# Situation Selection Flow Analysis

**Date:** 2026-01-30  
**Status:** ⚠️ **PARTIAL IMPLEMENTATION** - Only first situation is used

---

## Executive Summary

**Problem Found:** User can select up to 3 situations in onboarding, but only the FIRST situation is used for clip filtering. The other 2 selections are ignored.

**Impact:** Users selecting ['work', 'daily', 'media'] will only get 'work' clips. Their other preferences are unused.

**Fix Required:** Update the Feed API and frontend to support multiple situation filtering.

---

## Current Flow (Traced)

### 1. Onboarding: User Selects Situations

**File:** `app/(app)/onboarding/situations/page.tsx`

```typescript
// User can select up to 3 situations
const MAX_SELECTIONS = 3

// Available options:
const situations = [
  { id: 'work', emoji: '💼', label: 'At work' },
  { id: 'daily', emoji: '💬', label: 'With friends & family' },
  { id: 'travel', emoji: '✈️', label: 'While traveling' },
  { id: 'media', emoji: '🎬', label: 'In movies & shows' },
  { id: 'formal', emoji: '🎤', label: 'In formal settings' },
  { id: 'general', emoji: '🌍', label: 'Everywhere' }
]
```

**User Selection Example:**
```
✅ work
✅ media
✅ travel
```

**Stored in localStorage:**
```json
{
  "situations": ["work", "media", "travel"]
}
```

---

### 2. Storage: onboardingStore

**File:** `lib/onboardingStore.ts`

```typescript
export interface OnboardingData {
  situations?: SituationKey[]  // Array of situation keys
}

export type SituationKey = 
  | 'work_meetings'
  | 'daily'
  | 'travel'
  | 'videos_shows'
  | 'interviews_presentations'
  | 'general'
```

**Storage mechanism:**
- `setOnboardingData({ situations: ['work', 'media', 'travel'] })`
- Stored in `localStorage.getItem('onboardingData')`
- Retrieved with `getOnboardingData()`

✅ **Status:** Working correctly - all 3 situations are stored

---

### 3. Practice Select Page: Loading Clips

**File:** `app/(app)/practice/select/page.tsx`

```typescript
const onboardingData = getOnboardingData()

// ⚠️ PROBLEM: Only takes first situation
const situationKey = onboardingData.situations && onboardingData.situations.length > 0
  ? onboardingData.situations[0]  // ❌ Only using situations[0]
  : 'general'

// Map to clip situation format
const situation = mapSituationKeyToClipSituation(situationKey)
// 'work_meetings' → 'work'
// 'videos_shows' → 'media'

// Build API request
const params = new URLSearchParams({
  cefr: 'B1',
  // ⚠️ Only passes ONE situation
})
params.append('situation', situation)  // e.g., 'work'

const response = await fetch(`/api/clips/feed?${params.toString()}`)
```

**What happens:**
- User selects: `['work', 'media', 'travel']`
- Code uses: `situations[0]` = `'work'`
- API receives: `situation=work`
- Result: Only work clips are scored higher, media/travel preferences ignored

⚠️ **Status:** Only first situation used - **THIS IS THE PROBLEM**

---

### 4. Feed API: Filtering Clips

**File:** `app/api/clips/feed/route.ts`

```typescript
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const situationParam = searchParams.get('situation')  // Single value
  
  const situation = situationParam || undefined
  
  // Fetch ALL practice clips (no DB-level filtering)
  const { data, error } = await supabase
    .from('curated_clips')
    .select('*')
    .eq('clip_type', 'practice')
  
  // Score clips client-side
  const scoredClips = allClips.map(clip => {
    let score = 0
    
    // Situation matching
    if (situation && clip.situation) {
      const clipSituation = clip.situation.toLowerCase()
      const requestedSituation = situation.toLowerCase()
      
      if (clipSituation === requestedSituation || 
          clipSituation.includes(requestedSituation)) {
        score += 500  // High priority for situation match
      }
    }
    
    return { clip, score }
  })
  
  // Return top-scored clips
  return topClips.slice(0, limit)
}
```

**Current Behavior:**
- Accepts: Single `situation` query param
- Scoring: +500 for matching that ONE situation
- Result: Clips matching the ONE situation are prioritized

⚠️ **Status:** API only supports single situation - **NEEDS UPDATE**

---

## The Problem Visualized

```
┌─────────────────────────┐
│   User Onboarding       │
│                         │
│ Selects 3 situations:   │
│  ✅ work                │
│  ✅ media               │  
│  ✅ travel              │
└───────────┬─────────────┘
            │
            │ Stored in localStorage
            ▼
┌─────────────────────────┐
│   localStorage          │
│                         │
│ {                       │
│   situations: [         │
│     'work',             │
│     'media',            │
│     'travel'            │
│   ]                     │
│ }                       │
└───────────┬─────────────┘
            │
            │ getOnboardingData()
            ▼
┌─────────────────────────┐
│  Practice Select Page   │
│                         │
│ situationKey =          │
│   situations[0]  ❌     │ ← ONLY FIRST!
│   = 'work'              │
│                         │
│ (media & travel ignored)│
└───────────┬─────────────┘
            │
            │ API call: ?situation=work
            ▼
┌─────────────────────────┐
│      Feed API           │
│                         │
│ Scores clips:           │
│  - work clips: +500     │
│  - media clips: +0      │ ← Not prioritized
│  - travel clips: +0     │ ← Not prioritized
│                         │
│ Returns: Mostly work    │
└─────────────────────────┘
```

---

## Impact Assessment

### Current User Experience

**User selects:** Work, Media, Travel

**What they expect:**
- Mix of clips from all 3 situations
- Variety across their interests

**What they actually get:**
- Mostly work clips
- Media/travel preferences completely ignored

### Severity

**High Priority Issue**
- Users can select up to 3 situations but only 1 is used
- This defeats the purpose of multi-selection
- Users expect personalized content, but get limited variety

---

## Recommended Fix

### Option A: Multiple Situation Support (Recommended)

Update API to accept multiple situations and score all of them.

**API Changes:**

```typescript
// Accept comma-separated situations
const situationsParam = searchParams.get('situations')
const situations = situationsParam 
  ? situationsParam.split(',').map(s => s.trim())
  : undefined

// Score clips for ANY matching situation
if (situations && situations.length > 0 && clip.situation) {
  const clipSituation = clip.situation.toLowerCase()
  
  // Check if clip matches any user situation
  const hasMatch = situations.some(userSit => {
    const requestedSituation = userSit.toLowerCase()
    return clipSituation === requestedSituation || 
           clipSituation.includes(requestedSituation)
  })
  
  if (hasMatch) {
    score += 500
  }
}
```

**Frontend Changes:**

```typescript
// In practice/select/page.tsx
const onboardingData = getOnboardingData()
const situationKeys = onboardingData.situations || ['general']

// Map all situations
const situations = situationKeys.map(key => 
  mapSituationKeyToClipSituation(key)
)

// Pass as comma-separated string
params.append('situations', situations.join(','))

// e.g., ?cefr=B1&situations=work,media,travel
```

**Result:**
- All 3 user situations are used
- Clips from any of the 3 situations get +500 score
- Better variety and personalization

---

### Option B: Rotate Through Situations (Alternative)

Keep API accepting single situation, but rotate through user's selections.

**Frontend Changes:**

```typescript
// Store current situation index in localStorage
const currentSituationIndex = parseInt(
  localStorage.getItem('currentSituationIndex') || '0'
)

const situationKey = onboardingData.situations[currentSituationIndex]
const situation = mapSituationKeyToClipSituation(situationKey)

// Rotate to next situation for next fetch
const nextIndex = (currentSituationIndex + 1) % onboardingData.situations.length
localStorage.setItem('currentSituationIndex', nextIndex.toString())
```

**Result:**
- Each feed fetch uses a different situation
- Day 1: work clips, Day 2: media clips, Day 3: travel clips, Day 4: work again...
- All situations eventually used, but not in same batch

**Downside:**
- Less variety in single feed
- Users need to complete multiple sessions to see all their preferences

---

## Recommendation

**Implement Option A (Multiple Situation Support)**

**Reasons:**
1. ✅ Better user experience - variety in single session
2. ✅ Matches user expectation (I selected 3, I want all 3)
3. ✅ More personalized feed immediately
4. ✅ Simple implementation - just update scoring logic
5. ✅ No state management needed (no rotation tracking)

**Implementation Steps:**

1. Update `app/api/clips/feed/route.ts`:
   - Accept `situations` param (comma-separated)
   - Update scoring to match ANY situation in array
   
2. Update `app/(app)/practice/select/page.tsx`:
   - Map all user situations (not just first)
   - Pass as comma-separated string
   
3. Test:
   - User selects ['work', 'media', 'travel']
   - Feed returns mix of all 3
   - Verify no clips from 'daily' or 'formal' (unselected)

---

## Testing Checklist

After implementing the fix:

### ✅ Basic Flow
- [ ] User selects 3 situations in onboarding
- [ ] All 3 are stored in localStorage
- [ ] Practice page loads clips
- [ ] API receives all 3 situations
- [ ] Response includes clips from all 3

### ✅ Edge Cases
- [ ] User selects only 1 situation → works correctly
- [ ] User selects 'general' → gets all situations
- [ ] No situations selected → defaults to 'general'
- [ ] Old users with legacy data → migration works

### ✅ Scoring
- [ ] Clips from selected situations score +500
- [ ] Clips from unselected situations score +0
- [ ] Final feed has good mix of selected situations
- [ ] CEFR filtering still works correctly

---

## Current Status Summary

| Component | Status | Issue |
|-----------|--------|-------|
| Onboarding UI | ✅ Working | User can select up to 3 |
| localStorage | ✅ Working | All 3 stored correctly |
| Practice Page | ⚠️ Partial | Only uses situations[0] |
| Feed API | ⚠️ Partial | Only accepts 1 situation |
| Scoring | ⚠️ Partial | Only scores 1 situation |

**Overall:** ⚠️ Multi-selection works but only first selection is used

---

## Files That Need Changes

### Must Change
1. `app/api/clips/feed/route.ts` - Accept multiple situations
2. `app/(app)/practice/select/page.tsx` - Pass all situations to API

### Optional (for better UX)
3. Add logging to show which situations influenced the feed
4. Update UI to show "Today's clips from: Work, Media, Travel"

---

## Conclusion

The situation selection flow is **partially implemented**. Users can select multiple situations, but the system only uses the first one. 

**To fully implement the feature:**
- Update Feed API to accept multiple situations
- Update Practice Select Page to pass all selected situations
- Test that clips from all selected situations appear in feed

**Priority:** High - this is a user-facing feature that currently doesn't work as expected.


