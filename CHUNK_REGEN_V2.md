# Chunk Regeneration V2 - Safe Re-Chunking Pipeline

## Overview

This document provides a step-by-step guide for safely regenerating listening chunks for ~500 clips to fix quality issues like:
- Incomplete phrases: "you an email" (missing verb)
- Meaning-breaking cuts: "I'm gonna shoot" (missing object)
- Function-word-only chunks: "the", "a"
- Chunks ending with function words

**Architecture**: Shadow table → Verify → Swap → Rollback capability

## Prerequisites

1. **Environment variables** in `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   SUPABASE_SERVICE_ROLE_KEY=...
   OPENAI_API_KEY=...
   ```

2. **Database migration applied**:
   ```bash
   # Apply migration 016 (creates shadow + backup tables + RPCs)
   # This should already be done via Supabase dashboard or CLI
   ```

3. **Current chunks in production**: 
   - Table `clip_chunk_spans` should have existing chunks
   - These will be backed up before any swap

## Pipeline Components

| Component | Purpose |
|-----------|---------|
| `clip_chunk_spans` | Production table (live) |
| `clip_chunk_spans_v2` | Shadow table (for new chunks) |
| `clip_chunk_spans_backup` | Backup table (for rollback) |
| `scripts/auditChunkSpans.ts` | Find bad chunks |
| `scripts/regenerateChunksV2.ts` | Generate new chunks → v2 table |
| `scripts/swapChunksToV2.ts` | Swap v2 → production (atomic) |
| `scripts/restoreChunksFromBackup.ts` | Rollback (atomic) |

## Step-by-Step Execution

### PHASE 1: Audit (Find Worst Clips)

Run the audit to identify clips with bad chunks:

```bash
# Full audit with JSON + CSV export
npx tsx scripts/auditChunkSpans.ts \
  --export=audit-report.json \
  --export-csv=worst-clips.csv
```

**Expected output**:
- Console summary with critical/high/medium/low counts
- `audit-report.json`: Full report with all issues
- `worst-clips.csv`: Clips ranked by severity score

**Sample output**:
```
📊 AUDIT SUMMARY
────────────────────────────────────────────────────────────
Total chunks scanned:   2847
Issues found:           234 (8%)
  CRITICAL severity:    45
  High severity:        89
  Medium severity:      78
  Low severity:         22
Clips with issues:      187
────────────────────────────────────────────────────────────

🔥 TOP 20 CLIPS WITH MOST ISSUES (by severity score)
────────────────────────────────────────────────────────────
1. clip-practice-042 (score: 42.5)
   8 issues (critical: 3, high: 2, medium: 3)
2. clip-practice-157 (score: 38.0)
   7 issues (critical: 2, high: 4, medium: 1)
...
```

**Review the results**:
- Open `worst-clips.csv` in a spreadsheet
- Identify clips with `critical_count > 0` or `high_count > 2`
- These are your regeneration targets

---

### PHASE 2: Test Regeneration (Dry Run on 10 Worst Clips)

Pick the 10 worst clips from the audit report and test regeneration:

```bash
# Extract top 10 clip IDs from CSV (manual or via command)
# Example: clip-practice-042,clip-practice-157,clip-practice-203,...

# Dry run (no DB writes) to verify GPT output
npx tsx scripts/regenerateChunksV2.ts \
  --dry-run \
  --only-ids=clip-practice-042,clip-practice-157,clip-practice-203,clip-practice-089,clip-practice-211,clip-practice-074,clip-practice-198,clip-practice-133,clip-practice-165,clip-practice-081
```

**Expected output**:
```
🚀 Starting chunk regeneration V2...
   Mode: DRY RUN (no DB writes)
   Concurrency: 1
   Rate limit: 1200ms between requests
   Processing 10 specific clips
📦 Loaded 10 clips from database
────────────────────────────────────────────────────────────

🎧 Processing clip-practice-042
   Transcript: "I'll shoot you an email later tonight..."
   ⚠️  Rejected 2/8 chunks (25%)
      - "shoot you an" (Ends with function word)
   🔄 Invalid rate too high (25%), retrying with stricter prompt...
   ✓ Generated 7 valid chunks
   ✓ Matched 7 chunks to transcript
   🔎 DRY RUN: not writing to DB
   Sample chunks:
      "I'll" [0, 4]
      "shoot you an email" [5, 23]
      "later tonight" [24, 37]
...

✅ REGENERATION COMPLETE
═══════════════════════════════════════════════════════════
Total clips processed:  10
Successful:             10
Skipped:                0
Mode:                   DRY RUN
```

