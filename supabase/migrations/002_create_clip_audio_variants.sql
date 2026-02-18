-- Create clip_audio_variants table for pre-generated Gemini TTS audio variants
-- Each clip can have multiple audio variants (different voices/prompts)
-- for natural variation across sessions

CREATE TABLE IF NOT EXISTS clip_audio_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id TEXT NOT NULL UNIQUE,
  variant_urls TEXT[] NOT NULL DEFAULT '{}',
  variant_metadata JSONB DEFAULT '[]',
  variants_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for fast lookups by clip_id
CREATE INDEX IF NOT EXISTS idx_clip_audio_variants_clip_id ON clip_audio_variants(clip_id);

-- Enable Row Level Security
ALTER TABLE clip_audio_variants ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Allow public read access (variants are shared across all users)
DROP POLICY IF EXISTS "Anyone can read audio variants" ON clip_audio_variants;
CREATE POLICY "Anyone can read audio variants"
  ON clip_audio_variants FOR SELECT
  USING (true);

-- RLS Policy: Only service role can insert/update (via admin client)
DROP POLICY IF EXISTS "Service role can manage audio variants" ON clip_audio_variants;
CREATE POLICY "Service role can manage audio variants"
  ON clip_audio_variants FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS update_clip_audio_variants_updated_at ON clip_audio_variants;
CREATE TRIGGER update_clip_audio_variants_updated_at
  BEFORE UPDATE ON clip_audio_variants
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
