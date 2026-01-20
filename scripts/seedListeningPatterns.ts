#!/usr/bin/env node

/**
 * Seed script for listening_patterns table
 * 
 * Reads patterns from lib/listeningPatterns.ts and upserts them into Supabase.
 * Uses pattern_key (from local pattern.id) as the unique key.
 * 
 * Usage:
 *   npm run seed:patterns           # Dry run (default)
 *   npm run seed:patterns -- --yes  # Actually write to DB
 */

import { config } from 'dotenv'
import { resolve } from 'path'

// Load .env.local
config({ path: resolve(process.cwd(), '.env.local') })

import { createClient } from '@supabase/supabase-js'
import { LISTENING_PATTERNS, type ListeningPattern } from '../lib/listeningPatterns'

// Environment variables
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

interface SupabasePatternRow {
  pattern_key: string
  words: string[]
  chunk_display: string
  reduced_form: string | null
  parent_pattern_key: string | null
  how_it_sounds: string
  tip: string | null
  priority: number
  is_active: boolean
  // Legacy columns (kept for backward compatibility, populated from words[])
  focus: string
  left1: string | null
  right1: string | null
  right2: string | null
}

/**
 * Validate pattern consistency
 * Checks that word count matches pattern_key (id) structure
 * Example: "want-to" should have 2 words, "want-to-go" should have 3 words
 */
function validatePattern(pattern: ListeningPattern): void {
  if (pattern.words.length === 0) {
    throw new Error(`Pattern "${pattern.id}" has empty words array`)
  }
  
  const wordCount = pattern.words.length
  const keyParts = pattern.id.split('-')
  const expectedWordCount = keyParts.length
  
  if (wordCount !== expectedWordCount) {
    throw new Error(
      `Pattern "${pattern.id}" has ${wordCount} words but id suggests ${expectedWordCount} words. ` +
      `Words: [${pattern.words.join(', ')}], Id parts: [${keyParts.join(', ')}]`
    )
  }
}

/**
 * Convert local pattern to DB format
 * 
 * New schema (sequence-based):
 * - Uses words[] array directly (no conversion complexity)
 * - Legacy columns (focus, left1, right1, right2) are populated from words[] for backward compatibility
 * 
 * Local: { id, words[], chunkDisplay, howItSounds, tip, priority }
 * DB:    { pattern_key, words[], chunk_display, how_it_sounds, tip, priority, is_active }
 * 
 * Legacy columns are populated from words[]:
 * - focus = words[0] (first word, for indexing)
 * - left1 = words.length > 1 && words[1] exists ? words[0] : null (only if pattern starts before focus)
 * - right1 = words[1] || null (second word)
 * - right2 = words[2] || null (third word)
 * 
 * Actually, looking at the local patterns, they're all forward-ordered:
 * - ['went', 'to', 'the'] - all words in order
 * - ['want', 'to'] - all words in order
 * - ['a', 'lot', 'of'] - all words in order
 * 
 * So we'll use: focus = words[0], right1 = words[1], right2 = words[2], left1 = null
 * (This matches the simpler interpretation where patterns don't have left context)
 */
function convertLocalToDb(pattern: ListeningPattern): SupabasePatternRow {
  const { id, words, chunkDisplay, reducedForm, parentPatternKey, howItSounds, tip, priority } = pattern
  
  if (words.length === 0) {
    throw new Error(`Pattern ${id} has empty words array`)
  }
  
  // Primary: use words[] directly
  // Legacy: populate focus, left1, right1, right2 for backward compatibility
  // For local patterns, we assume they're forward-ordered (no left context)
  const focus = words[0]
  const left1 = null // Local patterns don't have left context
  const right1 = words.length > 1 ? words[1] : null
  const right2 = words.length > 2 ? words[2] : null
  
  return {
    pattern_key: id,
    words, // Primary: use words[] array directly
    chunk_display: chunkDisplay,
    reduced_form: reducedForm || null,
    parent_pattern_key: parentPatternKey || null,
    how_it_sounds: howItSounds,
    tip: tip || null,
    priority,
    is_active: true,
    // Legacy columns for backward compatibility
    focus,
    left1,
    right1,
    right2,
  }
}

/**
 * Main seed function
 */
