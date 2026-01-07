import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { put } from '@vercel/blob'
import { getSupabaseAdminClient, resolveUserId } from '@/lib/supabase/server'
import { generateTextHash, getTextPreview } from '@/lib/audioHash'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  let clipId: string | undefined
  let userId: string | undefined
  
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
        VERCEL_ENV: process.env.VERCEL_ENV || 'development',
        NODE_ENV: process.env.NODE_ENV,
      })
    } catch (error: any) {
      console.error('🚫 [Audio Generate] Failed to resolve user:', error.message)
      return NextResponse.json(
        { 
          error: 'Unauthorized',
          code: 'AUTH_REQUIRED',
          message: error.message || 'Authentication required. Please sign in.'
        },
        { status: 401 }
      )
    }
    
    const body = await request.json()
    clipId = body.clipId
    const transcript = body.transcript
    const variantKey = body.variantKey || 'clean_normal'

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
      variantKey,
      transcriptLength: transcript.length,
      transcriptPreview: getTextPreview(transcript),
    })

    // Compute transcript hash
    const transcriptHash = generateTextHash(transcript)
    console.log('🔐 [Audio Generate] Transcript hash:', transcriptHash.substring(0, 12) + '...')

    // Get Supabase admin client
    const supabaseAdmin = getSupabaseAdminClient()
    
    // Check for existing audio (with transcript_hash for idempotency)
    console.log('🔍 [Audio Generate] Checking for existing audio...')
    const { data: existingAudio, error: fetchError } = await supabaseAdmin
      .from('clip_audio')
      .select('*')
      .eq('user_id', userId)
      .eq('clip_id', clipId)
      .eq('variant_key', variantKey)
      .eq('transcript_hash', transcriptHash)
      .single()

    if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 = not found (expected)
      console.error('❌ [Audio Generate] Error fetching existing audio:', fetchError)
      return NextResponse.json(
        {
          error: 'Database query failed',
          code: 'DB_QUERY_ERROR',
          message: 'Failed to check existing audio. Please try again.',
          details: fetchError.message,
        },
        { status: 500 }
      )
    }

    // If existing audio with same hash exists and is ready, return it immediately (idempotency)
    // CRITICAL: Only return if blob_path is a valid https URL (never blob: URL)
    if (existingAudio && existingAudio.transcript_hash === transcriptHash && existingAudio.audio_status === 'ready' && existingAudio.blob_path) {
      // Validate blob_path is https URL (not blob: URL)
      if (existingAudio.blob_path.startsWith('blob:')) {
        console.warn('⚠️ [Audio Generate] Existing audio has invalid blob_path (blob: URL), regenerating:', {
          clipId,
          transcriptHash: transcriptHash.substring(0, 12) + '...',
        })
        // Continue to generation - don't return invalid URL
      } else {
        const validUrl = existingAudio.blob_path.startsWith('https://') 
          ? existingAudio.blob_path
          : `https://${process.env.BLOB_READ_WRITE_TOKEN?.split('_')[3] || 'public'}.public.blob.vercel-storage.com${existingAudio.blob_path.startsWith('/') ? existingAudio.blob_path : '/' + existingAudio.blob_path}`
        console.log('✅ [Audio Generate] Existing audio found (idempotent return):', {
          clipId,
          transcriptHash: transcriptHash.substring(0, 12) + '...',
          blobPath: validUrl.substring(0, 80) + '...',
        })
        return NextResponse.json({
          success: true,
          clipId,
          transcriptHash,
          blobPath: validUrl, // Return valid https URL
        })
      }
    }

    // Upsert with generating status
    console.log('💾 [Audio Generate] Upserting clip_audio row...')
    const { data: audioRow, error: upsertError } = await supabaseAdmin
      .from('clip_audio')
      .upsert({
        user_id: userId,
        clip_id: clipId,
        transcript,
        transcript_hash: transcriptHash,
        variant_key: variantKey,
        voice_profile: 'alloy', // Default, can be made configurable
        audio_status: 'generating',
        blob_path: null,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,clip_id,variant_key,transcript_hash', // Include transcript_hash for uniqueness
      })
      .select()
      .single()

    if (upsertError || !audioRow) {
      console.error('❌ [Audio Generate] Error upserting clip_audio:', {
        error: upsertError,
        hasAudioRow: !!audioRow,
        tableExists: upsertError?.code !== '42P01', // 42P01 = relation does not exist
      })
      
      // Check if table doesn't exist
      if (upsertError?.code === '42P01' || upsertError?.message?.includes('does not exist')) {
        return NextResponse.json(
          {
            error: 'Database table not found',
            code: 'TABLE_MISSING',
            message: 'The clip_audio table does not exist. Please run the migration first.',
            details: 'See supabase/migrations/001_create_clip_audio.sql',
          },
          { status: 500 }
        )
      }
      
      return NextResponse.json(
        {
          error: 'Failed to create audio record',
          code: 'DB_UPSERT_ERROR',
          message: 'Failed to save audio record to database.',
          details: upsertError?.message || 'Unknown error',
        },
        { status: 500 }
      )
    }

    console.log('✅ [Audio Generate] DB row created/updated:', {
      audioRowId: audioRow.id,
      status: audioRow.audio_status,
    })

    // Generate audio using OpenAI TTS
    console.log('🎤 [Audio Generate] Calling OpenAI TTS...')
    let audioArrayBuffer: ArrayBuffer
    try {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY environment variable is not set')
      }
      
      const response = await openai.audio.speech.create({
        model: 'tts-1',
        voice: 'alloy',
        input: transcript,
      })

      audioArrayBuffer = await response.arrayBuffer()
      console.log('✅ [Audio Generate] OpenAI TTS success:', {
        audioSizeBytes: audioArrayBuffer.byteLength,
        audioSizeKB: Math.round(audioArrayBuffer.byteLength / 1024),
      })
    } catch (error: any) {
      console.error('❌ [Audio Generate] OpenAI TTS error:', {
        error: error.message,
        stack: error.stack,
        code: error.code,
        status: error.status,
        hasApiKey: !!process.env.OPENAI_API_KEY,
      })
      
      // Update status to error
      try {
        await supabaseAdmin
          .from('clip_audio')
          .update({ audio_status: 'error' })
          .eq('id', audioRow.id)
      } catch (updateError) {
        console.error('❌ [Audio Generate] Failed to update error status:', updateError)
      }

      return NextResponse.json(
        {
          error: 'Failed to generate audio',
          code: 'OPENAI_ERROR',
          message: error.message || 'OpenAI TTS service error. Please try again.',
          details: error.code || 'Unknown error',
        },
        { status: 500 }
      )
    }

    // Upload to Vercel Blob
    // Include transcript_hash in path for uniqueness and to avoid overwrites
    const blobPath = `audio/${userId}/${clipId}/${variantKey}/${transcriptHash}.mp3`
    console.log('☁️ [Audio Generate] Uploading to Vercel Blob...', { blobPath, transcriptHash: transcriptHash.substring(0, 12) + '...' })
    
    try {
      if (!process.env.BLOB_READ_WRITE_TOKEN) {
        throw new Error('BLOB_READ_WRITE_TOKEN environment variable is not set')
      }
      
      const blob = await put(blobPath, audioArrayBuffer, {
        access: 'public',
        contentType: 'audio/mpeg',
      })
      
      console.log('✅ [Audio Generate] Vercel Blob upload success:', {
        blobUrl: blob.url,
        blobPath: blob.pathname,
        storedPath: blobPath,
      })
      
      // CRITICAL: Ensure blob.url is an https URL (not blob: URL)
      // Vercel Blob's blob.url should always be https://, but validate to be safe
      const blobUrl = blob.url
      if (!blobUrl || !blobUrl.startsWith('https://')) {
        throw new Error(`Invalid blob.url (not https): ${blobUrl}`)
      }
      
      const blobPathForStorage = blob.pathname || blobPath
      
      // Update row: status='ready', blob_path (store durable https URL, NEVER blob: URL)
      console.log('💾 [Audio Generate] Updating clip_audio to ready status with https URL...')
      const { error: updateError } = await supabaseAdmin
        .from('clip_audio')
        .update({
          audio_status: 'ready',
          blob_path: blobUrl, // Store durable https URL (never blob: URL)
          updated_at: new Date().toISOString(),
        })
        .eq('id', audioRow.id)

      if (updateError) {
        console.error('❌ [Audio Generate] Error updating clip_audio:', {
          error: updateError,
          audioRowId: audioRow.id,
        })
        return NextResponse.json(
          {
            error: 'Failed to update audio record',
            code: 'DB_UPDATE_ERROR',
            message: 'Audio generated but failed to update database. Please try again.',
            details: updateError.message,
          },
          { status: 500 }
        )
      }

      const duration = Date.now() - startTime
      console.log('✅ [Audio Generate] Success!', {
        clipId,
        durationMs: duration,
        durationSec: Math.round(duration / 1000),
        blobPath: blobPathForStorage,
        blobUrl: blobUrl,
      })

      return NextResponse.json({
        success: true,
        clipId,
        transcriptHash,
        blobPath: blobUrl,
      })
    } catch (error: any) {
      console.error('❌ [Audio Generate] Vercel Blob upload error:', {
        error: error.message,
        stack: error.stack,
        hasBlobToken: !!process.env.BLOB_READ_WRITE_TOKEN,
        blobPath,
      })
      
      // Update status to error
      try {
        await supabaseAdmin
          .from('clip_audio')
          .update({ audio_status: 'error' })
          .eq('id', audioRow.id)
      } catch (updateError) {
        console.error('❌ [Audio Generate] Failed to update error status:', updateError)
      }

      return NextResponse.json(
        {
          error: 'Failed to upload audio',
          code: 'BLOB_UPLOAD_ERROR',
          message: error.message || 'Failed to upload audio to storage. Please try again.',
          details: error.code || 'Unknown error',
        },
        { status: 500 }
      )
    }

  } catch (error: any) {
    const duration = Date.now() - startTime
    console.error('❌ [Audio Generate] Unhandled error:', {
      error: error.message,
      stack: error.stack,
      clipId,
      userId: userId?.substring(0, 8) + '...',
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

