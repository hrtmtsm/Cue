-- ============================================================
-- Migration 016: Create Shadow Table + Backup for Safe Re-Chunking
-- ============================================================
-- Purpose: Support safe, reversible chunk regeneration for ~500 clips
-- Strategy: Shadow table (v2) → Verify → Swap → Rollback capability

-- ============================================================
-- 1. CREATE SHADOW TABLE: clip_chunk_spans_v2
-- ============================================================
CREATE TABLE IF NOT EXISTS clip_chunk_spans_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id TEXT NOT NULL,
  chunk_text TEXT NOT NULL,
  chunk_display TEXT,
  ref_start INTEGER NOT NULL,
  ref_end INTEGER NOT NULL,
  confidence TEXT NOT NULL DEFAULT 'medium' CHECK (confidence IN ('low', 'medium', 'high')),
  approved BOOLEAN NOT NULL DEFAULT FALSE,
  chunk_source TEXT NOT NULL DEFAULT 'llm_auto_v2' CHECK (chunk_source IN ('llm_auto_v2', 'manual', 'pattern')),
  pattern_key TEXT,
  pattern_kind TEXT,
  chunk_version TEXT NOT NULL DEFAULT 'v2',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Prevent duplicates
  UNIQUE(clip_id, ref_start, ref_end, chunk_text)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_clip_chunk_spans_v2_clip_id ON clip_chunk_spans_v2(clip_id);
CREATE INDEX IF NOT EXISTS idx_clip_chunk_spans_v2_position ON clip_chunk_spans_v2(clip_id, ref_start, ref_end);
CREATE INDEX IF NOT EXISTS idx_clip_chunk_spans_v2_version ON clip_chunk_spans_v2(chunk_version);

-- RLS policies
ALTER TABLE clip_chunk_spans_v2 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can manage v2 spans" ON clip_chunk_spans_v2;
CREATE POLICY "Service role can manage v2 spans"
  ON clip_chunk_spans_v2 FOR ALL
  TO service_role
  USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS "Authenticated users can view v2 spans" ON clip_chunk_spans_v2;
CREATE POLICY "Authenticated users can view v2 spans"
  ON clip_chunk_spans_v2 FOR SELECT
  TO authenticated
  USING (TRUE);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_clip_chunk_spans_v2_updated_at ON clip_chunk_spans_v2;
CREATE TRIGGER update_clip_chunk_spans_v2_updated_at
  BEFORE UPDATE ON clip_chunk_spans_v2
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 2. CREATE BACKUP TABLE: clip_chunk_spans_backup
-- ============================================================
CREATE TABLE IF NOT EXISTS clip_chunk_spans_backup (
  id UUID,
  clip_id TEXT NOT NULL,
  chunk_text TEXT NOT NULL,
  chunk_display TEXT,
  ref_start INTEGER NOT NULL,
  ref_end INTEGER NOT NULL,
  confidence TEXT NOT NULL DEFAULT 'low',
  approved BOOLEAN NOT NULL DEFAULT FALSE,
  chunk_source TEXT NOT NULL DEFAULT 'llm_auto',
  pattern_key TEXT,
  pattern_kind TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  backed_up_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Allow multiple backups of same chunk over time
  PRIMARY KEY (id, backed_up_at)
);

-- Index for quick restore
CREATE INDEX IF NOT EXISTS idx_clip_chunk_spans_backup_clip_id ON clip_chunk_spans_backup(clip_id);
CREATE INDEX IF NOT EXISTS idx_clip_chunk_spans_backup_time ON clip_chunk_spans_backup(backed_up_at);

-- ============================================================
-- 3. RPC: backup_chunks_before_swap
-- ============================================================
-- Backs up existing chunks to backup table before swap
-- Idempotent: can be called multiple times safely
DROP FUNCTION IF EXISTS backup_chunks_before_swap(TEXT[]);
CREATE OR REPLACE FUNCTION backup_chunks_before_swap(p_clip_ids TEXT[])
RETURNS INTEGER AS $$
DECLARE
  rows_backed_up INTEGER;
