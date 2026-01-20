# Listening Patterns Migration Audit Report

**Date:** $(date)  
**Branch:** feature/listening-patterns-supabase

## Phase 0: Current State Audit

### Current Source of Truth
**Status:** ✅ **HYBRID (DB-first with local fallback)**

The codebase has already implemented a DB-first approach with local fallback:
- **Primary source:** Supabase table `listening_patterns`
- **Fallback source:** Local array in `lib/listeningPatterns.ts`
- **Loading mechanism:** Client-side hook fetches from API route

### Files and Their Roles

#### 1. `lib/listeningPatterns.ts`
- **Purpose:** Defines `ListeningPattern` interface and `LISTENING_PATTERNS` constant array
- **Status:** Still active as fallback data source
- **Contains:** 15 patterns (went-to-the, want-to, going-to, etc.)
- **Interface:** `{ id, words[], chunkDisplay, howItSounds, tip?, priority }`

#### 2. `lib/listeningPatternMatcher.ts`
- **Purpose:** Synchronous pattern matching functions
- **Status:** ✅ Updated to accept optional `patterns` parameter
- **Functions:**
  - `matchListeningPattern(focus, tokens, targetIndex, patterns?)` - matches forward
  - `matchListeningPatternBackward(target, tokens, targetIndex, patterns?)` - matches backward
  - `isEligibleForPatternMatching(word, patterns?)` - eligibility check
- **Fallback:** Uses `LISTENING_PATTERNS` if patterns not provided or empty

#### 3. `lib/practiceSteps.ts` (`extractPracticeSteps`)
- **Purpose:** Extracts practice steps from alignment events
- **Status:** ✅ Updated to accept optional `patterns` parameter
- **Signature:** `extractPracticeSteps(events, refTokens, userTokens, maxSteps, fullTranscript?, patterns?)`
- **Usage:** Passes patterns to `matchListeningPattern()` and `isEligibleForPatternMatching()`
- **Synchrony:** ✅ Remains synchronous (no async/await)

#### 4. `components/PhraseCard.tsx`
- **Purpose:** Displays feedback for individual phrases
- **Status:** ✅ Consumes pattern data correctly
- **Uses:**
  - `inSentence.chunkDisplay` - triggers chunk mode
  - `soundRule` - displays "How it sounds" section
  - `tip` - displays listening tip
  - `extraExample` - displays additional examples
- **Chunk mode:** Active when `chunkDisplay` exists, hides onomatopoeia "sounds like" text

#### 5. `app/api/listening-patterns/route.ts`
- **Purpose:** Server-side API route to fetch patterns from Supabase
- **Status:** ✅ Implemented
- **Method:** GET
- **Returns:** JSON array of `ListeningPattern[]`
- **Features:**
  - Fetches from `listening_patterns` table where `is_active = true`
  - Orders by `priority DESC`
  - Converts DB format (focus, left1, right1, right2) to client format (words[])
  - Falls back to local patterns on error
  - Caching headers: `s-maxage=600, stale-while-revalidate=600`

#### 6. `lib/useListeningPatterns.ts`
- **Purpose:** React hook to fetch patterns client-side
- **Status:** ✅ Implemented
- **Features:**
  - Fetches from `/api/listening-patterns` on mount
  - Returns `{ patterns, loading, error }`
  - Initializes with local patterns (immediate fallback)
  - Updates with DB patterns when fetch succeeds
  - Falls back to local patterns on error

#### 7. `app/(app)/practice/[clipId]/practice/page.tsx`
- **Purpose:** Practice page that uses `extractPracticeSteps`
- **Status:** ✅ Wired up
- **Usage:**
  - Calls `useListeningPatterns()` hook
  - Passes `patterns` to `extractPracticeSteps()` in `useMemo`
  - If patterns still loading, `undefined` is passed (uses local fallback)
  - `extractPracticeSteps` remains synchronous

### Database Schema

#### Table: `listening_patterns`
**Migration 002:** Initial table creation
- `id` UUID PRIMARY KEY
- `focus` TEXT NOT NULL
- `left1` TEXT
- `right1` TEXT
- `right2` TEXT
- `chunk_display` TEXT NOT NULL
- `how_it_sounds` TEXT NOT NULL
- `tip` TEXT
- `priority` INTEGER DEFAULT 100
- `created_at` TIMESTAMPTZ
- `updated_at` TIMESTAMPTZ

**Migration 003:** Added columns
- `pattern_key` TEXT UNIQUE NOT NULL (backfilled from `chunk_display`)
- `is_active` BOOLEAN DEFAULT true

