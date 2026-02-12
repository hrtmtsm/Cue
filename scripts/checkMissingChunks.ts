import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

async function checkMissingChunks() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!url || !key) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }
  
  const supabase = createClient(url, key)
  
  console.log('🔍 Checking which clips have chunks...\n')
  
  // Get all practice clips from curated_clips
  const { data: allClips, error: clipsError } = await supabase
    .from('curated_clips')
    .select('id')
    .neq('clip_type', 'diagnostic')
    .order('id')
  
  if (clipsError) {
    console.error('❌ Error fetching clips:', clipsError)
    return
  }
  
  console.log(`📊 Total practice clips in curated_clips: ${allClips?.length || 0}`)
  
  // Get DISTINCT clip IDs from clip_chunk_spans using pagination to avoid 1000-row limit
  const clipIdsWithChunks = new Set<string>()
  let page = 0
  const pageSize = 1000
  
  while (true) {
    const { data: chunkPage, error: chunkedError } = await supabase
      .from('clip_chunk_spans')
      .select('clip_id')
      .range(page * pageSize, (page + 1) * pageSize - 1)
    
    if (chunkedError) {
      console.error('❌ Error fetching chunked clips:', chunkedError)
      return
    }
    
    if (!chunkPage || chunkPage.length === 0) {
      break // No more rows
    }
    
    chunkPage.forEach(row => clipIdsWithChunks.add(row.clip_id))
    
    if (chunkPage.length < pageSize) {
      break // Last page
    }
    
    page++
  }
  
  console.log(`✅ Clips with chunks: ${clipIdsWithChunks.size}`)
  
  // Find clips without chunks
  const clipsWithoutChunks = allClips?.filter(clip => !clipIdsWithChunks.has(clip.id)) || []
  console.log(`❌ Clips WITHOUT chunks: ${clipsWithoutChunks.length}\n`)
  
  if (clipsWithoutChunks.length > 0) {
    console.log('📋 First 20 clips missing chunks:')
    clipsWithoutChunks.slice(0, 20).forEach((clip, i) => {
      console.log(`  ${i + 1}. ${clip.id}`)
    })
    
    if (clipsWithoutChunks.length > 20) {
      console.log(`  ... and ${clipsWithoutChunks.length - 20} more`)
    }
    
    console.log('\n💡 To process missing clips, run:')
    console.log('   npx tsx scripts/bulkChunkClips.ts')
  } else {
    console.log('🎉 All clips have chunks!')
  }
}

checkMissingChunks().catch(console.error)
