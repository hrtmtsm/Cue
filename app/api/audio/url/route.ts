import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdminClient } from '@/lib/supabase/server'
import { resolveUserId } from '@/lib/supabase/resolveUserId'

export async function GET(request: NextRequest) {
  try {
    // Resolve userId (authenticated user or dev guest)
    let userIdResolved: { userId: string; source: 'auth' | 'dev_guest' }
    try {
      userIdResolved = await resolveUserId(request)
      console.log('✅ [Audio URL] User resolved:', {
        userId: userIdResolved.userId.substring(0, 8) + '...',
        source: userIdResolved.source,
        VERCEL_ENV: process.env.VERCEL_ENV || 'development',
        NODE_ENV: process.env.NODE_ENV,
      })
    } catch (error: any) {
      console.error('🚫 [Audio URL] Failed to resolve user:', error.message)
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

    if (!clipId) {
      return NextResponse.json(
        { error: 'Missing clipId' },
        { status: 400 }
      )
    }

    // Get Supabase admin client
    const supabaseAdmin = getSupabaseAdminClient()
    
    // Check if clip is diagnostic
    const { data: clipInfo } = await supabaseAdmin
      .from('curated_clips')
      .select('clip_type')
      .eq('id', clipId)
      .maybeSingle()
    
    const isDiagnostic = clipInfo?.clip_type === 'diagnostic'
    
    // For diagnostic clips: Check diagnostic_audio table
    // For regular clips: Check user audio from clip_audio table
    let audioPath: string | null = null
    let audioStatus: string = 'needs_generation'
    let error: any = null
    
    if (isDiagnostic) {
      // Diagnostic clips: Check diagnostic_audio table
      console.log('🔍 [Audio URL] Diagnostic clip detected, checking diagnostic_audio table...', { clipId })
      
      const { data: diagnosticAudio, error: diagnosticError } = await supabaseAdmin
        .from('diagnostic_audio')
        .select('audio_path, status')
        .eq('clip_id', clipId)
        .maybeSingle()
      
      if (!diagnosticError && diagnosticAudio) {
        audioPath = diagnosticAudio.audio_path
        audioStatus = diagnosticAudio.status
        console.log('✅ [Audio URL] Found diagnostic audio:', { clipId })
      } else if (diagnosticError && diagnosticError.code !== 'PGRST116') {
        // PGRST116 = not found, which is fine
        error = diagnosticError
      }
    } else {
      // Regular clips: Check user audio from clip_audio table
      const { data: userAudio, error: userError } = await supabaseAdmin
        .from('clip_audio')
        .select('blob_path, audio_status')
        .eq('user_id', userId)
        .eq('clip_id', clipId)
        .eq('variant_key', variantKey)
        .maybeSingle()
      
      if (!userError && userAudio) {
        audioPath = userAudio.blob_path
        audioStatus = userAudio.audio_status
      } else {
        error = userError
      }
    }

    if (error && error.code !== 'PGRST116') {
      return NextResponse.json(
        { error: 'Error fetching audio', status: 'error' },
        { status: 500 }
      )
    }

    if (!audioPath) {
      return NextResponse.json(
        { error: 'Audio not found', status: 'needs_generation' },
        { status: 404 }
      )
    }

    // If status !== ready → return status
    if (audioStatus !== 'ready') {
      return NextResponse.json({
        status: audioStatus,
        clipId,
      })
    }

    // Construct public URL from blob path
    // audio_path is stored as full URL from blob.url, but handle legacy pathname format
    let blobUrl: string
    if (audioPath.startsWith('http')) {
      // Already a full URL (new format)
      blobUrl = audioPath
    } else {
      // Legacy: construct URL from pathname
      // Format: https://{account}.public.blob.vercel-storage.com/{path}
      // Extract account from BLOB_READ_WRITE_TOKEN (format: vercel_blob_rw_{account}_{token})
      const tokenParts = process.env.BLOB_READ_WRITE_TOKEN?.split('_') || []
      const account = tokenParts.length >= 4 ? tokenParts[3] : 'public'
      const pathname = audioPath.startsWith('/') ? audioPath : `/${audioPath}`
      blobUrl = `https://${account}.public.blob.vercel-storage.com${pathname}`
    }
    
    return NextResponse.json({
      url: blobUrl,
      status: 'ready',
      clipId,
    })
  } catch (error: any) {
    console.error('Error in /api/audio/url:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
