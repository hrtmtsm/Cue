import { NextRequest } from 'next/server'
import { getSupabaseAdminClient } from '@/lib/supabase/server'
import { resolveUserId } from '@/lib/supabase/resolveUserId'
import { generateTextHash } from '@/lib/audioHash'
import { generateGeminiTTS, isGeminiTTSConfigured } from '@/lib/gemini-tts'
import { getRandomVariantUrl } from '@/lib/generate-clip-variants'
import { getCachedAudio, setCachedAudio, getCacheKey } from '@/lib/audio-cache'

/**
 * Stream/serve audio for a clip
 * 
 * Priority order:
 * 1. Pre-generated Gemini variants (from clip_audio_variants table)
 * 2. In-memory session cache
 * 3. Legacy cached audio (from clip_audio table / Vercel Blob)
 * 4. On-demand Gemini TTS generation
 * 5. OpenAI TTS fallback
 */
export async function GET(request: NextRequest) {
  let clipId: string | undefined
  let userId: string | undefined
  
  try {
    console.log('🎵 [Audio Stream] Request started')
    
    // Resolve userId (authenticated user or dev guest)
    let userIdResolved: { userId: string; source: 'auth' | 'dev_guest' }
    try {
      userIdResolved = await resolveUserId(request)
      userId = userIdResolved.userId
      console.log('✅ [Audio Stream] User resolved:', {
        userId: userId.substring(0, 8) + '...',
        source: userIdResolved.source,
      })
    } catch (error: any) {
      console.error('🚫 [Audio Stream] Failed to resolve user:', error.message)
      return new Response(
        JSON.stringify({ 
          error: 'Unauthorized',
          code: 'AUTH_REQUIRED',
          message: error.message || 'Authentication required.'
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }
    
    const { searchParams } = new URL(request.url)
    clipId = searchParams.get('clipId') || undefined
    const transcript = searchParams.get('transcript')
    const variantKey = searchParams.get('variantKey') || 'clean_normal'

    if (!clipId || !transcript) {
      return new Response(
        JSON.stringify({ 
          error: 'Missing clipId or transcript',
          code: 'MISSING_FIELDS',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    console.log('📝 [Audio Stream] Request details:', {
      clipId,
      variantKey,
      transcriptLength: transcript.length,
    })

    // ──────────────────────────────────────────────
    // Strategy 1: Check pre-generated Gemini variants
    // ──────────────────────────────────────────────
    try {
      const variantUrl = await getRandomVariantUrl(clipId)
      if (variantUrl) {
        console.log('✅ [Audio Stream] Redirecting to Gemini variant:', variantUrl.substring(0, 80) + '...')
        return Response.redirect(variantUrl, 302)
      }
    } catch (variantError: any) {
      console.log('⚠️ [Audio Stream] Variant lookup failed:', variantError.message)
    }

    // ──────────────────────────────────────────────
    // Strategy 2: Check in-memory session cache
    // ──────────────────────────────────────────────
    const cacheKey = getCacheKey(clipId, userId)
    const cachedAudio = getCachedAudio(cacheKey)

    if (cachedAudio) {
      console.log('✅ [Audio Stream] Serving from session cache:', { clipId })
      return new Response(new Uint8Array(cachedAudio), {
        headers: {
          'Content-Type': 'audio/mpeg',
          'Cache-Control': 'no-cache',
          'X-Source': 'session-cache',
        },
      })
    }

    // ──────────────────────────────────────────────
    // Strategy 3: Check legacy cached audio (clip_audio table)
    // ──────────────────────────────────────────────
    const supabaseAdmin = getSupabaseAdminClient()
    const transcriptHash = generateTextHash(transcript)

    const { data: existingAudio } = await supabaseAdmin
      .from('clip_audio')
      .select('blob_path, audio_status')
      .eq('user_id', userId)
      .eq('clip_id', clipId)
      .eq('variant_key', variantKey)
      .eq('audio_status', 'ready')
      .single()

    if (existingAudio?.blob_path && existingAudio.blob_path.startsWith('https://')) {
      console.log('✅ [Audio Stream] Redirecting to legacy cached audio:', existingAudio.blob_path.substring(0, 80) + '...')
      return Response.redirect(existingAudio.blob_path, 302)
    }

    // ──────────────────────────────────────────────
    // Strategy 4: Generate on-demand with Gemini TTS
    // ──────────────────────────────────────────────
    if (isGeminiTTSConfigured()) {
      console.log('🎤 [Audio Stream] Generating on-demand with Gemini TTS...', { clipId })

      try {
        const result = await generateGeminiTTS({ text: transcript })

        // Cache in memory for session reuse
        setCachedAudio(cacheKey, result.audio)

        console.log('✅ [Audio Stream] Gemini TTS on-demand success:', {
          clipId,
          voice: result.voice,
          audioSizeKB: Math.round(result.audio.length / 1024),
        })

        return new Response(new Uint8Array(result.audio), {
          headers: {
            'Content-Type': 'audio/mpeg',
            'Cache-Control': 'no-cache',
            'X-Source': 'gemini-on-demand',
            'X-Voice': result.voice,
          },
        })
      } catch (geminiError: any) {
        console.error('❌ [Audio Stream] Gemini TTS error:', geminiError.message)
        // Fall through to OpenAI fallback
      }
    }

    // ──────────────────────────────────────────────
    // Strategy 5: OpenAI TTS fallback
    // ──────────────────────────────────────────────
    if (process.env.OPENAI_API_KEY) {
      console.log('🔄 [Audio Stream] Falling back to OpenAI TTS...', { clipId })
      
      const OpenAI = (await import('openai')).default
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      
      const { getNaturalSpeechInstructions, getVariedSpeedWithVariant, getIntimateVoice } = await import('@/lib/naturalSpeechVariation')
      const voice = getIntimateVoice()
      const speed = getVariedSpeedWithVariant(variantKey)
      const instructions = getNaturalSpeechInstructions()

      const openaiResponse = await openai.audio.speech.create({
        model: 'gpt-4o-mini-tts',
        voice: voice,
        input: transcript,
        speed: speed,
        instructions: instructions,
      })

      const audioBuffer = Buffer.from(await openaiResponse.arrayBuffer())

      // Cache in memory
      setCachedAudio(cacheKey, audioBuffer)

      console.log('✅ [Audio Stream] OpenAI fallback success:', {
        clipId,
        audioSizeKB: Math.round(audioBuffer.length / 1024),
      })

      return new Response(new Uint8Array(audioBuffer), {
        headers: {
          'Content-Type': 'audio/mpeg',
          'Cache-Control': 'no-cache',
          'X-Source': 'openai-fallback',
        },
      })
    }

    // No TTS provider configured
    return new Response(
      JSON.stringify({
        error: 'No TTS provider configured',
        code: 'TTS_NOT_CONFIGURED',
      }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('❌ [Audio Stream] Error:', {
      error: error.message,
      stack: error.stack,
      clipId,
    })
    
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
        message: error.message || 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
