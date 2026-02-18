#!/usr/bin/env node

/**
 * Migration Script: Generate Gemini TTS Audio Variants
 * 
 * This script fetches all clips from the curated_clips table and generates
 * 5 audio variants per clip using Gemini TTS. Variants are uploaded to
 * Vercel Blob and saved to the clip_audio_variants table.
 * 
 * Usage:
 *   npx tsx scripts/migrate-to-gemini-variants.ts
 * 
 * Options:
 *   --batch-size N    Process N clips at a time (default: 10)
 *   --offset N        Start from Nth clip (for resuming)
 *   --limit N         Only process N clips total
 *   --variants N      Generate N variants per clip (default: 5)
 *   --dry-run         Show what would be done without generating audio
 * 
 * Environment variables required:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   GOOGLE_CLOUD_CREDENTIALS_JSON (or GOOGLE_APPLICATION_CREDENTIALS)
 *   BLOB_READ_WRITE_TOKEN
 */

import { config } from 'dotenv'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'
import { generateGeminiTTS, GEMINI_VOICES, SPEECH_PROMPTS } from '../lib/gemini-tts'
import { validateAudio } from '../lib/audio-validation'
import { put } from '@vercel/blob'

// Load .env.local
config({ path: resolve(process.cwd(), '.env.local') })

// Parse CLI arguments
const args = process.argv.slice(2)
function getArg(name: string, defaultValue: number): number {
  const index = args.indexOf(`--${name}`)
  if (index !== -1 && args[index + 1]) {
    return parseInt(args[index + 1], 10)
  }
  return defaultValue
}
const isDryRun = args.includes('--dry-run')
const batchSize = getArg('batch-size', 10)
const startOffset = getArg('offset', 0)
const maxLimit = getArg('limit', 0) // 0 = no limit
const variantsCount = getArg('variants', 5)

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

// Check for Google Cloud credentials
if (!process.env.GOOGLE_CLOUD_CREDENTIALS_JSON && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('❌ Error: GOOGLE_CLOUD_CREDENTIALS_JSON or GOOGLE_APPLICATION_CREDENTIALS is required')
  process.exit(1)
}

// Check for Vercel Blob token
if (!process.env.BLOB_READ_WRITE_TOKEN && !isDryRun) {
  console.error('❌ Error: BLOB_READ_WRITE_TOKEN is required (unless --dry-run)')
  process.exit(1)
}

interface ClipRow {
  id: string
  transcript: string
}