**Review**:
- Check sample chunks look correct
- Verify no "you an email", "I'm gonna shoot" patterns
- If issues found, report to dev team (GPT prompt may need tuning)

---

### PHASE 3: Write to V2 Table (Real Run on 10 Clips)

If dry run looks good, write to the v2 table:

```bash
# REAL RUN - writes to clip_chunk_spans_v2
npx tsx scripts/regenerateChunksV2.ts \
  --only-ids=clip-practice-042,clip-practice-157,clip-practice-203,clip-practice-089,clip-practice-211,clip-practice-074,clip-practice-198,clip-practice-133,clip-practice-165,clip-practice-081
```

**Expected output**:
```
...
✅ REGENERATION COMPLETE
═══════════════════════════════════════════════════════════
Total clips processed:  10
Successful:             10
Skipped:                0
Mode:                   REAL

✅ 10 clips written to clip_chunk_spans_v2
Next steps:
  1. Verify in Supabase: SELECT * FROM clip_chunk_spans_v2 WHERE clip_id IN (...)
  2. Run RPC to swap: SELECT swap_chunks_to_v2(ARRAY[...])
  3. Test in UI
```

**Checkpoint file created**: `scripts/.regenerateV2.checkpoint.json`
- Tracks processed clips for resumability
- Delete this file to force re-run

---

### PHASE 4: Verify V2 Chunks in Supabase

Open Supabase SQL Editor and run:

```sql
-- Count v2 chunks for the 10 test clips
SELECT 
  clip_id,
  COUNT(*) as chunk_count,
  STRING_AGG(chunk_text, ' | ' ORDER BY ref_start) as sample_chunks
FROM clip_chunk_spans_v2
WHERE clip_id IN (
  'clip-practice-042',
  'clip-practice-157',
  'clip-practice-203',
  'clip-practice-089',
  'clip-practice-211',
  'clip-practice-074',
  'clip-practice-198',
  'clip-practice-133',
  'clip-practice-165',
  'clip-practice-081'
)
GROUP BY clip_id
ORDER BY clip_id;
```

**Manual quality check**:
- Open a few clips' transcripts
- Compare chunks in v2 table vs. sample transcript
- Look for:
  - ✅ Complete phrases (no "you an email", "I'm gonna shoot")
  - ✅ No function-word-only chunks
  - ✅ No chunks ending with function words
  - ✅ Chunks are exact substrings

**Run verification RPC**:
```sql
-- Verify readiness for swap
SELECT verify_v2_chunks(ARRAY[
  'clip-practice-042',
  'clip-practice-157',
  'clip-practice-203',
  'clip-practice-089',
  'clip-practice-211',
  'clip-practice-074',
  'clip-practice-198',
  'clip-practice-133',
  'clip-practice-165',
  'clip-practice-081'
]);
```

**Expected result**:
```json
{
  "clips_in_v2": 10,
  "chunks_in_v2": 87,
  "chunks_in_prod": 92,
  "ready_to_swap": true
}
```

---

### PHASE 5: Swap to Production (10 Clips)

**⚠️ CRITICAL STEP**: This replaces production chunks!

Use the wrapper script:

```bash
npx tsx scripts/swapChunksToV2.ts \
  clip-practice-042 \
  clip-practice-157 \
  clip-practice-203 \
  clip-practice-089 \
  clip-practice-211 \
  clip-practice-074 \
  clip-practice-198 \
  clip-practice-133 \
  clip-practice-165 \
  clip-practice-081
```

**Or call RPC directly in Supabase SQL Editor**:

```sql
-- Atomic swap with automatic backup
SELECT swap_chunks_to_v2(ARRAY[
  'clip-practice-042',
  'clip-practice-157',
  'clip-practice-203',
  'clip-practice-089',
  'clip-practice-211',
  'clip-practice-074',
  'clip-practice-198',
  'clip-practice-133',
  'clip-practice-165',
  'clip-practice-081'
]);
```

