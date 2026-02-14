# Chunk Data Structure Investigation

## Executive Summary

This document investigates the current data structure for chunks, meanings, and feedback to understand how to implement better click routing.

**Key Findings:**
1. **Chunks are stored in `clip_chunk_spans` table** (created by `scripts/bulkChunkClips.ts`)
2. **Meanings come from `listening_patterns` table** (gloss, translation_ja)
3. **"Why this was hard" is generated on-the-fly** from error tokens, not stored in DB
4. **Click routing uses `charIdx` → RPC `get_clip_chunk_hit` → chunk lookup**
5. **Pattern matching uses `clip_pattern_spans` + `listening_patterns` tables**

---

## 1. DATABASE SCHEMA - CHUNK STORAGE

### Table: `clip_chunk_spans`

**Schema (inferred from `scripts/bulkChunkClips.ts`):**
```sql
CREATE TABLE clip_chunk_spans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id TEXT NOT NULL REFERENCES curated_clips(id) ON DELETE CASCADE,
  chunk_text TEXT NOT NULL,              -- The chunk text (e.g., "i am", "a", "gym trainer")
  ref_start INTEGER NOT NULL,            -- Character start position in transcript
  ref_end INTEGER NOT NULL,              -- Character end position (exclusive)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**What it stores:**
- **Per-clip semantic chunks** (e.g., ["i am", "a", "gym trainer"])
- **Character positions** (`ref_start`, `ref_end`) in transcript string
- **Links to clips** via `clip_id` FK

**Population:**
- Populated by `scripts/bulkChunkClips.ts` using OpenAI GPT
- Script reads from `curated_clips`, generates chunks, writes to `clip_chunk_spans`

**Query Example:**
```sql
-- Show me sample chunk spans
SELECT 
  ccs.id,
  ccs.clip_id,
  ccs.chunk_text,
  ccs.ref_start,
  ccs.ref_end,
  cc.transcript
FROM clip_chunk_spans ccs
JOIN curated_clips cc ON cc.id = ccs.clip_id
LIMIT 3;
```

### Table: `curated_clips`

**Schema (inferred from code):**
```sql
CREATE TABLE curated_clips (
  id TEXT PRIMARY KEY,                   -- e.g., "clip-practice-v2-256"
  transcript TEXT NOT NULL,              -- Full transcript text
  title TEXT,
  text TEXT,                             -- Same as transcript?
  audio_url TEXT,
  focus TEXT[],                          -- Array of focus areas
  target_style TEXT,
  situation TEXT,
  length_sec INTEGER,
  difficulty TEXT,
  created_at TIMESTAMPTZ,
  -- Note: user_id column may or may not exist (defensive code handles both)
);
```

**Query Example:**
```sql
-- Show me sample clip
SELECT 
  id,
  transcript,
  title,
  focus,
  target_style,
  situation,
  difficulty
FROM curated_clips
LIMIT 1;
```

### RPC Function: `get_clip_chunk_hit`

**Purpose:** Find the chunk that contains a given character index

**Parameters:**
- `p_clip_id TEXT` - The clip ID
- `p_char_idx INTEGER` - Character index in transcript

**Returns:**
```typescript
{
  clip_id: string
  pattern_key: string | null
  chunk_display: string
  pattern_kind: string | null  // 'semantic' | 'listening'
  gloss: string | null
  translation_ja: string | null
  ref_start: number
  ref_end: number
}
```

**Usage:**
- Called from `/api/chunk` route (line 51)
- Returns chunk that contains `charIdx`
- Falls back to `get_chunk_hit` (pattern-based) if no chunk found

---

## 2. CURRENT EXPLANATION/FEEDBACK DATA

### "Why this was hard" Explanation

**Source:** Generated on-the-fly, NOT stored in database

**Generation Location:**
- `lib/dataDrivenFeedback.ts` - `generateWhatHappened()` function (lines 71-159)
- `lib/errorClassifier.ts` - `classifyError()` function (lines 126-187)

**How it works:**
1. User submits answer → `/api/check-answer` aligns user text with transcript
2. Alignment produces `tokens` array (correct/wrong/missing/extra)
3. Tokens are classified by error cause (CONNECTED_SPEECH, WORD_REDUCTION, etc.)
4. `generateWhatHappened()` generates:
   - `whatHappened`: "You missed X in this sentence."
   - `whyHard`: General explanation from `generalExplanations` record
   - `examples`: Array of missed words/phrases

**Example `whyHard` explanations:**
```typescript
const generalExplanations: Record<ErrorCause, string> = {
  CONNECTED_SPEECH: 'In fast speech, words often blend together, making boundaries hard to hear.',
  WORD_REDUCTION: 'Reduced forms like "gonna" are common in casual speech and can be hard to catch.',
  FUNCTION_WORD_DROP: 'Small connecting words are often spoken quickly and can be missed.',
  VOWEL_REDUCTION: 'Similar-sounding words can be confusing when spoken quickly.',
  BOUNDARY_MISALIGNMENT: 'Word boundaries can be unclear when speech flows quickly.',
  CONTENT_WORD_MISS: 'Content words carry meaning but can be missed in fast speech.',
}
```

**Storage:** NOT stored in DB - generated dynamically from error tokens

### Chunk Meaning Data

**Source:** Stored in `listening_patterns` table

**Schema:**
```sql
CREATE TABLE listening_patterns (
  id UUID PRIMARY KEY,
  pattern_key TEXT UNIQUE NOT NULL,      -- e.g., "wanna", "gonna"
  chunk_display TEXT NOT NULL,           -- Display form (e.g., "want-to")
  gloss TEXT,                            -- English meaning explanation
  translation_ja TEXT,                   -- Japanese translation
  meaning_general TEXT,                  -- Structural meaning (Layer 1)
  meaning_approved TEXT,                 -- Context-specific meaning (Layer 2)
  meaning_status TEXT DEFAULT 'none',   -- 'none' | 'general' | 'approved' | 'revoked'
  -- ... other fields
);
```

**Query Example:**
```sql
-- Show me patterns with meaning data
SELECT 
  pattern_key,
  chunk_display,
  gloss,
  translation_ja,
  meaning_general,
  meaning_approved,
  meaning_status
