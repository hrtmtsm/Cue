-- Create practice_sessions table to track daily session completions
-- This prevents free users from bypassing the daily limit by deleting localStorage
CREATE TABLE IF NOT EXISTS practice_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_date DATE GENERATED ALWAYS AS ((completed_at AT TIME ZONE 'UTC')::date) STORED,
  story_id TEXT,
  clips_completed INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Unique constraint: one session per user per day
  CONSTRAINT unique_user_date UNIQUE (user_id, completed_date)
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_practice_sessions_user_id ON practice_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_practice_sessions_completed_at ON practice_sessions(completed_at);
CREATE INDEX IF NOT EXISTS idx_practice_sessions_user_date ON practice_sessions(user_id, completed_date);

-- Enable Row Level Security
ALTER TABLE practice_sessions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (idempotent)
DROP POLICY IF EXISTS "Users can view their own sessions" ON practice_sessions;
DROP POLICY IF EXISTS "Users can insert their own sessions" ON practice_sessions;
DROP POLICY IF EXISTS "Service role can manage all sessions" ON practice_sessions;

-- RLS Policy: Users can only view their own sessions
CREATE POLICY "Users can view their own sessions"
  ON practice_sessions FOR SELECT
  USING (auth.uid() = user_id);

-- RLS Policy: Users can insert their own sessions
CREATE POLICY "Users can insert their own sessions"
  ON practice_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Service role can manage all sessions (for admin operations)
CREATE POLICY "Service role can manage all sessions"
  ON practice_sessions FOR ALL
  USING (auth.role() = 'service_role');
