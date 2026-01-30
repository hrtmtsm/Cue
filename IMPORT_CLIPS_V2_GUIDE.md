# Import Clips V2 - Usage Guide

**Purpose:** Load 300 practice clips from `clips-v2.csv` into Supabase `curated_clips` table

---

## 📋 Prerequisites

### 1. Environment Variables

Ensure `.env.local` contains:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

**⚠️ Important:** You need the **service role key** (not the anon key) to write to the database.

### 2. Files Required

- ✅ `data/clips-v2.csv` (300 clips)
- ✅ `scripts/import-clips-v2.ts` (import script)
- ✅ `.env.local` (environment variables)

### 3. Dependencies

All required dependencies are already in `package.json`:
- `tsx` - TypeScript executor
- `dotenv` - Environment variable loader
- `@supabase/supabase-js` - Supabase client

---

## 🚀 How to Run

### Step 1: Verify CSV File Exists

```bash
ls -lh data/clips-v2.csv
```

Should show:
```
-rw-r--r--  1 user  staff   XXK Jan 30 XX:XX data/clips-v2.csv
```

### Step 2: Test Environment Variables

```bash
node -e "require('dotenv').config({path:'.env.local'}); console.log(process.env.NEXT_PUBLIC_SUPABASE_URL ? '✅ URL set' : '❌ URL missing'); console.log(process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅ Key set' : '❌ Key missing')"
```

Should show:
```
✅ URL set
✅ Key set
```

### Step 3: Run Import

```bash
npm run import-clips-v2
```

---

## 📊 Expected Output

### During Import

```
🚀 Starting Clips V2 Import

📂 Reading data/clips-v2.csv...
📊 Found 300 clips to import

🔍 Sample clip (first record):
{
  "id": "clip-practice-v2-001",
  "transcript": "Let's touch base later today",
  "cefr": "A2",
  "focus_areas": ["idiom", "connected_speech"],
  "situation": "work",
  "length_sec": 4,
  "clip_type": "practice",
  "patterns": [],
  "semantic_structure": null
}

📤 Inserting batch 1/6 (50 clips)...
✅ Batch 1 complete (Total: 50/300)
📤 Inserting batch 2/6 (50 clips)...
✅ Batch 2 complete (Total: 100/300)
...
📤 Inserting batch 6/6 (50 clips)...
✅ Batch 6 complete (Total: 300/300)

============================================================
📊 IMPORT SUMMARY
============================================================
✅ Successfully inserted: 300
❌ Failed: 0
📝 Total clips: 300
============================================================

🔍 Verifying database state...
✅ Total practice clips in database: 300

📊 CEFR Distribution:
  A1: 50 clips (16.7%)
  A2: 80 clips (26.7%)
  B1: 80 clips (26.7%)
  B2: 50 clips (16.7%)
  C1: 30 clips (10.0%)
  C2: 10 clips (3.3%)

📊 Situation Distribution:
  work: 60 clips
  daily: 90 clips
  travel: 40 clips
  media: 60 clips
  formal: 30 clips

✅ Import verification complete!

🎉 Import process finished successfully!
```

---

## 🔧 What the Script Does

### 1. **CSV Parsing**
- Reads `data/clips-v2.csv`
- Parses CSV with custom parser (handles quoted fields with commas)
- Validates 300 records

### 2. **Data Transformation**
Maps CSV columns to database schema:

| CSV Column | DB Column | Transformation |
|------------|-----------|----------------|
| `id` | `id` | Direct |
| `transcript` | `transcript` | Direct |
| `difficulty_cefr` | `cefr` | Rename |
| `focus_areas` | `focus_areas` | CSV string → Array |
| `situation` | `situation` | Direct |
| `length_sec` | `length_sec` | String → Float |
| `clip_type` | `clip_type` | Direct |
| - | `patterns` | Default: `[]` |
| - | `semantic_structure` | Default: `null` |

### 3. **Batch Insertion**
- Inserts 50 clips at a time (6 batches)
- Uses `upsert` with conflict resolution on `id`
- Updates existing clips if ID already exists

### 4. **Verification**
- Counts total practice clips
- Shows CEFR level distribution
- Shows situation distribution
- Reports any errors

---

## ⚠️ Troubleshooting

### Error: "Cannot find module '@/lib/supabase/server'"

**Solution:**
```bash
# Make sure you're in the project root
pwd
# Should show: /Users/harutomatsushima/Desktop/cue

# Check if lib/supabase/server.ts exists
ls lib/supabase/server.ts
```

### Error: "SUPABASE_SERVICE_ROLE_KEY is not defined"

**Solution:**
1. Open Supabase Dashboard
2. Go to Settings → API
3. Copy "service_role" key (not "anon" key)
4. Add to `.env.local`:
   ```env
   SUPABASE_SERVICE_ROLE_KEY=eyJhbG...your_key_here
   ```

### Error: "relation 'curated_clips' does not exist"

**Solution:**
The `curated_clips` table needs to be created first. Run migration or create table:

