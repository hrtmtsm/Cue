# Daily Clip Rotation Analysis

**Date:** 2026-01-30  
**Status:** ❌ **CRITICAL BUG: No Story Rotation**

---

## Executive Summary

### 🔴 MAJOR ISSUE FOUND

**Expected:** Users get a new story each day
**Actual:** Users see THE SAME story every day forever

**Impact:** 
- Users practice the same 3 clips repeatedly
- No content variety
- Poor user retention
- Defeats the purpose of having multiple stories

---

## Current Flow Analysis

### 1. Initial Story Loading

**File:** `app/(app)/practice/select/page.tsx` (lines 165-178)

```typescript
// On first load, check localStorage
let userStories = loadUserStories()

if (userStories.length > 0) {
  // ✅ Found cached stories
  console.log('Loaded from userStories:', {
    storyCount: userStories.length,
    storyIds: userStories.map(s => s.id)
  })
  setStories(userStories)
  setIsHydrated(true)
  return  // ❌ Exit early - no feed fetch!
}
```

**What happens:**
- App checks `localStorage.userStories`
- If found, uses cached stories
- **Never fetches new stories** from API again
- Stories are loaded ONCE and cached forever

---

### 2. Daily Story Selection

**File:** `app/(app)/practice/select/page.tsx` (lines 113-134)

```typescript
useEffect(() => {
  if (!isHydrated || stories.length === 0) return

  // ❌ PROBLEM: Always selects first story
  const daily = stories[0]  // Always index 0!

  // Check if completed today
  const today = new Date().toISOString().split('T')[0]
  const lastPracticeDate = localStorage.getItem('lastPracticeDate')
  const completed = lastPracticeDate === today

  setDailyStory(daily)
  setCompletedToday(completed)

  console.log('📅 Daily session selected:', {
    storyId: daily.id,
    title: daily.title,
    completedToday: completed,
    lastPracticeDate,
    today,
  })
}, [isHydrated, stories])
```

**What happens:**
- **Always selects `stories[0]`** (first story)
- No rotation based on date
- No tracking of which stories were completed
- Same story shown every day

---

### 3. Completion Tracking

**File:** `app/(app)/practice/complete/page.tsx` (lines 34-72)

```typescript
useEffect(() => {
  const todayKey = new Date().toISOString().split('T')[0]

  // Mark session completed today
  localStorage.setItem('lastSessionCompleted', todayDateString)

  // Update streak
  const lastPracticeDate = localStorage.getItem('lastPracticeDate')
  const storedStreak = localStorage.getItem('streak')
  
  // Calculate streak
  let nextStreak = currentStreak || 0
  // ... streak calculation logic ...
  
  // ❌ ONLY updates date and streak, NOT story progress
  localStorage.setItem('lastPracticeDate', todayKey)
  localStorage.setItem('streak', String(nextStreak))
}, [])
```

**What happens:**
- Updates `lastPracticeDate` to today
- Updates streak counter
- **Does NOT track which story was completed**
- **Does NOT move to next story**

---

### 4. Next Day Experience

**What happens on Day 2:**

```
Day 1:
├─ Load stories → [Story-1, Story-2, Story-3, ...]
├─ Daily story = stories[0] = Story-1
├─ User completes Story-1
├─ lastPracticeDate = "2026-01-29"
└─ User locked out until tomorrow

Day 2:
├─ Load stories → [Story-1, Story-2, Story-3, ...] (same array)
├─ Daily story = stories[0] = Story-1  ❌ SAME STORY!
├─ lastPracticeDate = "2026-01-29" ≠ today
├─ User can practice again
└─ User sees Story-1 AGAIN

Day 3:
├─ Daily story = stories[0] = Story-1  ❌ SAME STORY AGAIN!
└─ User sees Story-1 for the 3rd time
```

**Result:** User practices the same 3 clips every day forever.

---

## The Problem Visualized

```
┌─────────────────────────────────────────────┐
│         localStorage                        │
│                                             │
│  userStories: [                            │
│    Story-1 ← ALWAYS SELECTED               │
│    Story-2 ← Never reached                 │
│    Story-3 ← Never reached                 │
│    Story-4 ← Never reached                 │
│  ]                                          │
│                                             │
│  lastPracticeDate: "2026-01-29"            │
│  ❌ No "currentStoryIndex"                 │
│  ❌ No "completedStories"                  │
└─────────────────────────────────────────────┘

        ↓ Every day

┌─────────────────────────────────────────────┐
│      Practice Select Page                   │
│                                             │
│  const daily = stories[0]  ← Always 0!     │
│                                             │
│  Shows: Story-1 every single day           │
└─────────────────────────────────────────────┘
```

