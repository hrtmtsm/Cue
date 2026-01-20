-- Add reduced_form column for phonetic reductions
-- This separates canonical forms (chunk_display) from phonetic reductions (reduced_form)
-- Example: chunk_display = "want to", reduced_form = "wanna"

ALTER TABLE listening_patterns 
ADD COLUMN IF NOT EXISTS reduced_form TEXT;

COMMENT ON COLUMN listening_patterns.reduced_form IS 
'Phonetic reduction of the pattern (e.g., "wanna" for "want to")';


