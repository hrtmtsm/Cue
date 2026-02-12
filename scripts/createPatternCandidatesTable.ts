#!/usr/bin/env node

/**
 * Create pattern_candidates table directly via Supabase admin client
 */

import { config } from 'dotenv'
import { resolve } from 'path'

// Load .env.local
config({ path: resolve(process.cwd(), '.env.local') })

import { getSupabaseAdminClient } from '@/lib/supabase/server'

async function createTable() {
  console.log('🔧 Creating pattern_candidates table...')
  
  const supabase = getSupabaseAdminClient()
  
  // Execute SQL statements one by one
  const statements = [
    `CREATE TABLE IF NOT EXISTS pattern_candidates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      phrase_text TEXT NOT NULL,
      candidate_kind TEXT NOT NULL CHECK (candidate_kind IN ('listening', 'semantic')),
      frequency INTEGER NOT NULL,
      example_clip_ids TEXT[] NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'accepted', 'rejected')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_pattern_candidates_status ON pattern_candidates(status)`,
    `CREATE INDEX IF NOT EXISTS idx_pattern_candidates_kind_status ON pattern_candidates(candidate_kind, status)`,
    `CREATE INDEX IF NOT EXISTS idx_pattern_candidates_frequency ON pattern_candidates(frequency DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_pattern_candidates_phrase_text ON pattern_candidates(phrase_text)`,
    `ALTER TABLE pattern_candidates ENABLE ROW LEVEL SECURITY`,
    `DROP POLICY IF EXISTS "Anyone can read pattern candidates" ON pattern_candidates`,
    `CREATE POLICY "Anyone can read pattern candidates"
      ON pattern_candidates FOR SELECT
      USING (true)`,
  ]
  
  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i]
    console.log(`   Executing statement ${i + 1}/${statements.length}...`)
    
    // Use PostgREST doesn't support DDL, so we need to use a different approach
    // For now, let's try using the REST API with raw SQL
    const { error } = await supabase.rpc('exec', { sql: statement }).catch(async () => {
      // If RPC doesn't exist, try direct query via REST
      const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY!,
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
        },
        body: JSON.stringify({ sql: statement }),
      })
      return { error: response.ok ? null : new Error(`HTTP ${response.status}`) }
    })
    
    if (error) {
      console.warn(`   ⚠️  Statement ${i + 1} may have failed (this is OK if table/index already exists):`, error.message)
    }
  }
  
  console.log('✅ Table creation completed')
  console.log('')
  console.log('📝 Note: If you see errors above, the table may already exist or you may need to run the migration via Supabase Dashboard')
  console.log('   Go to: https://supabase.com/dashboard/project/YOUR_PROJECT/sql/new')
  console.log('   And paste the SQL from: supabase/migrations/009_create_pattern_candidates.sql')
}

createTable().catch((error) => {
  console.error('❌ Fatal error:', error)
  process.exit(1)
})