**Expected output**:
```json
{
  "success": true,
  "clip_count": 10,
  "backed_up": 92,
  "deleted": 92,
  "inserted": 87,
  "message": "Successfully swapped 87 chunks for 10 clips"
}
```

**What just happened**:
1. ✅ Old chunks backed up to `clip_chunk_spans_backup`
2. ✅ Old chunks deleted from `clip_chunk_spans`
3. ✅ V2 chunks copied to `clip_chunk_spans`
4. ✅ Transaction verified (rollback on error)

---

### PHASE 6: Test in UI

**Test 1: Chunk Dictionary (Word Click)**
1. Open `http://localhost:3000/en/practice/respond` (or staging)
2. Select one of the 10 swapped clips
3. Click on words in the transcript
4. **Expected**: Modal shows chunk boundary correctly
5. **Check**: No "you an email" or broken chunks in dictionary

**Test 2: "Why This Is Hard" Insights**
1. Complete the practice clip (submit answer)
2. Go to review page
3. Open "Why this is hard" modal
4. **Expected**: Insight cards show complete chunks as context
5. **Check**: No "I'm gonna shoot" or incomplete phrases in feedback

**Test 3: Audio Playback**
1. In "Why this is hard", click "How it sounds"
2. **Expected**: Audio plays for the chunk
3. **Check**: No errors in console

---

### PHASE 7: Rollback (If Issues Found)

**If you find issues in UI testing**, rollback immediately:

```bash
# Rollback via wrapper script
npx tsx scripts/restoreChunksFromBackup.ts \
  clip-practice-042 \
  clip-practice-157 \
  clip-practice-203 \
  clip-practice-089 \
  clip-practice-211 \
  clip-practice-074 \
  clip-practice-198 \
  clip-practice-133 \
  clip-practice-165 \
  clip-practice-081
```

**Or call RPC directly**:

```sql
-- Atomic restore from backup
SELECT restore_chunks_from_backup(ARRAY[
  'clip-practice-042',
  'clip-practice-157',
  'clip-practice-203',
  'clip-practice-089',
  'clip-practice-211',
  'clip-practice-074',
  'clip-practice-198',
  'clip-practice-133',
  'clip-practice-165',
  'clip-practice-081'
]);
```

**Expected output**:
```json
{
  "success": true,
  "clip_count": 10,
  "deleted": 87,
  "restored": 92,
  "message": "Successfully restored 92 chunks for 10 clips"
}
```

**After rollback**:
1. Old chunks are back in production
2. V2 chunks still in `clip_chunk_spans_v2` (for debugging)
3. Report issue to dev team
4. Fix GPT prompt or validation logic
5. Re-run regeneration

---

### PHASE 8: Clean Up Orphaned Meanings (Optional)

After swap, old `chunk_meanings` may reference deleted chunk IDs:

```sql
-- Clean up orphaned meanings
SELECT cleanup_orphaned_chunk_meanings();
```

**Note**: This is optional. New meanings will be generated lazily on first click.

---

### PHASE 9: Scale to Full Dataset (Batches of 50)

Once 10-clip test is successful, scale up:

```bash
# Regenerate top 50 worst clips from audit
npx tsx scripts/regenerateChunksV2.ts \
  --from-audit=audit-report.json \
  --limit=50 \
  --concurrency=2
```

**Or process in batches of 50** (safer for rate limits):

```bash
# Batch 1: Clips 1-50
npx tsx scripts/regenerateChunksV2.ts \
  --from-audit=audit-report.json \
  --limit=50

# Verify + Swap
npx tsx scripts/swapChunksToV2.ts --from-file=batch1-clip-ids.txt

# Test in UI

# Batch 2: Clips 51-100
npx tsx scripts/regenerateChunksV2.ts \
  --from-audit=audit-report.json \
  --limit=100  # Takes top 100, but 1-50 already in checkpoint, so processes 51-100

# Continue...
```

**Checkpoint resumability**:
- If script crashes, just re-run the same command
- Checkpoint tracks processed clips, skips them on restart
- To force re-run: `rm scripts/.regenerateV2.checkpoint.json`

---

## Troubleshooting

### Issue: "OpenAI rate limit exceeded"

**Solution**: Increase `--rate-limit` (default 1200ms):
```bash
npx tsx scripts/regenerateChunksV2.ts \
  --only-ids=... \
  --rate-limit=2000  # 2 seconds between requests
```