async function migrateClips() {
  console.log('🚀 Gemini TTS Variant Migration')
  console.log('================================')
  console.log(`  Batch size: ${batchSize}`)
  console.log(`  Start offset: ${startOffset}`)
  console.log(`  Max limit: ${maxLimit || 'unlimited'}`)
  console.log(`  Variants per clip: ${variantsCount}`)
  console.log(`  Dry run: ${isDryRun}`)
  console.log('')

  // Fetch total clip count
  const { count: totalCount, error: countError } = await supabase
    .from('curated_clips')
    .select('id', { count: 'exact', head: true })

  if (countError) {
    console.error('❌ Failed to count clips:', countError)
    process.exit(1)
  }

  console.log(`📋 Total clips in database: ${totalCount}`)

  // Check which clips already have variants
  const { data: existingVariants, error: existingError } = await supabase
    .from('clip_audio_variants')
    .select('clip_id')

  const existingClipIds = new Set(
    (existingVariants || []).map((v: any) => v.clip_id)
  )
  console.log(`✅ Clips with existing variants: ${existingClipIds.size}`)
  console.log('')

  // Fetch clips in batches
  let processedCount = 0
  let successCount = 0
  let skipCount = 0
  let errorCount = 0
  let offset = startOffset

  while (true) {
    // Fetch a batch of clips
    let query = supabase
      .from('curated_clips')
      .select('id, transcript')
      .order('id', { ascending: true })
      .range(offset, offset + batchSize - 1)

    const { data: clips, error: fetchError } = await query

    if (fetchError) {
      console.error('❌ Failed to fetch clips:', fetchError)
      break
    }

    if (!clips || clips.length === 0) {
      console.log('✅ No more clips to process.')
      break
    }

    console.log(`\n📦 Batch: ${offset + 1}-${offset + clips.length} of ${totalCount}`)

    for (const clip of clips as ClipRow[]) {
      // Check limit
      if (maxLimit > 0 && processedCount >= maxLimit) {
        console.log(`\n⏹  Reached limit of ${maxLimit} clips.`)
        break
      }

      processedCount++

      // Skip if already has variants
      if (existingClipIds.has(clip.id)) {
        console.log(`  ⏭  [${processedCount}] Clip ${clip.id} - already has variants, skipping`)
        skipCount++
        continue
      }

      // Skip if no transcript
      if (!clip.transcript || clip.transcript.trim() === '') {
        console.log(`  ⚠️  [${processedCount}] Clip ${clip.id} - no transcript, skipping`)
        skipCount++
        continue
      }

      console.log(`  🎵 [${processedCount}] Clip ${clip.id} - "${clip.transcript.substring(0, 50)}..."`)

      if (isDryRun) {
        console.log(`    [DRY RUN] Would generate ${variantsCount} variants`)
        successCount++
        continue
      }

      try {
        const variantUrls: string[] = []
        const variantMeta: { voice: string; prompt: string }[] = []
        const MAX_RETRIES_PER_VARIANT = 3

        // Generate variants with validation + retry + rate-limit handling
        for (let i = 0; i < variantsCount; i++) {
          let generated = false

          for (let attempt = 1; attempt <= MAX_RETRIES_PER_VARIANT; attempt++) {
            let result
            try {
              result = await generateGeminiTTS({
                text: clip.transcript,
                voiceIndex: i % GEMINI_VOICES.length,
                promptIndex: i % SPEECH_PROMPTS.length,
              })
            } catch (genErr: any) {
              // Handle rate limit / quota errors with backoff
              if (genErr?.code === 8 || genErr?.message?.includes('RESOURCE_EXHAUSTED')) {
                const waitSec = 30 * attempt // 30s, 60s, 90s
                console.log(`    ⏳ Rate limited, waiting ${waitSec}s before retry ${attempt}/${MAX_RETRIES_PER_VARIANT}...`)
                await new Promise(resolve => setTimeout(resolve, waitSec * 1000))
                continue
              }
              throw genErr // Re-throw non-rate-limit errors
            }

            // Validate the generated audio
            const validation = validateAudio(result.audio, clip.transcript)

            if (!validation.valid) {
              const issueStr = validation.issues[0] || 'unknown'
              console.log(`    ⚠️  Variant ${i + 1} attempt ${attempt}/${MAX_RETRIES_PER_VARIANT}: ${issueStr}`)
              if (attempt < MAX_RETRIES_PER_VARIANT) {
                await new Promise(resolve => setTimeout(resolve, 4000))
                continue
              }
              // Last attempt failed — use it anyway but log warning
              console.log(`    ⚠️  Variant ${i + 1}: using best effort after ${MAX_RETRIES_PER_VARIANT} attempts`)
            }

            // Upload to Vercel Blob
            const blobPath = `audio/clips/${clip.id}/variant_${i}.mp3`
            const blob = await put(blobPath, result.audio, {
              access: 'public',
              contentType: 'audio/mpeg',
              allowOverwrite: true,
            })

            variantUrls.push(blob.url)
            variantMeta.push({ voice: result.voice, prompt: result.prompt })

            const status = validation.valid ? '✅' : '⚠️'
            console.log(`    ${status} Variant ${i + 1}/${variantsCount}: ${result.voice} (${(result.audio.length / 1024).toFixed(1)} KB, ~${validation.details.estimatedDurationSec.toFixed(1)}s)`)
            generated = true
            break
          }

          if (!generated) {
            console.log(`    ❌ Variant ${i + 1}: failed all attempts, skipping`)
          }

          // Rate limit delay (Gemini TTS has per-minute quotas)
          if (i < variantsCount - 1) {
            await new Promise(resolve => setTimeout(resolve, 5000))
          }
        }

        // Save to database
        const { error: saveError } = await supabase
          .from('clip_audio_variants')
          .upsert({
            clip_id: clip.id,
            variant_urls: variantUrls,
            variant_metadata: variantMeta,
            variants_count: variantUrls.length,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'clip_id',
          })

        if (saveError) {
          console.error(`    ❌ Failed to save variants:`, saveError.message)
          errorCount++
        } else {
          console.log(`    💾 Saved ${variantUrls.length} variants to database`)
          successCount++
          existingClipIds.add(clip.id)
        }

      } catch (error: any) {
        console.error(`    ❌ Error processing clip ${clip.id}:`, error.message)
        errorCount++
      }

      // Longer delay between clips to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 5000))
    }

    // Check limit
    if (maxLimit > 0 && processedCount >= maxLimit) {
      break
    }

    offset += batchSize
  }

  // Summary
  console.log('\n================================')
  console.log('🏁 Migration Complete!')
  console.log(`  Total processed: ${processedCount}`)
  console.log(`  ✅ Success: ${successCount}`)
  console.log(`  ⏭  Skipped: ${skipCount}`)
  console.log(`  ❌ Errors: ${errorCount}`)
  console.log('================================')
}

migrateClips().catch((error) => {
  console.error('❌ Fatal error:', error)
  process.exit(1)
})
