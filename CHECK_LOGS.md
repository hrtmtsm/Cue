# Check These Logs

## What to Look For

After refreshing `/practice/select` page, you should see one of these scenarios:

### Scenario 1: Invalid Cached Stories Detected ✅
```
🔥 [SELECT] Cached story check: {hasInvalidDbClipId: true, needsReEnrichment: true}
⚠️ [SELECT] Cached stories have invalid dbClipId! Will re-fetch and re-enrich.
⚠️ [SELECT] Clearing localStorage and continuing to fetchAndConvertStories...
🔥 [SELECT] About to call fetchAndConvertStories()
🔥 [SELECT] CALLING fetchAndConvertStories() now...
🔥 [SELECT] fetchAndConvertStories STARTED
🔥 [SELECT] API response: 200
🔥 [SELECT] Fetched clips count: X
🔥 [SELECT] Enriching clip: ...
🔥 [SELECT] Saved to localStorage
```

### Scenario 2: Valid Cached Stories ✅
```
🔥 [SELECT] Cached story check: {hasInvalidDbClipId: false, needsReEnrichment: false}
✅ [LOCALE PracticeSelect] Loading completed - userStories path
🔥 [SELECT] EARLY RETURN - fetchAndConvertStories will NOT be called
```

### Scenario 3: Supabase Error ❌
```
Supabase not configured: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing
🔥 [SELECT] API response: 500 (or error)
```

## If You See Supabase Error

The Supabase configuration warning means:
- The API calls to `/api/clips/user` will fail
- The enrichment won't happen
- You need to set environment variables

**Check your `.env.local` file:**
```bash
NEXT_PUBLIC_SUPABASE_URL=your_url_here
SUPABASE_SERVICE_ROLE_KEY=your_key_here
```

**Then restart the dev server:**
```bash
npm run dev
```

## What I Need From You

1. **Do you see any logs starting with `🔥 [SELECT]`?**
   - If YES: Share all of them
   - If NO: The page might not be loading, or the code isn't running

2. **Do you see the Supabase error?**
   - If YES: You need to configure Supabase first
   - If NO: Good, continue

3. **After the page loads, check localStorage:**
   ```javascript
   const stories = JSON.parse(localStorage.getItem('userStories') || '[]')
   const firstClip = stories[0]?.clips?.[0]
   console.log('First clip dbClipId:', firstClip?.dbClipId)
   ```
   - If it starts with `clip-story-`: Still invalid ❌
   - If it starts with `clip-practice-` or similar: Valid ✅

## Quick Test

Run this in console to see what's happening:

```javascript
// Check what's in localStorage
const stories = JSON.parse(localStorage.getItem('userStories') || '[]')
console.log('Stories count:', stories.length)

if (stories.length > 0) {
  const firstClip = stories[0].clips?.[0]
  console.log('First clip:', {
    id: firstClip?.id,
    dbClipId: firstClip?.dbClipId,
    isValid: firstClip?.dbClipId && !firstClip.dbClipId.startsWith('clip-story-')
  })
}
```