---

### Issue: "Invalid rate still too high after retry"

**Symptom**: Script skips clips with message like:
```
❌ Invalid rate still too high (60%) after retry, skipping clip
```

**Solution**: 
1. Check `regenerate-v2-failures.json` for details
2. Manually inspect transcript for that clip
3. If transcript is genuinely hard to chunk (e.g., very long, complex), consider manual chunking
4. Report to dev team if it's a GPT prompt issue

---

### Issue: "Count mismatch: expected X, got Y. Rolling back."

**Symptom**: Swap fails with transaction rollback

**Solution**:
- This is a safety check (working as intended)
- Check Supabase logs for details
- Verify v2 table has correct data: `SELECT * FROM clip_chunk_spans_v2 WHERE clip_id = '...'`
- Re-run regeneration if v2 data is corrupt

---

### Issue: "No backup found for these clip_ids"

**Symptom**: Rollback script fails

**Cause**: Trying to rollback clips that were never swapped (no backup exists)

**Solution**: Only rollback clips that were swapped in Phase 5

---

## File Locations

| File | Purpose |
|------|---------|
| `scripts/.regenerateV2.checkpoint.json` | Resumability checkpoint |
| `scripts/regenerate-v2-failures.json` | Failed clips report |
| `audit-report.json` | Full audit results |
| `worst-clips.csv` | Clips ranked by severity |

---

## Safety Checklist

Before running in production:

- [ ] Migration 016 applied
- [ ] Environment variables set
- [ ] Audit run successfully
- [ ] Dry run tested on 10 clips
- [ ] Real run tested on 10 clips
- [ ] Manual quality check in Supabase
- [ ] UI testing passed (dictionary + insights)
- [ ] Rollback tested and working
- [ ] Backup verified in `clip_chunk_spans_backup`

---

## Emergency Rollback

If production is broken after swap:

```sql
-- Rollback ALL swapped clips (if you have the list)
SELECT restore_chunks_from_backup(ARRAY[...]);

-- Or rollback ALL clips with backup
SELECT restore_chunks_from_backup(
  ARRAY(SELECT DISTINCT clip_id FROM clip_chunk_spans_backup)
);
```

**Warning**: This restores ALL backed-up clips, potentially including old swaps. Only use as last resort.

---

## Performance Notes

- **Concurrency**: Default is 1 (safe). Can increase to 2-3 for faster processing.
- **Rate limit**: Default 1200ms. OpenAI tier 1 allows ~500 RPM (120ms/request), but conservative to avoid spikes.
- **Batch size**: 50 clips per batch recommended for monitoring + testing.
- **Estimated time**: ~2-3 seconds per clip (GPT + DB write). 500 clips = ~20-30 minutes.

---

## Next Steps After Full Regeneration

1. **Monitor error rates** in practice sessions (via analytics)
2. **Collect user feedback** on chunk dictionary quality
3. **Compare "Why this is hard" accuracy** before/after
4. **Iterate on GPT prompt** if new patterns emerge
5. **Document lessons learned** for future re-chunking

---

## Summary Commands (Copy-Paste Ready)

```bash
# 1. Audit
npx tsx scripts/auditChunkSpans.ts --export=audit-report.json --export-csv=worst-clips.csv

# 2. Dry run (10 worst clips)
npx tsx scripts/regenerateChunksV2.ts --dry-run --only-ids=clip-1,clip-2,...

# 3. Real run (10 worst clips)
npx tsx scripts/regenerateChunksV2.ts --only-ids=clip-1,clip-2,...

# 4. Verify in DB
SELECT verify_v2_chunks(ARRAY['clip-1', 'clip-2', ...]);

# 5. Swap to production
npx tsx scripts/swapChunksToV2.ts clip-1 clip-2 ...

# 6. Test in UI
# (manual)

# 7. Rollback if needed
npx tsx scripts/restoreChunksFromBackup.ts clip-1 clip-2 ...

# 8. Clean up meanings
SELECT cleanup_orphaned_chunk_meanings();

# 9. Scale up (batches of 50)
npx tsx scripts/regenerateChunksV2.ts --from-audit=audit-report.json --limit=50 --concurrency=2
```

---

**Document version**: 1.0  
**Last updated**: 2026-02-07  
**Owner**: Cue Dev Team
