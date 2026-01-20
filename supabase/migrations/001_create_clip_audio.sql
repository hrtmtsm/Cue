-- Create clip_audio table for production audio pipeline
CREATE TABLE IF NOT EXISTS clip_audio (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  clip_id TEXT NOT NULL,
  transcript TEXT NOT NULL,
  transcript_hash TEXT NOT NULL,
  variant_key TEXT NOT NULL DEFAULT 'clean_normal',
  voice_profile TEXT DEFAULT 'alloy',
  audio_status TEXT NOT NULL DEFAULT 'needs_generation' CHECK (audio_status IN ('needs_generation', 'generating', 'ready', 'error')),
  blob_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Unique constraint: one audio per user/clip/variant combination
  UNIQUE(user_id, clip_id, variant_key)
);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_clip_audio_user_clip ON clip_audio(user_id, clip_id);
CREATE INDEX IF NOT EXISTS idx_clip_audio_status ON clip_audio(audio_status);
CREATE INDEX IF NOT EXISTS idx_clip_audio_hash ON clip_audio(transcript_hash);

-- Enable Row Level Security
ALTER TABLE clip_audio ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (idempotent)
DROP POLICY IF EXISTS "Users can view their own audio" ON clip_audio;
DROP POLICY IF EXISTS "Users can insert their own audio" ON clip_audio;
DROP POLICY IF EXISTS "Users can update their own audio" ON clip_audio;
DROP POLICY IF EXISTS "Users can delete their own audio" ON clip_audio;

-- RLS Policy: Users can only access their own audio
CREATE POLICY "Users can view their own audio"
  ON clip_audio FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own audio"
  ON clip_audio FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own audio"
  ON clip_audio FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own audio"
  ON clip_audio FOR DELETE
  USING (auth.uid() = user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
-- Drop existing trigger if it exists (idempotent)
DROP TRIGGER IF EXISTS update_clip_audio_updated_at ON clip_audio;

CREATE TRIGGER update_clip_audio_updated_at
  BEFORE UPDATE ON clip_audio
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

