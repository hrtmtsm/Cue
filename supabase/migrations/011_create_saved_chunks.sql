-- Create saved_chunks table for user-saved chunks
-- Note: Foreign key to clip_chunk_spans added in migration 014
CREATE TABLE IF NOT EXISTS saved_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  clip_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'phrase',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_saved_chunks_user_id ON saved_chunks(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_chunks_clip_id ON saved_chunks(clip_id);

-- Enable Row Level Security
ALTER TABLE saved_chunks ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access their own saved chunks
CREATE POLICY "Users can view their own saved chunks"
  ON saved_chunks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own saved chunks"
  ON saved_chunks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own saved chunks"
  ON saved_chunks FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own saved chunks"
  ON saved_chunks FOR DELETE
  USING (auth.uid() = user_id);

