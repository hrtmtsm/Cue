# Clips V2 Import - Quick Checklist

**Goal:** Import 300 practice clips into Supabase database

---

## ✅ Pre-Import Checklist

### Files & Configuration
- [ ] `data/clips-v2.csv` exists (300 clips)
- [ ] `scripts/import-clips-v2.ts` exists
- [ ] `.env.local` has `NEXT_PUBLIC_SUPABASE_URL`
- [ ] `.env.local` has `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `package.json` has `"import-clips-v2"` script

### Verify Environment
```bash
# Check CSV exists
ls -lh data/clips-v2.csv

# Check script exists
ls -lh scripts/import-clips-v2.ts

# Test environment variables
node -e "require('dotenv').config({path:'.env.local'}); console.log(process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅ Service key set' : '❌ Missing service key')"
```

---

## 🚀 Import Process

### Step 1: Run Import
```bash
npm run import-clips-v2
```

### Step 2: Watch Output
Expected output:
```
📂 Reading data/clips-v2.csv...
📊 Found 300 clips to import
...
✅ Successfully inserted: 300
```

### Step 3: Verify Results
Look for these in output:
- [ ] `✅ Successfully inserted: 300`
- [ ] `❌ Failed: 0`
- [ ] Total CEFR distribution matches:
  - [ ] A1: 50 clips (16.7%)
  - [ ] A2: 80 clips (26.7%)
  - [ ] B1: 80 clips (26.7%)
  - [ ] B2: 50 clips (16.7%)
  - [ ] C1: 30 clips (10.0%)
  - [ ] C2: 10 clips (3.3%)

---

## 🔍 Post-Import Verification

### 1. Check Supabase Dashboard
- [ ] Go to Supabase Dashboard
- [ ] Open Table Editor → `curated_clips`
- [ ] Filter: `clip_type = 'practice'`
- [ ] Verify 300 rows exist
- [ ] Sample a few clips to check data quality

### 2. SQL Verification
Run in Supabase SQL Editor:

```sql
-- Total count
SELECT COUNT(*) as total_v2_clips
FROM curated_clips
WHERE id LIKE 'clip-practice-v2-%';
-- Expected: 300

-- CEFR distribution
SELECT cefr, COUNT(*) as count
FROM curated_clips
WHERE id LIKE 'clip-practice-v2-%'
GROUP BY cefr
ORDER BY cefr;
-- Expected: A1:50, A2:80, B1:80, B2:50, C1:30, C2:10

-- Situation distribution
SELECT situation, COUNT(*) as count
FROM curated_clips
WHERE id LIKE 'clip-practice-v2-%'
GROUP BY situation
ORDER BY count DESC;
-- Expected: daily:90, work:60, media:60, travel:40, formal:30

-- Sample clips
SELECT id, transcript, cefr, situation
FROM curated_clips
WHERE id LIKE 'clip-practice-v2-%'
LIMIT 10;
```

### 3. Test API Endpoint
```bash
# Start dev server
npm run dev

# Test in browser or curl
curl "http://localhost:3000/api/clips/feed?cefr=A2&situation=work&limit=5"
```

Expected response:
```json
{
  "clips": [
    {
      "id": "clip-practice-v2-...",
      "transcript": "...",
      "difficultyCefr": "A2",
      "focusAreas": ["..."],
      "situation": "work",
      ...
    }
  ]
}
```

---

## 🎯 Success Criteria

### Critical
- [x] ✅ CSV file created (300 clips)
- [x] ✅ Import script created
- [x] ✅ Package.json updated with script
- [ ] ✅ Import runs without errors
- [ ] ✅ All 300 clips inserted
- [ ] ✅ CEFR distribution correct
- [ ] ✅ Situation distribution correct

### Verification
- [ ] ✅ Database shows 300 practice clips
- [ ] ✅ No duplicate IDs
- [ ] ✅ API returns clips correctly
- [ ] ✅ Sample clips look natural and authentic

---

## 🐛 Common Issues & Solutions

### Issue: Script fails to find CSV
**Solution:**
```bash
# Make sure you're in project root
pwd  # Should be: /Users/harutomatsushima/Desktop/cue

# Check if data directory exists
ls -la data/
```

### Issue: Environment variables not loaded
**Solution:**
```bash
# Verify .env.local exists
ls -la .env.local

# Check contents (don't share output!)
cat .env.local | grep SUPABASE
```

### Issue: Permission denied
**Solution:**
- Check you're using **service role key** (not anon key)
- Service role key starts with `eyJ...` and is much longer

### Issue: Duplicate key error
**Solution:**
Script uses `upsert`, so duplicates will be updated, not fail.
If you want fresh start:
```sql
DELETE FROM curated_clips WHERE id LIKE 'clip-practice-v2-%';
```

---

## 📊 Expected Metrics

| Metric | Expected Value |
|--------|----------------|
| **Total Clips** | 300 |
| **A1 Clips** | 50 (16.7%) |
| **A2 Clips** | 80 (26.7%) |
| **B1 Clips** | 80 (26.7%) |
| **B2 Clips** | 50 (16.7%) |
| **C1 Clips** | 30 (10.0%) |
| **C2 Clips** | 10 (3.3%) |
| **Work Clips** | 60 |
| **Daily Clips** | 90 |
| **Travel Clips** | 40 |
| **Media Clips** | 60 |
| **Formal Clips** | 30 |
| **Filler Clips** | 20 (cross-situational) |

---

## 🔄 If You Need to Re-run

The import is **safe to re-run**:
- Uses `upsert` (updates existing, inserts new)
- Won't create duplicates
- Idempotent operation

```bash
# Just run again
npm run import-clips-v2
```

---

## 🎉 Completion

When all checkboxes are ✅, you're done!

**Next steps:**
1. Generate audio for clips (TTS)
2. Test user experience with new clips
3. Monitor performance metrics
4. Collect user feedback

---

## 📝 Documentation

- **CSV Structure:** `data/clips-v2.csv`
- **Clip Analysis:** `CLIP_ANALYSIS_REPORT.md`
- **V1 vs V2 Comparison:** `V1_VS_V2_COMPARISON.md`
- **Clips Summary:** `CLIPS_V2_SUMMARY.md`
- **Import Guide:** `IMPORT_CLIPS_V2_GUIDE.md` (detailed)
- **This Checklist:** `CLIPS_V2_IMPORT_CHECKLIST.md` (quick reference)

---

**Status:** Ready to import

**Command:** `npm run import-clips-v2`

**Estimated Time:** 2-3 minutes

---

**Good luck! 🚀**


