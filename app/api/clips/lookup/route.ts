import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdminClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const lookupRequestSchema = z.object({
  transcript: z.string().min(1, 'transcript must be a non-empty string'),
})

/**
 * POST /api/clips/lookup
 * Lookup clip ID by transcript (exact match)
 * Used to enrich mock story clips with dbClipId
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const validationResult = lookupRequestSchema.safeParse(body)
    
    if (!validationResult.success) {
      return NextResponse.json(
        { clipId: null, error: validationResult.error.errors.map(e => e.message).join(', ') },
        { status: 400 }
      )
    }

    const { transcript } = validationResult.data
    const supabase = getSupabaseAdminClient()

    // Lookup by exact transcript match in curated_clips
    const { data, error } = await supabase
      .from('curated_clips')
      .select('id')
      .eq('transcript', transcript.trim())
      .eq('approved', true)
      .eq('clip_type', 'practice')
      .limit(1)
      .single()

    if (error || !data) {
      // Not found is not an error - just return null
      return NextResponse.json({ clipId: null })
    }

    return NextResponse.json({ clipId: data.id })
  } catch (err: any) {
    if (process.env.NODE_ENV === 'development') {
      console.error('❌ [clips/lookup] Error:', err)
    }
    return NextResponse.json(
      { clipId: null, error: err?.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
