# Pattern Candidates Extraction and Acceptance

This directory contains scripts for batch-generating pattern candidates from existing transcripts and accepting them into the `listening_patterns` table.

## Overview

1. **Extract candidates** from `curated_clips` transcripts
2. **Review candidates** in `pattern_candidates` table
3. **Accept candidates** and upsert them to `listening_patterns`

## Setup

### 1. Run Migration

First, apply the migration to create the `pattern_candidates` table:

```bash
# Apply migration via Supabase CLI or dashboard
supabase migration up 009_create_pattern_candidates
```

Or manually run the SQL in `supabase/migrations/009_create_pattern_candidates.sql`

### 2. Environment Variables

Ensure `.env.local` contains:
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Usage

### Step 1: Extract Candidates

Extract frequent n-grams and phrasal verbs from all transcripts:

```bash
# Dry run (preview without writing)
npx tsx scripts/extractPatternCandidates.ts --dry-run

# Extract with default settings (min frequency: 3, max n-gram: 4, top 100 per kind)
npx tsx scripts/extractPatternCandidates.ts

# Custom settings
npx tsx scripts/extractPatternCandidates.ts --min-freq=5 --max-ngram=3 --top-n=50
```

**Options:**
- `--min-freq <number>`: Minimum frequency for n-grams (default: 3)
- `--max-ngram <number>`: Maximum n-gram size (default: 4)
- `--top-n <number>`: Top N candidates to save per kind (default: 100)
- `--dry-run`: Preview without writing to database

**What it does:**
- Loads all transcripts from `curated_clips`
- Extracts frequent 2-4 word n-grams (listening patterns)
- Extracts phrasal verb patterns (verb + particle) (semantic patterns)
- Writes candidates to `pattern_candidates` table with frequency and example clip IDs

### Step 2: Review Candidates

Query the `pattern_candidates` table to review candidates:

```sql
-- View all new candidates
SELECT * FROM pattern_candidates 
WHERE status = 'new' 
ORDER BY frequency DESC 
LIMIT 50;

-- View by kind
SELECT * FROM pattern_candidates 
WHERE status = 'new' AND candidate_kind = 'listening'
ORDER BY frequency DESC;

-- View by kind
SELECT * FROM pattern_candidates 
WHERE status = 'new' AND candidate_kind = 'semantic'
ORDER BY frequency DESC;
```

### Step 3: Accept Candidates

Mark candidates as accepted and upsert them to `listening_patterns`:

```bash
# Accept a specific candidate
npx tsx scripts/acceptPatternCandidates.ts --candidate-id=<uuid>

# Accept all candidates with status='accepted'
npx tsx scripts/acceptPatternCandidates.ts --all

# Accept and generate spans for example clips
npx tsx scripts/acceptPatternCandidates.ts --all --generate-spans

# Dry run (preview without writing)
npx tsx scripts/acceptPatternCandidates.ts --all --dry-run
```

**Options:**
- `--candidate-id <uuid>`: Accept specific candidate by ID
- `--all`: Accept all candidates with `status='accepted'`
- `--generate-spans`: Generate `clip_pattern_spans` for example clips
- `--dry-run`: Preview without writing to database

**What it does:**
- Finds candidates with `status='accepted'`
- Generates `pattern_key` from `phrase_text` (e.g., "push the deadline back" → "push-the-deadline-back")
- Upserts to `listening_patterns` with basic fields
- Optionally generates spans for example clips

### Manual Acceptance Workflow

1. **Mark candidate as accepted:**
   ```sql
   UPDATE pattern_candidates 
   SET status = 'accepted' 
   WHERE id = '<candidate-id>';
   ```

2. **Run acceptance script:**
   ```bash
   npx tsx scripts/acceptPatternCandidates.ts --candidate-id=<candidate-id>
   ```

3. **Update pattern details** (optional):
   ```sql
   UPDATE listening_patterns 
   SET 
     how_it_sounds = 'Custom explanation...',
     tip = 'Custom tip...',
     priority = 90
   WHERE pattern_key = 'push-the-deadline-back';
   ```

## Table Schema

### `pattern_candidates`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `phrase_text` | TEXT | The candidate phrase (e.g., "push the deadline back") |
| `candidate_kind` | TEXT | 'listening' or 'semantic' |
| `frequency` | INTEGER | How many times this phrase appeared across transcripts |
| `example_clip_ids` | TEXT[] | Array of clip IDs where this phrase appears |
| `status` | TEXT | 'new', 'accepted', or 'rejected' |
| `created_at` | TIMESTAMPTZ | When the candidate was created |

## Example Workflow

```bash
# 1. Extract candidates (dry run first)
npx tsx scripts/extractPatternCandidates.ts --dry-run

# 2. Extract for real
npx tsx scripts/extractPatternCandidates.ts --min-freq=3 --top-n=100

# 3. Review in database
# (Query pattern_candidates table)

# 4. Mark good candidates as accepted
# (UPDATE pattern_candidates SET status = 'accepted' WHERE ...)

# 5. Accept and generate spans
npx tsx scripts/acceptPatternCandidates.ts --all --generate-spans

# 6. Review and refine patterns in listening_patterns
# (Update how_it_sounds, tip, priority, etc.)
```

## Notes

- **N-grams**: Extracted as lowercase, punctuation removed
- **Phrasal verbs**: Detected using particle list (up, out, off, back, down, in, on, over, away, etc.)
- **Frequency**: Counts occurrences across all transcripts
- **Example clips**: Limited to 10 per candidate to avoid large arrays
- **Pattern keys**: Generated by joining words with hyphens (e.g., "want to" → "want-to")
- **Spans**: Generated by finding phrase position in transcript (case-insensitive)

## Troubleshooting

**Error: "No clips found"**
- Check that `curated_clips` table has data
- Verify transcripts are not null

**Error: "Authentication required"**
- Check `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`
- Ensure service role key has write permissions

**Candidates not appearing:**
- Check minimum frequency threshold (default: 3)
- Verify transcripts contain the phrases
- Check that n-gram size matches phrase length
