/* eslint-disable no-console */
/**
 * Restore chunks from backup (rollback) via RPC
 * 
 * This is an emergency rollback script that restores chunks from the
 * clip_chunk_spans_backup table to production
 * 
 * Usage:
 *   npx tsx scripts/restoreChunksFromBackup.ts clip-123 clip-456 clip-789
 *   npx tsx scripts/restoreChunksFromBackup.ts --from-file=clip-ids.txt
 * 
 * Env vars required:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import fs from 'fs'
import { resolve } from 'path'
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

// Load .env.local
config({ path: resolve(process.cwd(), '.env.local') })

function getEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required env var: ${name}`)
  }
  return value
}

async function main() {
  const args = process.argv.slice(2)
  const fromFileArg = args.find(a => a.startsWith('--from-file='))?.split('=')[1]
  
  let clipIds: string[] = []
  
  if (fromFileArg) {
    // Load clip IDs from file (one per line)
    const content = fs.readFileSync(fromFileArg, 'utf8')
    clipIds = content.split('\n').map(line => line.trim()).filter(Boolean)
    console.log(`📂 Loaded ${clipIds.length} clip IDs from ${fromFileArg}`)
  } else {
    // Clip IDs from command line args
    clipIds = args.filter(arg => !arg.startsWith('--'))
    if (clipIds.length === 0) {
      console.error('❌ Usage: npx tsx scripts/restoreChunksFromBackup.ts clip-123 clip-456 ...')
      console.error('   Or:     npx tsx scripts/restoreChunksFromBackup.ts --from-file=clip-ids.txt')
      process.exit(1)
    }
  }
  
  console.log('🔙 Starting chunk restoration from backup...')
  console.log(`   Clips to restore: ${clipIds.length}`)
  console.log('─'.repeat(60))
  
  const SUPABASE_URL = getEnv('NEXT_PUBLIC_SUPABASE_URL') || getEnv('SUPABASE_URL')
  const SUPABASE_SERVICE_ROLE_KEY = getEnv('SUPABASE_SERVICE_ROLE_KEY')
  
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
  
  // Step 1: Verify backup exists
  console.log('📋 Step 1: Verifying backup exists...')
  const { data: backupData, error: backupError } = await supabase
    .from('clip_chunk_spans_backup')
    .select('clip_id, backed_up_at')
    .in('clip_id', clipIds)
  
  if (backupError) {
    console.error('❌ Error checking backup:', backupError.message)
    process.exit(1)
  }
  
  if (!backupData || backupData.length === 0) {
    console.error('❌ No backup found for these clip IDs')
    process.exit(1)
  }
  
  // Show backup info
  const backupsByClip = new Map<string, string>()
  backupData.forEach(row => {
    const existing = backupsByClip.get(row.clip_id)
    if (!existing || row.backed_up_at > existing) {
      backupsByClip.set(row.clip_id, row.backed_up_at)
    }
  })
  
  console.log('✅ Backup found:')
  console.log(`   Clips with backup: ${backupsByClip.size}/${clipIds.length}`)
  if (backupsByClip.size < clipIds.length) {
    const missing = clipIds.filter(id => !backupsByClip.has(id))
    console.error(`\n❌ Missing backup for: ${missing.join(', ')}`)
    process.exit(1)
  }
  
  // Show most recent backup time for each clip
  console.log('\n   Most recent backups:')
  Array.from(backupsByClip.entries()).slice(0, 5).forEach(([clipId, time]) => {
    console.log(`      ${clipId}: ${time}`)
  })
  if (backupsByClip.size > 5) {
    console.log(`      ... and ${backupsByClip.size - 5} more`)
  }
  
  // Step 2: Confirm restore
  console.log('\n⚠️  WARNING: This will REPLACE current production chunks with backup.')
  console.log('   Current chunks will be DELETED and cannot be recovered.')
  console.log('   Only proceed if you want to undo a recent swap.')
  console.log('')
  
  // In a real script, you might add a confirmation prompt here
  // For now, we proceed directly
  
  // Step 3: Call restore RPC
  console.log('🔄 Step 2: Restoring chunks from backup...')
  const { data: restoreData, error: restoreError } = await supabase
    .rpc('restore_chunks_from_backup', { p_clip_ids: clipIds })
  
  if (restoreError) {
    console.error('❌ Restore failed:', restoreError.message)
    console.error('   Transaction was rolled back - production table unchanged')
    process.exit(1)
  }
  
  console.log('\n' + '═'.repeat(60))
  console.log('✅ RESTORE SUCCESSFUL')
  console.log('═'.repeat(60))
  console.log(`Clips restored:    ${restoreData.clip_count}`)
  console.log(`Deleted:           ${restoreData.deleted} current chunks`)
  console.log(`Restored:          ${restoreData.restored} chunks from backup`)
  console.log('\n' + restoreData.message)
  
  console.log('\n✅ Next steps:')
  console.log('   1. Test in UI to verify old chunks are back')
  console.log('   2. Investigate what went wrong with the v2 chunks')
  console.log('   3. Fix the issue and re-run regenerateChunksV2.ts')
  
  console.log('\n✅ Done')
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
