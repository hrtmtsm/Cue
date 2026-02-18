#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'path'

// Load .env.local
config({ path: resolve(process.cwd(), '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function checkStatus() {
  console.log('\n🔍 Checking Gemini TTS Migration Status...\n')

  // Get all variants and count unique clips
  const { data: allVariants } = await supabase
    .from('clip_audio_variants')
    .select('clip_id, variants_count')

  const uniqueClips = new Set(allVariants?.map(v => v.clip_id) || [])
  
  // Count clips with full 5 variants
  const clipsWithFullVariants = allVariants?.filter(v => v.variants_count === 5).length || 0
  const clipsWithPartialVariants = allVariants?.filter(v => v.variants_count > 0 && v.variants_count < 5).length || 0

  // Calculate total variant files (sum of variants_count)
  const totalVariantFiles = allVariants?.reduce((sum, v) => sum + (v.variants_count || 0), 0) || 0

  // Total clips in database
  const { count: totalClips } = await supabase
    .from('curated_clips')
    .select('*', { count: 'exact', head: true })

  // Calculate stats
  const expectedVariants = (totalClips || 0) * 5
  const missingVariants = expectedVariants - totalVariantFiles
  const clipsWithoutVariants = (totalClips || 0) - uniqueClips.size
  const percentComplete = totalClips && totalClips > 0 
    ? ((uniqueClips.size / totalClips) * 100).toFixed(1)
    : '0.0'

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📊 Migration Statistics')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`Total clips in DB:        ${totalClips}`)
  console.log(`Clips with variants:      ${uniqueClips.size}`)
  console.log(`  ├─ Full (5 variants):   ${clipsWithFullVariants}`)
  console.log(`  └─ Partial (<5):         ${clipsWithPartialVariants}`)
  console.log(`Clips without variants:   ${clipsWithoutVariants}`)
  console.log(`Total variant files:      ${totalVariantFiles} (${uniqueClips.size} clips × avg ${uniqueClips.size > 0 ? (totalVariantFiles / uniqueClips.size).toFixed(1) : 0})`)
  console.log(`Expected variant files:   ${expectedVariants} (${totalClips} × 5)`)
  console.log(`Missing variant files:    ${missingVariants}`)
  console.log(`Progress:                 ${percentComplete}%`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  if (missingVariants === 0 && clipsWithoutVariants === 0) {
    console.log('✅ Migration complete! All clips have 5 variants.\n')
  } else {
    console.log(`⚠️  ${clipsWithoutVariants} clips need variants, ${missingVariants} variants still need to be generated.\n`)
    console.log('Run: npx tsx scripts/migrate-to-gemini-variants.ts\n')
  }
}

checkStatus().catch((error) => {
  console.error('❌ Fatal error:', error)
  process.exit(1)
})
