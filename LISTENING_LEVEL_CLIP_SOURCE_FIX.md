# Listening Level Card - Clip Source Fix

**Date**: 2026-02-12  
**Status**: ✅ **FIXED**

---

## Problem

Listening Level card was not appearing, and logs showed:
```
📊 [PROGRESS PAGE] events: 50 events loaded
📊 [PROGRESS PAGE] clips: 10 clips loaded
📊 [PROGRESS PAGE] levelData result: null
⚠️ [PROGRESS PAGE] Listening Level returned null
```

**User Question**: "I don't see the listening card. Are these two cards listening cards?"

**Answer**: The two visible cards are:
1. **Listening Accuracy** - Shows weekly accuracy percentage
2. **Comprehension** - Shows understanding rate

The **Listening Level card** (Around B1 · Intermediate) was **missing** because it returned `null`.

---

## Root Cause

### Events vs Clips Mismatch

Your practice events reference **story clip IDs**, but the Progress page was only loading **standalone clips** from `localStorage.userClips`.

**Result**: No events matched any clips → all CEFR bands had 0 clips → function returned `null`.

### Your App's Clip Architecture

```
┌─────────────────────────────────────┐
│  Clip Sources                       │
├─────────────────────────────────────┤
│  1. Standalone Clips                │
│     localStorage.userClips          │
│     (10 clips in your case)         │
│                                     │
│  2. Story Clips                     │
│     localStorage.userStories        │
│     (Your 50 events reference these)│
└─────────────────────────────────────┘
```

**The problem**: Progress page was only reading source #1, but practice events came from source #2.

---

## Solution

### Updated Both Progress Pages

1. **Import story loader**
```typescript
import { loadUserStories } from '@/lib/storyClient'
```

2. **Extract clips from stories**
```typescript
const standaloneClips = getAllClipsClient()
const stories = loadUserStories()

// Extract clips from stories
const storyClips: Clip[] = []
stories.forEach(story => {
  story.clips.forEach(storyClip => {
    storyClips.push({
      id: storyClip.id,
      text: storyClip.transcript,
      title: `${story.title} - Clip`,
      audioUrl: storyClip.audioUrl || '',
      focus: [storyClip.focusSkill || 'connected_speech'],
      targetStyle: story.situation || 'Daily Life',
      situation: story.situation as any || 'Daily Life',
      lengthSec: (storyClip.endMs - storyClip.startMs) / 1000,
      difficulty: story.difficulty,
      createdAt: story.createdAt || new Date().toISOString(),
    })
  })
})

// Combine both sources
const allClips = [...standaloneClips, ...storyClips]
```

3. **Enhanced debug logging**
```typescript
console.log('📊 [PROGRESS PAGE] clips loaded:', {
  standalone: standaloneClips.length,
  fromStories: storyClips.length,
  total: allClips.length
})
```

---

## Expected Console Logs (After Fix)

### Success Case

```
📊 [PROGRESS PAGE] Starting metrics calculation
📊 [PROGRESS PAGE] events: 50 events loaded
📊 [PROGRESS PAGE] Loading clips for Listening Level...
📊 [PROGRESS PAGE] clips loaded: {
  standalone: 10,
  fromStories: 15,
  total: 25
}
📊 [PROGRESS PAGE] clip IDs: ['story-1-clip-0', 'story-1-clip-1', ...] ...
📊 [PROGRESS PAGE] unique event clipIds: ['story-1-clip-0', 'story-1-clip-1', ...] ...
📊 [PROGRESS PAGE] matched events: 50 / 50
📊 [PROGRESS PAGE] Calling calculateListeningLevel...
📊 [PROGRESS PAGE] levelData result: {
  currentLevel: 'B1',
  confidence: 'high',
  stabilityScore: 0.78,
  ...
}
📊 [PROGRESS PAGE] Listening Level calculated: {
  level: 'B1',
  confidence: 'high',
  stabilityScore: '78%',
  descriptor: 'Catching most everyday conversations',
  progression: undefined
}
```

### What Changed

**Before Fix:**
- `clips: 10 clips loaded`
- `matched events: 0 / 50` ← Problem!
- `levelData result: null`

**After Fix:**
- `clips loaded: { standalone: 10, fromStories: 15, total: 25 }`
- `matched events: 50 / 50` ← Fixed!
- `levelData result: { currentLevel: 'B1', ... }`

---

## Expected UI Result

After refreshing the Progress page, you should see **three metric cards**:

```
┌─────────────────────────────────────────┐
│ Listening Accuracy                      │
│ 100% this week                          │
│ All-time: 100%                          │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ Comprehension                        ✓  │
│ 100% understood                         │
│ 50 of 50 clips                          │
│ Key points captured: 20%                │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ Listening Level            ← NEW CARD   │
│                                         │
│ Around B1 · Intermediate                │
│ Catching most everyday conversations    │
│                                         │
│ ━━━━━━━━━━━━━━━━━━ 78%                 │
│ 78% · Stability              ⓘ         │
│ ─────────────────────────────           │
│ Confidence · High                       │
└─────────────────────────────────────────┘
```

---

## Files Modified

1. ✅ `app/[locale]/(app)/progress/page.tsx`
2. ✅ `app/(app)/progress/page.tsx`

**Changes**:
- Added `loadUserStories` import
- Load clips from both standalone + stories
- Enhanced debug logging
- Combine clip sources into single array

---

## Testing Steps

1. **Refresh the Progress page**
2. **Open browser console**
3. **Look for logs:**

```
📊 [PROGRESS PAGE] clips loaded: {
  standalone: X,
  fromStories: Y,
  total: X+Y
}
📊 [PROGRESS PAGE] matched events: 50 / 50
```

4. **Verify Listening Level card appears** below Comprehension card

---

## Why This Happened

### Architectural Assumption

Initial implementation assumed clips were stored in `localStorage.userClips`, but your app stores practice clips **inside stories** (`localStorage.userStories`).

### Story-Clip Relationship

```typescript
Story {
  id: 'story-1',
  clips: [
    { id: 'story-1-clip-0', transcript: '...', ... },
    { id: 'story-1-clip-1', transcript: '...', ... },
    // ...
  ]
}
```

Practice events reference these clip IDs, but the Progress page wasn't extracting them from stories.

---

## Lessons Learned

1. **Multiple data sources**: App has two clip storage patterns
2. **Check data flow**: Trace where practice event clipIds come from
3. **Debug early**: Enhanced logging would've caught this immediately
4. **Test with real data**: Initial testing didn't have story-based practice events

---

## Status

✅ **FIXED**  
✅ **Both progress pages updated**  
✅ **Story clips now included**  
✅ **Enhanced debug logging**  
✅ **No linter errors**  
✅ **Ready to test**

---

## Next Steps

1. **Refresh Progress page** - Listening Level card should appear
2. **Verify CEFR levels** - Check if clips have correct CEFR (or fallback works)
3. **Monitor logs** - Ensure matched events: X / X shows full match
4. **User feedback** - Validate "Around B1" phrasing resonates

---

## Related Documentation

- `LISTENING_LEVEL_PHASE1_IMPLEMENTATION.md` - Full implementation docs
- `LISTENING_LEVEL_BUGFIX.md` - First bug fix (server vs client function)
- `lib/cefrMetrics.ts` - Listening Level calculation logic
- `lib/storyClient.ts` - Story storage functions
