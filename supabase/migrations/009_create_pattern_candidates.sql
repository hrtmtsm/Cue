-- Create pattern_candidates table for batch-generated candidate phrases
-- This table stores potential listening/semantic patterns extracted from transcripts
-- before they are reviewed and accepted into listening_patterns

CREATE TABLE IF NOT EXISTS pattern_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phrase_text TEXT NOT NULL,
  candidate_kind TEXT NOT NULL CHECK (candidate_kind IN ('listening', 'semantic')),
  frequency INTEGER NOT NULL,
  example_clip_ids TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'accepted', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_pattern_candidates_status ON pattern_candidates(status);
CREATE INDEX IF NOT EXISTS idx_pattern_candidates_kind_status ON pattern_candidates(candidate_kind, status);
CREATE INDEX IF NOT EXISTS idx_pattern_candidates_frequency ON pattern_candidates(frequency DESC);
CREATE INDEX IF NOT EXISTS idx_pattern_candidates_phrase_text ON pattern_candidates(phrase_text);

-- Enable Row Level Security
ALTER TABLE pattern_candidates ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Anyone can read candidates (public read-only)
DROP POLICY IF EXISTS "Anyone can read pattern candidates" ON pattern_candidates;
CREATE POLICY "Anyone can read pattern candidates"
  ON pattern_candidates FOR SELECT
  USING (true);

-- Note: Write operations (INSERT, UPDATE) should be done via service role key
-- No write policy needed for public access
