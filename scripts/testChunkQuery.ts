import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

async function testChunkQuery() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!url || !key) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }
  
  const supabase = createClient(url, key)
  
  console.log('🔍 Testing chunk query for clip-practice-028...\n')
  
  // First, let's check a clip that should have chunks
  const { data: sampleClips, error: sampleError } = await supabase
    .from('clip_chunk_spans')
    .select('clip_id')
    .limit(5)
  
  if (sampleError) {
    console.error('❌ Error getting sample clips:', sampleError)
  } else {
    console.log('📋 Sample clips with chunks:', sampleClips?.map(c => c.clip_id).join(', '))
  }
  
  // Test 1: Check if chunks exist for clip-practice-028
  const { data: chunks, error: chunksError } = await supabase
    .from('clip_chunk_spans')
    .select('*')
    .eq('clip_id', 'clip-practice-028')
    .limit(10)
  
  if (chunksError) {
    console.error('❌ Error querying chunks:', chunksError)
    return
  }
  
  console.log(`✅ Found ${chunks?.length || 0} chunks for clip-practice-028`)
  if (chunks && chunks.length > 0) {
    console.log('\nFirst 5 chunks:')
    chunks.slice(0, 5).forEach((chunk, i) => {
      console.log(`  ${i + 1}. "${chunk.chunk_text}" [${chunk.ref_start}, ${chunk.ref_end}]`)
    })
  } else {
    console.log('⚠️ No chunks found! Run: npx tsx scripts/bulkChunkClips.ts --only-ids=clip-practice-028')
    return
  }
  
  // Test 2: Test RPC function
  console.log('\n🔍 Testing get_clip_chunk_hit RPC function...\n')
  
  const testPositions = [0, 2, 8, 14, 19] // Different character positions
  
  for (const charIdx of testPositions) {
    const { data: rpcData, error: rpcError } = await supabase.rpc('get_clip_chunk_hit', {
      p_clip_id: 'clip-practice-028',
      p_char_idx: charIdx,
    })
    
    if (rpcError) {
      console.log(`  ❌ charIdx ${charIdx}: Error - ${rpcError.message}`)
    } else if (!rpcData || rpcData.length === 0) {
      console.log(`  ⚠️  charIdx ${charIdx}: No chunk found`)
    } else {
      const hit = rpcData[0]
      console.log(`  ✅ charIdx ${charIdx}: "${hit.chunk_text}" [${hit.ref_start}, ${hit.ref_end}]`)
    }
  }
  
  console.log('\n✅ Test complete')
}

testChunkQuery().catch(console.error)
