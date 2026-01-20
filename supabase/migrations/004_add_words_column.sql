-- Add words column to listening_patterns table
-- This migration makes the schema sequence-based (words[]) instead of context-based (focus, left1, right1, right2)
-- 
-- Rationale:
-- - Matcher logic already uses words[] array directly
-- - Supports arbitrary length patterns (no 4-word limit)
-- - Cleaner and easier to reason about
-- - Eliminates conversion complexity between DB and client format
-- - Still supports backward matching (check last word in array)

-- Add words column (TEXT[] array)
ALTER TABLE listening_patterns
ADD COLUMN IF NOT EXISTS words TEXT[];

-- Migrate existing data from (focus, left1, right1, right2) to words[]
-- Pattern: words = [left1?, focus, right1?, right2?]
UPDATE listening_patterns
SET words = (
  CASE
    WHEN left1 IS NOT NULL AND right1 IS NOT NULL AND right2 IS NOT NULL THEN
      ARRAY[left1, focus, right1, right2]
    WHEN left1 IS NOT NULL AND right1 IS NOT NULL THEN
      ARRAY[left1, focus, right1]
    WHEN left1 IS NOT NULL THEN
      ARRAY[left1, focus]
    WHEN right1 IS NOT NULL AND right2 IS NOT NULL THEN
      ARRAY[focus, right1, right2]
    WHEN right1 IS NOT NULL THEN
      ARRAY[focus, right1]
    ELSE
      ARRAY[focus]
  END
)
WHERE words IS NULL;

-- Make words NOT NULL after backfilling (should be safe since all rows have focus)
ALTER TABLE listening_patterns
ALTER COLUMN words SET NOT NULL;

-- Create index for fast lookups by first word (for forward matching)
-- Note: PostgreSQL array indexing uses 1-based indexing (words[1] is the first element)
CREATE INDEX IF NOT EXISTS idx_listening_patterns_words_first 
ON listening_patterns((words[1])) WHERE is_active = true;

-- Update the existing focus_priority index to include words
-- Drop old index
DROP INDEX IF EXISTS idx_listening_patterns_focus_priority_active;

-- Create new index with words first element + priority (for forward matching with priority)
CREATE INDEX IF NOT EXISTS idx_listening_patterns_words_priority 
ON listening_patterns((words[1]), priority DESC) WHERE is_active = true;

-- Note: Backward matching (checking last word) will use sequential scan
-- This is acceptable since we have a small number of patterns (~20-30)
-- If performance becomes an issue, we can add a GIN index on words[] for array containment

-- Note: We keep the old columns (focus, left1, right1, right2) for backward compatibility
-- They can be removed in a future migration if not needed

