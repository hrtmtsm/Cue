# Supabase Listening Patterns Analysis

## 1. Related Tables

### Table: `listening_patterns`
**Purpose:** Stores pattern-based feedback data for listening comprehension explanations

**Key Fields:**
- `id` (UUID, PRIMARY KEY)
- `pattern_key` (TEXT, UNIQUE) - Unique identifier (e.g., 'went-to-the', 'want-to')
- `words` (TEXT[]) - Array of words in sequence (e.g., ['went', 'to', 'the'])
- `chunk_display` (TEXT) - Canonical display form (e.g., 'went-to-the')
- `reduced_form` (TEXT, nullable) - Phonetic reduction (e.g., 'wanna' for 'want to')
- `how_it_sounds` (TEXT) - Explanation text (sound rule)
- `tip` (TEXT, nullable) - Optional listening tip
- `priority` (INTEGER, 0-1000) - Match priority (higher = better)
- `is_active` (BOOLEAN) - Enable/disable flag
- `meaning_general` (TEXT, nullable) - Layer 1: Structural meaning
- `meaning_approved` (TEXT, nullable) - Layer 2: Context-specific meaning
- `meaning_status` (TEXT) - Controls which meaning to show ('none'|'general'|'approved'|'revoked')
- `parent_pattern_key` (TEXT, nullable) - Self-referencing FK to parent pattern
- `created_at` (TIMESTAMPTZ)
- `updated_at` (TIMESTAMPTZ)
- **Legacy columns** (for backward compatibility):
  - `focus` (TEXT) - First word (for indexing)
  - `left1` (TEXT, nullable) - Left context (deprecated)
  - `right1` (TEXT, nullable) - Right context word 1
  - `right2` (TEXT, nullable) - Right context word 2

**How it's used:**
- **API:** `GET /api/listening-patterns` (lines 98-236) - Fetches active patterns, falls back to local `LISTENING_PATTERNS`
- **Seed script:** `scripts/seedListeningPatterns.ts` - Upserts patterns from `lib/listeningPatterns.ts`
- **Code usage:** `lib/listeningPatternMatcher.ts` - Matches patterns by word sequence
- **Pattern matching:** Used in `lib/practiceSteps.ts` (lines 469-524) - Optional pattern matching for feedback generation

**Current Data:**
- Seeded from `lib/listeningPatterns.ts` (22 patterns)
- Examples: 'went-to-the', 'want-to', 'going-to', 'gonna-go', 'a-lot-of', 'to', 'of'
- Some patterns have `reduced_form`: 'wanna', 'gonna', 'kinda', 'lotta'
- Some patterns have `meaning_general` (seeded via migration 007)

### Table: `clip_audio`
**Purpose:** Stores audio generation metadata (NOT related to patterns/feedback)

**Key Fields:**
- `id`, `user_id`, `clip_id`, `transcript`, `audio_status`, `blob_path`, etc.

**Relevance:** None - audio storage only, not feedback-related

## 2. Existing Data Representing Sound Patterns

### A) Sound Patterns (written_form → spoken_form)

**Current representation:**
- `chunk_display` = written form (e.g., 'want to', 'going to')
- `reduced_form` = spoken form (e.g., 'wanna', 'gonna')

**Examples from existing data:**
```sql
-- Pattern: want-to
chunk_display: 'want to'
reduced_form: 'wanna'

-- Pattern: going-to
chunk_display: 'going to'
reduced_form: 'gonna'

-- Pattern: kind-of
chunk_display: 'kind of'
reduced_form: 'kinda'

-- Pattern: lot-of
chunk_display: 'lot of'
reduced_form: 'lotta'
```

**Missing:** Single-word patterns don't have `reduced_form` (e.g., 'to' → 'tuh', 'the' → 'thuh')

### B) Explanations

**Current representation:**
- `how_it_sounds` = explanation_medium (sound rule explanation)
- `tip` = optional short tip
- `meaning_general` = structural meaning (Layer 1)
- `meaning_approved` = context-specific meaning (Layer 2)

