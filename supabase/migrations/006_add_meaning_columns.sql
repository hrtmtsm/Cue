-- Add meaning columns for 3-layer meaning system
-- Layer 1: meaning_general (structural, generalizable)
-- Layer 2: meaning_approved (context-specific, human-approved)
-- Layer 3: meaning_status (controls which meaning to show)

ALTER TABLE listening_patterns 
ADD COLUMN IF NOT EXISTS meaning_general TEXT;

ALTER TABLE listening_patterns 
ADD COLUMN IF NOT EXISTS meaning_approved TEXT;

ALTER TABLE listening_patterns 
ADD COLUMN IF NOT EXISTS meaning_status TEXT DEFAULT 'none' 
  CHECK (meaning_status IN ('none', 'general', 'approved', 'revoked'));

COMMENT ON COLUMN listening_patterns.meaning_general IS 
'Structural meaning that generalizes across contexts (Layer 1). Example: "want to + verb" → "to express desire or intention to do something."';

COMMENT ON COLUMN listening_patterns.meaning_approved IS 
'Context-specific meaning that has been human-approved (Layer 2). Only shown if meaning_status = "approved".';

COMMENT ON COLUMN listening_patterns.meaning_status IS 
'Controls which meaning to show: "none" (no meaning), "general" (use meaning_general), "approved" (use meaning_approved), "revoked" (hide meaning).';


