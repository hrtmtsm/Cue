# Re-Chunking Pipeline Testing Commands

## What Was Enhanced

### GPT Prompt Updates (`scripts/regenerateChunksV2.ts`)
Added two new critical rules:

**Rule 8: VERB/DESTINATION COMPLETENESS**
- Chunks with "go", "come", or "get" MUST include object/destination
- ✅ "We're gonna go" + "to the airport"
- ❌ "We're gonna" + "the airport" (drops "go")

**Rule 9: SUBORDINATING CLAUSE INTEGRITY**
- Do NOT split subordinating conjunctions (before, after, when, if) from their clauses
- ✅ "before we can board" (single chunk)
- ❌ "before we" + "can board" (splits clause)

### Validation Updates (`validateChunk()`)
Added 3 new checks (HIGH/MEDIUM severity):

**Check 7: Dangling gonna/wanna/gotta**
- Rejects: "We're gonna", "I'm gonna", "You're wanna" without following verb

**Check 8: Subordinating conjunction + pronoun**
- Rejects: "before we", "after I", "when you", "if they" without clause

**Check 9: Stranded go/come/get**
- Rejects: chunks ending with "go", "come", "get" without destination/object
- Allows: "Let's go", "Here we go" (complete idioms)

---

## Phase 1: Dry Run Test (10 Clips)

### Command
```bash
npx tsx scripts/regenerateChunksV2.ts \
  --dry-run \
  --only-ids=clip-practice-095,clip-practice-v2-041,clip-practice-093,clip-practice-282,clip-practice-288,clip-practice-290,clip-practice-291,clip-practice-292,clip-practice-294,clip-practice-015
```

### What to Look For

**Expected improvements for clip-practice-015**:
- ✅ Should generate: "We're gonna go" + "to the airport"
- ✅ OR: "go to the airport" (single chunk)
- ❌ Should NOT generate: "We're gonna" + "the airport"

**Expected improvements for clip-practice-095**:
- ✅ Should generate: "before we can board" (single chunk)
- ❌ Should NOT generate: "before we" + "can board"

**General validation**:
- Check console output for rejection messages:
  - "Dangling 'gonna' without verb"
  - "Dangling subordinating clause"
  - "Stranded 'go' without destination"
- Verify retry logic kicks in if >30% rejected
- Confirm final chunk samples look grammatically complete

### Sample Expected Output
```
🎧 Processing clip-practice-015
   Transcript: "We're gonna go to the airport before we can board..."
   ✓ Generated 8 valid chunks
   ✓ Matched 8 chunks to transcript
   🔎 DRY RUN: not writing to DB
   Sample chunks:
      "We're gonna go" [0, 14]
      "to the airport" [15, 29]
      "before we can board" [30, 49]
      ...

📊 Progress: 10/10 clips (10 success, 0 skipped)
```

---

## Phase 2: Real Generation to V2 Table (Top 50)

### Prerequisites
- ✅ Phase 1 dry run passed
- ✅ Sample chunks look correct
- ✅ No "dangling" chunks in output

### Command
```bash
# Option A: From audit report (recommended)
npx tsx scripts/regenerateChunksV2.ts \
  --from-audit=audit-report-v2.json \
  --limit=50 \
  --concurrency=2

# Option B: Specific clip IDs
npx tsx scripts/regenerateChunksV2.ts \
  --only-ids=clip-1,clip-2,...,clip-50
```

### What to Monitor
- Success count (should be ~48-50 / 50)
- Skipped count (should be 0-2 / 50)
- Check `regenerate-v2-failures.json` if any failures
- Estimated time: ~2-3 minutes for 50 clips

### Sample Expected Output
```
✅ REGENERATION COMPLETE
═══════════════════════════════════════════════════════════
Total clips processed:  50
Successful:             49
Skipped:                1
Mode:                   REAL

✅ 49 clips written to clip_chunk_spans_v2
Next steps:
  1. Verify in Supabase: SELECT * FROM clip_chunk_spans_v2 WHERE clip_id IN (...)
  2. Run RPC to swap: SELECT swap_chunks_to_v2(ARRAY[...])
  3. Test in UI
```

---

## Phase 3: Verify in Supabase

### SQL Queries

**Query 1: Count v2 chunks by clip**
```sql
SELECT 
  clip_id,
  COUNT(*) as chunk_count,
  STRING_AGG(chunk_text, ' | ' ORDER BY ref_start LIMIT 10) as sample_chunks
FROM clip_chunk_spans_v2
WHERE clip_id IN (
  -- Paste top 10 clip IDs from worst-50.txt
  'clip-practice-015',
  'clip-practice-095',
  ...
)
GROUP BY clip_id
ORDER BY clip_id;
```

**Query 2: Search for problematic patterns in v2**
```sql
-- Should return 0 rows (no dangling chunks)
SELECT clip_id, chunk_text, ref_start, ref_end
FROM clip_chunk_spans_v2
WHERE 
  -- Dangling gonna/wanna
  chunk_text ~* '^(we''re|i''m|you''re|they''re)\s+(gonna|wanna|gotta)$'
  OR
  -- Split subordinate clauses
  chunk_text ~* '^(before|after|when|if)\s+(we|i|you|he|she|they)$'
  OR
  -- Standalone "go to"
  chunk_text = 'go to'
  OR
  -- Standalone "have to"
  chunk_text = 'have to'
ORDER BY clip_id;
```

