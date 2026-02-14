# Chunk-Level Spans Investigation Report

## Executive Summary

The codebase **already has substantial support for chunk-level spans** that could be reused for a dictionary/interpretation UI. The primary infrastructure exists in:

1. **`clip_pattern_spans`** table - stores per-clip pattern spans with `ref_start`/`ref_end` (character positions)
2. **`listening_patterns`** table - stores reusable pattern definitions with meanings
3. **`listening_pattern_variants`** table (referenced but schema not found in migrations) - stores clip-specific variant explanations
4. **Runtime span generation** - `lib/phraseSpans.ts` and `lib/alignmentEngine.ts` generate spans on-the-fly

**Key Finding:** Spans are **per-clip** (not reusable across users), but pattern definitions are **reusable**. The system supports multi-word expressions like "push the deadline back" through pattern matching, but currently focuses on listening patterns (reductions, weak forms) rather than semantic chunks.

---

## 1. Database Tables with Span Data

### Table 1: `clip_pattern_spans`

**Schema (from CURATED_CONTENT_REFACTOR.md):**
```sql
CREATE TABLE clip_pattern_spans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id TEXT NOT NULL REFERENCES curated_clips(id) ON DELETE CASCADE,
  pattern_key TEXT NOT NULL REFERENCES listening_patterns(pattern_key),
  variant_id TEXT | NULL,  -- Links to listening_pattern_variants.id
  ref_start INTEGER NOT NULL,  -- Character start position in transcript
  ref_end INTEGER NOT NULL,     -- Character end position (exclusive)
  word_start INTEGER | NULL,    -- Token start index (optional)
  word_end INTEGER | NULL,      -- Token end index (optional)
  confidence TEXT,              -- 'high' | 'medium' | 'low'
  approved BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**What it stores:**
- **Per-clip pattern spans** (e.g., "gonna", "wanna", "to", "the")
- **Character positions** (`ref_start`, `ref_end`) in transcript string
- **Optional token indices** (`word_start`, `word_end`) for token-based alignment
- **Links to pattern definitions** via `pattern_key` FK
- **Links to variant explanations** via `variant_id` FK (optional)

**Usage:**
- Populated by `scripts/detectPatternSpans.ts` (auto-detection script)
- Queried in `app/api/check-answer/route.ts` (lines 148-163) for feedback generation
- Used in `lib/practiceSteps.ts` (lines 535-554) to provide variant-specific explanations

**Reusability:**
- **Per-clip only** - each span is tied to a specific `clip_id`
- **Not user-specific** - spans are shared across all users for the same clip
- **Pattern definitions are reusable** - `pattern_key` references `listening_patterns` table

**Alignment:**
- `ref_start`/`ref_end` are **character positions** in transcript string (not token indices)
- `word_start`/`word_end` are **optional token indices** (if populated)
- Used with `transcript.substring(span.ref_start, span.ref_end)` in code

---

### Table 2: `listening_patterns`

**Schema (from migrations/002_create_listening_patterns.sql):**
```sql
CREATE TABLE listening_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  focus TEXT NOT NULL,              -- Main word (e.g., "to")
  left1 TEXT,                       -- Left context word (deprecated, use words[])
  right1 TEXT,                      -- Right context word (deprecated, use words[])
  right2 TEXT,                      -- Second right context (deprecated, use words[])
  words TEXT[] NOT NULL,            -- Array of words in pattern (e.g., ["want", "to"])
  chunk_display TEXT NOT NULL,      -- Display form (e.g., "want-to")
  reduced_form TEXT,                -- Phonetic reduction (e.g., "wanna")
  how_it_sounds TEXT NOT NULL,      -- Sound explanation
  tip TEXT,                         -- Listening tip
  meaning_general TEXT,             -- Structural meaning (Layer 1)
  meaning_approved TEXT,            -- Context-specific meaning (Layer 2)
  meaning_status TEXT DEFAULT 'none' CHECK (meaning_status IN ('none', 'general', 'approved', 'revoked')),
  pattern_key TEXT NOT NULL UNIQUE, -- Unique identifier (e.g., "wanna")
  is_active BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER NOT NULL DEFAULT 100,
  cefr_min TEXT,                    -- Minimum CEFR level (if exists)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**What it stores:**
- **Reusable pattern definitions** (e.g., "want to" → "wanna")
- **Multi-word patterns** via `words[]` array (supports arbitrary length)
- **Sound explanations** (`how_it_sounds`, `tip`)
- **Meaning explanations** (`meaning_general`, `meaning_approved`)
- **Display forms** (`chunk_display`, `reduced_form`)

