-- Create saved_items table for user-saved vocab
-- Note: clip_chunk_span_id foreign key is added conditionally below
CREATE TABLE IF NOT EXISTS saved_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  clip_id TEXT NOT NULL,
  clip_chunk_span_id UUID,  -- Foreign key added conditionally below
  chunk_display TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'phrase',
  meaning TEXT,
  example_sentence TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Unique constraint: one saved item per user/chunk_span combination
  -- Only enforce when clip_chunk_span_id is not null
  UNIQUE(user_id, clip_chunk_span_id)
);

-- Add foreign key constraint only if clip_chunk_spans table exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'clip_chunk_spans'
  ) THEN
    -- Check if constraint already exists before adding
    IF NOT EXISTS (
      SELECT 1 
      FROM information_schema.table_constraints 
      WHERE constraint_name = 'fk_saved_items_clip_chunk_span'
      AND table_name = 'saved_items'
    ) THEN
      ALTER TABLE saved_items 
      ADD CONSTRAINT fk_saved_items_clip_chunk_span 
      FOREIGN KEY (clip_chunk_span_id) 
      REFERENCES clip_chunk_spans(id) 
      ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_saved_items_user_id ON saved_items(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_items_clip_id ON saved_items(clip_id);
CREATE INDEX IF NOT EXISTS idx_saved_items_clip_chunk_span_id ON saved_items(clip_chunk_span_id);

-- Enable Row Level Security
ALTER TABLE saved_items ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access their own saved items
CREATE POLICY "Users can view their own saved items"
  ON saved_items FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own saved items"
  ON saved_items FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own saved items"
  ON saved_items FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own saved items"
  ON saved_items FOR DELETE
  USING (auth.uid() = user_id);