**Examples:**
```sql
-- Pattern: want-to
how_it_sounds: 'In casual speech, "want to" often sounds like "wanna".'
tip: 'The "t" between "want" and "to" disappears in fast speech.'
meaning_general: 'A shortened spoken form used in casual conversation.' (if seeded)

-- Pattern: going-to
how_it_sounds: 'In fast speech, "going to" often sounds like "gonna".'
tip: 'The "ing" and "to" blend together in casual speech.'
meaning_general: 'A shortened spoken form used in casual conversation.' (if seeded)
```

## 3. Mapping to Target Schema

### Target Schema:
```sql
listening_patterns {
  key                    -- Unique identifier
  category               -- FeedbackCategory (contraction, linking, elision, etc.)
  written_form           -- Canonical written form
  spoken_form            -- Phonetic reduction
  explanation_short      -- Brief explanation (1-2 sentences)
  explanation_medium     -- Detailed explanation
  examples               -- Example sentences
}
```

### Current → Target Mapping:

| Target Field | Current Field(s) | Mapping Notes |
|-------------|------------------|---------------|
| `key` | `pattern_key` | ✅ Direct match |
| `category` | ❌ **MISSING** | Currently detected via regex in code, not stored |
| `written_form` | `chunk_display` | ✅ Direct match (e.g., 'want to') |
| `spoken_form` | `reduced_form` | ✅ Direct match (e.g., 'wanna') |
| `explanation_short` | `tip` | ⚠️ Partial - tip is optional, not always present |
| `explanation_medium` | `how_it_sounds` | ✅ Direct match |
| `examples` | ❌ **MISSING** | Currently hardcoded in `generateExtraExample()` |

### Additional Current Fields (Not in Target):
- `words` (TEXT[]) - Word sequence array (needed for matching)
- `priority` - Match priority (needed for ranking)
- `is_active` - Enable/disable flag (needed for filtering)
- `meaning_general` - Structural meaning (Layer 1)
- `meaning_approved` - Context-specific meaning (Layer 2)
- `meaning_status` - Meaning visibility control
- `parent_pattern_key` - Parent pattern reference (for fallback)

## 4. Row-by-Row Classification

### Pattern Classification Rules:

**KEEP:** Patterns that match target schema structure
- Has `chunk_display` (written_form)
- Has `reduced_form` (spoken_form) OR single-word pattern
- Has `how_it_sounds` (explanation_medium)

**RENAME:** Patterns that need field name changes only
- All patterns need `pattern_key` → `key`
- All patterns need `chunk_display` → `written_form`
- All patterns need `reduced_form` → `spoken_form`
- All patterns need `how_it_sounds` → `explanation_medium`

**REFERENCE:** Patterns that need data enrichment
- Patterns missing `category` (need to add)
- Patterns missing `examples` (need to add)
- Single-word patterns missing `spoken_form` (e.g., 'to' → 'tuh')

**DROP:** Patterns that don't fit target schema
- None identified - all current patterns are valid

### Detailed Row Analysis:

#### Pattern: 'went-to-the'
- **Current:** `chunk_display='went-to-the'`, `words=['went','to','the']`, `how_it_sounds='...'`, `tip='...'`
- **Classification:** KEEP + RENAME + REFERENCE
- **Actions:**
  - RENAME: `chunk_display` → `written_form`
  - ADD: `category='linking'` (words blend together)
  - ADD: `spoken_form='wento thuh'` (from `how_it_sounds` text)
  - ADD: `examples` (e.g., "I went to the store yesterday.")
  - REFERENCE: Keep `words`, `priority`, `is_active` (needed for matching)

#### Pattern: 'want-to'
- **Current:** `chunk_display='want to'`, `reduced_form='wanna'`, `how_it_sounds='...'`, `tip='...'`
- **Classification:** KEEP + RENAME + REFERENCE
- **Actions:**
  - RENAME: `chunk_display` → `written_form`, `reduced_form` → `spoken_form`
  - ADD: `category='elision'` (sounds dropped: "want to" → "wanna")
  - ADD: `examples` (e.g., "I want to go home.")
  - REFERENCE: Keep existing fields

