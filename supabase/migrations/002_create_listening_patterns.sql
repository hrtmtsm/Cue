-- Create listening_patterns table for pattern-based feedback
CREATE TABLE IF NOT EXISTS listening_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  focus TEXT NOT NULL,
  left1 TEXT,
  right1 TEXT,
  right2 TEXT,
  chunk_display TEXT NOT NULL,
  how_it_sounds TEXT NOT NULL,
  tip TEXT,
  priority INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Index for fast lookups by focus word
  -- We'll query by focus first, then filter by context
  CONSTRAINT valid_priority CHECK (priority >= 0 AND priority <= 1000)
);

-- Create indexes for fast pattern matching
CREATE INDEX IF NOT EXISTS idx_listening_patterns_focus ON listening_patterns(focus);
CREATE INDEX IF NOT EXISTS idx_listening_patterns_focus_priority ON listening_patterns(focus, priority DESC);
CREATE INDEX IF NOT EXISTS idx_listening_patterns_context ON listening_patterns(focus, left1, right1) WHERE left1 IS NOT NULL AND right1 IS NOT NULL;

-- Enable Row Level Security (public read-only table)
ALTER TABLE listening_patterns ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (idempotent)
DROP POLICY IF EXISTS "Anyone can read listening patterns" ON listening_patterns;

-- RLS Policy: Anyone can read patterns (public read-only)
CREATE POLICY "Anyone can read listening patterns"
  ON listening_patterns FOR SELECT
  USING (true);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_listening_patterns_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER update_listening_patterns_updated_at
  BEFORE UPDATE ON listening_patterns
  FOR EACH ROW
  EXECUTE FUNCTION update_listening_patterns_updated_at();

-- Seed data: Common function word patterns
INSERT INTO listening_patterns (focus, left1, right1, right2, chunk_display, how_it_sounds, tip, priority) VALUES
-- "to" patterns (priority 100 = exact match, 90 = partial, 80 = fallback)
('to', 'went', 'the', NULL, 'went-to-the', 'In fast speech, "went to the" sounds like "wento thuh" - the words blend together.', 'Listen for the "t" sound that links "went" and "to".', 100),
('to', 'want', 'go', NULL, 'want-to', 'In casual speech, "want to" often sounds like "wanna".', 'The "t" between "want" and "to" disappears in fast speech.', 100),
('to', 'going', 'store', NULL, 'going-to', 'In fast speech, "going to" often sounds like "gonna".', 'The "ing" and "to" blend together in casual speech.', 100),
('to', NULL, 'the', NULL, 'to-the', 'In fast speech, "to" sounds like "tuh" before "the", and the words blend together.', 'The "t" in "to" links to the next word.', 90),
('to', NULL, NULL, NULL, 'to', 'In fast speech, "to" often sounds like "tuh" - the vowel is reduced.', 'Listen for the reduced vowel sound, not the full "oo" sound.', 80),

-- "of" patterns
('of', 'lot', NULL, NULL, 'lot-of', 'In fast speech, "lot of" sounds like "lotta" - the "f" is dropped.', 'The "f" at the end of "of" disappears before consonants.', 100),
('of', 'a', NULL, NULL, 'a-of', 'In fast speech, "a lot of" sounds like "a lotta".', 'The "f" in "of" is dropped in casual speech.', 90),
('of', NULL, NULL, NULL, 'of', 'In fast speech, "of" often sounds like "uh" - the vowel is reduced.', 'The "f" can be dropped or the vowel reduced depending on context.', 80),

-- "and" patterns
('and', NULL, 'then', NULL, 'and-then', 'In fast speech, "and then" sounds like "an then" - the "d" is dropped.', 'The "d" in "and" disappears before consonants.', 90),
('and', NULL, NULL, NULL, 'and', 'In fast speech, "and" often sounds like "n" or "an" - the final "d" is dropped.', 'Listen for just the "n" sound, not the full "and".', 80),

-- "the" patterns (bonus - common weak form)
('the', NULL, 'park', NULL, 'the-park', 'In fast speech, "the" sounds like "thuh" before consonants like "park".', 'The vowel in "the" changes from "ee" to "uh" before consonant sounds.', 90),
('the', NULL, NULL, NULL, 'the', 'In fast speech, "the" often sounds like "thuh" - the vowel is reduced.', 'Listen for "thuh" not "thee" in most contexts.', 80);

