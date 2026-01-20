# Listening Patterns Migration Summary

## Decision: Sequence-Based Schema (Option B)

**Chosen:** Sequence-based representation using `words TEXT[]` array

**Rationale:**
1. **Matcher compatibility:** The matcher logic already uses `words[]` array directly
2. **No conversion complexity:** Eliminates ambiguous conversion between DB (focus/left1/right1/right2) and client format (words[])
3. **Arbitrary length support:** No 4-word limit - supports patterns of any length
4. **Clearer semantics:** Patterns are represented exactly as they appear (e.g., `['went', 'to', 'the']`)
5. **Backward matching:** Still supported by checking `words[words.length - 1]` (last element)
6. **Easier to reason about:** No need to infer structure from context columns

**Comparison:**
- **Option A (context-based):** focus, left1, right1, right2
  - ❌ Limited to 4 words max
  - ❌ Conversion is ambiguous (when does left1 exist?)
  - ❌ Complex seed script with heuristics
  - ✅ Already in DB (but requires migration anyway)

- **Option B (sequence-based):** words TEXT[]
  - ✅ No length limit
  - ✅ No conversion needed (direct mapping)
  - ✅ Cleaner seed script
  - ✅ Matcher uses words[] directly
  - ⚠️ Requires migration (but one-time cost)

## Final DB Schema

**New column:**
- `words TEXT[] NOT NULL` - Array of words in sequence (e.g., `['went', 'to', 'the']`)

**Legacy columns (kept for backward compatibility):**
- `focus TEXT NOT NULL` - First word (populated from `words[0]`)
- `left1 TEXT NULL` - Not used by local patterns (always null)
- `right1 TEXT NULL` - Second word (populated from `words[1]`)
- `right2 TEXT NULL` - Third word (populated from `words[2]`)

**Existing columns (unchanged):**
- `pattern_key TEXT NOT NULL UNIQUE` - Unique identifier
- `chunk_display TEXT NOT NULL` - Display string (e.g., "went-to-the")
- `how_it_sounds TEXT NOT NULL` - Explanation text
- `tip TEXT NULL` - Optional listening tip
- `priority INTEGER NOT NULL DEFAULT 100` - Match priority
- `is_active BOOLEAN NOT NULL DEFAULT true` - Enable/disable flag

**Indexes:**
- `idx_listening_patterns_pattern_key` - Unique index on pattern_key
- `idx_listening_patterns_words_first` - Index on `words[1]` (first word) for forward matching
- `idx_listening_patterns_words_priority` - Index on `(words[1], priority DESC)` for prioritized forward matching
- `idx_listening_patterns_is_active` - Index on is_active WHERE is_active = true

**Backward matching:** Uses sequential scan (acceptable for small dataset ~20-30 patterns)

## What Changed

### 1. Migration (004_add_words_column.sql)
- ✅ Added `words TEXT[]` column
- ✅ Migrated existing data from (focus, left1, right1, right2) to words[]
- ✅ Made words NOT NULL after backfilling
- ✅ Created indexes on words[1] for forward matching
- ✅ Kept legacy columns for backward compatibility

### 2. Seed Script (scripts/seedListeningPatterns.ts)
- ✅ Updated to use `words[]` directly from local patterns
- ✅ Populates legacy columns (focus, left1, right1, right2) for backward compatibility
- ✅ Uses pattern_key for upserts (no duplicates)
- ✅ Dry-run by default, requires `--yes` to write

### 3. API Route (app/api/listening-patterns/route.ts)
- ✅ Updated to use `words[]` directly (no conversion needed)
- ✅ Legacy fallback: converts from focus/left1/right1/right2 if words[] is null (shouldn't happen after migration)
- ✅ Returns same client format (unchanged interface)

### 4. Matcher Logic (lib/listeningPatternMatcher.ts)
- ✅ **No changes needed** - already uses words[] directly
- ✅ Forward matching: checks `pattern.words[0] === focus`
- ✅ Backward matching: checks `pattern.words[pattern.words.length - 1] === target`

## Backward Compatibility

✅ **Fully backward compatible:**
- Legacy columns (focus, left1, right1, right2) are kept in DB
- API route has fallback logic (converts from legacy columns if words[] is null)
- Client interface is unchanged (still receives words[] array)
- Matcher logic is unchanged (already uses words[])

✅ **Migration safety:**
- Migration populates words[] for all existing rows
- Old columns are kept (can be removed in future migration if desired)
- No data loss during migration

## Next Steps

1. **Run migration:**
   ```bash
   # Apply migration to your Supabase database
   supabase migration up
   # OR use Supabase dashboard to run 004_add_words_column.sql
   ```

2. **Seed patterns:**
   ```bash
   # Dry run first (verify conversion)
   npm run seed:patterns
   
   # Actually write to DB
   npm run seed:patterns -- --yes
   ```

3. **Verify API route:**
   - Test `/api/listening-patterns` endpoint
   - Should return patterns with words[] array
   - Verify fallback to local patterns still works if DB is unavailable

4. **Test matcher:**
   - Verify forward matching still works (patterns starting with focus word)
   - Verify backward matching still works (patterns ending with target word)
   - Check that priority ordering is correct

5. **Optional cleanup (future):**
   - Remove legacy columns (focus, left1, right1, right2) if not needed
   - Remove legacy index on focus (if not used)
   - This can be done in a future migration once everything is stable

## Testing Checklist

- [ ] Migration runs successfully (no errors)
- [ ] Existing patterns have words[] populated correctly
- [ ] Seed script runs successfully (dry-run and --yes)
- [ ] API route returns patterns with words[] array
- [ ] Forward matching works (patterns starting with focus word)
- [ ] Backward matching works (patterns ending with target word)
- [ ] Priority ordering is correct (higher priority first)
- [ ] Fallback to local patterns works (if DB unavailable)
- [ ] No regressions in pattern matching behavior

## Notes

- **Pattern key uniqueness:** Seed script uses `pattern_key` for upserts, so re-running won't create duplicates
- **Local fallback:** `lib/listeningPatterns.ts` remains as fallback if DB is unavailable
- **Synchronous matching:** Matcher remains synchronous (no async/await needed)
- **Performance:** Indexes support fast forward matching; backward matching uses sequential scan (acceptable for small dataset)
- **Future enhancements:** If needed, can add GIN index on words[] for array containment queries (overkill for current use case)


