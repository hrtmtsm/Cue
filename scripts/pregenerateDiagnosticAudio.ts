/**
 * Pre-generate Audio for Diagnostic Clips
 * 
 * This script generates audio for all diagnostic clips and stores them
 * in the diagnostic_audio table (shared across all users).
 * 
 * Usage:
 *   npx tsx scripts/pregenerateDiagnosticAudio.ts
 */

import { resolve } from 'path'
import { config } from 'dotenv'
import { getSupabaseAdminClient } from '@/lib/supabase/server'
import OpenAI from 'openai'
import { put } from '@vercel/blob'

// Load .env.local
config({ path: resolve(process.cwd(), '.env.local') })

const VOICE = 'alloy' // Default voice for diagnostic clips

// Check environment variables before initializing OpenAI
if (!process.env.OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY environment variable is required')
  process.exit(1)
}

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error('❌ BLOB_READ_WRITE_TOKEN environment variable is required')
  process.exit(1)
}

// Initialize OpenAI (after env check)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

async function main() {
  console.log('🚀 Starting diagnostic audio pre-generation...')
  console.log('')
  
  const supabase = getSupabaseAdminClient()
  
  // 1. Fetch all diagnostic clips
  console.log('📋 Fetching diagnostic clips from curated_clips...')
  const { data: clips, error: clipsError } = await supabase
    .from('curated_clips')
    .select('id, transcript')
    .eq('clip_type', 'diagnostic')
    .order('id', { ascending: true })
  
  if (clipsError) {
    console.error('❌ Error fetching diagnostic clips:', clipsError)
    process.exit(1)
  }
  
  if (!clips || clips.length === 0) {
    console.warn('⚠️ No diagnostic clips found in database')
    process.exit(0)
  }
  
  console.log(`✅ Found ${clips.length} diagnostic clips`)
  console.log('')
  
  // 2. Process each clip
  let successCount = 0
  let skipCount = 0
  let errorCount = 0
  
  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i]
    const clipId = clip.id
    const transcript = clip.transcript
    const progress = `[${i + 1}/${clips.length}]`
    
    try {
      // Check if audio already exists in diagnostic_audio table
      const { data: existingAudio, error: checkError } = await supabase
        .from('diagnostic_audio')
        .select('id, status')
        .eq('clip_id', clipId)
        .maybeSingle()
      
      if (existingAudio && existingAudio.status === 'ready') {
        console.log(`${progress} ✅ Skip ${clipId} - audio already exists (status: ${existingAudio.status})`)
        skipCount++
        continue
      }
      
      if (existingAudio && existingAudio.status === 'generating') {
        console.log(`${progress} ⏳ Skip ${clipId} - audio is currently generating`)
        skipCount++
        continue
      }
      
      // Generate audio
      console.log(`${progress} 🎵 Generating audio for ${clipId}...`)
      
      // Call OpenAI TTS API
      const mp3 = await openai.audio.speech.create({
        model: 'tts-1',
        voice: VOICE,
        input: transcript,
      })
      
      // Convert to buffer
      const buffer = Buffer.from(await mp3.arrayBuffer())
      console.log(`${progress} ✅ Audio generated (${buffer.length} bytes)`)
      
      // Upload to Vercel Blob (allow overwrite for idempotency)
      const blobPath = `diagnostic-audio/${clipId}.mp3`
      const blob = await put(blobPath, buffer, {
        access: 'public',
        contentType: 'audio/mpeg',
        allowOverwrite: true, // Allow overwriting existing blobs
      })
      
      console.log(`${progress} ✅ Audio uploaded to blob storage`)
      
      // Store metadata in diagnostic_audio table
      const { error: upsertError } = await supabase
        .from('diagnostic_audio')
        .upsert({
          clip_id: clipId,
          audio_path: blob.url, // Store full https URL
          status: 'ready',
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'clip_id',
        })
      
      if (upsertError) {
        console.error(`${progress} ❌ Error storing audio in database:`, upsertError)
        errorCount++
      } else {
        console.log(`${progress} ✅ Audio stored in database`)
        successCount++
      }
      
      // Add small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500))
      
    } catch (error: any) {
      console.error(`${progress} ❌ Error processing clip ${clipId}:`, error.message)
      errorCount++
      
      // Try to mark as error in database
      try {
        await supabase
          .from('diagnostic_audio')
          .upsert({
            clip_id: clipId,
            audio_path: null,
            status: 'error',
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'clip_id',
          })
      } catch (dbError) {
        console.error(`${progress} ❌ Error updating database with error status:`, dbError)
      }
    }
    
    console.log('')
  }
  
  // Summary
  console.log('📊 Summary:')
  console.log(`   ✅ Generated: ${successCount}`)
  console.log(`   ⏭️  Skipped: ${skipCount}`)
  console.log(`   ❌ Errors: ${errorCount}`)
  console.log(`   📋 Total: ${clips.length}`)
  console.log('')
  console.log('✨ Done!')
}

main().catch((error) => {
  console.error('❌ Fatal error:', error)
  process.exit(1)
})