BEGIN
  -- Insert existing chunks into backup table
  INSERT INTO clip_chunk_spans_backup (
    id, clip_id, chunk_text, chunk_display, ref_start, ref_end,
    confidence, approved, chunk_source, pattern_key, pattern_kind,
    created_at, updated_at, backed_up_at
  )
  SELECT 
    id, clip_id, chunk_text, chunk_display, ref_start, ref_end,
    confidence, approved, chunk_source, pattern_key, pattern_kind,
    created_at, updated_at, NOW()
  FROM clip_chunk_spans
  WHERE clip_id = ANY(p_clip_ids);
  
  GET DIAGNOSTICS rows_backed_up = ROW_COUNT;
  
  RAISE NOTICE 'Backed up % chunks for % clips', rows_backed_up, array_length(p_clip_ids, 1);
  
  RETURN rows_backed_up;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION backup_chunks_before_swap(TEXT[]) TO service_role;

-- ============================================================
-- 4. RPC: swap_chunks_to_v2
-- ============================================================
-- Atomically swaps v2 chunks to production table
-- Process:
--   1. Backup existing chunks
--   2. Delete old chunks for clip_ids
--   3. Copy v2 chunks to production
--   4. Verify counts match
--   5. If mismatch, RAISE exception to rollback transaction
DROP FUNCTION IF EXISTS swap_chunks_to_v2(TEXT[]);
CREATE OR REPLACE FUNCTION swap_chunks_to_v2(p_clip_ids TEXT[])
RETURNS JSON AS $$
DECLARE
  backup_count INTEGER;
  delete_count INTEGER;
  v2_count INTEGER;
  insert_count INTEGER;
  result JSON;
BEGIN
  -- Step 1: Backup
  RAISE NOTICE 'Step 1: Backing up existing chunks...';
  SELECT backup_chunks_before_swap(p_clip_ids) INTO backup_count;
  
  -- Step 2: Count v2 chunks to insert
  SELECT COUNT(*) INTO v2_count
  FROM clip_chunk_spans_v2
  WHERE clip_id = ANY(p_clip_ids);
  
  IF v2_count = 0 THEN
    RAISE EXCEPTION 'No v2 chunks found for these clip_ids. Aborting.';
  END IF;
  
  RAISE NOTICE 'Step 2: Found % v2 chunks to swap', v2_count;
  
  -- Step 3: Delete old chunks from production
  DELETE FROM clip_chunk_spans
  WHERE clip_id = ANY(p_clip_ids);
  
  GET DIAGNOSTICS delete_count = ROW_COUNT;
  RAISE NOTICE 'Step 3: Deleted % old chunks from production', delete_count;
  
  -- Step 4: Copy v2 chunks to production
  INSERT INTO clip_chunk_spans (
    clip_id, chunk_text, chunk_display, ref_start, ref_end,
    confidence, approved, chunk_source, pattern_key, pattern_kind
  )
  SELECT 
    clip_id, chunk_text, chunk_display, ref_start, ref_end,
    confidence, approved, chunk_source, pattern_key, pattern_kind
  FROM clip_chunk_spans_v2
  WHERE clip_id = ANY(p_clip_ids);
  
  GET DIAGNOSTICS insert_count = ROW_COUNT;
  RAISE NOTICE 'Step 4: Inserted % chunks into production', insert_count;
  
  -- Step 5: Verify counts match
  IF insert_count != v2_count THEN
    RAISE EXCEPTION 'Count mismatch: expected %, got %. Rolling back.', v2_count, insert_count;
  END IF;
  
  -- Build result JSON
  result := json_build_object(
    'success', TRUE,
    'clip_count', array_length(p_clip_ids, 1),
    'backed_up', backup_count,
    'deleted', delete_count,
    'inserted', insert_count,
    'message', format('Successfully swapped %s chunks for %s clips', insert_count, array_length(p_clip_ids, 1))
  );
  
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION swap_chunks_to_v2(TEXT[]) TO service_role;

-- ============================================================
-- 5. RPC: restore_chunks_from_backup
-- ============================================================
-- Atomically restores chunks from backup table (rollback)
-- Uses most recent backup for each clip_id
DROP FUNCTION IF EXISTS restore_chunks_from_backup(TEXT[]);
CREATE OR REPLACE FUNCTION restore_chunks_from_backup(p_clip_ids TEXT[])
RETURNS JSON AS $$
DECLARE
  delete_count INTEGER;
  restore_count INTEGER;
  result JSON;