```sql
CREATE TABLE curated_clips (
  id TEXT PRIMARY KEY,
  transcript TEXT NOT NULL,
  cefr TEXT NOT NULL,
  focus_areas TEXT[] NOT NULL,
  situation TEXT NOT NULL,
  length_sec FLOAT NOT NULL,
  clip_type TEXT NOT NULL,
  patterns TEXT[],
  semantic_structure JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add index for common queries
CREATE INDEX idx_curated_clips_cefr ON curated_clips(cefr);
CREATE INDEX idx_curated_clips_situation ON curated_clips(situation);
CREATE INDEX idx_curated_clips_clip_type ON curated_clips(clip_type);
```

### Error: "duplicate key value violates unique constraint"

**Cause:** Clips with the same IDs already exist in the database.

**Solution:**
The script uses `upsert` which will update existing clips. If you want to start fresh:

```sql
-- Delete all v2 clips (be careful!)
DELETE FROM curated_clips WHERE id LIKE 'clip-practice-v2-%';
```

Then re-run the import.

### Error: Batch fails mid-import

**Solution:**
The script continues even if a batch fails. Check error details in output.

To find which clips failed:
```sql
-- Check which v2 clips are missing
SELECT generate_series(1, 300) AS num
EXCEPT
SELECT CAST(SUBSTRING(id FROM 'clip-practice-v2-(\d+)') AS INTEGER)
FROM curated_clips
WHERE id LIKE 'clip-practice-v2-%'
ORDER BY num;
```

---

## 📊 Database Schema

### `curated_clips` Table Structure

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | TEXT | NOT NULL | Unique clip ID (e.g., "clip-practice-v2-001") |
| `transcript` | TEXT | NOT NULL | Full text of the clip |
| `cefr` | TEXT | NOT NULL | CEFR level (A1, A2, B1, B2, C1, C2) |
| `focus_areas` | TEXT[] | NOT NULL | Array of focus areas (e.g., ["idiom", "reduction"]) |
| `situation` | TEXT | NOT NULL | Context (work, daily, travel, media, formal) |
| `length_sec` | FLOAT | NOT NULL | Duration in seconds |
| `clip_type` | TEXT | NOT NULL | Always "practice" for these clips |
| `patterns` | TEXT[] | NULL | Optional array of linguistic patterns |
| `semantic_structure` | JSONB | NULL | Optional semantic analysis |
| `created_at` | TIMESTAMP | NULL | Auto-generated timestamp |

---

## 🔄 Re-running the Import

The script is **idempotent** - you can run it multiple times safely.

### What happens on re-run:
- Existing clips (same ID) are **updated** with new data
- New clips are **inserted**
- No duplicates are created

### To verify:
```bash
npm run import-clips-v2
```

Check the output:
```
✅ Total practice clips in database: 300
```

---

## 📈 Next Steps After Import

### 1. **Verify Clips in Supabase Dashboard**
- Go to Table Editor
- Select `curated_clips` table
- Filter: `clip_type = 'practice'`
- Should see 300 rows

### 2. **Generate Audio for Clips**
The clips don't have audio URLs yet. You need to:
- Run TTS generation for all 300 clips
- Update `audio_url` column for each clip

### 3. **Test API Endpoints**
```bash
# Test feed endpoint
curl "http://localhost:3000/api/clips/feed?cefr=A2&situation=work&limit=5"
```

### 4. **Update Frontend**
Ensure the app uses the new clips:
- Check `app/(app)/practice/select/page.tsx`
- Verify `api/clips/feed` endpoint
- Test clip selection logic

---

## 🧪 Testing

### Manual Testing

```bash
# 1. Import clips
npm run import-clips-v2

# 2. Query clips via Supabase
# Open Supabase SQL Editor and run:
SELECT cefr, COUNT(*) 
FROM curated_clips 
WHERE clip_type = 'practice' 
GROUP BY cefr 
ORDER BY cefr;

# 3. Test API
npm run dev
# Visit: http://localhost:3000/api/clips/feed?cefr=A2&limit=10
```

### Expected Results

| CEFR | Expected Count |
|------|----------------|
| A1 | 50 |
| A2 | 80 |
| B1 | 80 |
| B2 | 50 |
| C1 | 30 |
| C2 | 10 |
| **Total** | **300** |

---

## 🎯 Success Criteria

✅ All 300 clips imported without errors  
✅ CEFR distribution matches expected (50/80/80/50/30/10)  
✅ All situations represented (work/daily/travel/media/formal)  
✅ No duplicate IDs in database  
✅ API endpoint returns clips correctly  

---

## 📞 Support

If you encounter issues:

1. **Check logs** for specific error messages
2. **Verify environment variables** are set correctly
3. **Check Supabase dashboard** for table structure
4. **Review CSV file** for formatting issues
5. **Check database permissions** (service role key has write access)

---

## 🔐 Security Notes

- **Never commit** `.env.local` to git
- **Service role key** has admin access - keep it secret
- **Don't expose** service role key in frontend code
- **Use anon key** for client-side queries only

---

**Status:** Script is ready to run

**Command:** `npm run import-clips-v2`

---

**End of Guide**


