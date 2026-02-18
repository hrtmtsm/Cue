import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdminClient } from '@/lib/supabase/server'
import { resolveUserId } from '@/lib/supabase/resolveUserId'
import { generateTextHash } from '@/lib/audioHash'
import { generateGeminiTTS, isGeminiTTSConfigured } from '@/lib/gemini-tts'
import { getRandomVariantUrl } from '@/lib/generate-clip-variants'
import { getCachedAudio, setCachedAudio, getCacheKey } from '@/lib/audio-cache'
import { put } from '@vercel/blob'

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  let clipId: string | undefined
  let userId: string | undefined
  
  // 🔍 DEBUG: Log request details at the very start
  const cookieHeader = request.headers.get('cookie')
  const authHeader = request.headers.get('authorization')
  console.log('🔍 [Audio Generate] Request received:', {
    hasCookies: cookieHeader ? 'YES' : 'NO',
    cookieCount: cookieHeader ? cookieHeader.split(';').length : 0,
    hasAuth: authHeader ? 'YES' : 'NO',
    authHeaderPrefix: authHeader?.substring(0, 20) || 'N/A',
    vercelEnv: process.env.VERCEL_ENV,
    nodeEnv: process.env.NODE_ENV,
    url: request.url,
  })
  
  try {
    console.log('🎵 [Audio Generate] Request started')
    
    // Resolve userId (authenticated user or dev guest)
    let userIdResolved: { userId: string; source: 'auth' | 'dev_guest' }
    try {
      userIdResolved = await resolveUserId(request)
      userId = userIdResolved.userId
      console.log('✅ [Audio Generate] User resolved:', {
        userId: userId.substring(0, 8) + '...',
        source: userIdResolved.source,
      })
    } catch (error: any) {
      console.error('🚫 [Audio Generate] Failed to resolve user:', {
        message: error.message,
        stack: error.stack,
        vercelEnv: process.env.VERCEL_ENV,
        nodeEnv: process.env.NODE_ENV,
      })
      return NextResponse.json(
        { 
          error: 'Unauthorized',
          code: 'AUTH_REQUIRED',
          message: error.message || 'Authentication required. Please sign in.'
        },
        { status: 401 }
      )
    }
    
    let body: any
    try {
      body = await request.json()
    } catch (parseError: any) {
      console.error('❌ [Audio Generate] Error parsing request body:', parseError?.message)
      return NextResponse.json(
        { 
          error: 'Invalid request body',
          code: 'PARSE_ERROR',
          message: 'Request body must be valid JSON',
        },
        { status: 400 }
      )
    }

    clipId = body.clipId
    const transcript = body.transcript

    if (!clipId || !transcript) {
      console.error('❌ [Audio Generate] Missing required fields:', { clipId: !!clipId, transcript: !!transcript })
      return NextResponse.json(
        { 
          error: 'Missing clipId or transcript',
          code: 'MISSING_FIELDS',
          message: 'Both clipId and transcript are required.'
        },
        { status: 400 }
      )
    }

    console.log('📝 [Audio Generate] Request details:', {
      clipId,
      transcriptLength: transcript?.length || 0,
    })

    // ──────────────────────────────────────────────
    // Strategy 1: Check pre-generated Gemini variants
    // ──────────────────────────────────────────────
    try {
      const variantUrl = await getRandomVariantUrl(clipId)
      if (variantUrl) {
        const duration = Date.now() - startTime
        console.log('✅ [Audio Generate] Serving pre-generated Gemini variant:', {
          clipId,
          variantUrl: variantUrl.substring(0, 80) + '...',
          durationMs: duration,
        })
        return NextResponse.json({
          success: true,
          clipId,
          blobPath: variantUrl,
          source: 'gemini_variant',
        })
      }
    } catch (variantError: any) {
      // Table might not exist yet - that's fine, fall through
      console.log('⚠️ [Audio Generate] Variant lookup failed (table may not exist):', variantError.message)
    }

    // ──────────────────────────────────────────────
    // Strategy 2: Check in-memory session cache
    // ──────────────────────────────────────────────
    const cacheKey = getCacheKey(clipId, userId)
    const cachedAudio = getCachedAudio(cacheKey)

    if (cachedAudio) {
      console.log('✅ [Audio Generate] Serving from session cache:', { clipId })
      return new NextResponse(new Uint8Array(cachedAudio), {
        headers: {
          'Content-Type': 'audio/mpeg',
          'Cache-Control': 'public, max-age=31536000, immutable',
          'X-Source': 'session-cache',
        },
      })
    }

    // ──────────────────────────────────────────────
    // Strategy 3: Check existing clip_audio in DB (legacy OpenAI audio)
    // ──────────────────────────────────────────────
    const supabaseAdmin = getSupabaseAdminClient()
    const transcriptHash = generateTextHash(transcript)
    const variantKey = body.variantKey || 'clean_normal'

    const { data: existingAudio } = await supabaseAdmin
      .from('clip_audio')
      .select('blob_path, audio_status, transcript_hash')
      .eq('user_id', userId)
      .eq('clip_id', clipId)
      .eq('variant_key', variantKey)
      .eq('audio_status', 'ready')
      .single()

    if (existingAudio?.blob_path && existingAudio.blob_path.startsWith('https://')) {
      const duration = Date.now() - startTime
      console.log('✅ [Audio Generate] Serving legacy cached audio:', {
        clipId,
        blobPath: existingAudio.blob_path.substring(0, 80) + '...',
        durationMs: duration,
      })
      return NextResponse.json({
        success: true,
        clipId,
        transcriptHash,
        blobPath: existingAudio.blob_path,
        source: 'legacy_cache',
      })
    }

    // ──────────────────────────────────────────────
    // Strategy 4: Generate on-demand with Gemini TTS (fallback)
    // ──────────────────────────────────────────────
    if (isGeminiTTSConfigured()) {
      console.log('🎤 [Audio Generate] Generating on-demand with Gemini TTS...', { clipId })

      try {
        const result = await generateGeminiTTS({ text: transcript })

        // Cache in memory for session
        setCachedAudio(cacheKey, result.audio)

        // Upload to Vercel Blob in background (non-blocking)
        if (process.env.BLOB_READ_WRITE_TOKEN) {
          const blobPath = `audio/${userId}/${clipId}/gemini_${transcriptHash}.mp3`
          put(blobPath, result.audio, {
            access: 'public',
            contentType: 'audio/mpeg',
          }).then(blob => {
            console.log('☁️ [Audio Generate] Background upload to Blob complete:', blob.url.substring(0, 80))
            // Update clip_audio table with new blob URL
            supabaseAdmin
              .from('clip_audio')
              .upsert({
                user_id: userId,
                clip_id: clipId,
                transcript,
                transcript_hash: transcriptHash,
                variant_key: variantKey,
                voice_profile: result.voice,
                audio_status: 'ready',
                blob_path: blob.url,
                updated_at: new Date().toISOString(),
              }, {
                onConflict: 'user_id,clip_id,variant_key',
              })
              .then(({ error }) => {
                if (error) console.error('❌ [Audio Generate] Background DB update error:', error.message)
              })
          }).catch(err => {
            console.error('❌ [Audio Generate] Background upload error:', err.message)
          })
        }

        const duration = Date.now() - startTime
        console.log('✅ [Audio Generate] Gemini TTS on-demand success:', {
          clipId,
          voice: result.voice,
          audioSizeKB: Math.round(result.audio.length / 1024),
          durationMs: duration,
        })

        // Return audio directly
        return new NextResponse(new Uint8Array(result.audio), {
          headers: {
            'Content-Type': 'audio/mpeg',
            'Cache-Control': 'public, max-age=31536000, immutable',
            'X-Source': 'gemini-on-demand',
            'X-Voice': result.voice,
          },
        })
      } catch (geminiError: any) {
        console.error('❌ [Audio Generate] Gemini TTS error:', geminiError.message)
        // Fall through to OpenAI fallback
      }
    }

    // ──────────────────────────────────────────────
    // Strategy 5: OpenAI TTS fallback (if Gemini unavailable)
    // ──────────────────────────────────────────────
    if (process.env.OPENAI_API_KEY) {
      console.log('🔄 [Audio Generate] Falling back to OpenAI TTS...', { clipId })
      
      const OpenAI = (await import('openai')).default
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      
      const { getNaturalSpeechInstructions, getVariedSpeed, getIntimateVoice } = await import('@/lib/naturalSpeechVariation')
      const voice = getIntimateVoice()
      const speed = getVariedSpeed('medium')
      const instructions = getNaturalSpeechInstructions()

      const response = await openai.audio.speech.create({
        model: 'gpt-4o-mini-tts',
        voice: voice,
        input: transcript,
        speed: speed,
        instructions: instructions,
      })

      const audioArrayBuffer = await response.arrayBuffer()
      const audioBuffer = Buffer.from(audioArrayBuffer)

      // Cache in memory
      setCachedAudio(cacheKey, audioBuffer)

      // Upload to Vercel Blob
      if (process.env.BLOB_READ_WRITE_TOKEN) {
        try {
          const blobPath = `audio/${userId}/${clipId}/${variantKey}/${transcriptHash}.mp3`
          const blob = await put(blobPath, audioArrayBuffer, {
            access: 'public',
            contentType: 'audio/mpeg',
          })

          await supabaseAdmin
            .from('clip_audio')
            .upsert({
              user_id: userId,
              clip_id: clipId,
              transcript,
              transcript_hash: transcriptHash,
              variant_key: variantKey,
              voice_profile: voice,
              audio_status: 'ready',
              blob_path: blob.url,
              updated_at: new Date().toISOString(),
            }, {
              onConflict: 'user_id,clip_id,variant_key',
            })

          const duration = Date.now() - startTime
          console.log('✅ [Audio Generate] OpenAI fallback success:', {
            clipId,
            blobPath: blob.url.substring(0, 80),
            durationMs: duration,
          })

          return NextResponse.json({
            success: true,
            clipId,
            transcriptHash,
            blobPath: blob.url,
            source: 'openai_fallback',
          })
        } catch (uploadError: any) {
          console.error('❌ [Audio Generate] OpenAI upload error:', uploadError.message)
        }
      }

      // Return audio directly if blob upload failed
      return new NextResponse(new Uint8Array(audioBuffer), {
        headers: {
          'Content-Type': 'audio/mpeg',
          'X-Source': 'openai-fallback-direct',
        },
      })
    }

    // No TTS provider configured
    return NextResponse.json(
      {
        error: 'No TTS provider configured',
        code: 'TTS_NOT_CONFIGURED',
        message: 'Neither Google Cloud nor OpenAI TTS is configured.',
      },
      { status: 503 }
    )

  } catch (error: any) {
    const duration = Date.now() - startTime
    console.error('❌ [Audio Generate] Unhandled error:', {
      message: error?.message,
      stack: error?.stack,
      clipId,
      durationMs: duration,
    })
    
    return NextResponse.json(
      {
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred. Please try again.',
        details: error.message || 'Unknown error',
      },
      { status: 500 }
    )
  }
}
