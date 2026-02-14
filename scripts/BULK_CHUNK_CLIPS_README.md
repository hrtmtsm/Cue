# Bulk Chunk Curated Clips with OpenAI + Supabase

This script calls the OpenAI GPT API to generate **listening-meaning chunks** for each
approved `curated_clips` row, matches them back to the transcript, and writes chunk spans
to Supabase.

## Files

- `scripts/bulkChunkClips.ts` — main script
- `scripts/BULK_CHUNK_CLIPS_README.md` — this file

## Environment Variables

Set these in your shell or `.env` before running:

- `SUPABASE_URL` — Supabase project URL (e.g. `https://xxx.supabase.co`)
- `SUPABASE_SERVICE_ROLE_KEY` — service role key (used server-side ONLY)
- `OPENAI_API_KEY` — OpenAI API key

## How to Run

From the project root:

```bash
# 1) Dry-run on a small sample (no DB writes)
npx tsx scripts/bulkChunkClips.ts --dry-run --max-clips=20

# 2) Real run on all remaining clips
npx tsx scripts/bulkChunkClips.ts
```

Options:

- `--dry-run` — do not write to `clip_chunk_spans` or `chunk_generation_log` (logs only)
- `--max-clips=N` — stop after processing at most `N` new clips this run
- `--print-samples=N` — print detailed sample output for the first `N` processed clips (default: 0)
  - Shows transcript, chunks array, and matched spans with `[ref_start, ref_end]`
- `--only-ids=id1,id2,...` — process only the specified clip IDs (comma-separated)
  - Example: `--only-ids=clip-practice-101,clip-practice-142`
  - Useful for re-running failed clips

The script processes clips in batches of **50**, rate limits OpenAI calls to about **1/second**,
and stores a checkpoint file so you can safely re-run it:

- Checkpoint file: `scripts/.bulkChunkClips.checkpoint.json`

## Tables Used

- **Read:** `public.curated_clips (id, transcript, cefr, clip_type, approved)`
- **Write:** `public.clip_chunk_spans`
- **Log:** `public.chunk_generation_log`

Inserted spans use:

- `clip_id` — from `curated_clips.id`
- `chunk_text` — raw chunk string from OpenAI
- `ref_start`, `ref_end` — character offsets in original transcript (0-based, end-exclusive)
- `confidence` — always `'low'` for now
- `approved` — `false`
- `chunk_source` — `'llm_auto'`

Upsert constraint (must exist in DB):

- Unique on `(clip_id, ref_start, ref_end, chunk_text)`

Failures (chunks that could not be matched) are logged to `chunk_generation_log` with:

- `clip_id`
- `status = 'failed'`
- `message`
- `chunk_text`

## OpenAI Prompt (Example)

The script uses a prompt like this (see `buildOpenAIPrompt` in `bulkChunkClips.ts`):

```text
You are an expert English listening coach.
Segment the following transcript into small *listening-meaning* chunks.

Rules:
- Return JSON ONLY in this exact format: { "chunks": ["...", "..."] }
- Do NOT include any explanations or extra keys.
- Each chunk should be 1 to 6 words.
- Chunks should follow natural listening units that learners hear as one piece.
- Do NOT end a chunk with function words such as:
  a, an, the, to, of, at, in, on, for, with, by, from, about, into, onto,
  is, are, was, were, am, be, been, being,
  have, has, had, do, does, did, will, would, could, should, may, might, can, must, shall.
- Keep time expressions and set phrases together, e.g.:
  "at seven thirty", "this afternoon", "for a few minutes", "next Friday evening".

Transcript:
<<<
...transcript text...
>>>

Now return ONLY a single JSON object in this exact shape:
{ "chunks": ["chunk one", "chunk two", "..."] }
```

OpenAI must return **only** the JSON object; the script will `JSON.parse` the response content.