**Schema Status:** ✅ Matches requirements

### Supabase Configuration
- **Server client:** `lib/supabase/server.ts` - uses `getSupabaseAdminClient()`
- **Environment vars:** `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- **RLS:** Enabled, public read-only policy

## Phase 1: Chosen Approach

**Approach:** ✅ **A) DB-first with local fallback** (already implemented)

**Rationale:**
- Patterns fetched once via API route (server-side)
- Matcher remains synchronous
- No async calls in `useMemo` path
- Robust fallback to local patterns
- Backward compatible

**Constraints Met:**
- ✅ No async/await in `extractPracticeSteps` or `useMemo`
- ✅ No client-side direct Supabase queries for matching
- ✅ Patterns fetched once, passed synchronously
- ✅ Current behavior maintained (chunk mode, tautology guards)

## Phase 2: Implementation Status

### Completed ✅
1. ✅ Database migration (003_add_pattern_key_and_active.sql)
2. ✅ API route (`/api/listening-patterns`)
3. ✅ Client hook (`useListeningPatterns`)
4. ✅ Matcher updates (optional patterns parameter)
5. ✅ `extractPracticeSteps` updates (optional patterns parameter)
6. ✅ Practice page wiring

### Missing ❌
1. ❌ Dev-only console logs for pattern matching
   - Should log: `pattern_key`, `focus token`, `chunkDisplay` when match found
   - Only in `NODE_ENV === 'development'`

## Files Changed Summary

### New Files
- `supabase/migrations/003_add_pattern_key_and_active.sql`
- `app/api/listening-patterns/route.ts`
- `lib/useListeningPatterns.ts`

### Modified Files
- `lib/listeningPatternMatcher.ts` - added optional `patterns` parameter
- `lib/practiceSteps.ts` - added optional `patterns` parameter, passes to matcher
- `app/(app)/practice/[clipId]/practice/page.tsx` - uses hook, passes patterns

### Unchanged Files (still used)
- `lib/listeningPatterns.ts` - kept as fallback source
- `components/PhraseCard.tsx` - no changes needed (already consumes pattern data correctly)

## Next Steps

### Required: Add Dev Console Logs ✅ DONE
✅ Added development-only logging in `lib/listeningPatternMatcher.ts`:
- Logs `pattern.id` (pattern_key), `focus` token, `chunkDisplay` when match found
- Only active in `NODE_ENV === 'development'`
- Added to both `matchListeningPattern` and `matchListeningPatternBackward`

### Optional Enhancements
- Add pattern_key to ListeningPattern interface (if not already using id)
- Verify DB seed data matches local patterns
- Add unit tests for pattern matching with DB patterns

## Conclusion

The implementation is **COMPLETE and FUNCTIONAL**. ✅

All requirements have been met:
- ✅ DB-first approach with local fallback
- ✅ Synchronous pattern matching (no async in useMemo)
- ✅ Dev-only console logging for pattern matches
- ✅ Backward compatible (works with or without DB)
- ✅ Chunk mode and tautology guards maintained
- ✅ Seed script for populating database

The architecture correctly implements DB-first with local fallback while maintaining all constraints.

---

## Seed Script

### How to Run

To seed the `listening_patterns` table from `lib/listeningPatterns.ts`:

1. **Ensure environment variables are set:**
   ```bash
   # In .env.local or exported in shell
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   ```

2. **Dry run (default - safe, no changes):**
   ```bash
   npm run seed:patterns
   ```

3. **Actually write to database (requires --yes flag):**
   ```bash
   npm run seed:patterns -- --yes
   ```

### What the Script Does

- Reads patterns from `lib/listeningPatterns.ts`
- Converts local format to DB format:
  - `id` → `pattern_key`
  - `words[]` → `focus`, `left1`, `right1`, `right2`
  - `chunkDisplay` → `chunk_display`
  - `howItSounds` → `how_it_sounds`
  - `tip` → `tip`
  - `priority` → `priority`
  - Sets `is_active = true`
- Upserts patterns using `pattern_key` as unique key
- Prints summary with inserted/updated counts and first 10 keys

### Safety Features

- ✅ Dry-run by default (no changes unless `--yes` flag)
- ✅ Browser environment check (must run in Node.js)
- ✅ Environment variable validation
- ✅ Preview of conversions before writing
- ✅ Error handling with detailed reporting

### Notes

- The script uses `tsx` to run TypeScript directly (no compilation needed)
- Patterns are upserted, so running multiple times is safe (won't create duplicates)
- Existing rows are updated if they have the same `pattern_key`