#### Pattern: 'going-to'
- **Current:** `chunk_display='going to'`, `reduced_form='gonna'`, `how_it_sounds='...'`, `tip='...'`
- **Classification:** KEEP + RENAME + REFERENCE
- **Actions:**
  - RENAME: `chunk_display` → `written_form`, `reduced_form` → `spoken_form`
  - ADD: `category='elision'` (sounds dropped: "going to" → "gonna")
  - ADD: `examples` (e.g., "I'm going to call you later.")
  - REFERENCE: Keep existing fields

#### Pattern: 'to' (single word)
- **Current:** `chunk_display='to'`, `how_it_sounds='In fast speech, "to" often sounds like "tuh"...'`, `reduced_form=NULL`
- **Classification:** KEEP + RENAME + REFERENCE
- **Actions:**
  - RENAME: `chunk_display` → `written_form`
  - ADD: `spoken_form='tuh'` (extract from `how_it_sounds` text)
  - ADD: `category='weak_form'` (function word reduced)
  - ADD: `examples` (e.g., "I need to go.")
  - REFERENCE: Keep existing fields

#### Pattern: 'of' (single word)
- **Current:** `chunk_display='of'`, `how_it_sounds='In fast speech, "of" often sounds like "uh"...'`, `reduced_form=NULL`
- **Classification:** KEEP + RENAME + REFERENCE
- **Actions:**
  - RENAME: `chunk_display` → `written_form`
  - ADD: `spoken_form='uh'` (extract from `how_it_sounds` text)
  - ADD: `category='weak_form'` (function word reduced)
  - ADD: `examples` (e.g., "a lot of people")
  - REFERENCE: Keep existing fields

#### Pattern: 'a-lot-of'
- **Current:** `chunk_display='a-lot-of'`, `how_it_sounds='...sounds like "a lotta"...'`, `reduced_form=NULL`
- **Classification:** KEEP + RENAME + REFERENCE
- **Actions:**
  - RENAME: `chunk_display` → `written_form`
  - ADD: `spoken_form='a lotta'` (extract from `how_it_sounds` text)
  - ADD: `category='elision'` (sound dropped: "of" → "a")
  - ADD: `examples` (e.g., "There are a lot of people here.")
  - REFERENCE: Keep existing fields

## 5. Migration Recommendation

### Recommended Approach: **HYBRID (Migrate + Enrich)**

**Rationale:**
1. **Existing data is valuable** - 22 patterns already seeded with good explanations
2. **Schema is close** - Only missing `category` and `examples`
3. **Backward compatibility** - Keep `words`, `priority`, `is_active` for matching logic
4. **Incremental migration** - Add new fields without breaking existing code

### Migration Plan:

#### Phase 1: Add Missing Fields (Non-Breaking)
```sql
-- Add category column
ALTER TABLE listening_patterns 
ADD COLUMN IF NOT EXISTS category TEXT 
CHECK (category IN ('contraction', 'linking', 'elision', 'weak_form', 'similar_words', 'spelling', 'missed'));

-- Add examples column (JSONB for array of example sentences)
ALTER TABLE listening_patterns 
ADD COLUMN IF NOT EXISTS examples JSONB DEFAULT '[]'::jsonb;

-- Add spoken_form column (extract from reduced_form or how_it_sounds)
ALTER TABLE listening_patterns 
ADD COLUMN IF NOT EXISTS spoken_form TEXT;

-- Populate spoken_form from reduced_form (where exists)
UPDATE listening_patterns
SET spoken_form = reduced_form
WHERE reduced_form IS NOT NULL;

-- Extract spoken_form from how_it_sounds for single-word patterns
-- Example: "sounds like 'tuh'" → spoken_form = 'tuh'
UPDATE listening_patterns
SET spoken_form = (
  CASE
    WHEN chunk_display = 'to' THEN 'tuh'
    WHEN chunk_display = 'of' THEN 'uh'
    WHEN chunk_display = 'the' THEN 'thuh'
    WHEN chunk_display = 'and' THEN 'n'
    ELSE NULL
  END
)
WHERE spoken_form IS NULL AND reduced_form IS NULL;
```

