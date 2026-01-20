#!/usr/bin/env node

/**
 * Seed script for meaning_general and meaning_status
 * 
 * Executes the SQL migration file that seeds Layer 1 meanings for common reduced forms.
 * 
 * Usage:
 *   npm run seed:meanings
 */

import { config } from 'dotenv'
import { resolve } from 'path'
import { readFileSync } from 'fs'

// Load .env.local
config({ path: resolve(process.cwd(), '.env.local') })

import { createClient } from '@supabase/supabase-js'

// Environment variables
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing required environment variables:')
  console.error('   - NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL')
  console.error('   - SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

// Type assertion: After validation, we know these are defined
const SUPABASE_URL_VALIDATED = SUPABASE_URL as string
const SUPABASE_SERVICE_ROLE_KEY_VALIDATED = SUPABASE_SERVICE_ROLE_KEY as string

async function seedMeanings() {
  const supabase = createClient(SUPABASE_URL_VALIDATED, SUPABASE_SERVICE_ROLE_KEY_VALIDATED)

  console.log('📝 Checking meaning_general seed status for reduced forms...')
  console.log('   SQL file: supabase/migrations/007_seed_meaning_general.sql\n')

  // Check if SQL execution is needed
  const sqlPath = resolve(process.cwd(), 'supabase/migrations/007_seed_meaning_general.sql')
  
  try {
    // Verification: Query patterns that should have meanings
    const { data, error } = await supabase
      .from('listening_patterns')
      .select('pattern_key, reduced_form, meaning_general, meaning_status')
      .in('reduced_form', ['gonna', 'wanna', 'gotta', 'kinda', 'lemme', 'gimme', 'hafta', 'outta', 'sorta'])
      .eq('meaning_status', 'general')

    if (error) {
      console.error('❌ Error verifying seed:', error)
      process.exit(1)
    }

    const updatedCount = data?.length || 0
    
    if (updatedCount > 0) {
      console.log(`✅ Found ${updatedCount} patterns with meaning_general:`)
      data?.forEach(pattern => {
        console.log(`   - ${pattern.pattern_key || 'N/A'} (reduced_form: ${pattern.reduced_form})`)
        console.log(`     meaning_general: ${pattern.meaning_general?.substring(0, 60)}...`)
      })
      console.log(`\n✅ All ${updatedCount} patterns have meaning_status='general'`)
    } else {
      console.log('⚠️  No patterns found with meaning_general set.')
      console.log('\n   To seed meanings, run the SQL file using one of these methods:')
      console.log('\n   1. Via Supabase CLI (recommended):')
      console.log('      supabase db execute --file supabase/migrations/007_seed_meaning_general.sql')
      console.log('\n   2. Via Supabase Dashboard:')
      console.log('      - Go to SQL Editor')
      console.log('      - Copy contents of supabase/migrations/007_seed_meaning_general.sql')
      console.log('      - Paste and execute')
      console.log('\n   3. Via psql (if connected):')
      console.log('      psql <connection_string> -f supabase/migrations/007_seed_meaning_general.sql')
      console.log('\n   Then re-run this script to verify: npm run seed:meanings')
    }

    // Also check for patterns that might need seeding (exist but don't have meaning yet)
    const { data: unseededData } = await supabase
      .from('listening_patterns')
      .select('pattern_key, reduced_form')
      .in('reduced_form', ['gonna', 'wanna', 'gotta', 'kinda', 'lemme', 'gimme', 'hafta', 'outta', 'sorta'])
      .or('meaning_status.is.null,meaning_status.eq.none')

    const unseededCount = unseededData?.length || 0
    if (unseededCount > 0 && updatedCount === 0) {
      console.log(`\n📋 Found ${unseededCount} patterns that could be seeded:`)
      unseededData?.slice(0, 5).forEach(pattern => {
        console.log(`   - ${pattern.pattern_key} (reduced_form: ${pattern.reduced_form})`)
      })
      if (unseededCount > 5) {
        console.log(`   ... and ${unseededCount - 5} more`)
      }
    }

  } catch (error) {
    console.error('❌ Error checking meanings:', error)
    process.exit(1)
  }
}

seedMeanings()