---

## What's Missing

### ❌ No Story Index Tracking
```typescript
// Needed but not present:
localStorage.getItem('currentStoryIndex')  // undefined!
```

### ❌ No Completed Stories Tracking
```typescript
// Needed but not present:
localStorage.getItem('completedStories')  // undefined!
// Should be: ["story-1", "story-2"]
```

### ❌ No Story Rotation Logic
```typescript
// Current (broken):
const daily = stories[0]  // Always first

// Should be:
const currentIndex = getCurrentStoryIndex()
const daily = stories[currentIndex]
```

---

## Recommended Fix

### Solution A: Index-Based Rotation (Simple)

Track current story index and increment after completion.

**Step 1: Track Current Story Index**

```typescript
// In practice/select/page.tsx

function getCurrentStoryIndex(): number {
  if (typeof window === 'undefined') return 0
  const stored = localStorage.getItem('currentStoryIndex')
  return stored ? parseInt(stored, 10) : 0
}

function setCurrentStoryIndex(index: number): void {
  if (typeof window === 'undefined') return
  localStorage.setItem('currentStoryIndex', index.toString())
}
```

**Step 2: Update Daily Selection**

```typescript
// Replace: const daily = stories[0]
// With:
const currentIndex = getCurrentStoryIndex()
const daily = stories[currentIndex % stories.length]  // Wrap around
```

**Step 3: Increment After Completion**

```typescript
// In practice/complete/page.tsx

// After updating lastPracticeDate:
const currentIndex = parseInt(localStorage.getItem('currentStoryIndex') || '0', 10)
const nextIndex = currentIndex + 1
localStorage.setItem('currentStoryIndex', nextIndex.toString())

console.log('✅ Moved to next story:', {
  completed: currentIndex,
  next: nextIndex
})
```

**Result:**
```
Day 1: Story 0 (currentStoryIndex = 0)
Day 2: Story 1 (currentStoryIndex = 1)
Day 3: Story 2 (currentStoryIndex = 2)
Day 4: Story 3 (currentStoryIndex = 3)
```

---

### Solution B: Completion-Based (Robust)

Track which stories are completed and select the first uncompleted one.

**Step 1: Track Completed Stories**

```typescript
// Helper functions
function getCompletedStories(): string[] {
  if (typeof window === 'undefined') return []
  const stored = localStorage.getItem('completedStories')
  return stored ? JSON.parse(stored) : []
}

function markStoryCompleted(storyId: string): void {
  if (typeof window === 'undefined') return
  const completed = getCompletedStories()
  if (!completed.includes(storyId)) {
    completed.push(storyId)
    localStorage.setItem('completedStories', JSON.stringify(completed))
  }
}
```

**Step 2: Select First Uncompleted Story**

```typescript
// In practice/select/page.tsx
const completedStories = getCompletedStories()

// Filter out completed stories
const remainingStories = stories.filter(s => !completedStories.includes(s.id))

// Select first remaining, or loop back to start if all completed
const daily = remainingStories.length > 0 
  ? remainingStories[0]
  : stories[0]  // Start over if all completed

// If all completed, optionally clear the list
if (remainingStories.length === 0) {
  localStorage.removeItem('completedStories')
  // Could also trigger a new feed fetch here
}
```

**Step 3: Mark Completed After Practice**

```typescript
// In practice/complete/page.tsx
const storyId = searchParams.get('storyId')
if (storyId) {
  markStoryCompleted(storyId)
  console.log('✅ Story marked as completed:', storyId)
}
```

**Result:**
```
Day 1: Story-1 (completedStories = [])
Day 2: Story-2 (completedStories = ["story-1"])
Day 3: Story-3 (completedStories = ["story-1", "story-2"])
Day 4: Story-4 (completedStories = ["story-1", "story-2", "story-3"])
...
All done: Reset, start from Story-1 again
```

---

## Comparison: Solution A vs B