async function seedPatterns(dryRun: boolean = true) {
  // Safety check: ensure we're in Node.js environment
  if (typeof window !== 'undefined') {
    throw new Error('This script must be run in Node.js, not in a browser')
  }
  
  // Check environment variables
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'Missing environment variables. Required:\n' +
      '  NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL\n' +
      '  SUPABASE_SERVICE_ROLE_KEY\n' +
      '\nSet these in .env.local or export them before running the script.'
    )
  }
  
  // Type assertion: After validation, we know these are defined
  const SUPABASE_URL_VALIDATED = SUPABASE_URL as string
  const SUPABASE_SERVICE_ROLE_KEY_VALIDATED = SUPABASE_SERVICE_ROLE_KEY as string
  
  // Initialize Supabase client
  const supabase = createClient(SUPABASE_URL_VALIDATED, SUPABASE_SERVICE_ROLE_KEY_VALIDATED, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
  
  console.log(`\n🌱 Seeding listening_patterns table${dryRun ? ' (DRY RUN)' : ''}\n`)
  console.log(`Supabase URL: ${SUPABASE_URL}`)
  console.log(`Patterns to process: ${LISTENING_PATTERNS.length}\n`)
  
  // Validate and convert local patterns to DB format
  const dbPatterns = LISTENING_PATTERNS.map(pattern => {
    try {
      // Validate pattern consistency before conversion
      validatePattern(pattern)
      return convertLocalToDb(pattern)
    } catch (error) {
      console.error(`❌ Error processing pattern ${pattern.id}:`, error)
      throw error
    }
  })
  
  // Show conversion preview
  console.log('Preview (first 3 patterns):')
  dbPatterns.slice(0, 3).forEach(p => {
    console.log(`  ${p.pattern_key}: words=[${p.words.join(', ')}], priority=${p.priority}`)
  })
  console.log()
  
  if (dryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made to the database')
    console.log(`\nWould ${dbPatterns.length === 0 ? 'skip' : 'upsert'} ${dbPatterns.length} patterns`)
    console.log(`\nTo actually write to the database, run:`)
    console.log(`  npm run seed:patterns -- --yes\n`)
    return
  }
  
  // Query existing pattern_keys first to determine inserts vs updates
  console.log('📋 Checking existing patterns...\n')
  
  const { data: existingPatterns, error: queryError } = await supabase
    .from('listening_patterns')
    .select('pattern_key')
  
  if (queryError) {
    throw new Error(`Failed to query existing patterns: ${queryError.message}`)
  }
  
  const existingKeys = new Set((existingPatterns || []).map(p => p.pattern_key))
  
  // Upsert patterns
  console.log('📝 Upserting patterns...\n')
  
  const results = {
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
  }
  
  const insertedKeys: string[] = []
  const updatedKeys: string[] = []
  const errorKeys: string[] = []
  
  for (const pattern of dbPatterns) {
    try {
      const isNew = !existingKeys.has(pattern.pattern_key)
      
      // Use upsert with pattern_key as conflict target
      const { data, error } = await supabase
        .from('listening_patterns')
        .upsert(
          {
            pattern_key: pattern.pattern_key,
            words: pattern.words, // Primary: words[] array
            chunk_display: pattern.chunk_display,
            reduced_form: pattern.reduced_form,
            how_it_sounds: pattern.how_it_sounds,
            tip: pattern.tip,
            priority: pattern.priority,
            is_active: pattern.is_active,
            // Legacy columns for backward compatibility
            focus: pattern.focus,
            left1: pattern.left1,
            right1: pattern.right1,
            right2: pattern.right2,
          },
          {
            onConflict: 'pattern_key',
            ignoreDuplicates: false,
          }
        )
      
      if (error) {
        console.error(`❌ Error upserting ${pattern.pattern_key}:`, error.message)
        results.errors++
        errorKeys.push(pattern.pattern_key)
        continue
      }
      
      // Track based on whether pattern_key existed before
      if (isNew) {
        results.inserted++
        insertedKeys.push(pattern.pattern_key)
      } else {
        results.updated++
        updatedKeys.push(pattern.pattern_key)
      }
    } catch (error) {
      console.error(`❌ Unexpected error processing ${pattern.pattern_key}:`, error)
      results.errors++
      errorKeys.push(pattern.pattern_key)
    }
  }
  
  // Print summary
  console.log('\n' + '='.repeat(60))
  console.log('📊 SEED SUMMARY')
  console.log('='.repeat(60))
  console.log(`✅ Inserted: ${results.inserted}`)
  console.log(`📝 Updated:   ${results.updated}`)
  console.log(`⏭️  Skipped:   ${results.skipped}`)
  console.log(`❌ Errors:    ${results.errors}`)
  console.log()
  
  if (insertedKeys.length > 0) {
    console.log(`Inserted keys (first 10):`)
    insertedKeys.slice(0, 10).forEach(key => console.log(`  - ${key}`))
    if (insertedKeys.length > 10) {
      console.log(`  ... and ${insertedKeys.length - 10} more`)
    }
    console.log()
  }
  
  if (updatedKeys.length > 0) {
    console.log(`Updated keys (first 10):`)
    updatedKeys.slice(0, 10).forEach(key => console.log(`  - ${key}`))
    if (updatedKeys.length > 10) {
      console.log(`  ... and ${updatedKeys.length - 10} more`)
    }
    console.log()
  }
  
  if (errorKeys.length > 0) {
    console.log(`❌ Error keys:`)
    errorKeys.forEach(key => console.log(`  - ${key}`))
    console.log()
  }
  
  console.log('='.repeat(60) + '\n')
}

// Main execution
const args = process.argv.slice(2)
const dryRun = !args.includes('--yes')

seedPatterns(dryRun)
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Fatal error:', error)
    process.exit(1)
  })

