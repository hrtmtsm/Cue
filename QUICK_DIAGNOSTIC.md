# Quick Diagnostic for "Practice not available" Error

Based on your console logs, I can see:
- `❌ [RespondPage] Clip missing dbClipId` - This is the root cause
- The clip object exists but `dbClipId` is missing

## Immediate Action: Expand Console Log

The console log at line 543 should now show the full clip object. Please expand the log entry:
```
🔍 [RespondPage] Clip validation check:
```

And share:
1. What does `clipFull` show? (the full JSON object)
2. What does `clipKeys` show? (all keys in the clip object)
3. What does `allClipIds` show? (all clips in the story with their dbClipId values)

## Check localStorage

Run this in browser console:

```javascript
const stories = JSON.parse(localStorage.getItem('userStories') || '[]')
const story = stories[0] // First story
if (story) {
  console.log('First story clips:')
  story.clips.forEach((clip, i) => {
    console.log(`Clip ${i + 1}:`, {
      id: clip.id,
      dbClipId: clip.dbClipId,
      hasDbClipId: !!clip.dbClipId,
      allKeys: Object.keys(clip)
    })
  })
}
```

## Check API Response

Run this in browser console:

```javascript
fetch('/api/clips/user')
  .then(r => r.json())
  .then(data => {
    console.log('API Response:', data)
    if (data.clips && data.clips.length > 0) {
      console.log('First clip from API:', {
        id: data.clips[0].id,
        hasId: !!data.clips[0].id,
        allKeys: Object.keys(data.clips[0])
      })
    }
  })
  .catch(err => console.error('API Error:', err))
```

## Check Database Structure

Run this in Supabase SQL Editor:

```sql
-- Check if user_id column exists
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'curated_clips'
ORDER BY ordinal_position;
```

Then check for invalid IDs:

```sql
-- Check for NULL/empty IDs (without user_id filter)
SELECT 
  id, 
  LEFT(transcript, 50) as transcript_preview,
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

## Most Likely Issue

Based on the error, the most likely issue is:

1. **Clips are being converted to stories** but `dbClipId` is not being set during enrichment
2. **The enrichment happens in practice/select page** (line 294: `dbClipId: clip.dbClipId || clip.id`)
3. **If `clip.id` is undefined/null**, then `dbClipId` will also be undefined/null

**Check the enrichment logs:**
- Navigate to `/practice/select` page
- Look for logs: `🔄 [SELECT] Enriching story:` and `✨ [SELECT] Enriched clip:`
- See if `clip.id` is undefined in the "Original clip" log