| Aspect | Solution A (Index) | Solution B (Completion) |
|--------|-------------------|------------------------|
| **Simplicity** | ✅ Very simple | ⚠️ More complex |
| **Storage** | 1 number | Array of IDs |
| **Accuracy** | ⚠️ Can skip if stories change | ✅ Tracks actual completion |
| **Flexibility** | ❌ Linear progression only | ✅ Can skip/reorder |
| **Handle story changes** | ❌ Index becomes invalid | ✅ Adapts to new stories |
| **User skips a day** | ✅ Just increments | ✅ Resumes from last |

**Recommendation:** Use **Solution B (Completion-Based)**
- More robust
- Handles edge cases
- Tracks actual progress
- Better UX if user skips days

---

## Additional Features to Consider

### 1. Story Refresh Logic

**When should new stories be fetched?**

```typescript
// Option 1: After all stories completed
if (remainingStories.length === 0) {
  console.log('🔄 All stories completed, fetching new batch')
  fetchNewStories()
}

// Option 2: Weekly refresh (add variety)
function shouldRefreshStories(): boolean {
  const lastFetch = localStorage.getItem('lastStoryFetch')
  if (!lastFetch) return true
  
  const daysSinceLastFetch = Math.floor(
    (Date.now() - new Date(lastFetch).getTime()) / (1000 * 60 * 60 * 24)
  )
  
  return daysSinceLastFetch >= 7  // Weekly
}

// Option 3: When user reaches last 2 stories (prefetch)
if (remainingStories.length <= 2) {
  console.log('🔄 Running low on stories, prefetching more')
  fetchAndAppendStories()
}
```

### 2. Story Pool Management

**How to keep content fresh:**

```typescript
// Instead of replacing all stories, append new ones
async function fetchAndAppendStories() {
  const existingStories = loadUserStories()
  const newClips = await fetch('/api/clips/feed').then(r => r.json())
  const newStories = convertClipsToStories(newClips.clips)
  
  // Merge, avoiding duplicates
  const allStories = [...existingStories, ...newStories]
  const uniqueStories = deduplicateStories(allStories)
  
  saveUserStories(uniqueStories)
  
  console.log('✅ Story pool expanded:', {
    before: existingStories.length,
    after: uniqueStories.length,
    added: uniqueStories.length - existingStories.length
  })
}
```

### 3. Progress Visualization

**Show which stories are completed:**

```jsx
// In practice/select/page.tsx UI
<div className="mt-6 space-y-2">
  <h3>Your Story Progress</h3>
  <div className="flex gap-2">
    {stories.slice(0, 7).map((story, idx) => {
      const isCompleted = completedStories.includes(story.id)
      const isCurrent = idx === currentStoryIndex
      
      return (
        <div 
          key={story.id}
          className={`w-8 h-8 rounded-full flex items-center justify-center ${
            isCompleted ? 'bg-green-500 text-white' :
            isCurrent ? 'bg-blue-500 text-white' :
            'bg-gray-200'
          }`}
        >
          {isCompleted ? '✓' : idx + 1}
        </div>
      )
    })}
  </div>
  <p className="text-sm text-gray-600">
    {completedStories.length} of {stories.length} stories completed
  </p>
</div>
```

---

## Implementation Checklist

### Phase 1: Fix Story Rotation (Critical)

- [ ] Add `completedStories` tracking to localStorage
- [ ] Update `practice/select/page.tsx` to filter completed stories
- [ ] Update `practice/complete/page.tsx` to mark story as completed
- [ ] Test: Day 1 = Story 1, Day 2 = Story 2, Day 3 = Story 3

### Phase 2: Story Refresh Logic

- [ ] Detect when all stories are completed
- [ ] Fetch new batch from `/api/clips/feed`
- [ ] Append new stories to existing pool
- [ ] Clear `completedStories` to start fresh cycle

### Phase 3: Edge Cases

- [ ] Handle empty stories array
- [ ] Handle API fetch failure (use fallback)
- [ ] Handle localStorage quota exceeded
- [ ] Handle user skipping days (resume from last)

### Phase 4: UX Improvements

- [ ] Show story progress (X of Y completed)
- [ ] Add visual indicators for current/completed stories
- [ ] Show "New stories available!" notification
- [ ] Add manual refresh button

---

