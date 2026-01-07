import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdminClient, resolveUserId } from '@/lib/supabase/server'
import { generateTextHash } from '@/lib/audioHash'

export async function GET(request: NextRequest) {
  try {
    // Resolve userId (authenticated user or dev guest)
    let userIdResolved: { userId: string; source: 'auth' | 'dev_guest' }
    try {
      userIdResolved = await resolveUserId(request)
      console.log('✅ [Audio Metadata] User resolved:', {
        userId: userIdResolved.userId.substring(0, 8) + '...',
        source: userIdResolved.source,
        VERCEL_ENV: process.env.VERCEL_ENV || 'development',
        NODE_ENV: process.env.NODE_ENV,
      })
    } catch (error: any) {
      console.error('🚫 [Audio Metadata] Failed to resolve user:', error.message)
      return NextResponse.json(
        { 
          error: 'Unauthorized',
          code: 'AUTH_REQUIRED',
          message: error.message || 'Authentication required. Please sign in.'
        },
        { status: 401 }
      )
    }

    const userId = userIdResolved.userId
    const { searchParams } = new URL(request.url)
    const clipId = searchParams.get('clipId')
    const variantKey = searchParams.get('variantKey') || 'clean_normal'
    const transcript = searchParams.get('transcript')

    if (!clipId) {
      return NextResponse.json(
        { error: 'Missing clipId' },
        { status: 400 }
      )
    }

    // Get Supabase admin client
    const supabaseAdmin = getSupabaseAdminClient()
    
    // Compute transcript hash if transcript is available
    const transcriptHash = transcript ? generateTextHash(transcript) : null

    // Strategy: First try to find by exact transcript_hash if transcript is available
    // If not found or transcript unavailable, fall back to latest ready audio for (user_id, clip_id, variant_key)
    let audioRow: any = null
    let error: any = null

    if (transcript && transcriptHash) {
      // Try exact match with transcript_hash first
      const exactMatch = await supabaseAdmin
        .from('clip_audio')
        .select('*')
        .eq('user_id', userId)
        .eq('clip_id', clipId)
        .eq('variant_key', variantKey)
        .eq('transcript_hash', transcriptHash)
        .single()
      
      if (!exactMatch.error && exactMatch.data) {
        audioRow = exactMatch.data
        // Validate hash matches (integrity check)
        if (audioRow.transcript_hash !== transcriptHash) {
          console.warn('⚠️ [Audio Metadata] Hash mismatch detected - trying fallback lookup', {
            clipId,
            variantKey,
            transcriptHashClient: transcriptHash,
            transcriptHashRow: audioRow.transcript_hash,
          })
          audioRow = null // Clear and try fallback
        }
      } else {
        error = exactMatch.error
      }
    }

    // Fallback: If no exact match or transcript unavailable, find latest ready audio
    if (!audioRow) {
      const fallbackQuery = supabaseAdmin
        .from('clip_audio')
        .select('*')
        .eq('user_id', userId)
        .eq('clip_id', clipId)
        .eq('variant_key', variantKey)
        .eq('audio_status', 'ready')
        .order('updated_at', { ascending: false })
        .limit(1)
      
      const fallbackResult = await fallbackQuery.single()
      
      if (!fallbackResult.error && fallbackResult.data) {
        audioRow = fallbackResult.data
        console.log('✅ [Audio Metadata] Using fallback lookup (latest ready audio):', {
          clipId,
          variantKey,
          transcriptHash: audioRow.transcript_hash?.substring(0, 12) + '...',
        })
      } else {
        error = fallbackResult.error
      }
    }

    if (error || !audioRow) {
      return NextResponse.json({
        clipId,
        transcript: transcript || '',
        transcriptHash: transcriptHash || '',
        audioStatus: 'needs_generation',
      })
    }

    // If transcript was provided and hash doesn't match, force needs_generation
    if (transcript && transcriptHash && audioRow.transcript_hash !== transcriptHash) {
      console.warn('⚠️ [Audio Metadata] Hash mismatch - forcing needs_generation', {
        clipId,
        variantKey,
        transcriptHashClient: transcriptHash,
        transcriptHashRow: audioRow.transcript_hash,
      })
      return NextResponse.json({
        clipId,
        transcript,
        transcriptHash,
        audioStatus: 'needs_generation',
      })
    }

    // If ready, use blob_path (must be durable https URL, never blob: URL)
    let audioUrl: string | undefined
    if (audioRow.audio_status === 'ready' && audioRow.blob_path) {
      // CRITICAL: blob: URLs are ephemeral and must never be persisted or returned
      // If blob_path starts with 'blob:', treat it as invalid and ignore it
      if (audioRow.blob_path.startsWith('blob:')) {
        console.warn('⚠️ [Audio Metadata] Invalid blob_path (blob: URL detected), ignoring:', {
          blobPath: audioRow.blob_path.substring(0, 80) + '...',
          clipId,
          variantKey,
        })
        // Fallback to latest ready record with https URL for (user_id, clip_id, variant_key)
        const fallbackQuery = supabaseAdmin
          .from('clip_audio')
          .select('*')
          .eq('user_id', userId)
          .eq('clip_id', clipId)
          .eq('variant_key', variantKey)
          .eq('audio_status', 'ready')
          .not('blob_path', 'like', 'blob:%') // Exclude blob: URLs
          .like('blob_path', 'https://%') // Only https URLs
          .order('updated_at', { ascending: false })
          .limit(1)
        
        const fallbackResult = await fallbackQuery.single()
        
        if (!fallbackResult.error && fallbackResult.data && fallbackResult.data.blob_path?.startsWith('https://')) {
          audioUrl = fallbackResult.data.blob_path
          console.log('✅ [Audio Metadata] Using fallback https URL:', {
            audioUrl: audioUrl?.substring(0, 80) + '...',
          })
        } else {
          // No valid https URL found - return needs_generation
          console.log('⚠️ [Audio Metadata] No valid https URL found, returning needs_generation')
          return NextResponse.json({
            clipId,
            transcript: transcript || '',
            transcriptHash: transcriptHash || '',
            audioStatus: 'needs_generation',
          })
        }
      } else if (audioRow.blob_path.startsWith('http')) {
        // Already a full https URL (correct format)
        audioUrl = audioRow.blob_path
      } else {
        // Legacy: construct URL from pathname (only if not blob:)
        const tokenParts = process.env.BLOB_READ_WRITE_TOKEN?.split('_') || []
        const account = tokenParts.length >= 4 ? tokenParts[3] : 'public'
        const pathname = audioRow.blob_path.startsWith('/') ? audioRow.blob_path : `/${audioRow.blob_path}`
        audioUrl = `https://${account}.public.blob.vercel-storage.com${pathname}`
      }
      console.log('🔗 [Audio Metadata] Using URL:', {
        blobPath: audioRow.blob_path.substring(0, 50) + '...',
        audioUrl: audioUrl?.substring(0, 80) + '...',
      })
    }

    return NextResponse.json({
      clipId,
      transcript,
      transcriptHash,
      audioStatus: audioRow.audio_status,
      audioUrl,
      variantKey,
    })
  } catch (error: any) {
    console.error('Error in /api/audio/metadata:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}

