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

async function checkDistribution() {
  console.log('\n🔍 Checking variant distribution...\n')

  // Get sample with metadata
  const { data: sample } = await supabase
    .from('clip_audio_variants')
    .select('clip_id, variants_count, variant_metadata')
    .order('clip_id')
    .limit(20)

  console.log('📋 Sample variants (first 20):')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  sample?.forEach(v => {
    const metadata = (v.variant_metadata as any[]) || []
    if (metadata.length > 0) {
      metadata.forEach((m: any, idx: number) => {
        console.log(`Clip: ${v.clip_id.padEnd(25)} | Variant: ${idx} | Voice: ${m.voice || 'N/A'}`)
      })
    } else {
      console.log(`Clip: ${v.clip_id.padEnd(25)} | Variants: ${v.variants_count}`)
    }
  })

  // Get all and use variants_count
  const { data: all } = await supabase
    .from('clip_audio_variants')
    .select('clip_id, variants_count')

  const counts: number[] = []
  all?.forEach(v => {
    counts.push(v.variants_count || 0)
  })

  console.log('\n📊 Variants per clip distribution:')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('Clips with 1 variant: ', counts.filter(c => c === 1).length)
  console.log('Clips with 2 variants:', counts.filter(c => c === 2).length)
  console.log('Clips with 3 variants:', counts.filter(c => c === 3).length)
  console.log('Clips with 4 variants:', counts.filter(c => c === 4).length)
  console.log('Clips with 5 variants:', counts.filter(c => c === 5).length)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
}

checkDistribution().catch((error) => {
  console.error('❌ Fatal error:', error)
  process.exit(1)
})
