/* eslint-disable no-console */
/**
 * Swap chunks from v2 table to production via RPC
 * 
 * This is a thin wrapper around the swap_chunks_to_v2 RPC function
 * for safer batch swapping with verification
 * 
 * Usage:
 *   npx tsx scripts/swapChunksToV2.ts clip-123 clip-456 clip-789
 *   npx tsx scripts/swapChunksToV2.ts --from-file=clip-ids.txt
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
      console.error('❌ Usage: npx tsx scripts/swapChunksToV2.ts clip-123 clip-456 ...')
      console.error('   Or:     npx tsx scripts/swapChunksToV2.ts --from-file=clip-ids.txt')
      process.exit(1)
    }
  }
  
  console.log('🔄 Starting chunk swap to production...')
  console.log(`   Clips to swap: ${clipIds.length}`)
  console.log('─'.repeat(60))
  
  const SUPABASE_URL = getEnv('NEXT_PUBLIC_SUPABASE_URL') || getEnv('SUPABASE_URL')
  const SUPABASE_SERVICE_ROLE_KEY = getEnv('SUPABASE_SERVICE_ROLE_KEY')
  
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
  
  // Step 1: Verify v2 chunks exist
  console.log('📋 Step 1: Verifying v2 chunks exist...')
  const { data: verifyData, error: verifyError } = await supabase
    .rpc('verify_v2_chunks', { p_clip_ids: clipIds })
  
  if (verifyError) {
    console.error('❌ Verification failed:', verifyError.message)
    process.exit(1)
  }
  
  console.log('✅ Verification result:')
  console.log(`   Clips in v2:      ${verifyData.clips_in_v2}`)
  console.log(`   Chunks in v2:     ${verifyData.chunks_in_v2}`)
  console.log(`   Chunks in prod:   ${verifyData.chunks_in_prod}`)
  console.log(`   Ready to swap:    ${verifyData.ready_to_swap ? 'YES ✅' : 'NO ❌'}`)
  
  if (!verifyData.ready_to_swap) {
    console.error('\n❌ Not all clips have v2 chunks. Cannot proceed.')
    console.error('   Ensure all clip IDs have been processed by regenerateChunksV2.ts')
    process.exit(1)
  }
  
  // Step 2: Confirm swap
  console.log('\n⚠️  WARNING: This will REPLACE production chunks with v2 chunks.')
  console.log('   Backup will be created automatically.')
  console.log('   This action can be rolled back using restoreChunksFromBackup.ts')
  console.log('')
  
  // In a real script, you might add a confirmation prompt here
  // For now, we proceed directly
  
  // Step 3: Call swap RPC
  console.log('🔄 Step 2: Swapping chunks to production...')
  const { data: swapData, error: swapError } = await supabase
    .rpc('swap_chunks_to_v2', { p_clip_ids: clipIds })
  
  if (swapError) {
    console.error('❌ Swap failed:', swapError.message)
    console.error('   Transaction was rolled back - production table unchanged')
    process.exit(1)
  }
  
  console.log('\n' + '═'.repeat(60))
  console.log('✅ SWAP SUCCESSFUL')
  console.log('═'.repeat(60))
  console.log(`Clips swapped:     ${swapData.clip_count}`)
  console.log(`Backed up:         ${swapData.backed_up} chunks`)
  console.log(`Deleted:           ${swapData.deleted} old chunks`)
  console.log(`Inserted:          ${swapData.inserted} new chunks`)
  console.log('\n' + swapData.message)
  
  console.log('\n✅ Next steps:')
  console.log('   1. Test in UI: open practice page, check chunk dictionary')
  console.log('   2. Test "Why this is hard" insights')
  console.log('   3. If issues found, rollback with: npx tsx scripts/restoreChunksFromBackup.ts <clip-ids>')
  
  console.log('\n✅ Done')
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
