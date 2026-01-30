#!/usr/bin/env node

/**
 * Import clips-v2.csv into Supabase curated_clips table
 * 
 * This script loads 300 practice clips with natural, authentic speech patterns
 * covering CEFR levels A1-C2 across all situations.
 * 
 * Usage:
 *   npm run import-clips-v2
 * 
 * Prerequisites:
 *   - .env.local with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 *   - data/clips-v2.csv file exists
 */

import { config } from 'dotenv'
import { resolve } from 'path'
import { readFileSync } from 'fs'
import { getSupabaseAdminClient } from '@/lib/supabase/server'

// Load .env.local
config({ path: resolve(process.cwd(), '.env.local') })

interface ClipCSVRow {
  id: string
  transcript: string
  difficulty_cefr: string  // CSV column name (maps to "cefr" in DB)
  focus_areas: string  // CSV format: "idiom,connected_speech"
  situation: string
  length_sec: string
  clip_type: string
  content_type: string  // CSV only - not used in DB
}

/**
 * Simple CSV parser that handles quoted fields with commas
 */
function parseCSV(content: string): ClipCSVRow[] {
  const lines = content.trim().split('\n')
  const headers = lines[0].split(',').map(h => h.trim())
  const rows: ClipCSVRow[] = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    const values: string[] = []
    let current = ''
    let inQuotes = false

    for (let j = 0; j < line.length; j++) {
      const char = line[j]
      
      if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    values.push(current.trim()) // Last value

    if (values.length === headers.length) {
      const row: any = {}
      headers.forEach((header, idx) => {
        row[header] = values[idx].replace(/^"|"$/g, '') // Remove surrounding quotes
      })
      rows.push(row as ClipCSVRow)
    }
  }

  return rows
}

/**
 * Main import function
 */
async function importClipsV2() {
  console.log('🚀 Starting Clips V2 Import\n')
  
  // Read CSV file
  console.log('📂 Reading data/clips-v2.csv...')
  const csvFilePath = resolve(process.cwd(), 'data/clips-v2.csv')
  const csvContent = readFileSync(csvFilePath, 'utf-8')
  const records = parseCSV(csvContent)
  
  console.log(`📊 Found ${records.length} clips to import\n`)
  
  // Get Supabase client
  const supabase = getSupabaseAdminClient()
  
  // Transform CSV data to match curated_clips table schema
  const clipsToInsert = records.map(record => {
    const focusAreasArray = record.focus_areas
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
    
    return {
      id: record.id,
      transcript: record.transcript,
      cefr: record.difficulty_cefr, // CSV column "difficulty_cefr" → DB column "cefr"
      focus_areas: focusAreasArray,  // Convert CSV string to array
      situation: record.situation,
      length_sec: parseFloat(record.length_sec),
      clip_type: record.clip_type,
      approved: true, // Required field - mark all v2 clips as approved
      // Note: Only include columns that exist in the database schema
      // patterns: removed - column doesn't exist
      // semantic_structure: removed - column doesn't exist
    }
  })
  
  // Show sample clip
  console.log('🔍 Sample clip (first record):')
  console.log(JSON.stringify(clipsToInsert[0], null, 2))
  console.log()
  
  // Insert in batches to avoid timeouts
  const batchSize = 50
  let inserted = 0
  let errors = 0
  const errorDetails: Array<{ batch: number; error: any }> = []
  
  for (let i = 0; i < clipsToInsert.length; i += batchSize) {
    const batch = clipsToInsert.slice(i, i + batchSize)
    const batchNumber = Math.floor(i / batchSize) + 1
    const totalBatches = Math.ceil(clipsToInsert.length / batchSize)
    
    console.log(`📤 Inserting batch ${batchNumber}/${totalBatches} (${batch.length} clips)...`)
    
    const { data, error } = await supabase
      .from('curated_clips')
      .upsert(batch, { onConflict: 'id' }) // Use upsert to update if ID exists
    
    if (error) {
      console.error(`❌ Error in batch ${batchNumber}:`, error.message)
      errors += batch.length
      errorDetails.push({ batch: batchNumber, error })
    } else {
      inserted += batch.length
      console.log(`✅ Batch ${batchNumber} complete (Total: ${inserted}/${clipsToInsert.length})`)
    }
  }
  
  console.log('\n' + '='.repeat(60))
  console.log('📊 IMPORT SUMMARY')
  console.log('='.repeat(60))
  console.log(`✅ Successfully inserted: ${inserted}`)
  console.log(`❌ Failed: ${errors}`)
  console.log(`📝 Total clips: ${clipsToInsert.length}`)
  console.log('='.repeat(60))
  
  // Show error details if any
  if (errorDetails.length > 0) {
    console.log('\n❌ Error Details:')
    errorDetails.forEach(({ batch, error }) => {
      console.log(`\nBatch ${batch}:`)
      console.log(error)
    })
  }
  
  // Verify total count in database
  console.log('\n🔍 Verifying database state...')
  
  const { count: totalPracticeClips, error: countError } = await supabase
    .from('curated_clips')
    .select('*', { count: 'exact', head: true })
    .eq('clip_type', 'practice')
  
  if (countError) {
    console.error('❌ Error counting clips:', countError)
  } else {
    console.log(`✅ Total practice clips in database: ${totalPracticeClips}`)
  }
  
  // Show CEFR distribution
  const cefrLevels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
  console.log('\n📊 CEFR Distribution:')
  for (const level of cefrLevels) {
    const { count, error } = await supabase
      .from('curated_clips')
      .select('*', { count: 'exact', head: true })
      .eq('clip_type', 'practice')
      .eq('cefr', level)
    
    if (!error) {
      const percentage = totalPracticeClips ? ((count! / totalPracticeClips) * 100).toFixed(1) : '0.0'
      console.log(`  ${level}: ${count} clips (${percentage}%)`)
    }
  }
  
  // Show situation distribution
  console.log('\n📊 Situation Distribution:')
  const situations = ['work', 'daily', 'travel', 'media', 'formal']
  for (const situation of situations) {
    const { count, error } = await supabase
      .from('curated_clips')
      .select('*', { count: 'exact', head: true })
      .eq('clip_type', 'practice')
      .eq('situation', situation)
    
    if (!error && count! > 0) {
      console.log(`  ${situation}: ${count} clips`)
    }
  }
  
  console.log('\n✅ Import verification complete!')
}

// Execute import
importClipsV2()
  .then(() => {
    console.log('\n🎉 Import process finished successfully!')
    process.exit(0)
  })
  .catch(error => {
    console.error('\n💥 Import failed with error:')
    console.error(error)
    process.exit(1)
  })

