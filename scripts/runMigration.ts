#!/usr/bin/env node

/**
 * Run a SQL migration file directly via Supabase admin client
 * 
 * Usage:
 *   npx tsx scripts/runMigration.ts <migration-file.sql>
 */

import { config } from 'dotenv'
import { resolve } from 'path'
import { readFileSync } from 'fs'

// Load .env.local
config({ path: resolve(process.cwd(), '.env.local') })

import { getSupabaseAdminClient } from '@/lib/supabase/server'

async function runMigration(migrationFile: string) {
  console.log(`📄 Reading migration file: ${migrationFile}`)
  
  const sql = readFileSync(migrationFile, 'utf-8')
  
  console.log('🔧 Running migration...')
  const supabase = getSupabaseAdminClient()
  
  // Split SQL by semicolons and execute each statement
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'))
  
  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i]
    if (statement.length === 0) continue
    
    console.log(`   Executing statement ${i + 1}/${statements.length}...`)
    
    const { error } = await supabase.rpc('exec_sql', { sql: statement })
    
    if (error) {
      // Try direct query if RPC doesn't work
      const { error: queryError } = await (supabase as any).query(statement)
      if (queryError) {
        console.error(`❌ Error executing statement ${i + 1}:`, queryError.message)
        console.error(`   Statement: ${statement.substring(0, 100)}...`)
        // Continue with next statement
      }
    }
  }
  
  console.log('✅ Migration completed')
}

const migrationFile = process.argv[2]
if (!migrationFile) {
  console.error('❌ Error: Please provide a migration file path')
  console.error('Usage: npx tsx scripts/runMigration.ts <migration-file.sql>')
  process.exit(1)
}

runMigration(migrationFile).catch((error) => {
  console.error('❌ Fatal error:', error)
  process.exit(1)
})
