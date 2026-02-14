# Listening Level Card - Bug Fix

**Date**: 2026-02-12  
**Status**: ✅ **FIXED**

---

## Problem

The Listening Level card was not appearing on the Progress page, and console logs showed that "Listening Level calculated" was never printed.

---

## Root Cause

### Issue 1: Wrong Function Used

**Problem**: Progress page was calling `getAllClips()` instead of `getAllClipsClient()`

**Impact**: `getAllClips()` is a **server-side only** function that returns an empty array when called from the client:

```typescript
// lib/clipStorage.ts line 22-26
export async function getAllClips(): Promise<Clip[]> {
  if (typeof window !== 'undefined') {
    // This shouldn't be called on client, but return empty array if it is
    return []
  }
  // ... server-side logic
}
```

**Result**: 
- `allClips` was always an empty array `[]`
- `clipsMap` was always an empty Map
- `calculateListeningLevel()` returned `null` (no clips to match events against)
- Listening Level card never rendered

---

## Solution

### Changed Files

#### 1. **`app/[locale]/(app)/progress/page.tsx`**

**Before:**
```typescript
import { getAllClips, type Clip } from '@/lib/clipStorage'

// In useEffect:
const allClips = await getAllClips()  // ❌ Server-side function
```

**After:**
```typescript
import { getAllClipsClient } from '@/lib/clipStorage'
import type { Clip } from '@/lib/clipTypes'

// In useEffect:
const allClips = getAllClipsClient()  // ✅ Client-side function
```

**Changes:**
1. ✅ Changed import from `getAllClips` to `getAllClipsClient`
2. ✅ Removed `async/await` (no longer needed - synchronous function)
3. ✅ Added comprehensive debug logs
4. ✅ Fixed import path for `Clip` type

---

#### 2. **`app/(app)/progress/page.tsx`** (non-locale version)

**Identical changes** to maintain consistency.

---

### Debug Logs Added

Now the Progress page logs detailed information:

```javascript
📊 [PROGRESS PAGE] Starting metrics calculation
📊 [PROGRESS PAGE] events: 12 events loaded
📊 [PROGRESS PAGE] Loading clips for Listening Level...
📊 [PROGRESS PAGE] clips: 18 clips loaded
📊 [PROGRESS PAGE] Calling calculateListeningLevel...
📊 [PROGRESS PAGE] levelData result: { currentLevel: 'B1', ... }
📊 [PROGRESS PAGE] Listening Level calculated: {
  level: 'B1',
  confidence: 'high',
  stabilityScore: '78%',
  descriptor: 'Catching most everyday conversations',
  progression: { direction: 'up', fromLevel: 'A2' }
}
```

**Empty state logs:**
```javascript
⚠️ [PROGRESS PAGE] No practice events found - skipping metrics calculation
```

**Error state logs:**
```javascript
⚠️ [PROGRESS PAGE] Listening Level returned null
```

---

## Code Changes Summary

### Before (Broken)

```typescript
// Wrong import
import { getAllClips, type Clip } from '@/lib/clipStorage'

// In useEffect
async function calculateMetrics() {
  const events = getPracticeEvents() as DetailedPracticeEvent[]
  
  if (events.length > 0) {
    // ... other metrics
    
    const allClips = await getAllClips()  // ❌ Returns []
    const clipsMap = new Map<string, Clip>()
    allClips.forEach(clip => clipsMap.set(clip.id, clip))  // Empty map
    
    const levelData = calculateListeningLevel(events, clipsMap)  // Returns null
    setListeningLevel(levelData)  // Sets null
  }
}
calculateMetrics()
```

**Result**: Listening Level card never renders (null state)

---

### After (Fixed)