## Testing Scenarios

### Scenario 1: Normal Daily Use

```
Day 1:
- User sees Story-1
- Completes Story-1
- completedStories = ["story-1"]

Day 2:
- User sees Story-2 ✅
- Completes Story-2
- completedStories = ["story-1", "story-2"]

Day 3:
- User sees Story-3 ✅
```

### Scenario 2: User Skips a Day

```
Day 1:
- User sees Story-1
- Completes Story-1
- completedStories = ["story-1"]

Day 2:
- User doesn't open app

Day 3:
- User sees Story-2 ✅ (not Story-3)
- Progress resumes correctly
```

### Scenario 3: All Stories Completed

```
Day 10:
- User completes last story
- completedStories = ["story-1", ..., "story-10"]

Day 11:
- No remaining stories
- Option A: Fetch new stories from API
- Option B: Clear completedStories, start over
- Option C: Show "All caught up!" message
```

### Scenario 4: Stories Array Changes

```
Day 1:
- stories = [Story-A, Story-B, Story-C]
- User completes Story-A
- completedStories = ["story-a"]

Day 2:
- New stories fetched/appended
- stories = [Story-A, Story-B, Story-C, Story-D, Story-E]
- Filter out Story-A (completed)
- User sees Story-B ✅
```

---

## Files to Modify

### 1. `app/(app)/practice/select/page.tsx`

**Changes:**
- Add `getCompletedStories()` helper
- Update daily story selection logic
- Filter out completed stories
- Add story refresh logic

### 2. `app/(app)/practice/complete/page.tsx`

**Changes:**
- Add `markStoryCompleted()` call
- Pass `storyId` from URL params
- Update localStorage with completed story

### 3. `app/(app)/practice/story/[storyId]/page.tsx`

**Changes:**
- Ensure `storyId` is passed to completion page
- Add `?storyId=xxx` to navigation

---

## Expected User Experience (After Fix)

### ✅ Week 1

| Day | Story | Clips | Result |
|-----|-------|-------|--------|
| Mon | Story-1 | 3 clips | ✅ Completed |
| Tue | Story-2 | 3 clips | ✅ Completed |
| Wed | Story-3 | 3 clips | ✅ Completed |
| Thu | Story-4 | 3 clips | ✅ Completed |
| Fri | Story-5 | 3 clips | ✅ Completed |
| Sat | (Skip) | - | - |
| Sun | Story-6 | 3 clips | ✅ Completed |

**Total Progress:** 18 clips practiced, good variety ✅

### ✅ Week 2

User continues from Story-7, Story-8, etc. until all 10 stories are completed, then:

**Option A:** Fetch new batch of 10 stories (20 total now)  
**Option B:** Loop back to Story-1 for review  
**Option C:** Mix of old (review) + new (fresh content)

---

## Current Status Summary

| Component | Status | Issue |
|-----------|--------|-------|
| Story Loading | ✅ Working | Stories loaded once, cached forever |
| Daily Selection | ❌ BROKEN | Always selects stories[0] |
| Completion Tracking | ⚠️ Partial | Tracks date, not story progress |
| Story Rotation | ❌ MISSING | No rotation logic at all |
| Story Refresh | ❌ MISSING | Never fetches new stories |

**Overall:** ❌ **No story rotation - critical bug**

---

## Priority

**🔴 CRITICAL - HIGH PRIORITY**

**Reasons:**
1. Users see the same content every day
2. Defeats the purpose of multiple stories
3. Poor user retention (boring)
4. Simple fix (1-2 hours implementation)
5. High impact on user experience

**Estimated Effort:** 2-4 hours
**Risk:** Low (isolated to select/complete pages)

---

## Conclusion

The app currently has **NO daily story rotation**. Users practice the same story every day forever because:

1. ❌ Daily story is always `stories[0]`
2. ❌ No tracking of which stories are completed
3. ❌ No logic to move to next story after completion
4. ❌ Stories cached forever, never refreshed

**Fix Required:**
- Implement completion tracking (`completedStories` in localStorage)
- Filter out completed stories when selecting daily story
- Mark story as completed after practice session
- Optionally: Fetch new stories when running low

**Expected Result:**
- Day 1: Story-1
- Day 2: Story-2
- Day 3: Story-3
- Users get fresh content daily ✅