BEGIN
  -- Step 1: Verify backup exists
  IF NOT EXISTS (
    SELECT 1 FROM clip_chunk_spans_backup
    WHERE clip_id = ANY(p_clip_ids)
  ) THEN
    RAISE EXCEPTION 'No backup found for these clip_ids. Cannot restore.';
  END IF;
  
  RAISE NOTICE 'Step 1: Backup found, proceeding with restore...';
  
  -- Step 2: Delete current (bad) chunks from production
  DELETE FROM clip_chunk_spans
  WHERE clip_id = ANY(p_clip_ids);
  
  GET DIAGNOSTICS delete_count = ROW_COUNT;
  RAISE NOTICE 'Step 2: Deleted % chunks from production', delete_count;
  
  -- Step 3: Restore from most recent backup
  INSERT INTO clip_chunk_spans (
    clip_id, chunk_text, chunk_display, ref_start, ref_end,
    confidence, approved, chunk_source, pattern_key, pattern_kind
  )
  SELECT DISTINCT ON (clip_id, ref_start, ref_end, chunk_text)
    clip_id, chunk_text, chunk_display, ref_start, ref_end,
    confidence, approved, chunk_source, pattern_key, pattern_kind
  FROM clip_chunk_spans_backup
  WHERE clip_id = ANY(p_clip_ids)
  ORDER BY clip_id, ref_start, ref_end, chunk_text, backed_up_at DESC;
  
  GET DIAGNOSTICS restore_count = ROW_COUNT;
  RAISE NOTICE 'Step 3: Restored % chunks from backup', restore_count;
  
  -- Build result JSON
  result := json_build_object(
    'success', TRUE,
    'clip_count', array_length(p_clip_ids, 1),
    'deleted', delete_count,
    'restored', restore_count,
    'message', format('Successfully restored %s chunks for %s clips', restore_count, array_length(p_clip_ids, 1))
  );
  
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION restore_chunks_from_backup(TEXT[]) TO service_role;

-- ============================================================
-- 6. Helper RPC: verify_v2_chunks
-- ============================================================
-- Check v2 chunks before swap (returns stats)
DROP FUNCTION IF EXISTS verify_v2_chunks(TEXT[]);
CREATE OR REPLACE FUNCTION verify_v2_chunks(p_clip_ids TEXT[])
RETURNS JSON AS $$
DECLARE
  v2_count INTEGER;
  prod_count INTEGER;
  clip_count INTEGER;
  result JSON;
BEGIN
  SELECT COUNT(DISTINCT clip_id) INTO clip_count
  FROM clip_chunk_spans_v2
  WHERE clip_id = ANY(p_clip_ids);
  
  SELECT COUNT(*) INTO v2_count
  FROM clip_chunk_spans_v2
  WHERE clip_id = ANY(p_clip_ids);
  
  SELECT COUNT(*) INTO prod_count
  FROM clip_chunk_spans
  WHERE clip_id = ANY(p_clip_ids);
  
  result := json_build_object(
    'clips_in_v2', clip_count,
    'chunks_in_v2', v2_count,
    'chunks_in_prod', prod_count,
    'ready_to_swap', clip_count = array_length(p_clip_ids, 1)
  );
  
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION verify_v2_chunks(TEXT[]) TO service_role;

-- ============================================================
-- 7. Helper: Clean up old chunk_meanings for swapped clips
-- ============================================================
-- After swap, old chunk_meanings reference deleted span IDs
-- This function deletes orphaned meanings
-- (New meanings will be generated lazily on first click)
DROP FUNCTION IF EXISTS cleanup_orphaned_chunk_meanings();
CREATE OR REPLACE FUNCTION cleanup_orphaned_chunk_meanings()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM chunk_meanings
  WHERE clip_chunk_span_id NOT IN (
    SELECT id FROM clip_chunk_spans
  );
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RAISE NOTICE 'Deleted % orphaned chunk_meanings', deleted_count;
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION cleanup_orphaned_chunk_meanings() TO service_role;

-- ============================================================
-- Migration Complete
-- ============================================================
-- Summary:
-- ✅ Created clip_chunk_spans_v2 (shadow table)
-- ✅ Created clip_chunk_spans_backup (backup table)
-- ✅ Created backup_chunks_before_swap() RPC
-- ✅ Created swap_chunks_to_v2() RPC (atomic swap with rollback)
-- ✅ Created restore_chunks_from_backup() RPC (atomic rollback)
-- ✅ Created verify_v2_chunks() RPC (pre-swap verification)
-- ✅ Created cleanup_orphaned_chunk_meanings() RPC (post-swap cleanup)
--
-- Ready for safe, reversible chunk regeneration!
-- ============================================================
