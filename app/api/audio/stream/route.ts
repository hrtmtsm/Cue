import { NextRequest } from 'next/server'
import OpenAI from 'openai'
import { put } from '@vercel/blob'
import { getSupabaseAdminClient, resolveUserId } from '@/lib/supabase/server'
import { generateTextHash } from '@/lib/audioHash'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

/**
 * Stream audio directly from OpenAI TTS to client
 * Optionally tees stream to upload to Vercel Blob in background
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
          message: error.message || 'Authentication required. Please sign in.'
        }),
        { 
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }
    
    const { searchParams } = new URL(request.url)
    clipId = searchParams.get('clipId') || undefined
    const transcript = searchParams.get('transcript')
    const variantKey = searchParams.get('variantKey') || 'clean_normal'
    const cache = searchParams.get('cache') === 'true' // Optional: upload to blob while streaming

    if (!clipId || !transcript) {
      return new Response(
        JSON.stringify({ 
          error: 'Missing clipId or transcript',
          code: 'MISSING_FIELDS',
          message: 'Both clipId and transcript are required.'
        }),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }

    console.log('📝 [Audio Stream] Request details:', {
      clipId,
      variantKey,
      transcriptLength: transcript.length,
      cache,
    })

    // Check for existing audio in cache (optional - can skip for streaming)
    const supabaseAdmin = getSupabaseAdminClient()
    const transcriptHash = generateTextHash(transcript)
    
    const { data: existingAudio } = await supabaseAdmin
      .from('clip_audio')
      .select('*')
      .eq('user_id', userId)
      .eq('clip_id', clipId)
      .eq('variant_key', variantKey)
      .eq('transcript_hash', transcriptHash)
      .eq('audio_status', 'ready')
      .single()

    // If cached audio exists with valid https URL, redirect to it instead of streaming
    // CRITICAL: Never use blob: URLs - they are ephemeral
    if (existingAudio?.blob_path && existingAudio.blob_path.startsWith('https://')) {
      // Valid https URL - redirect to it
      console.log('✅ [Audio Stream] Using cached audio (https URL):', existingAudio.blob_path.substring(0, 50) + '...')
      return Response.redirect(existingAudio.blob_path, 302)
    } else if (existingAudio?.blob_path && !existingAudio.blob_path.startsWith('blob:')) {
      // Legacy pathname format - construct https URL
      const tokenParts = process.env.BLOB_READ_WRITE_TOKEN?.split('_') || []
      const account = tokenParts.length >= 4 ? tokenParts[3] : 'public'
      const pathname = existingAudio.blob_path.startsWith('/') ? existingAudio.blob_path : `/${existingAudio.blob_path}`
      const blobUrl = `https://${account}.public.blob.vercel-storage.com${pathname}`
      console.log('✅ [Audio Stream] Using cached audio (constructed https URL):', blobUrl.substring(0, 50) + '...')
      return Response.redirect(blobUrl, 302)
    }
    // If blob_path is blob: URL or invalid, ignore it and proceed with streaming

    // Generate audio using OpenAI TTS (streaming)
    console.log('🎤 [Audio Stream] Calling OpenAI TTS (streaming)...')
    
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is not set')
    }
    
    const openaiResponse = await openai.audio.speech.create({
      model: 'tts-1',
      voice: 'alloy',
      input: transcript,
    })

    // OpenAI SDK returns a Response-like object
    // Access the body stream directly - it should be a ReadableStream
    const openaiStream = openaiResponse.body
    
    if (!openaiStream) {
      // Fallback: if no stream, read as buffer and create stream
      console.warn('⚠️ [Audio Stream] OpenAI response has no body stream, using buffer fallback')
      const arrayBuffer = await openaiResponse.arrayBuffer()
      const uint8Array = new Uint8Array(arrayBuffer)
      const fallbackStream = new ReadableStream({
        start(controller) {
          controller.enqueue(uint8Array)
          controller.close()
        }
      })
      
      // If cache=true, still upload in background
      if (cache) {
        uploadToBlobInBackground(
          new ReadableStream({
            start(controller) {
              controller.enqueue(uint8Array)
              controller.close()
            }
          }),
          userId,
          clipId,
          variantKey,
          transcript,
          transcriptHash,
          supabaseAdmin
        )
      }
      
      return new Response(fallbackStream, {
        headers: {
          'Content-Type': 'audio/mpeg',
          'Cache-Control': 'no-cache',
          'Transfer-Encoding': 'chunked',
        },
      })
    }

    // If cache=true, tee the stream: one to client, one to blob upload
    if (cache) {
      console.log('☁️ [Audio Stream] Teeing stream for background upload...')
      
      // Tee the stream
      const [clientStream, uploadStream] = openaiStream.tee()
      
      // Start background upload (don't await - let it run in background)
      uploadToBlobInBackground(uploadStream, userId, clipId, variantKey, transcript, transcriptHash, supabaseAdmin)
      
      // Return client stream immediately
      return new Response(clientStream, {
        headers: {
          'Content-Type': 'audio/mpeg',
          'Cache-Control': 'no-cache',
          'Transfer-Encoding': 'chunked',
        },
      })
    } else {
      // Stream directly to client without caching
      return new Response(openaiStream, {
        headers: {
          'Content-Type': 'audio/mpeg',
          'Cache-Control': 'no-cache',
          'Transfer-Encoding': 'chunked',
        },
      })
    }

  } catch (error: any) {
    console.error('❌ [Audio Stream] Error:', {
      error: error.message,
      stack: error.stack,
      clipId,
      userId: userId?.substring(0, 8) + '...',
    })
    
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred. Please try again.',
        details: error.message || 'Unknown error',
      }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
}

/**
 * Background function to upload stream to Vercel Blob and update DB
 * Runs asynchronously without blocking the client stream
 */
