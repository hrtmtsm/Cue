import { NextRequest, NextResponse } from 'next/server'
import { generateAndSaveClipVariants } from '@/lib/generate-clip-variants'
import { isGeminiTTSConfigured } from '@/lib/gemini-tts'

/**
 * Regenerate audio variants for a specific clip
 * 
 * POST /api/clips/regenerate-audio
 * Body: { clipId: string, transcript: string, variantsCount?: number }
 * 
 * This endpoint generates new Gemini TTS variants and saves them
 * to the clip_audio_variants table + Vercel Blob storage.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { clipId, transcript, variantsCount = 5 } = body

    if (!clipId || !transcript) {
      return NextResponse.json(
        { error: 'Missing clipId or transcript' },
        { status: 400 }
      )
    }

    if (!isGeminiTTSConfigured()) {
      return NextResponse.json(
        { error: 'Gemini TTS is not configured. Set GOOGLE_CLOUD_CREDENTIALS_JSON or GOOGLE_APPLICATION_CREDENTIALS.' },
        { status: 503 }
      )
    }

    console.log(`🔄 [Regenerate] Generating ${variantsCount} variants for clip ${clipId}...`)

    const variantUrls = await generateAndSaveClipVariants(clipId, transcript, variantsCount)

    console.log(`✅ [Regenerate] Generated ${variantUrls.length} variants for clip ${clipId}`)

    return NextResponse.json({
      success: true,
      clipId,
      variants: variantUrls,
      count: variantUrls.length,
    })
  } catch (error: any) {
    console.error('❌ [Regenerate] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to regenerate audio' },
      { status: 500 }
    )
  }
}
