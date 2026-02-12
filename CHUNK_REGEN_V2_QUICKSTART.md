# Chunk Regeneration V2 - Quick Start Guide

## 🎯 Goal
Safely regenerate ~500 clips with better chunk quality (fix "you an email", "I'm gonna shoot", etc.)

## 📦 What Was Delivered

### 1. Database Migration
- **File**: `supabase/migrations/016_create_chunk_spans_v2.sql`
- **Creates**:
  - `clip_chunk_spans_v2` (shadow table for new chunks)
  - `clip_chunk_spans_backup` (backup table)
  - 5 RPC functions for atomic operations

### 2. Scripts
- **`scripts/auditChunkSpans.ts`** (enhanced)
  - CRITICAL/HIGH/MEDIUM/LOW severity levels
  - Pattern detection for forbidden chunks
  - CSV + JSON export
  
- **`scripts/regenerateChunksV2.ts`** (new)
  - Improved GPT prompt with strict rules
  - Validation + retry logic
  - Writes to v2 table
  - Checkpoint for resumability
  
- **`scripts/swapChunksToV2.ts`** (new)
  - Wrapper for atomic swap RPC
  - Verification before swap
  
- **`scripts/restoreChunksFromBackup.ts`** (new)
  - Emergency rollback wrapper

### 3. Documentation
- **`CHUNK_REGEN_V2.md`** - Full step-by-step runbook (see this for details)
- **`CHUNK_REGEN_V2_QUICKSTART.md`** - This file

## ⚡ Quick Commands (Test on 10 Clips)

```bash
# Step 1: Find worst clips
npx tsx scripts/auditChunkSpans.ts --export=audit-report.json --export-csv=worst.csv

# Step 2: Pick 10 worst clip IDs from worst.csv, then:

# Dry run (test GPT output)
npx tsx scripts/regenerateChunksV2.ts --dry-run --only-ids=clip-1,clip-2,...,clip-10

# Real run (write to v2)
npx tsx scripts/regenerateChunksV2.ts --only-ids=clip-1,clip-2,...,clip-10

# Step 3: Verify in Supabase
SELECT * FROM clip_chunk_spans_v2 WHERE clip_id IN ('clip-1', 'clip-2', ..., 'clip-10');

# Step 4: Swap to production
npx tsx scripts/swapChunksToV2.ts clip-1 clip-2 ... clip-10

# Step 5: Test in UI
# - Open practice page
# - Click words (chunk dictionary)
# - Check "Why this is hard" insights

# Step 6: Rollback if issues
npx tsx scripts/restoreChunksFromBackup.ts clip-1 clip-2 ... clip-10
```

## ✅ Testing Checklist

Before scaling to 500 clips:

1. [ ] Run audit, identify 10 worst clips
2. [ ] Dry run on 10 clips → verify no bad patterns in output
3. [ ] Real run on 10 clips → verify data in v2 table
4. [ ] Manual SQL check: no "you an email", "I'm gonna shoot"
5. [ ] Swap 10 clips to production
6. [ ] UI test: chunk dictionary works correctly
7. [ ] UI test: "Why this is hard" shows complete chunks
8. [ ] Test rollback on 1-2 clips
9. [ ] If all pass → scale to batches of 50

## 🔥 Scale to Full Dataset

```bash
# Process in batches of 50
npx tsx scripts/regenerateChunksV2.ts \
  --from-audit=audit-report.json \
  --limit=50 \
  --concurrency=2

# After each batch:
# 1. Verify in Supabase
# 2. Swap to production
# 3. Quick UI test
# 4. Continue to next batch
```

## 🚨 Emergency Rollback

If production breaks:

```bash
# Rollback specific clips
npx tsx scripts/restoreChunksFromBackup.ts clip-1 clip-2 ...

# Or via SQL (if script fails)
SELECT restore_chunks_from_backup(ARRAY['clip-1', 'clip-2', ...]);
```

## 📊 Validation Heuristics

The regeneration script rejects chunks that:
- Are function-word-only ("the", "a")
- End with **forbidden function words**: articles (a, an, the), prepositions (to, of, for, at, in, on, with, by), auxiliaries (is, are, be, have, has, had, do, does, did, will, would, etc.)
- Match critical patterns: /^you\s+an?\s+\w+$/i (e.g., "you an email"), /^I'm\s+gonna\s+\w+$/i (e.g., "I'm gonna shoot")
- Are not exact substrings of transcript
- Have no content words

**Object pronouns and demonstratives ARE ALLOWED as endings**:
- ✅ "call you", "tell you", "find it", "asked him", "got this", "need that"
- ❌ "go to", "kind of", "have to", "It's kind of"

If >30% of chunks are rejected, it retries with a stricter prompt.
If still >50% rejected, the clip is skipped and logged to `regenerate-v2-failures.json`.

## 📁 Files Created

| File | Purpose |
|------|---------|
| `supabase/migrations/016_create_chunk_spans_v2.sql` | DB migration |
| `scripts/auditChunkSpans.ts` | Enhanced audit (CRITICAL severity) |
| `scripts/regenerateChunksV2.ts` | Main regeneration script |
| `scripts/swapChunksToV2.ts` | Swap wrapper |
| `scripts/restoreChunksFromBackup.ts` | Rollback wrapper |
| `CHUNK_REGEN_V2.md` | Full documentation |
| `CHUNK_REGEN_V2_QUICKSTART.md` | This file |

## 🎯 Next Step

**Run the audit now**:
```bash
npx tsx scripts/auditChunkSpans.ts --export=audit-report.json --export-csv=worst.csv
```

Then review `worst.csv` and pick 10 clips with highest `severity_score` to start testing.

---

**Questions?** See full documentation in `CHUNK_REGEN_V2.md`
