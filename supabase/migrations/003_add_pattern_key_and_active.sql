-- Add pattern_key and is_active to listening_patterns table
-- pattern_key: unique identifier for each pattern (e.g., 'went-to-the')
-- is_active: boolean flag to enable/disable patterns (default true)

-- Add pattern_key column if it doesn't exist
ALTER TABLE listening_patterns 
ADD COLUMN IF NOT EXISTS pattern_key TEXT;

-- Add is_active column if it doesn't exist
ALTER TABLE listening_patterns 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Update existing rows to have pattern_key based on chunk_display
-- This creates a slug-like key from chunk_display
UPDATE listening_patterns
SET pattern_key = chunk_display
WHERE pattern_key IS NULL;

-- Delete duplicate pattern_keys, keeping only the first occurrence (lowest id)
-- This ensures the unique index can be created successfully
DELETE FROM listening_patterns a
USING listening_patterns b
WHERE a.id > b.id 
  AND a.pattern_key IS NOT NULL
  AND b.pattern_key IS NOT NULL
  AND a.pattern_key = b.pattern_key;

-- Now make pattern_key NOT NULL after backfilling and deduplication
ALTER TABLE listening_patterns
ALTER COLUMN pattern_key SET NOT NULL;

-- Create unique constraint on pattern_key
CREATE UNIQUE INDEX IF NOT EXISTS idx_listening_patterns_pattern_key 
ON listening_patterns(pattern_key);

-- Create index for filtering by is_active
CREATE INDEX IF NOT EXISTS idx_listening_patterns_is_active 
ON listening_patterns(is_active) WHERE is_active = true;

-- Update the existing focus_priority index to include is_active
-- Drop old index if it exists
DROP INDEX IF EXISTS idx_listening_patterns_focus_priority;

-- Create new index with is_active
CREATE INDEX IF NOT EXISTS idx_listening_patterns_focus_priority_active 
ON listening_patterns(focus, priority DESC) WHERE is_active = true;
