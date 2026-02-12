# Diagnostic Steps for "Practice not available" Error

## STEP 1: Browser Console Diagnostic

Open the practice/respond page where the error occurs, open browser DevTools console (F12 or Cmd+Option+I), and run:

```javascript
// Check localStorage
const userStories = JSON.parse(localStorage.getItem('userStories') || '[]')
console.log('📦 Total stories in localStorage:', userStories.length)

// Check each story's clips for dbClipId
userStories.forEach((story, i) => {
  console.log(`\n📖 Story ${i + 1}: ${story.title || story.id}`)
  story.clips.forEach((clip, j) => {
    console.log(`  🎬 Clip ${j + 1}:`, {
      id: clip.id,
      dbClipId: clip.dbClipId,
      hasDbClipId: !!clip.dbClipId,
      transcript: clip.transcript?.substring(0, 30) + '...'
    })
  })
})

// Check API response
fetch('/api/clips/user')
  .then(r => r.json())
  .then(data => {
    console.log('\n🌐 API Response:')
    console.log('Total clips from API:', data.clips.length)
    data.clips.slice(0, 3).forEach((clip, i) => {
      console.log(`Clip ${i + 1}:`, {
        id: clip.id,
        hasId: !!clip.id,
        text: clip.text?.substring(0, 30) + '...'
      })
    })
  })
  .catch(err => console.error('❌ API Error:', err))
```

**Expected Output:**
- Total stories count
- Each clip's `id` and `dbClipId` values
- API response showing clips with valid IDs

**What to Look For:**
- Clips with `dbClipId: undefined` or `dbClipId: null`
- Clips where `id` exists but `dbClipId` is missing
- API returning clips with NULL/empty IDs

---

## STEP 2: Database Check for Invalid IDs

**First, check if curated_clips has a user_id column:**

```sql
-- Check table structure
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'curated_clips'
ORDER BY ordinal_position;
```

**Then check for invalid IDs (without user_id filter):**

```sql
SELECT 
  id, 
  transcript,
  created_at,
  CASE 
    WHEN id IS NULL THEN 'NULL'
    WHEN id = '' THEN 'EMPTY'
    WHEN TRIM(id) = '' THEN 'WHITESPACE'
    ELSE 'OK'
  END as id_status
FROM curated_clips 
WHERE id IS NULL OR id = '' OR TRIM(id) = ''
LIMIT 10;
```

**If user_id column exists, check for your user specifically:**
```sql
SELECT 
  id, 
  transcript,
  CASE 
    WHEN id IS NULL THEN 'NULL'
    WHEN id = '' THEN 'EMPTY'
    WHEN TRIM(id) = '' THEN 'WHITESPACE'
    ELSE 'OK'
  END as id_status
FROM curated_clips 
WHERE user_id = 'YOUR_USER_ID_HERE'  -- Replace with your actual user_id
  AND (id IS NULL OR id = '' OR TRIM(id) = '')
LIMIT 10;
```

**Expected Result:**
- If no rows returned: All clips have valid IDs ✅
- If rows returned: These clips have invalid IDs and need to be fixed ❌

---

## STEP 3: Check Enrichment Logic (Already Added)

The code has been updated with diagnostic logging. To see it:

1. Open browser DevTools console
2. Navigate to `/practice/select` page
3. Look for console logs starting with:
   - `🔄 [SELECT] Enriching story:`
   - `📎 [SELECT] Original clip:`
   - `✨ [SELECT] Enriched clip:`
   - `✅ [SELECT] Enriched stories:`

**What to Look For:**
- Clips where `Original clip` shows `hasDbClipId: false`
- Clips where `Enriched clip` shows `dbClipId: undefined` or `null`
- Any `❌ [SELECT] Removing clip without dbClipId` errors

---

## STEP 4: Fix Applied

The defensive fix has been applied to `app/[locale]/(app)/practice/select/page.tsx`:

- Uses `clip.dbClipId || clip.id` as fallback
- Filters out clips without valid `dbClipId`
- Removes stories with no valid clips
- Adds comprehensive logging

---

## STEP 5: Verify the Fix

1. **Clear localStorage:**
   ```javascript
   localStorage.removeItem('userStories')
   ```

2. **Refresh the practice/select page** (this will re-fetch and re-enrich stories)

3. **Check console logs** for:
   - `✅ [SELECT] Enriched stories: X stories with valid clips`
   - No `❌ Removing clip without dbClipId` errors

4. **Try starting a practice session:**
   - Click "Start Practice" on a story
   - Navigate to respond page
   - Check if "Practice not available" error still occurs

5. **If error persists, check:**
   - Browser console for the diagnostic logs from STEP 1
   - Server logs for `/api/clips/user` endpoint
   - Database for invalid clip IDs

---

## Quick Diagnostic Script

You can also run this script to check the database programmatically:

```bash
npx tsx scripts/checkCuratedClipsIds.ts
```

This will:
- Check for NULL/empty IDs
- Check for duplicate IDs
- Show sample valid IDs
- Provide summary statistics
