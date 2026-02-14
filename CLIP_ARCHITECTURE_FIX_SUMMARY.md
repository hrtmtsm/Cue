# Clip Architecture Fix - Implementation Summary

## Date: 2026-02-06

## Problem
The app was dynamically generating clips using OpenAI during onboarding, but should only SELECT from pre-existing clips in the `curated_clips` database table.

## Changes Implemented

### 1. ✅ Updated `/api/clips/user` Route
**File:** `app/api/clips/user/route.ts`

**Changes:**
- Added filtering by `situations` (from onboarding)
- Added filtering by `focus_areas` (array overlap)
- Added filter to exclude `clip_type = 'diagnostic'`
- Added 100-clip limit for performance
- All filters work with both user-specific and shared clip tables

**Query Parameters Now Supported:**
```typescript
GET /api/clips/user?difficulties=["easy","medium"]&situations=["Daily Life","Work"]&focus=["connected_speech"]
```

### 2. ✅ Removed Dynamic Generation from Onboarding
**File:** `app/[locale]/onboarding/ready/page.tsx`

**Changes:**
- Removed entire "OLD: Generation flow" block (lines 91-205)
- All users now route to `/practice/select` after onboarding
- Clips will be fetched from database on practice select page

**Before:**
```
Onboarding → Generate Clips via OpenAI → Store in localStorage → Practice
```

**After:**
```
Onboarding → Practice Select → Fetch from Database → Practice
```

### 3. ✅ Updated Practice Select Page
**File:** `app/[locale]/(app)/practice/select/page.tsx`

**Changes:**
- Added situations filter from `onboardingData` in localStorage
- Pass both difficulty and situations as query params to `/api/clips/user`
- Added auto-cleanup logic to remove old generated clips from localStorage
- Enhanced clip filtering to reject:
  - `clip-story-X-Y` (story IDs)
  - `clip-practice-v2-*` (old generated IDs)
  - `clip_TIMESTAMP_*` (timestamp-based generated IDs)

**Auto-Cleanup Logic:**
```typescript
// Detects and removes old generated clips on page load
const hasGeneratedClips = parsed.some(story => 
  story.clips?.some(clip => 
    clip.id?.includes('clip-practice-v2-') || 
    clip.id?.match(/^clip_\d+_[a-z0-9]+$/)
  )
)
if (hasGeneratedClips) {
  localStorage.removeItem('userStories')
  localStorage.removeItem('userClips')
  localStorage.removeItem('hasGeneratedClips')
}
```

### 4. ✅ Deprecated Generation API
**File:** `app/api/clips/generate/route.ts`

**Changes:**
- Added early return with HTTP 410 Gone status
- Returns deprecation error message
- Old code kept for reference but unreachable

**Response:**
```json
{
  "error": "This endpoint is deprecated",
  "message": "Clips should be pre-loaded in curated_clips table, not generated dynamically. Use /api/clips/user instead.",
  "code": "ENDPOINT_DEPRECATED"
}
```

## Data Flow (New Architecture)

```mermaid
graph TB
    User[User] -->|completes| Onboarding
    Onboarding -->|saves preferences| LocalStorage[localStorage: onboardingData]
    Onboarding -->|navigates to| PracticeSelect[/practice/select]
    
    PracticeSelect -->|reads| LocalStorage
    PracticeSelect -->|builds filters| Filters[difficulty + situations]
    Filters -->|queries| API[/api/clips/user]
    
    API -->|SELECT FROM| Database[(curated_clips table)]
    Database -->|filters by| FilterLogic[clip_type != 'diagnostic'<br/>AND difficulty IN [...]<br/>AND situation IN [...]]
    FilterLogic -->|returns| DBClips[Database Clips]
    
    DBClips -->|converts to| Stories[User Stories]
    Stories -->|validates IDs| Validation[Reject generated IDs]
    Validation -->|displays| Practice[Practice Page]
```

## Expected Clip ID Formats

### ✅ Valid (Database IDs)
- `clip-practice-123`
- `clip_abc123def`
- Any ID from `curated_clips.id` column

### ❌ Invalid (Will be Filtered Out)
- `clip-story-1-2` (story IDs)
- `clip-practice-v2-101` (old generated format)
- `clip_1738876543_abc123` (timestamp-based generated)

## Verification Steps

1. **Check Database:**
   ```sql
   SELECT COUNT(*), clip_type FROM curated_clips GROUP BY clip_type;
   SELECT * FROM curated_clips WHERE clip_type != 'diagnostic' LIMIT 5;
   ```

2. **Test Onboarding Flow:**
   - Complete onboarding with situations selection
   - Should navigate to `/practice/select`
   - Should NOT call `/api/clips/generate`

3. **Test Practice Page:**
   - Should fetch clips from `/api/clips/user` with filters
   - Should display clips from database
   - Clip IDs should NOT contain `clip-practice-v2-` or `clip_TIMESTAMP_`

4. **Test Auto-Cleanup:**
   - If old generated clips exist in localStorage
   - They should be automatically removed on page load
   - Fresh clips should be fetched from database

## Migration Notes

### For Users with Old Data
- Old generated clips in localStorage will be automatically cleaned up
- No manual intervention required
- Fresh clips will be fetched from database on next visit

### For Developers
- `/api/clips/generate` is now deprecated (returns 410)
- Use `/api/clips/user` with appropriate filters instead
- Ensure `curated_clips` table has sufficient practice clips

## Benefits

1. **Faster Loading:** No OpenAI API calls during clip fetching
2. **More Reliable:** No dependency on external API availability
3. **Better Quality:** Curated clips from database vs. dynamically generated
4. **Consistent IDs:** All clips have stable database IDs
5. **No "Practice not available" Errors:** Proper `dbClipId` for all clips

## Files Modified

1. `app/api/clips/user/route.ts` - Added filtering
2. `app/[locale]/onboarding/ready/page.tsx` - Removed generation
3. `app/[locale]/(app)/practice/select/page.tsx` - Added filters & cleanup
4. `app/api/clips/generate/route.ts` - Deprecated endpoint

## Next Steps

1. Ensure `curated_clips` table has sufficient practice clips
2. Monitor logs for any deprecated API calls
3. Consider deleting `app/api/clips/generate/route.ts` entirely after verification
4. Update any documentation referencing clip generation
