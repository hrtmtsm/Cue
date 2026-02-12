-- Create diagnostic_audio table for shared audio content
CREATE TABLE IF NOT EXISTS diagnostic_audio (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id TEXT UNIQUE NOT NULL,
  audio_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'generating', 'error')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_diagnostic_audio_clip_id ON diagnostic_audio(clip_id);
CREATE INDEX IF NOT EXISTS idx_diagnostic_audio_status ON diagnostic_audio(status);

-- RLS Policies
ALTER TABLE diagnostic_audio ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists (idempotent)
DROP POLICY IF EXISTS "Anyone can read diagnostic audio" ON diagnostic_audio;

-- Allow all authenticated users to read diagnostic audio
CREATE POLICY "Anyone can read diagnostic audio"
ON diagnostic_audio FOR SELECT
TO authenticated
USING (true);

-- Only service role can insert/update/delete (regular users cannot)
-- Service role bypasses RLS, so no need for explicit policies

-- Add trigger to update updated_at (reuse existing function)
DROP TRIGGER IF EXISTS update_diagnostic_audio_updated_at ON diagnostic_audio;

CREATE TRIGGER update_diagnostic_audio_updated_at
  BEFORE UPDATE ON diagnostic_audio
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