**Usage:**
- Referenced by `clip_pattern_spans.pattern_key` (FK)
- Queried in `app/api/check-answer/route.ts` for pattern metadata
- Used in `lib/practiceSteps.ts` for pattern matching and feedback

**Reusability:**
- **Fully reusable** - patterns are shared across all clips and users
- **Patterns are generic** - not tied to specific clips or contexts

**Multi-word support:**
- ✅ **Supports multi-word expressions** via `words[]` array
- ✅ **Examples in seed data:** "went-to-the", "want-to", "going-to", "lot-of"
- ⚠️ **Currently focused on listening patterns** (reductions, weak forms) rather than semantic chunks (idioms, phrasal verbs)

---

### Table 3: `listening_pattern_variants` (Referenced but Schema Not Found)

**Referenced in:**
- `lib/types/patternFeedback.ts` (interface `ListeningPatternVariant`)
- `app/api/check-answer/route.ts` (line 155: `listening_pattern_variants(...)`)
- `scripts/detectPatternSpans.ts` (line 145: `from('listening_pattern_variants')`)

**Inferred Schema (from TypeScript interface):**
```typescript
interface ListeningPatternVariant {
  id: string
  pattern_key: string              // FK to listening_patterns.pattern_key
  written_form: string             // Canonical form (e.g., "going to")
  spoken_form: string              // Reduced form (e.g., "gonna")
  explanation_short: string         // Brief explanation
  explanation_medium: string | null // Detailed explanation
  listening_strategy: string | null // Strategy tip
  what_to_focus_on: string | null  // Focus tip
  examples: { sentence: string }[] | null // Example sentences
  created_at: Date
  updated_at: Date
}
```

**What it stores:**
- **Clip-specific variant explanations** for patterns
- **Written vs. spoken forms** (e.g., "going to" vs. "gonna")
- **Context-specific explanations** (different from generic `listening_patterns` explanations)
- **Example sentences** (array of sentences using the pattern)

**Usage:**
- Linked via `clip_pattern_spans.variant_id` FK
- Queried in `app/api/check-answer/route.ts` for variant-specific feedback
- Used in `lib/practiceSteps.ts` to provide clip-specific explanations

**Reusability:**
- **Per-pattern, per-clip** - variants are specific to how a pattern appears in a particular clip
- **Not user-specific** - shared across users for the same clip

**Gap:**
- ⚠️ **Schema not found in migrations** - table may be created manually or in a missing migration file

---

## 2. Runtime Span Generation

### File: `lib/phraseSpans.ts`

**What it does:**
- Attaches phrase spans to alignment events and tokens
- Uses hard-coded `PHRASE_PATTERNS` array (lines 9-21) to match multi-word phrases
- Generates `phraseHint` objects with `spanText`, `spanRefStart`, `spanRefEnd`

**Patterns supported:**
```typescript
const PHRASE_PATTERNS: string[][] = [
  ['want', 'to'],
  ['going', 'to'],
  ['got', 'to'],
  ['have', 'to'],
  ["it'll", 'be'],
  ['catch', 'up'],
  ['hang', 'out'],
  ['pick', 'up'],
  ['grab', 'a'],
  ['grab', 'some'],
  ['what', 'do', 'you', 'say'],
]
```

**Span format:**
```typescript
phraseHint: {
  spanText: string      // Full phrase text (e.g., "want to")
  spanRefStart: number  // Token start index
  spanRefEnd: number    // Token end index (inclusive)
}
```

**Alignment:**
- Uses **token indices** (not character positions)
- Matches against `refTokens` array from alignment result
- Returns best matching span for each event

**Reusability:**
- **Runtime-only** - not persisted to database
- **Per-alignment** - generated fresh for each answer check
- **Patterns are hard-coded** - not user-configurable

---

### File: `lib/alignmentEngine.ts`

**What it does:**
- Performs Levenshtein alignment between reference and user text
- Generates `AlignmentEvent` objects with `refStart`, `refEnd` (token indices)
- Generates `AlignmentToken` objects with `refIndex`, `userIndex`

**Span format:**
```typescript
AlignmentEvent {
  refStart: number      // Token start index
  refEnd: number        // Token end index (inclusive)
  expectedSpan: string  // Expected text
  actualSpan?: string   // User's text
  phraseHint?: {        // Added by attachPhraseSpans()
    spanText: string
    spanRefStart: number
    spanRefEnd: number
  }
}
```

**Alignment:**
- Uses **token indices** (0-based array indices)
- Tokenization splits on spaces, normalizes contractions
- `refStart`/`refEnd` refer to positions in `refTokens[]` array

---