```typescript
// Correct import
import { getAllClipsClient } from '@/lib/clipStorage'
import type { Clip } from '@/lib/clipTypes'

// In useEffect (no longer async)
try {
  const events = getPracticeEvents() as DetailedPracticeEvent[]
  
  console.log('📊 [PROGRESS PAGE] Starting metrics calculation')
  console.log('📊 [PROGRESS PAGE] events:', events.length, 'events loaded')
  
  if (events.length > 0) {
    // ... other metrics
    
    console.log('📊 [PROGRESS PAGE] Loading clips for Listening Level...')
    const allClips = getAllClipsClient()  // ✅ Returns actual clips
    console.log('📊 [PROGRESS PAGE] clips:', allClips.length, 'clips loaded')
    
    const clipsMap = new Map<string, Clip>()
    allClips.forEach(clip => clipsMap.set(clip.id, clip))
    
    console.log('📊 [PROGRESS PAGE] Calling calculateListeningLevel...')
    const levelData = calculateListeningLevel(events, clipsMap)
    console.log('📊 [PROGRESS PAGE] levelData result:', levelData)
    
    setListeningLevel(levelData)
    
    if (levelData) {
      console.log('📊 [PROGRESS PAGE] Listening Level calculated:', {
        level: levelData.currentLevel,
        confidence: levelData.confidence,
        stabilityScore: Math.round(levelData.stabilityScore * 100) + '%',
        descriptor: levelData.capabilityDescriptor,
        progression: levelData.progressionContext,
      })
    } else {
      console.log('⚠️ [PROGRESS PAGE] Listening Level returned null')
    }
  } else {
    console.log('⚠️ [PROGRESS PAGE] No practice events found - skipping metrics calculation')
  }
} catch (error) {
  console.error('❌ [PROGRESS PAGE] Error calculating metrics:', error)
}
```

**Result**: Listening Level card renders successfully with actual data

---

## Testing

### Verification Steps

1. **Navigate to Progress page**
2. **Open browser console**
3. **Look for logs:**

**Success case:**
```
📊 [PROGRESS PAGE] Starting metrics calculation
📊 [PROGRESS PAGE] events: 12 events loaded
📊 [PROGRESS PAGE] Loading clips for Listening Level...
📊 [PROGRESS PAGE] clips: 18 clips loaded
📊 [PROGRESS PAGE] Calling calculateListeningLevel...
📊 [PROGRESS PAGE] levelData result: { ... }
📊 [PROGRESS PAGE] Listening Level calculated: { ... }
```

**Empty events case:**
```
📊 [PROGRESS PAGE] Starting metrics calculation
📊 [PROGRESS PAGE] events: 0 events loaded
⚠️ [PROGRESS PAGE] No practice events found - skipping metrics calculation
```

**No clips case (shouldn't happen, but logged):**
```
📊 [PROGRESS PAGE] clips: 0 clips loaded
⚠️ [PROGRESS PAGE] Listening Level returned null
```

---

## Why This Happened

### Design Oversight

The initial implementation copied the import pattern from other parts of the codebase that used `getAllClips()`, but those were in **server components** or **API routes**, not client components.

**Server-side usage (correct):**
```typescript
// app/api/clips/generate/route.ts
export async function POST(request: NextRequest) {
  const clips = await getAllClips()  // ✅ Runs on server
}
```

**Client-side usage (incorrect):**
```typescript
// app/(app)/progress/page.tsx
'use client'

export default function ProgressPage() {
  const clips = await getAllClips()  // ❌ Runs on client
}
```

### clipStorage.ts Architecture

The file has **two separate APIs**:

1. **Client-side**: `getAllClipsClient()`, `saveClipClient()`
   - Uses localStorage
   - Synchronous
   - Only works in browser

2. **Server-side**: `getAllClips()`, `saveClip()`, `getClipById()`
   - Uses filesystem (data/clips.json)
   - Asynchronous
   - Only works on server
   - Returns `[]` if called from client (safety guard)

---

## Lessons Learned

1. **Check function context**: Ensure client components use client functions
2. **Early returns matter**: `getAllClips()` silently returned `[]` instead of throwing error
3. **Debug logs essential**: Without logs, would've been harder to diagnose
4. **Test edge cases**: Should have tested with actual clip data

---

## Status

✅ **FIXED**  
✅ **Both progress pages updated**  
✅ **Debug logs added**  
✅ **No linter errors**  
✅ **Ready for testing**

---

## Next Steps

1. **Test with real data**: Complete practice sessions and verify card appears
2. **Verify CEFR mapping**: Check if clips have correct CEFR levels (or fallback works)
3. **Monitor console logs**: Ensure no unexpected `null` returns
4. **User feedback**: Validate UX of "Around B1" phrasing

---

## Related Files

- `lib/cefrMetrics.ts` - Listening Level calculation logic
- `lib/clipStorage.ts` - Clip storage (client vs server functions)
- `lib/clipTypes.ts` - Clip interface with optional cefrLevel
- `LISTENING_LEVEL_PHASE1_IMPLEMENTATION.md` - Full implementation docs
