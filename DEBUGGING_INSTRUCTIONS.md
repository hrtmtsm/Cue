# Debugging Instructions for Missing dbClipId

## Current Situation
You're seeing the error on the **respond page**, but the enrichment happens on the **select page**. We need to check both.

## Step 1: Check localStorage (Run this FIRST)

Open browser console (F12) and run:

```javascript
// Check what's in localStorage
const stories = JSON.parse(localStorage.getItem('userStories') || '[]')
console.log('📦 Total stories:', stories.length)

if (stories.length > 0) {
  const firstStory = stories[0]
  const firstClip = firstStory.clips?.[0]
  
  console.log('📖 First story:', {
    id: firstStory.id,
    title: firstStory.title,
    clipCount: firstStory.clips?.length || 0,
  })
  
  console.log('🎬 First clip:', {
    id: firstClip?.id,
    dbClipId: firstClip?.dbClipId,
    hasDbClipId: !!firstClip?.dbClipId,
    allKeys: firstClip ? Object.keys(firstClip) : [],
    fullClip: firstClip,
  })
  
  // Check ALL clips in first story
  console.log('📋 All clips in first story:')
  firstStory.clips?.forEach((clip, i) => {
    console.log(`  Clip ${i + 1}:`, {
      id: clip.id,
      dbClipId: clip.dbClipId,
      hasDbClipId: !!clip.dbClipId,
      keys: Object.keys(clip),
    })
  })
} else {
  console.log('⚠️ No stories in localStorage')
}
```

**Share the output here.**

## Step 2: Clear localStorage and Re-fetch

```javascript
// Clear localStorage
localStorage.removeItem('userStories')
console.log('✅ Cleared localStorage')

// Verify it's cleared
const check = localStorage.getItem('userStories')
console.log('Verification:', check === null ? '✅ Cleared' : '❌ Still has data')
```

## Step 3: Navigate to Select Page

1. Go to: `http://localhost:3000/en/practice/select`
2. Open DevTools Console (F12)
3. Wait for page to load
4. Look for logs starting with `🔥 [SELECT]`

**You should see:**
- `🔥 [SELECT] About to call fetchAndConvertStories()`
- `🔥 [SELECT] CALLING fetchAndConvertStories() now...`
- `🔥 [SELECT] fetchAndConvertStories STARTED`
- `🔥 [SELECT] API response: 200`
- `🔥 [SELECT] Fetched clips count: X`
- `🔥 [SELECT] BEFORE enrichment - first clip keys: [...]`
- `🔥 [SELECT] Enriching clip: ... -> dbClipId: ...`
- `🔥 [SELECT] AFTER enrichment - first clip keys: [...]`
- `🔥 [SELECT] First enriched clip dbClipId: ...`
- `🔥 [SELECT] Saved to localStorage`

**Share ALL logs that start with `🔥 [SELECT]`**

## Step 4: Check localStorage Again

After Step 3, run Step 1 again to verify `dbClipId` is now present.

## Step 5: Navigate to Respond Page

1. Click "Start Practice" on a story
2. You should be redirected to `/practice/respond?storyId=...&clipId=...`
3. Open DevTools Console
4. Look for logs starting with `🔥 [RespondPage]`

**You should see:**
- `🔥 [RespondPage] Story lookup result:`
- `🔥 [RespondPage] Clip validation check:`
- `🔥 [RespondPage] localStorage clip check:`

**Share ALL logs that start with `🔥 [RespondPage]`**

## If You See "EARLY RETURN" Log

If you see `🔥 [SELECT] EARLY RETURN - fetchAndConvertStories will NOT be called`, it means:
- localStorage already has stories (even old ones without dbClipId)
- The function is skipped
- **Solution:** Clear localStorage (Step 2) and try again

## If You Don't See Any 🔥 Logs

1. Make sure you're on the correct page (`/practice/select` for SELECT logs, `/practice/respond` for RESPOND logs)
2. Refresh the page (Cmd+R or Ctrl+R)
3. Check if console is filtering logs (make sure "All levels" is selected)
4. Check if logs are being cleared (disable "Preserve log" if needed)
