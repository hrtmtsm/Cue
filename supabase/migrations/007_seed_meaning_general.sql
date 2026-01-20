-- Seed meaning_general for common reduced forms
-- Updates listening_patterns with Layer 1 (general) meanings for safe reduced forms
-- Idempotent: safe to run multiple times

-- Update patterns by pattern_key or reduced_form
-- Matches common reduced forms: gonna, wanna, gotta, kinda, lemme, gimme, hafta, outta, sorta

UPDATE listening_patterns
SET 
  meaning_general = 'A shortened spoken form used in casual conversation.',
  meaning_status = 'general'
WHERE reduced_form IN ('gonna', 'wanna', 'gotta', 'lemme', 'gimme', 'hafta', 'outta')
  AND (meaning_status IS NULL OR meaning_status = 'none');

UPDATE listening_patterns
SET 
  meaning_general = 'A casual way to say "kind of".',
  meaning_status = 'general'
WHERE reduced_form = 'kinda'
  AND (meaning_status IS NULL OR meaning_status = 'none');

UPDATE listening_patterns
SET 
  meaning_general = 'A casual way to say "sort of".',
  meaning_status = 'general'
WHERE reduced_form = 'sorta'
  AND (meaning_status IS NULL OR meaning_status = 'none');

-- Verification: Count how many patterns were updated
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO updated_count
  FROM listening_patterns
  WHERE reduced_form IN ('gonna', 'wanna', 'gotta', 'kinda', 'lemme', 'gimme', 'hafta', 'outta', 'sorta')
    AND meaning_status = 'general'
    AND meaning_general IS NOT NULL;
  
  RAISE NOTICE 'Updated % patterns with meaning_general and meaning_status=''general''', updated_count;
END $$;