async function uploadToBlobInBackground(
  stream: ReadableStream<Uint8Array>,
  userId: string,
  clipId: string,
  variantKey: string,
  transcript: string,
  transcriptHash: string,
  supabaseAdmin: any
) {
  try {
    // Convert stream to ArrayBuffer for upload
    const reader = stream.getReader()
    const chunks: Uint8Array[] = []
    
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
    }
    
    // Combine chunks into single buffer
    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0)
    const audioBuffer = new Uint8Array(totalLength)
    let offset = 0
    for (const chunk of chunks) {
      audioBuffer.set(chunk, offset)
      offset += chunk.length
    }
    
    // Upload to Vercel Blob (include transcript_hash for uniqueness)
    const blobPath = `audio/${userId}/${clipId}/${variantKey}/${transcriptHash}.mp3`
    console.log('☁️ [Audio Stream] Uploading to Vercel Blob (background)...', { 
      blobPath,
      transcriptHash: transcriptHash.substring(0, 12) + '...',
    })
    
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      throw new Error('BLOB_READ_WRITE_TOKEN environment variable is not set')
    }
    
    const blob = await put(blobPath, audioBuffer.buffer, {
      access: 'public',
      contentType: 'audio/mpeg',
    })
    
    console.log('✅ [Audio Stream] Background upload complete:', {
      blobUrl: blob.url,
    })
    
    // CRITICAL: Ensure blob.url is an https URL (not blob: URL)
    // Vercel Blob's blob.url should always be https://, but validate to be safe
    if (!blob.url || !blob.url.startsWith('https://')) {
      console.error('❌ [Audio Stream] Invalid blob.url (not https):', blob.url)
      // Don't update DB with invalid URL
      return
    }
    
    // Update DB record with durable https URL
    await supabaseAdmin
      .from('clip_audio')
      .upsert({
        user_id: userId,
        clip_id: clipId,
        transcript,
        transcript_hash: transcriptHash,
        variant_key: variantKey,
        voice_profile: 'alloy',
        audio_status: 'ready',
        blob_path: blob.url, // Store durable https URL (never blob: URL)
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,clip_id,variant_key,transcript_hash', // Include transcript_hash for uniqueness
      })
    
    console.log('✅ [Audio Stream] DB updated (background) with https URL:', blob.url.substring(0, 80) + '...')
  } catch (error: any) {
    console.error('❌ [Audio Stream] Background upload error:', {
      error: error.message,
      clipId,
    })
    // Don't throw - this is background, shouldn't affect client
  }
}