#### Phase 2: Populate Category (Data Migration)
```sql
-- Categorize existing patterns based on chunk_display and reduced_form
UPDATE listening_patterns
SET category = (
  CASE
    -- Contractions
    WHEN chunk_display LIKE '%''%' OR chunk_display IN ('you''re', 'i''m', 'we''re', 'they''re', 'it''s', 'that''s') THEN 'contraction'
    -- Elision (reduced forms)
    WHEN reduced_form IN ('wanna', 'gonna', 'gotta', 'kinda', 'lotta', 'lemme', 'gimme', 'hafta', 'outta', 'sorta') THEN 'elision'
    -- Linking (words blend)
    WHEN chunk_display IN ('went-to-the', 'went-to', 'to-the', 'and-then') THEN 'linking'
    -- Weak forms (single function words)
    WHEN chunk_display IN ('to', 'of', 'the', 'and', 'a', 'an') THEN 'weak_form'
    -- Default
    ELSE 'missed'
  END
)
WHERE category IS NULL;
```

#### Phase 3: Populate Examples (Data Enrichment)
```sql
-- Add example sentences for common patterns
UPDATE listening_patterns
SET examples = '["I want to go home.", "Do you want to come?"]'::jsonb
WHERE pattern_key = 'want-to';

UPDATE listening_patterns
SET examples = '["I''m going to call you later.", "She''s going to be there."]'::jsonb
WHERE pattern_key = 'going-to';

UPDATE listening_patterns
SET examples = '["I went to the store yesterday.", "We went to the park."]'::jsonb
WHERE pattern_key = 'went-to-the';

-- ... (continue for all patterns)
```

#### Phase 4: Rename Columns (Breaking Change - Do Last)
```sql
-- Rename columns to match target schema
ALTER TABLE listening_patterns 
RENAME COLUMN pattern_key TO key;

ALTER TABLE listening_patterns 
RENAME COLUMN chunk_display TO written_form;

-- Note: Keep reduced_form for backward compatibility, but also have spoken_form
-- Can drop reduced_form later after code migration
```

### Alternative: Keep Current Schema + Add Aliases

**Safer approach (recommended for MVP):**
- Keep existing column names (`pattern_key`, `chunk_display`, `reduced_form`)
- Add new columns (`category`, `examples`, `spoken_form`)
- Update code to use new columns where available
- Gradually migrate code to new column names

## 6. Summary

### Current State:
- ✅ **22 patterns** in database (seeded from `lib/listeningPatterns.ts`)
- ✅ **Sound patterns** represented: `chunk_display` (written) + `reduced_form` (spoken)
- ✅ **Explanations** present: `how_it_sounds` (medium) + `tip` (short)
- ❌ **Missing:** `category` (detected in code, not stored)
- ❌ **Missing:** `examples` (hardcoded in code, not stored)
- ⚠️ **Partial:** `spoken_form` (only for patterns with `reduced_form`, missing for single words)

### Target State:
- `key` (from `pattern_key`)
- `category` (NEW - needs to be added)
- `written_form` (from `chunk_display`)
- `spoken_form` (from `reduced_form` or extract from `how_it_sounds`)
- `explanation_short` (from `tip` or extract from `how_it_sounds`)
- `explanation_medium` (from `how_it_sounds`)
- `examples` (NEW - needs to be added)

### Recommendation:
**HYBRID APPROACH:**
1. ✅ **Migrate existing rows** - All 22 patterns are valid, keep them
2. ✅ **Add missing fields** - `category`, `examples`, `spoken_form`
3. ✅ **Populate from existing data** - Extract `spoken_form` from `how_it_sounds` for single words
4. ✅ **Enrich with examples** - Add example sentences for each pattern
5. ⚠️ **Rename columns later** - After code migration (non-breaking first)

### Files to Update:
- `supabase/migrations/009_add_category_and_examples.sql` (NEW)
- `scripts/seedListeningPatterns.ts` (add category and examples)
- `lib/listeningPatterns.ts` (add category and examples to local patterns)
- `app/api/listening-patterns/route.ts` (map new fields)
- `lib/practiceSteps.ts` (use category from pattern instead of regex detection)

