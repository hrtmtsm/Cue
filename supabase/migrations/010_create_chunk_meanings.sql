-- Create chunk_meanings table for storing chunk explanations
-- One meaning per chunk (English only for now)

CREATE TABLE IF NOT EXISTS chunk_meanings (
  clip_chunk_span_id UUID NOT NULL UNIQUE REFERENCES clip_chunk_spans(id) ON DELETE CASCADE,
  meaning_en TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (clip_chunk_span_id)
);

-- Create index for fast lookups by clip_chunk_span_id
CREATE INDEX IF NOT EXISTS idx_chunk_meanings_span_id ON chunk_meanings(clip_chunk_span_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_chunk_meanings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS update_chunk_meanings_updated_at ON chunk_meanings;

CREATE TRIGGER update_chunk_meanings_updated_at
  BEFORE UPDATE ON chunk_meanings
  FOR EACH ROW
  EXECUTE FUNCTION update_chunk_meanings_updated_at();

-- Enable Row Level Security (optional - adjust based on your needs)
ALTER TABLE chunk_meanings ENABLE ROW LEVEL SECURITY;

-- Policy: Allow all authenticated users to read meanings (public read)
DROP POLICY IF EXISTS "Anyone can view chunk meanings" ON chunk_meanings;
CREATE POLICY "Anyone can view chunk meanings"
  ON chunk_meanings FOR SELECT
  USING (true);

-- Policy: Allow service role to manage (insert/update) via API
-- Note: Service role bypasses RLS, but we add this for clarity
-- In practice, API routes use service role which bypasses RLS
DROP POLICY IF EXISTS "Service role can manage chunk meanings" ON chunk_meanings;
-- Service role operations bypass RLS, so this policy is mainly for documentation
-- If needed, we can add authenticated user policies later
