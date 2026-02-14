-- Create clip_chunk_spans table for storing chunk boundaries
CREATE TABLE IF NOT EXISTS clip_chunk_spans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id TEXT NOT NULL,
  chunk_text TEXT NOT NULL,
  chunk_display TEXT,
  ref_start INTEGER NOT NULL,
  ref_end INTEGER NOT NULL,
  confidence TEXT DEFAULT 'low' CHECK (confidence IN ('low', 'medium', 'high')),
  approved BOOLEAN DEFAULT FALSE,
  chunk_source TEXT DEFAULT 'llm_auto' CHECK (chunk_source IN ('llm_auto', 'manual', 'pattern')),
  pattern_key TEXT,
  pattern_kind TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Unique constraint: one chunk per clip/position/text combination
  UNIQUE(clip_id, ref_start, ref_end, chunk_text)
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_clip_chunk_spans_clip_id ON clip_chunk_spans(clip_id);
CREATE INDEX IF NOT EXISTS idx_clip_chunk_spans_position ON clip_chunk_spans(clip_id, ref_start, ref_end);
CREATE INDEX IF NOT EXISTS idx_clip_chunk_spans_approved ON clip_chunk_spans(approved);

-- Enable Row Level Security
ALTER TABLE clip_chunk_spans ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Allow all authenticated users to read chunk spans
CREATE POLICY "Authenticated users can view chunk spans"
  ON clip_chunk_spans FOR SELECT
  TO authenticated
  USING (true);

-- RLS Policy: Allow service role to manage chunk spans
CREATE POLICY "Service role can manage chunk spans"
  ON clip_chunk_spans FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS update_clip_chunk_spans_updated_at ON clip_chunk_spans;

CREATE TRIGGER update_clip_chunk_spans_updated_at
  BEFORE UPDATE ON clip_chunk_spans
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Drop existing function if it exists (to handle signature changes)
DROP FUNCTION IF EXISTS get_clip_chunk_hit(TEXT, INTEGER);

-- Create RPC function to find chunk hit for a given clip and character index
CREATE OR REPLACE FUNCTION get_clip_chunk_hit(
  p_clip_id TEXT,
  p_char_idx INTEGER
)
RETURNS TABLE (
  id UUID,
  clip_id TEXT,
  chunk_text TEXT,
  chunk_display TEXT,
  ref_start INTEGER,
  ref_end INTEGER,
  pattern_key TEXT,
  pattern_kind TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ccs.id,
    ccs.clip_id,
    ccs.chunk_text,
    ccs.chunk_display,
    ccs.ref_start,
    ccs.ref_end,
    ccs.pattern_key,
    ccs.pattern_kind
  FROM clip_chunk_spans ccs
  WHERE ccs.clip_id = p_clip_id
    AND ccs.ref_start <= p_char_idx
    AND ccs.ref_end > p_char_idx
  ORDER BY ccs.ref_start DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_clip_chunk_hit(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_clip_chunk_hit(TEXT, INTEGER) TO service_role;
