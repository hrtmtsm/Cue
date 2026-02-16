import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdminClient } from '@/lib/supabase/server'
import { resolveUserId } from '@/lib/supabase/resolveUserId'
import { generateTextHash } from '@/lib/audioHash'

/**
 * Audio metadata endpoint
 * 
 * Returns audio URL and status for a given clip.
 * Checks in order:
 * 1. Pre-generated Gemini variants (clip_audio_variants table)
 * 2. Diagnostic audio (diagnostic_audio table)
 * 3. User-specific cached audio (clip_audio table)
 * 4. Returns needs_generation if nothing found
 */
export async function GET(request: NextRequest) {
  try {
    // Resolve userId (authenticated user or dev guest)
    let userIdResolved: { userId: string; source: 'auth' | 'dev_guest' }
    try {
      userIdResolved = await resolveUserId(request)
      console.log('✅ [Audio Metadata] User resolved:', {
        userId: userIdResolved.userId.substring(0, 8) + '...',
        source: userIdResolved.source,
      })
    } catch (error: any) {
      console.error('🚫 [Audio Metadata] Failed to resolve user:', error.message)
      return NextResponse.json(
        { 
          error: 'Unauthorized',
          code: 'AUTH_REQUIRED',
          message: error.message || 'Authentication required.'
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

    const supabaseAdmin = getSupabaseAdminClient()
    const transcriptHash = transcript ? generateTextHash(transcript) : null

    // ──────────────────────────────────────────────
    // Strategy 1: Check pre-generated Gemini variants
    // ──────────────────────────────────────────────
    try {
      const { data: variants } = await supabaseAdmin
        .from('clip_audio_variants')
        .select('variant_urls')
        .eq('clip_id', clipId)
        .single()

      if (variants?.variant_urls && Array.isArray(variants.variant_urls) && variants.variant_urls.length > 0) {
        // Select a random variant
        const randomIndex = Math.floor(Math.random() * variants.variant_urls.length)
        const audioUrl = variants.variant_urls[randomIndex]
        
        console.log('✅ [Audio Metadata] Serving Gemini variant:', {
          clipId,
          variantCount: variants.variant_urls.length,
          selectedIndex: randomIndex,
        })

        return NextResponse.json({
          clipId,
          transcript,
          transcriptHash,
          audioStatus: 'ready',
          audioUrl,
          variantKey,
          source: 'gemini_variant',
        })
      }
    } catch (variantError: any) {
      // Table might not exist yet - that's fine
      console.log('⚠️ [Audio Metadata] Variant lookup failed (table may not exist):', variantError.message)
    }

    // ──────────────────────────────────────────────
    // Strategy 2: Check diagnostic audio
    // ──────────────────────────────────────────────
    const { data: clipInfo } = await supabaseAdmin
      .from('curated_clips')
      .select('clip_type')
      .eq('id', clipId)
      .maybeSingle()
    
    const isDiagnostic = clipInfo?.clip_type === 'diagnostic'

    let audioRow: any = null
    let error: any = null

    if (isDiagnostic) {
      console.log('🔍 [Audio Metadata] Diagnostic clip detected...', { clipId })
      
      const { data: diagnosticAudio, error: diagnosticError } = await supabaseAdmin
        .from('diagnostic_audio')
        .select('*')
        .eq('clip_id', clipId)
        .maybeSingle()
      
      if (!diagnosticError && diagnosticAudio) {
        audioRow = {
          clip_id: diagnosticAudio.clip_id,
          audio_status: diagnosticAudio.status,
          blob_path: diagnosticAudio.audio_path,
          variant_key: variantKey,
          transcript_hash: transcriptHash || '',
          updated_at: diagnosticAudio.updated_at,
        }
        console.log('✅ [Audio Metadata] Found diagnostic audio:', { clipId })
      } else if (diagnosticError && diagnosticError.code !== 'PGRST116') {
        error = diagnosticError
      }
    }

    // ──────────────────────────────────────────────
    // Strategy 3: Check user-specific cached audio (clip_audio table)
    // ──────────────────────────────────────────────
    if (!audioRow && !isDiagnostic) {
      if (transcript && transcriptHash) {
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
          if (audioRow.transcript_hash !== transcriptHash) {
            console.warn('⚠️ [Audio Metadata] Hash mismatch detected', { clipId })
            audioRow = null
          }
        } else {
          error = exactMatch.error
        }
      }

      // Fallback: latest ready audio for this clip
      if (!audioRow) {
        const fallbackResult = await supabaseAdmin
          .from('clip_audio')
          .select('*')
          .eq('user_id', userId)
          .eq('clip_id', clipId)
          .eq('variant_key', variantKey)
          .eq('audio_status', 'ready')
          .order('updated_at', { ascending: false })
          .limit(1)
          .single()
        
        if (!fallbackResult.error && fallbackResult.data) {
          audioRow = fallbackResult.data
          console.log('✅ [Audio Metadata] Using fallback lookup:', { clipId })
        } else {
          error = fallbackResult.error
        }
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
      return NextResponse.json({
        clipId,
        transcript,
        transcriptHash,
        audioStatus: 'needs_generation',
      })
    }

    // Resolve audio URL from blob_path
    let audioUrl: string | undefined
    if (audioRow.audio_status === 'ready' && audioRow.blob_path) {
      if (audioRow.blob_path.startsWith('blob:')) {
        // Invalid blob: URL - try fallback
        const fallbackResult = await supabaseAdmin
          .from('clip_audio')
          .select('*')
          .eq('user_id', userId)
          .eq('clip_id', clipId)
          .eq('variant_key', variantKey)
          .eq('audio_status', 'ready')
          .not('blob_path', 'like', 'blob:%')
          .like('blob_path', 'https://%')
          .order('updated_at', { ascending: false })
          .limit(1)
          .single()
        
        if (!fallbackResult.error && fallbackResult.data?.blob_path?.startsWith('https://')) {
          audioUrl = fallbackResult.data.blob_path
        } else {
          return NextResponse.json({
            clipId,
            transcript: transcript || '',
            transcriptHash: transcriptHash || '',
            audioStatus: 'needs_generation',
          })
        }
      } else if (audioRow.blob_path.startsWith('http')) {
        audioUrl = audioRow.blob_path
      } else {
        // Legacy pathname format
        const tokenParts = process.env.BLOB_READ_WRITE_TOKEN?.split('_') || []
        const account = tokenParts.length >= 4 ? tokenParts[3] : 'public'
        const pathname = audioRow.blob_path.startsWith('/') ? audioRow.blob_path : `/${audioRow.blob_path}`
        audioUrl = `https://${account}.public.blob.vercel-storage.com${pathname}`
      }
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
