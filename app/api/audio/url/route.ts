import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdminClient, resolveUserId } from '@/lib/supabase/server'

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
    
    // Fetch clip_audio
    const { data: audioRow, error } = await supabaseAdmin
      .from('clip_audio')
      .select('*')
      .eq('user_id', userId)
      .eq('clip_id', clipId)
      .eq('variant_key', variantKey)
      .single()

    if (error || !audioRow) {
      return NextResponse.json(
        { error: 'Audio not found', status: 'needs_generation' },
        { status: 404 }
      )
    }

    // If status !== ready → return status
    if (audioRow.audio_status !== 'ready') {
      return NextResponse.json({
        status: audioRow.audio_status,
        clipId,
      })
    }

    if (!audioRow.blob_path) {
      return NextResponse.json(
        { error: 'Audio blob path missing', status: 'error' },
        { status: 500 }
      )
    }

    // Construct public URL from blob path
    // blob_path is now stored as full URL from blob.url, but handle legacy pathname format
    let blobUrl: string
    if (audioRow.blob_path.startsWith('http')) {
      // Already a full URL (new format)
      blobUrl = audioRow.blob_path
    } else {
      // Legacy: construct URL from pathname
      // Format: https://{account}.public.blob.vercel-storage.com/{path}
      // Extract account from BLOB_READ_WRITE_TOKEN (format: vercel_blob_rw_{account}_{token})
      const tokenParts = process.env.BLOB_READ_WRITE_TOKEN?.split('_') || []
      const account = tokenParts.length >= 4 ? tokenParts[3] : 'public'
      const pathname = audioRow.blob_path.startsWith('/') ? audioRow.blob_path : `/${audioRow.blob_path}`
      blobUrl = `https://${account}.public.blob.vercel-storage.com${pathname}`
    }
    
    return NextResponse.json({
      url: blobUrl,
      status: 'ready',
      clipId,
      transcriptHash: audioRow.transcript_hash,
    })
  } catch (error: any) {
    console.error('Error in /api/audio/url:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
