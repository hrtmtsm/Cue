# Import Script Schema Fix

**Date:** 2026-01-30  
**Issue:** Import script didn't match actual Supabase database schema  
**Status:** ✅ Fixed

---

## 🔧 Changes Made

### 1. **Corrected Column Mapping**

**CSV Column → Database Column:**
```typescript
{
  id: record.id,                    // ✅ Direct mapping
  transcript: record.transcript,    // ✅ Direct mapping
  cefr: record.difficulty_cefr,     // ✅ CSV "difficulty_cefr" → DB "cefr"
  focus_areas: focusAreasArray,     // ✅ String → Array conversion
  situation: record.situation,      // ✅ Direct mapping
  length_sec: parseFloat(record.length_sec), // ✅ String → Number
  clip_type: record.clip_type,      // ✅ Direct mapping
  approved: true,                   // ✅ ADDED - Required field
  patterns: [],                     // ✅ Optional (can be null)
  semantic_structure: null,         // ✅ Optional (can be null)
}
```

### 2. **Removed Invalid Field**

**Before:**
```typescript
interface ClipCSVRow {
  id: string
  transcript: string
  difficulty_cefr: string
  focus_areas: string
  situation: string
  length_sec: string
  clip_type: string
  content_type: string  // ❌ This doesn't exist in DB
}
```

**After:**
```typescript
interface ClipCSVRow {
  id: string
  transcript: string
  difficulty_cefr: string  // CSV column name (maps to "cefr" in DB)
  focus_areas: string
  situation: string
  length_sec: string
  clip_type: string
  content_type: string  // CSV only - not used in DB
}
```

Note: `content_type` is read from CSV but not inserted into DB.

### 3. **Added Required Field**

```typescript
approved: true  // ✅ Mark all v2 clips as approved by default
```

---

## 📊 Schema Comparison

### CSV File Schema (clips-v2.csv)

| Column | Type | Example |
|--------|------|---------|
| `id` | string | "clip-practice-v2-001" |
| `transcript` | string | "Let's touch base later today" |
| `difficulty_cefr` | string | "A2" |
| `focus_areas` | string (CSV) | "idiom,connected_speech" |
| `situation` | string | "work" |
| `length_sec` | string | "4" |
| `clip_type` | string | "practice" |
| `content_type` | string | "idiom" |

### Supabase Database Schema (curated_clips table)

| Column | Type | Required | Default |
|--------|------|----------|---------|
| `id` | TEXT | ✅ | - |
| `transcript` | TEXT | ✅ | - |
| `cefr` | TEXT | ✅ | - |
| `focus_areas` | TEXT[] | ✅ | - |
| `situation` | TEXT | ✅ | - |
| `length_sec` | FLOAT | ✅ | - |
| `clip_type` | TEXT | ✅ | - |
| `approved` | BOOLEAN | ✅ | - |
| `patterns` | TEXT[] | ❌ | null |
| `semantic_structure` | JSONB | ❌ | null |
| `created_at` | TIMESTAMP | ❌ | NOW() |

**Note:** `content_type` does NOT exist in the database.

---

## 🔄 Data Transformations

### 1. **Column Rename**
```
CSV: difficulty_cefr  →  DB: cefr
```

### 2. **String to Array**
```
CSV: "idiom,connected_speech"  →  DB: ["idiom", "connected_speech"]
```

### 3. **String to Number**
```
CSV: "4"  →  DB: 4.0
```

### 4. **Added Default**
```
DB: approved = true  (not in CSV)
```

---

## ✅ Verification

### Before Fix (Would Fail)
```typescript
// ❌ Wrong column name
cefr: record.difficulty_cefr,  // CSV has "difficulty_cefr"

// ❌ Missing required field
// No "approved" field

// ❌ Would try to insert invalid column
content_type: record.content_type  // Column doesn't exist in DB
```

### After Fix (Will Succeed)
```typescript
// ✅ Correct mapping
cefr: record.difficulty_cefr,  // CSV "difficulty_cefr" → DB "cefr"

// ✅ Required field added
approved: true,

// ✅ content_type not inserted (only in CSV)
```

---

## 🧪 Testing

### Test the Script

```bash
# Run import
npm run import-clips-v2
```

### Expected Success Output

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
  "approved": true,
  "patterns": [],
  "semantic_structure": null
}

📤 Inserting batch 1/6 (50 clips)...
✅ Batch 1 complete (Total: 50/300)
...
✅ Successfully inserted: 300
```

### Verify in Database

```sql
-- Check first clip
SELECT * FROM curated_clips WHERE id = 'clip-practice-v2-001';

-- Should show:
-- id: clip-practice-v2-001
-- cefr: A2  ← Correct column name
-- approved: true  ← Required field present
-- focus_areas: {idiom, connected_speech}  ← Array format
```

---

## 🎯 Key Fixes Summary

| Issue | Before | After |
|-------|--------|-------|
| **Column name** | Used `difficulty_cefr` | Map to `cefr` ✅ |
| **Required field** | Missing `approved` | Added `approved: true` ✅ |
| **Invalid column** | Tried to insert `content_type` | Removed ✅ |
| **Type conversion** | String `focus_areas` | Array conversion ✅ |

---

## 📝 Files Updated

- ✅ `scripts/import-clips-v2.ts` - Fixed schema mapping

---

## 🚀 Ready to Import

The script is now corrected and ready to run:

```bash
npm run import-clips-v2
```

All 300 clips should import successfully with:
- ✅ Correct column names
- ✅ Required fields populated
- ✅ Proper data type conversions
- ✅ No invalid columns

---

**Status:** ✅ Schema issues fixed, ready for import

---

**End of Fix Documentation**



