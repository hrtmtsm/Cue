-- Add clip_chunk_span_id column to saved_chunks if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'saved_chunks'
    AND column_name = 'clip_chunk_span_id'
  ) THEN
    ALTER TABLE saved_chunks 
    ADD COLUMN clip_chunk_span_id UUID;
  END IF;
END $$;

-- Add foreign key constraint only if clip_chunk_spans table exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'clip_chunk_spans'
  ) THEN
    -- Add foreign key constraint if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 
      FROM information_schema.table_constraints 
      WHERE constraint_name = 'fk_saved_chunks_clip_chunk_span'
      AND table_name = 'saved_chunks'
    ) THEN
      ALTER TABLE saved_chunks 
      ADD CONSTRAINT fk_saved_chunks_clip_chunk_span 
      FOREIGN KEY (clip_chunk_span_id) 
      REFERENCES clip_chunk_spans(id) 
      ON DELETE CASCADE;
    END IF;
    
    -- Add index if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 
      FROM pg_indexes 
      WHERE indexname = 'idx_saved_chunks_clip_chunk_span_id'
    ) THEN
      CREATE INDEX idx_saved_chunks_clip_chunk_span_id ON saved_chunks(clip_chunk_span_id);
    END IF;
  END IF;
END $$;
