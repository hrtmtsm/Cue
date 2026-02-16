/**
 * Clip Audio Variant Generator
 * 
 * Generates multiple audio variants per clip using Gemini TTS
 * with different voice/prompt combinations. Stores results in
 * Vercel Blob and saves variant URLs to the database.
 * 
 * Each variant uses a different voice + speech prompt to create
 * natural variation in how the same text sounds across sessions.
 */

import { generateGeminiTTS, GEMINI_VOICES, SPEECH_PROMPTS } from './gemini-tts'
import { put } from '@vercel/blob'
import { getSupabaseAdminClient } from '@/lib/supabase/server'

const DEFAULT_VARIANTS_COUNT = 5

export interface VariantInfo {
  url: string
  voice: string
  prompt: string
}

/**
 * Generate N audio variants for a clip and upload them to Vercel Blob
 * 
 * @param clipId - The clip ID
 * @param transcript - The text to synthesize
 * @param variantsCount - Number of variants to generate (default: 5)
 * @returns Array of variant URLs
 */
export async function generateClipVariants(
  clipId: string,
  transcript: string,
  variantsCount: number = DEFAULT_VARIANTS_COUNT
): Promise<VariantInfo[]> {
  const variants: VariantInfo[] = []

  console.log(`🎵 [Variants] Generating ${variantsCount} variants for clip ${clipId}...`)

  for (let i = 0; i < variantsCount; i++) {
    console.log(`  🔊 Variant ${i + 1}/${variantsCount}...`)

    // Generate audio with different voice/prompt combination
    // Cycle through voices and prompts for maximum variety
    const result = await generateGeminiTTS({
      text: transcript,
      voiceIndex: i % GEMINI_VOICES.length,
      promptIndex: i % SPEECH_PROMPTS.length,
    })

    // Upload to Vercel Blob
    const blobPath = `audio/clips/${clipId}/variant_${i}.mp3`
    const blob = await put(blobPath, result.audio, {
      access: 'public',
      contentType: 'audio/mpeg',
    })

    variants.push({
      url: blob.url,
      voice: result.voice,
      prompt: result.prompt,
    })

    console.log(`  ✅ Variant ${i + 1} saved: ${result.voice} (${(result.audio.length / 1024).toFixed(1)} KB)`)

    // Small delay between API calls to avoid rate limits
    if (i < variantsCount - 1) {
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }

  console.log(`✅ [Variants] Generated ${variants.length} variants for clip ${clipId}`)
  return variants
}

/**
 * Save clip variant URLs to the database
 * 
 * @param clipId - The clip ID
 * @param variants - Array of variant info objects
 */
export async function saveClipVariants(clipId: string, variants: VariantInfo[]): Promise<void> {
  const supabaseAdmin = getSupabaseAdminClient()

  const variantUrls = variants.map(v => v.url)

  // Try updating clip_audio_variants table first
  const { error } = await supabaseAdmin
    .from('clip_audio_variants')
    .upsert(
      {
        clip_id: clipId,
        variant_urls: variantUrls,
        variant_metadata: variants.map(v => ({ voice: v.voice, prompt: v.prompt })),
        variants_count: variants.length,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'clip_id',
      }
    )

  if (error) {
    console.error(`❌ [Variants] Failed to save variants for clip ${clipId}:`, error)
    throw new Error(`Failed to save variants: ${error.message}`)
  }

  console.log(`💾 [Variants] Saved ${variants.length} variant URLs for clip ${clipId}`)
}

/**
 * Get a random variant URL for a clip
 * Returns null if no variants exist
 */
export async function getRandomVariantUrl(clipId: string): Promise<string | null> {
  const supabaseAdmin = getSupabaseAdminClient()

  const { data, error } = await supabaseAdmin
    .from('clip_audio_variants')
    .select('variant_urls')
    .eq('clip_id', clipId)
    .single()

  if (error || !data?.variant_urls || !Array.isArray(data.variant_urls) || data.variant_urls.length === 0) {
    return null
  }

  // Random variant selection
  const randomIndex = Math.floor(Math.random() * data.variant_urls.length)
  return data.variant_urls[randomIndex]
}

/**
 * Get all variant URLs for a clip
 * Returns empty array if no variants exist
 */
export async function getClipVariants(clipId: string): Promise<string[]> {
  const supabaseAdmin = getSupabaseAdminClient()

  const { data, error } = await supabaseAdmin
    .from('clip_audio_variants')
    .select('variant_urls')
    .eq('clip_id', clipId)
    .single()

  if (error || !data?.variant_urls) {
    return []
  }

  return data.variant_urls
}

/**
 * Generate variants for a clip and save them to the database
 * Convenience function that combines generation and saving
 */
export async function generateAndSaveClipVariants(
  clipId: string,
  transcript: string,
  variantsCount: number = DEFAULT_VARIANTS_COUNT
): Promise<string[]> {
  const variants = await generateClipVariants(clipId, transcript, variantsCount)
  await saveClipVariants(clipId, variants)
  return variants.map(v => v.url)
}
