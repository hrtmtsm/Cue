#!/usr/bin/env node

/**
 * Check curated_clips table for NULL or empty id fields
 * 
 * Usage:
 *   npx tsx scripts/checkCuratedClipsIds.ts
 */

import { config } from 'dotenv'
import { resolve } from 'path'
import { getSupabaseAdminClient } from '@/lib/supabase/server'

// Load .env.local
config({ path: resolve(process.cwd(), '.env.local') })

async function checkClipIds() {
  console.log('🔍 Checking curated_clips table for NULL or empty id fields...\n')
  
  const supabase = getSupabaseAdminClient()
  
  // First, check table structure
  console.log('📋 Checking table structure...')
  let columns: any[] | null = null
  let columnsError: any = null
  
  try {
    const result = await supabase.rpc('exec_sql', {
      query: `
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'curated_clips'
        ORDER BY ordinal_position;
      `
    })
    columns = result.data
    columnsError = result.error
  } catch {
    // Fallback: try direct query
    const { data, error } = await supabase
      .from('curated_clips')
      .select('*')
      .limit(1)
    
    if (data && data.length > 0) {
      console.log('📋 Table columns (from sample row):', Object.keys(data[0]))
      columns = Object.keys(data[0]).map(k => ({ column_name: k }))
      columnsError = null
    } else {
      columns = null
      columnsError = error
    }
  }
  
  const hasUserId = columns?.some((c: any) => c.column_name === 'user_id') || false
  console.log(`  Has user_id column: ${hasUserId}\n`)
  
  // Fetch all clips (with or without user_id)
  const selectFields = hasUserId 
    ? 'id, transcript, user_id, created_at'
    : 'id, transcript, created_at'
  
  const { data: allClips, error: fetchError } = await supabase
    .from('curated_clips')
    .select(selectFields)
    .order('created_at', { ascending: false })
  
  if (fetchError) {
    console.error('❌ Error fetching clips:', fetchError)
    process.exit(1)
  }
  
  if (!allClips || allClips.length === 0) {
    console.log('⚠️ No clips found in curated_clips table')
    return
  }
  
  console.log(`✅ Fetched ${allClips.length} clips from curated_clips\n`)
  
  // Check for NULL or empty IDs
  const invalidClips = (allClips as any[]).filter(clip => 
    clip && typeof clip === 'object' && (!clip.id || clip.id.trim() === '')
  )
  
  if (invalidClips.length > 0) {
    console.error(`❌ Found ${invalidClips.length} clips with NULL or empty id:\n`)
    invalidClips.forEach((clip, index) => {
      console.error(`  ${index + 1}. ID: "${clip.id}"`, {
        transcript: clip.transcript?.substring(0, 50) + '...',
        user_id: clip.user_id,
        created_at: clip.created_at,
      })
    })
  } else {
    console.log('✅ All clips have valid id fields\n')
  }
  
  // Check for duplicate IDs
  const idCounts = new Map<string, number>()
  allClips.forEach(clip => {
    if (clip.id) {
      idCounts.set(clip.id, (idCounts.get(clip.id) || 0) + 1)
    }
  })
  
  const duplicates = Array.from(idCounts.entries()).filter(([_, count]) => count > 1)
  if (duplicates.length > 0) {
    console.error(`❌ Found ${duplicates.length} duplicate IDs:\n`)
    duplicates.forEach(([id, count]) => {
      console.error(`  ID: "${id}" appears ${count} times`)
    })
  } else {
    console.log('✅ No duplicate IDs found\n')
  }
  
  // Show sample of valid IDs
  const validClips = allClips.filter(clip => clip.id && clip.id.trim() !== '')
  if (validClips.length > 0) {
    console.log('📋 Sample of valid clip IDs (first 10):')
    validClips.slice(0, 10).forEach((clip, index) => {
      console.log(`  ${index + 1}. "${clip.id}" - ${clip.transcript?.substring(0, 40)}...`)
    })
  }
  
  // Summary
  console.log('\n' + '='.repeat(50))
  console.log('Summary:')
  console.log(`  Total clips: ${allClips.length}`)
  console.log(`  Valid IDs: ${validClips.length}`)
  console.log(`  Invalid IDs: ${invalidClips.length}`)
  console.log(`  Duplicate IDs: ${duplicates.length}`)
}

checkClipIds().catch(error => {
  console.error('❌ Unexpected error:', error)
  process.exit(1)
})