FROM listening_patterns
WHERE gloss IS NOT NULL OR translation_ja IS NOT NULL
LIMIT 5;
```

**Link to chunks:**
- `clip_chunk_spans` → (via pattern matching) → `listening_patterns.pattern_key`
- Pattern matching happens in RPC `get_clip_chunk_hit` or `get_chunk_hit`

---

## 3. REVIEW PAGE - TEXT RENDERING

### File: `app/[locale]/(app)/practice/review/page.tsx`

### Text Rendering (Lines 1845-2054)

**How transcript is rendered:**
1. Uses `diffResult.tokens` array (from alignment)
2. Each token is wrapped in a `<span>` with:
   - `data-start={wordStart}` - Character start position
   - `onClick` handler that calls `handleTranscriptClick(start, rect)`
   - Styling based on token type (correct/wrong/missing/extra)

**Code snippet:**
```typescript
return (diffResult.tokens || []).map((t: any, idx: number) => {
  const word = (t.type === 'extra' ? t.actual : t.expected) ?? ''
  
  // Find word's position in transcriptForOffsets
  const start = transcriptForOffsets.indexOf(word, cursor)
  let wordStart = start
  
  return (
    <span
      key={t.id ?? idx}
      className={className}
      data-start={wordStart}
      onClick={async (e) => {
        e.stopPropagation()
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
        await handleTranscriptClick(start, rect)
      }}
    >
      {word}{' '}
    </span>
  )
})
```

### Click Handler (Lines 1431-1513)

**Function: `handleTranscriptClick(charIdx, anchorRect)`**

**Flow:**
1. Validates `charIdx` is within transcript bounds
2. Resolves `clipId` (route param or `dbClipId` from story clip)
3. Calls `fetchAndShowChunk(clipId, charIdx, anchorRect)`

**Code:**
```typescript
const handleTranscriptClick = async (charIdx: number, anchorRect: DOMRect | null) => {
  // ... validation ...
  
  const resolvedClipId = (() => {
    if (clipId && clipId.trim()) return clipId.trim()
    if (currentStoryClipRef.current?.dbClipId) return currentStoryClipRef.current.dbClipId.trim()
    return null
  })()
  
  await fetchAndShowChunk(resolvedClipId, charIdx, anchorRect)
}
```

### Chunk Lookup (Lines 1515-1650)

**Function: `fetchAndShowChunk(clipId, charIdx, anchorRect)`**

**Flow:**
1. Calls `fetchChunkHit(clipId, charIdx)` → `/api/chunk` endpoint
2. Checks if chunk has meaning (`gloss` or `translation_ja`)
3. **If has meaning:** Shows `ChunkDictionary` modal
4. **If no meaning:** Finds event at `charIdx` → Shows insights modal with "Why this was hard"

**Code:**
```typescript
const fetchAndShowChunk = async (clipId: string, charIdx: number, anchorRect: DOMRect | null) => {
  const hit = await fetchChunkHit(clipId, charIdx)
  
  const hasMeaning = hit && (hit.gloss || hit.translation_ja)
  
  if (hasMeaning) {
    // Show ChunkDictionary
    setChunkHit(hit)
    setIsChunkModalOpen(true)
  } else if (hit) {
    // Chunk exists but no meaning - fall back to "Why this was hard"
    const event = findEventAtCharIdx(charIdx)
    if (event) {
      openInsightForEvent(event)
    }
  }
}
```

---

## 4. PATTERN/FEEDBACK SYSTEM

### Table: `clip_pattern_spans`

**Schema:**
```sql
CREATE TABLE clip_pattern_spans (
  id UUID PRIMARY KEY,
  clip_id TEXT NOT NULL REFERENCES curated_clips(id),
  pattern_key TEXT NOT NULL REFERENCES listening_patterns(pattern_key),
  variant_id TEXT,                       -- Links to listening_pattern_variants.id
  ref_start INTEGER NOT NULL,            -- Character start position
  ref_end INTEGER NOT NULL,              -- Character end position
  word_start INTEGER,                   -- Token start index (optional)
  word_end INTEGER,                     -- Token end index (optional)
  confidence TEXT,                      -- 'high' | 'medium' | 'low'
  approved BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**What it stores:**
- **Per-clip pattern spans** (e.g., "gonna", "wanna", "to", "the")
- **Character positions** (`ref_start`, `ref_end`) in transcript
- **Links to pattern definitions** via `pattern_key` FK

### Pattern Matching Logic

**Location:** `app/api/check-answer/route.ts` (lines 146-229)

**Flow:**
1. Fetch `clip_pattern_spans` for clip
2. Filter spans that overlap with user's errors
3. Join with `listening_patterns` to get pattern metadata
4. Join with `listening_pattern_variants` for clip-specific explanations

**Code snippet:**
```typescript
const { data: patternSpans } = await supabase
  .from('clip_pattern_spans')
  .select(`
    *,
    listening_patterns!inner (
      cefr_min,
      priority
    ),
    listening_pattern_variants(
      written_form,
      spoken_form,
      explanation_short,
      explanation_medium,
      listening_strategy,
      what_to_focus_on
    )
  `)
  .eq('clip_id', clipId)
  .eq('approved', true)
```

---

## 5. WORD-TO-CHUNK MAPPING

### How it works:

1. **User clicks word** → `onClick` handler captures `wordStart` (character index)
2. **`handleTranscriptClick(charIdx, anchorRect)`** → Validates and resolves `clipId`
3. **`fetchAndShowChunk(clipId, charIdx, anchorRect)`** → Calls `/api/chunk`
4. **`/api/chunk` route** → Calls RPC `get_clip_chunk_hit(clipId, charIdx)`
5. **RPC function** → Queries `clip_chunk_spans` WHERE `ref_start <= charIdx AND ref_end > charIdx`
6. **Returns chunk** → Chunk with `gloss`/`translation_ja` if available

### Character Index Calculation

**Source:** `transcriptForOffsets` string
- Built from: `refTokens.join(' ')` OR `diffResult.transcript` OR `currentPhrase.text`
- Each word's `wordStart` is calculated by finding its position in this string
- `charIdx` = character position in the full transcript string

**Code:**
```typescript
const refTokens = diffResult.refTokens || []
const transcriptForOffsets = 
  (refTokens.length > 0 ? refTokens.join(' ') : null) ||
  diffResult.transcript ||
  currentPhrase.text ||
  ''

// Find word's position
const start = transcriptForOffsets.indexOf(word, cursor)
let wordStart = start
```

---

## SQL QUERIES TO RUN

### 1. Check chunk_spans table structure
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'clip_chunk_spans'
ORDER BY ordinal_position;
```

### 2. Sample chunk spans
```sql
SELECT 
  ccs.id,
  ccs.clip_id,
  ccs.chunk_text,
  ccs.ref_start,
  ccs.ref_end,
  cc.transcript,
  SUBSTRING(cc.transcript, ccs.ref_start, ccs.ref_end - ccs.ref_start) as chunk_in_transcript
FROM clip_chunk_spans ccs
JOIN curated_clips cc ON cc.id = ccs.clip_id
LIMIT 5;
```

### 3. Check listening_patterns with meanings
```sql
SELECT 
  pattern_key,
  chunk_display,
  gloss,
  translation_ja,
  meaning_general,
  meaning_approved,
  meaning_status
FROM listening_patterns
WHERE gloss IS NOT NULL OR translation_ja IS NOT NULL
LIMIT 10;
```

### 4. Check clip_pattern_spans
```sql
SELECT 
  cps.id,
  cps.clip_id,
  cps.pattern_key,
  cps.ref_start,
  cps.ref_end,
  lp.chunk_display,
  lp.gloss
FROM clip_pattern_spans cps
JOIN listening_patterns lp ON lp.pattern_key = cps.pattern_key
LIMIT 5;
```

### 5. Check curated_clips structure
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'curated_clips'
ORDER BY ordinal_position;
```

---

## SUMMARY

### What exists in DB:
- ✅ `clip_chunk_spans` - Semantic chunks with character positions
- ✅ `listening_patterns` - Pattern definitions with meanings (gloss, translation_ja)
- ✅ `clip_pattern_spans` - Pattern spans per clip
- ✅ `curated_clips` - Clip transcripts

### What is generated on-the-fly:
- ⚠️ "Why this was hard" explanations - Generated from error tokens
- ⚠️ Error classification - Based on token alignment
- ⚠️ Feedback insights - Generated from error patterns

### Click Routing Flow:
1. Word click → `charIdx` (character position)
2. `/api/chunk` → RPC `get_clip_chunk_hit(clipId, charIdx)`
3. Returns chunk from `clip_chunk_spans`
4. If chunk has meaning → Show `ChunkDictionary`
5. If chunk has no meaning → Show "Why this was hard" insights modal

### Next Steps for Better Click Routing:
1. Ensure all chunks in `clip_chunk_spans` are linked to patterns with meanings
2. Or create a direct `chunk_meanings` table for semantic chunks
3. Improve pattern matching to link semantic chunks to listening patterns
4. Consider storing "Why this was hard" explanations in DB for consistency
