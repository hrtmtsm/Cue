# Pattern Candidate Pipeline - End-to-End Instructions

## Prerequisites

1. **Run the migration** to create `pattern_candidates` table:
   
   **Option A: Via Supabase Dashboard (Recommended)**
   - Go to: https://supabase.com/dashboard/project/YOUR_PROJECT/sql/new
   - Copy the contents of `supabase/migrations/009_create_pattern_candidates.sql`
   - Paste and run in the SQL editor
   
   **Option B: Via Supabase CLI**
   ```bash
   supabase migration up 009_create_pattern_candidates
   ```

2. **Verify environment variables** in `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

## Step 1: Extract Pattern Candidates

Extract frequent n-grams and phrasal verbs from all transcripts:

```bash
npx tsx scripts/extractPatternCandidates.ts --min-freq=3 --max-ngram=4 --top-n=100
```

This will:
- Load all transcripts from `curated_clips`
- Extract frequent 2-4 word n-grams (listening patterns)
- Extract phrasal verb patterns (semantic patterns)
- Write candidates to `pattern_candidates` table

**Expected output:**
- ~100 listening candidates (n-grams)
- ~10-20 semantic candidates (phrasal verbs)

## Step 2: Review and Accept Candidates

### Option A: Accept specific candidates

1. **Mark candidate as accepted in database:**
   ```sql
   UPDATE pattern_candidates 
   SET status = 'accepted' 
   WHERE phrase_text = 'need to';
   ```

2. **Run acceptance script:**
   ```bash
   npx tsx scripts/acceptPatternCandidates.ts --candidate-id=<uuid> --generate-spans
   ```

### Option B: Accept all candidates (for testing)

1. **Mark all candidates as accepted:**
   ```sql
   UPDATE pattern_candidates 
   SET status = 'accepted' 
   WHERE status = 'new';
   ```

2. **Run acceptance script:**
   ```bash
   npx tsx scripts/acceptPatternCandidates.ts --all --generate-spans
   ```

## Step 3: Verify Results

### Check patterns in `listening_patterns`:
```sql
SELECT pattern_key, chunk_display, words, how_it_sounds 
FROM listening_patterns 
WHERE pattern_key LIKE 'need-to%' 
ORDER BY created_at DESC 
LIMIT 10;
```

### Check spans in `clip_pattern_spans`:
```sql
SELECT clip_id, pattern_key, ref_start, ref_end 
FROM clip_pattern_spans 
WHERE pattern_key = 'need-to' 
LIMIT 10;
```

### Test in UI:
1. Go to a practice/review page
2. Click on a word that should match an accepted pattern
3. The chunk dictionary should appear with the pattern information

## What the Scripts Do

### `extractPatternCandidates.ts`
- Extracts n-grams (2-4 words) that appear at least 3 times
- Extracts phrasal verbs (verb + particle)
- Writes to `pattern_candidates` with frequency and example clip IDs

### `acceptPatternCandidates.ts`
- Finds candidates with `status='accepted'`
- Generates `pattern_key` from `phrase_text`
- Upserts to `listening_patterns` with:
  - All required NOT NULL fields filled (focus, chunk_display, how_it_sounds, words, pattern_key)
  - Safe placeholders for semantic patterns
- Generates `clip_pattern_spans` for ALL clips containing the phrase (not just examples)
- Uses exact string matching (case-insensitive) to find phrase positions

## Troubleshooting

**Error: "Could not find the table 'public.pattern_candidates'"**
- Run the migration first (see Prerequisites)

**Error: "NOT NULL constraint violation"**
- The script should handle this automatically, but if you see this error, check that:
  - `focus` is set (first word of phrase)
  - `chunk_display` is set (original phrase text)
  - `how_it_sounds` is set (auto-generated explanation)
  - `words` array is not empty

**Spans not appearing in UI:**
- Verify spans were created: `SELECT COUNT(*) FROM clip_pattern_spans WHERE pattern_key = 'your-pattern-key'`
- Check that `ref_start` and `ref_end` are correct character positions
- Verify the clip ID matches what's in the UI

**Pattern not showing in dictionary:**
- Check that `get_chunk_hit` RPC function exists and works
- Verify the pattern_key matches between `listening_patterns` and `clip_pattern_spans`
- Check that `approved = true` in `clip_pattern_spans`
