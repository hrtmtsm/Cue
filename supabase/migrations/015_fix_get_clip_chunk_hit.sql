-- Fix get_clip_chunk_hit to match actual database schema
-- Only return columns that actually exist in clip_chunk_spans

DROP FUNCTION IF EXISTS get_clip_chunk_hit(TEXT, INTEGER);

CREATE OR REPLACE FUNCTION get_clip_chunk_hit(
  p_clip_id TEXT,
  p_char_idx INTEGER
)
RETURNS TABLE (
  id UUID,
  clip_id TEXT,
  chunk_text TEXT,
  ref_start INTEGER,
  ref_end INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ccs.id,
    ccs.clip_id,
    ccs.chunk_text,
    ccs.ref_start,
    ccs.ref_end
  FROM clip_chunk_spans ccs
  WHERE ccs.clip_id = p_clip_id
    AND ccs.ref_start <= p_char_idx
    AND ccs.ref_end > p_char_idx
  ORDER BY ccs.ref_start DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION get_clip_chunk_hit(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_clip_chunk_hit(TEXT, INTEGER) TO service_role;