**Query 3: Spot check specific clips**
```sql
-- Check clip-practice-015 for "go to the airport" integrity
SELECT chunk_text, ref_start, ref_end
FROM clip_chunk_spans_v2
WHERE clip_id = 'clip-practice-015'
ORDER BY ref_start;

-- Check clip-practice-095 for "before we can board" integrity
SELECT chunk_text, ref_start, ref_end
FROM clip_chunk_spans_v2
WHERE clip_id = 'clip-practice-095'
ORDER BY ref_start;
```

### Acceptance Criteria
- ✅ No rows returned from Query 2 (no problematic patterns)
- ✅ clip-practice-015 includes "We're gonna go" or "go to the airport" (not "We're gonna" alone)
- ✅ clip-practice-095 includes "before we can board" (not "before we" alone)
- ✅ All chunks are exact substrings of transcripts
- ✅ No "shoot you an email" split into pieces

---

## Phase 4: Swap to Production

### Prerequisites
- ✅ Phase 3 verification passed
- ✅ Supabase spot checks look good
- ✅ No problematic patterns found

### Create Clip IDs File
```bash
# Extract clip IDs from v2 table
psql -h <host> -U <user> -d <db> -c \
  "COPY (SELECT DISTINCT clip_id FROM clip_chunk_spans_v2 ORDER BY clip_id) TO STDOUT" \
  > worst-50.txt
```

### Swap Command
```bash
# Option A: Using wrapper script
npx tsx scripts/swapChunksToV2.ts --from-file=worst-50.txt

# Option B: Direct SQL (if wrapper fails)
# In Supabase SQL Editor:
SELECT swap_chunks_to_v2(ARRAY[
  'clip-practice-015',
  'clip-practice-095',
  -- ... paste all 50 clip IDs
]);
```

### Expected Output
```
✅ SWAP SUCCESSFUL
═══════════════════════════════════════════════════════════
Clips swapped:     50
Backed up:         417 chunks
Deleted:           417 old chunks
Inserted:          405 new chunks

Successfully swapped 405 chunks for 50 clips

✅ Next steps:
   1. Test in UI: open practice page, check chunk dictionary
   2. Test "Why this is hard" insights
   3. If issues found, rollback with: npx tsx scripts/restoreChunksFromBackup.ts <clip-ids>
```

---

## Phase 5: UI Testing

### Test 1: Chunk Dictionary (Word Click)
1. Navigate to `/en/practice/respond`
2. Select a swapped clip (e.g., clip-practice-015)
3. Click on words in transcript
4. **Expected**: Modal shows complete chunks
5. **Verify**: No "We're gonna" alone, no "before we" alone

### Test 2: "Why This Is Hard" Insights
1. Complete practice clip
2. Go to review page (`/en/practice/review`)
3. Open "Why this is hard" modal
4. **Expected**: Context chunks are complete phrases
5. **Verify**: No split subordinate clauses in insight cards

### Test 3: Audio Playback
1. In "Why this is hard", click "How it sounds"
2. **Expected**: Audio plays for the chunk
3. **Verify**: No console errors

---

## Phase 6: Rollback (If Needed)

### When to Rollback
- ❌ UI shows broken chunks in dictionary
- ❌ "Why this is hard" insights are incomplete
- ❌ Audio playback fails
- ❌ Users report issues

### Rollback Command
```bash
npx tsx scripts/restoreChunksFromBackup.ts --from-file=worst-50.txt

# Or direct SQL:
SELECT restore_chunks_from_backup(ARRAY[
  'clip-practice-015',
  'clip-practice-095',
  -- ... paste all 50 clip IDs
]);
```

### Expected Output
```
✅ RESTORE SUCCESSFUL
═══════════════════════════════════════════════════════════
Clips restored:    50
Deleted:           405 current chunks
Restored:          417 chunks from backup

Successfully restored 417 chunks for 50 clips
```

---

## Troubleshooting

### Issue: High rejection rate during regeneration

**Symptom**:
```
⚠️  Rejected 15/20 chunks (75%)
🔄 Invalid rate too high (75%), retrying with stricter prompt...
❌ Invalid rate still too high (60%) after retry, skipping clip
```

**Solution**:
1. Check `regenerate-v2-failures.json` for details
2. Inspect transcript of failed clip
3. If transcript is genuinely complex, consider manual chunking
4. If pattern is systematic, report to dev team

---

### Issue: Chunks still look "weak" after regeneration

**Example**: "We need to" + "get to" + "the airport"

**Diagnosis**:
- This might be acceptable if transcript is very long
- Check if chunks are within 1-8 word limit
- Verify chunks are grammatically complete (even if short)

**Action**:
- If chunks are complete but short, it's OK (better than broken)
- If chunks are incomplete, report specific patterns to dev team

---

### Issue: Swap fails with "Count mismatch" error

**Symptom**:
```
❌ Swap failed: Count mismatch: expected 405, got 398. Rolling back.
   Transaction was rolled back - production table unchanged
```

**Solution**:
1. Check v2 table: `SELECT COUNT(*) FROM clip_chunk_spans_v2 WHERE clip_id IN (...)`
2. Verify clip IDs match exactly
3. Re-run regeneration for missing clips
4. Try swap again

---

## Summary Checklist

Before scaling to full dataset (500 clips):

- [ ] Phase 1: Dry run passed (10 clips, no dangling chunks)
- [ ] Phase 2: Real generation successful (50 clips to v2)
- [ ] Phase 3: Supabase verification passed (no problematic patterns)
- [ ] Phase 4: Swap successful (50 clips to production)
- [ ] Phase 5: UI testing passed (dictionary + insights work)
- [ ] Phase 6: Rollback tested and working (restore 1-2 clips)

If all checkboxes pass → proceed to full dataset regeneration in batches of 50.

---

**Last updated**: 2026-02-07  
**Script version**: V2.1 (enhanced validation)
