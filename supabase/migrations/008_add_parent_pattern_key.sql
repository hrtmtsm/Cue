-- Add parent_pattern_key column for phonetic reductions
-- This allows patterns like "gonna" to reference their parent "going-to"

ALTER TABLE listening_patterns 
ADD COLUMN IF NOT EXISTS parent_pattern_key TEXT;

-- Create foreign key constraint (self-referencing)
-- Use IF NOT EXISTS pattern for idempotency
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'listening_patterns_parent_pattern_key_fkey'
  ) THEN
    ALTER TABLE listening_patterns
    ADD CONSTRAINT listening_patterns_parent_pattern_key_fkey 
    FOREIGN KEY (parent_pattern_key) 
    REFERENCES listening_patterns(pattern_key)
    ON DELETE SET NULL;  -- If parent is deleted, set child's parent_pattern_key to NULL
  END IF;
END $$;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_listening_patterns_parent_key 
ON listening_patterns(parent_pattern_key);

-- Add comment for clarity
COMMENT ON COLUMN listening_patterns.parent_pattern_key IS 
'References the canonical pattern_key this reduction comes from (e.g., "gonna" → "going-to")';