### File: `lib/coachingInsights.ts`

**What it does:**
- Generates AI coaching insights for alignment events
- Uses `replay_target` with `refStart`/`refEnd` for audio replay
- Extracts spans from `event.phraseHint` or `event.expectedSpan`

**Span format:**
```typescript
replay_target: {
  text: string      // Text to replay (e.g., "going to")
  refStart: number  // Token start index
  refEnd: number    // Token end index
}
```

**Alignment:**
- Uses **token indices** (from `phraseHint` or `event.refStart`/`refEnd`)
- Falls back to single token if no phrase hint available

---

## 3. Multi-Word Expression Support

### Current Support

**✅ Listening Patterns (Reductions, Weak Forms):**
- "want to" → "wanna"
- "going to" → "gonna"
- "got to" → "gotta"
- "lot of" → "lotta"
- "and then" → "an then"
- "to the" → "tuh thuh"

**✅ Phrasal Verbs (Limited):**
- "catch up"
- "hang out"
- "pick up"
- "grab a" / "grab some"

**⚠️ Idioms (Not Explicitly Supported):**
- No dedicated table for idioms
- No "push the deadline back" type patterns in seed data
- Would need to be added to `listening_patterns` or new table

### Gap Analysis

**Missing for Dictionary/Interpretation UI:**
1. **Semantic chunk definitions** (idioms, phrasal verbs with meanings)
2. **Gloss/translation storage** (what does "push the deadline back" mean?)
3. **Example sentences per chunk** (beyond `listening_pattern_variants.examples`)
4. **Cross-clip chunk indexing** (find all clips containing "push X back")
5. **User-specific chunk annotations** (user's saved chunks, notes)

---

## 4. Span Alignment Methods

### Method 1: Character Positions (clip_pattern_spans)

**Format:**
- `ref_start`: Character index in transcript string
- `ref_end`: Character index (exclusive)

**Usage:**
```typescript
const spanText = transcript.substring(span.ref_start, span.ref_end)
```

**Pros:**
- ✅ Works with raw transcript strings
- ✅ No tokenization required
- ✅ Precise character-level alignment

**Cons:**
- ⚠️ Breaks if transcript is modified (whitespace changes)
- ⚠️ Harder to map to token-based alignment results

---

### Method 2: Token Indices (Runtime Spans)

**Format:**
- `refStart`: Token index in `refTokens[]` array
- `refEnd`: Token index (inclusive)

**Usage:**
```typescript
const spanText = refTokens.slice(span.refStart, span.refEnd + 1).join(' ')
```

**Pros:**
- ✅ Aligns with alignment engine output
- ✅ Works with normalized tokens
- ✅ Easy to map to user input tokens

**Cons:**
- ⚠️ Requires tokenization
- ⚠️ Token indices change if normalization changes

---

### Method 3: Hybrid (clip_pattern_spans with word_start/word_end)

**Format:**
- `ref_start`/`ref_end`: Character positions (primary)
- `word_start`/`word_end`: Token indices (optional, nullable)

**Usage:**
- Character positions for transcript substring extraction
- Token indices for alignment event matching

**Pros:**
- ✅ Best of both worlds
- ✅ Supports both alignment methods

**Cons:**
- ⚠️ Requires maintaining both representations
- ⚠️ Potential for inconsistency

---

## 5. Relationships: Alignment Events → DB Spans

### Flow: Answer Check → Pattern Feedback

**File: `app/api/check-answer/route.ts` (lines 135-280)**

1. **Alignment:** `alignTexts()` generates `AlignmentEvent[]` with token indices
2. **Phrase Spans:** `attachPhraseSpans()` adds `phraseHint` to events (token indices)
3. **DB Query:** Fetches `clip_pattern_spans` for clip (character positions)
4. **Matching:** Filters spans by:
   - Character position overlap with missed keywords/units
   - Pattern key matching
5. **Feedback:** Uses `listening_pattern_variants` for clip-specific explanations

**Key Code:**
```typescript
// Fetch spans from DB (character positions)
const { data: patternSpans } = await supabase
  .from('clip_pattern_spans')
  .select('*, listening_pattern_variants(...)')
  .eq('clip_id', clipId)

// Filter by semantic evaluation (character positions)
const relevantSpans = patternSpans.filter(span => {
  const spanText = transcript.substring(span.ref_start, span.ref_end)
  // Check if span affects missed keywords/units
})
```

**Gap:**
- ⚠️ **No direct mapping** between alignment event token indices and DB character positions
- ⚠️ **Manual filtering** by substring matching (not precise token alignment)

---

### Flow: Coaching Insights → Spans

**File: `lib/coachingInsights.ts`**

1. **Input:** `AlignmentEvent` with `phraseHint` (token indices)
2. **Extraction:** `safeReplayText()` extracts `refStart`/`refEnd` from `phraseHint` or `event`
3. **Output:** `CoachingInsight.replay_target` with token indices

**Key Code:**
```typescript
function safeReplayText(event: AlignmentEvent): { text: string; refStart: number; refEnd: number } {
  const text = event.phraseHint?.spanText ?? event.expectedSpan ?? ''
  const refStart = event.phraseHint?.spanRefStart ?? event.refStart ?? 0
  const refEnd = event.phraseHint?.spanRefEnd ?? event.refEnd ?? refStart
  return { text, refStart, refEnd }
}
```

**Relationship:**
- ✅ **Direct mapping** - coaching insights use same token indices as alignment events
- ✅ **No DB dependency** - insights are generated on-the-fly, not stored

---

## 6. What's Missing for Dictionary/Interpretation UI

### Gap 1: Semantic Chunk Definitions

**Current:**
- `listening_patterns` focuses on **sound patterns** (reductions, weak forms)
- No dedicated table for **semantic chunks** (idioms, phrasal verbs with meanings)

**Needed:**
- Table for multi-word expressions with:
  - Meaning/gloss (e.g., "push X back" = "postpone X")
  - Part of speech / grammar pattern
  - Example sentences
  - Cross-references to listening patterns (if applicable)

---

### Gap 2: Gloss/Translation Storage

**Current:**
- `listening_patterns.meaning_general` / `meaning_approved` exist but are:
  - Focused on listening explanations ("how it sounds")
  - Not semantic meanings ("what it means")
  - Not translations/glosses

**Needed:**
- Field for semantic meaning/gloss
- Field for translation (if multi-language support)
- Field for usage notes

---

### Gap 3: Cross-Clip Chunk Indexing

**Current:**
- `clip_pattern_spans` is **per-clip** only
- No way to query "all clips containing 'push the deadline back'"

**Needed:**
- Index or view that maps chunks → clips
- Query: "Show me all clips where 'push X back' appears"

---

### Gap 4: User-Specific Chunk Annotations

**Current:**
- No user-specific chunk data
- No saved chunks, notes, or personal dictionary

**Needed:**
- Table: `user_chunk_annotations` or `saved_chunks`
- Fields: `user_id`, `chunk_id`, `notes`, `saved_at`, `mastery_level`

---

### Gap 5: Example Sentences Per Chunk

**Current:**
- `listening_pattern_variants.examples` exists but:
  - Per-variant (clip-specific)
  - Not per-pattern (reusable across clips)

**Needed:**
- `listening_patterns.examples` field (array of sentences)
- Or separate `chunk_examples` table

---

## 7. Recommendations

### Option A: Reuse Existing Spans (Minimal Change)

**Pros:**
- ✅ `clip_pattern_spans` already has `ref_start`/`ref_end` (character positions)
- ✅ `listening_patterns` already has `words[]` (multi-word support)
- ✅ `listening_pattern_variants` already has `examples` (example sentences)

**Cons:**
- ⚠️ Focused on listening patterns, not semantic chunks
- ⚠️ No semantic meaning/gloss storage
- ⚠️ Per-clip spans, not reusable chunk definitions

**Changes needed:**
1. Add `meaning_semantic` field to `listening_patterns` (for gloss/translation)
2. Add `examples` array to `listening_patterns` (reusable examples)
3. Extend `clip_pattern_spans` to support semantic chunks (new `span_type: 'idiom' | 'phrasal_verb'`)

**Effort:** Low (1-2 migrations)

---

### Option B: Extend Existing Table (Moderate Change)

**Pros:**
- ✅ Reuses `listening_patterns` infrastructure
- ✅ Can add semantic fields without breaking changes
- ✅ Maintains relationship with `clip_pattern_spans`

**Cons:**
- ⚠️ Mixes listening patterns and semantic chunks in same table
- ⚠️ May need to split concerns later

**Changes needed:**
1. Add `chunk_type` field to `listening_patterns` ('listening_pattern' | 'idiom' | 'phrasal_verb')
2. Add `meaning_semantic`, `gloss`, `translation` fields
3. Add `examples` array field
4. Update `clip_pattern_spans` to support new chunk types

**Effort:** Medium (2-3 migrations + data migration)

---

### Option C: Create New Chunk Table (Clean Separation)

**Pros:**
- ✅ Clean separation of concerns (listening vs. semantic)
- ✅ Can design schema specifically for dictionary/interpretation UI
- ✅ No impact on existing listening pattern system

**Cons:**
- ⚠️ More tables to maintain
- ⚠️ Need to link chunks to clips (new junction table or extend `clip_pattern_spans`)

**Changes needed:**
1. Create `semantic_chunks` table:
   ```sql
   CREATE TABLE semantic_chunks (
     id UUID PRIMARY KEY,
     chunk_text TEXT NOT NULL,        -- "push the deadline back"
     chunk_type TEXT NOT NULL,        -- 'idiom' | 'phrasal_verb' | 'collocation'
     meaning TEXT NOT NULL,           -- "postpone the deadline"
     gloss TEXT,                      -- Brief explanation
     examples TEXT[],                 -- Example sentences
     grammar_pattern TEXT,            -- "push [object] back"
     created_at TIMESTAMPTZ
   );
   ```
2. Create `clip_chunk_spans` table (or extend `clip_pattern_spans`):
   ```sql
   CREATE TABLE clip_chunk_spans (
     id UUID PRIMARY KEY,
     clip_id TEXT NOT NULL,
     chunk_id UUID REFERENCES semantic_chunks(id),
     ref_start INTEGER NOT NULL,
     ref_end INTEGER NOT NULL,
     word_start INTEGER,
     word_end INTEGER
   );
   ```

**Effort:** High (2-3 migrations + data population + UI updates)

---

## 8. Final Recommendation

**Recommended: Option B (Extend Existing Table)**

**Rationale:**
1. **Minimal disruption** - reuses existing `listening_patterns` and `clip_pattern_spans` infrastructure
2. **Incremental** - can add semantic fields without breaking existing code
3. **Flexible** - can support both listening patterns and semantic chunks in same system
4. **Fast to implement** - 2-3 migrations, no new tables

**Implementation Plan:**
1. **Migration 1:** Add semantic fields to `listening_patterns`
   - `chunk_type` (nullable, defaults to 'listening_pattern')
   - `meaning_semantic` (TEXT, nullable)
   - `gloss` (TEXT, nullable)
   - `examples` (TEXT[], nullable)

2. **Migration 2:** Extend `clip_pattern_spans` to support semantic chunks
   - Add `chunk_type` field (or infer from `listening_patterns.chunk_type`)
   - No schema changes needed (already has `ref_start`/`ref_end`)

3. **Data Population:**
   - Seed semantic chunks (idioms, phrasal verbs) into `listening_patterns`
   - Create `clip_pattern_spans` entries for semantic chunks in clips

4. **Code Updates:**
   - Update `app/api/check-answer/route.ts` to query semantic chunks
   - Update UI to display semantic meanings/glosses

**Timeline:** 1-2 days for migrations + data population, 1-2 days for UI integration

---

## 9. Summary Table

| Component | Current State | Can Reuse? | Gaps |
|-----------|--------------|------------|------|
| **clip_pattern_spans** | ✅ Exists, per-clip spans | ✅ Yes (ref_start/ref_end) | ⚠️ No semantic chunk support |
| **listening_patterns** | ✅ Exists, reusable patterns | ✅ Yes (words[], meanings) | ⚠️ Focused on sound, not semantics |
| **listening_pattern_variants** | ⚠️ Referenced, schema unclear | ✅ Yes (examples) | ⚠️ Per-variant, not per-pattern |
| **phraseSpans.ts** | ✅ Runtime span generation | ✅ Yes (token indices) | ⚠️ Hard-coded patterns |
| **alignmentEngine.ts** | ✅ Token-based alignment | ✅ Yes (refStart/refEnd) | ⚠️ No DB persistence |
| **coachingInsights.ts** | ✅ Span extraction | ✅ Yes (replay_target) | ⚠️ No semantic meaning |

**Overall Assessment:** ✅ **70% ready** - infrastructure exists, needs semantic extensions

---

## 10. Next Steps (If Implementing)

1. **Verify `listening_pattern_variants` schema** - check if table exists in production DB
2. **Audit existing spans** - how many clips have `clip_pattern_spans` entries?
3. **Design semantic chunk schema** - finalize fields for `listening_patterns` extension
4. **Create migration** - add semantic fields with backward compatibility
5. **Seed semantic chunks** - populate idioms/phrasal verbs from curated list
6. **Update query logic** - extend `app/api/check-answer/route.ts` to include semantic chunks
7. **Build UI** - dictionary/interpretation interface using existing span data

---

**Report Generated:** 2024-12-19
**Investigation Scope:** Database schema, runtime span generation, alignment events
**Files Reviewed:** 15+ files across migrations, lib/, app/api/, scripts/
