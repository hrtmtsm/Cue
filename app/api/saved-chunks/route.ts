import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdminClient } from '@/lib/supabase/server'
import { resolveUserId } from '@/lib/supabase/resolveUserId'

export const runtime = 'nodejs'

const saveChunkSchema = z.object({
  clipChunkSpanId: z.string().uuid('clipChunkSpanId must be a valid UUID'),
  clipId: z.string().min(1, 'clipId must be a non-empty string'),
  kind: z.string().default('phrase'),
})

export async function POST(req: NextRequest) {
  try {
    // Resolve user ID
    let userId: string
    try {
      const userResolved = await resolveUserId(req)
      userId = userResolved.userId
    } catch (error: any) {
      return NextResponse.json(
        { error: 'Unauthorized', message: error.message || 'Authentication required' },
        { status: 401 }
      )
    }

    // Parse and validate request body
    let body: unknown
    try {
      body = await req.json()
    } catch (parseError: any) {
      return NextResponse.json(
        { error: 'Invalid request body', message: 'Request body must be valid JSON' },
        { status: 400 }
      )
    }

    const validationResult = saveChunkSchema.safeParse(body)
    if (!validationResult.success) {
      const errorMessage = validationResult.error.errors.map(e => e.message).join(', ')
      return NextResponse.json(
        { error: 'Validation error', message: errorMessage },
        { status: 400 }
      )
    }

    const { clipChunkSpanId, clipId, kind } = validationResult.data

    // Get Supabase admin client
    const supabase = getSupabaseAdminClient()

    // Upsert saved chunk (insert or update if exists)
    const { data: result, error: upsertError } = await supabase
      .from('saved_chunks')
      .upsert({
        user_id: userId,
        clip_id: clipId,
        clip_chunk_span_id: clipChunkSpanId,
        kind: kind || 'phrase',
      }, {
        onConflict: 'user_id,clip_chunk_span_id',
      })
      .select()
      .single()

    if (upsertError) {
      console.error('❌ [saved-chunks] Upsert error:', upsertError)
      return NextResponse.json(
        { error: 'Failed to save chunk', message: upsertError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, saved: true, data: result })
  } catch (err: any) {
    console.error('❌ [saved-chunks] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error', message: err?.message || 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function GET(req: NextRequest) {
  try {
    // Resolve user ID
    let userId: string
    try {
      const userResolved = await resolveUserId(req)
      userId = userResolved.userId
    } catch (error: any) {
      return NextResponse.json(
        { error: 'Unauthorized', message: error.message || 'Authentication required' },
        { status: 401 }
      )
    }

    // Get Supabase admin client
    const supabase = getSupabaseAdminClient()

    // Check if checking for specific chunk
    const { searchParams } = new URL(req.url)
    const clipChunkSpanId = searchParams.get('clipChunkSpanId')

    if (clipChunkSpanId) {
      // Check if specific chunk is saved
      const { data: saved, error } = await supabase
        .from('saved_chunks')
        .select('id')
        .eq('user_id', userId)
        .eq('clip_chunk_span_id', clipChunkSpanId)
        .maybeSingle()

      if (error && error.code !== 'PGRST116') {
        console.error('❌ [saved-chunks] Check saved error:', error)
        return NextResponse.json(
          { error: 'Failed to check saved status', message: error.message },
          { status: 500 }
        )
      }

      return NextResponse.json({ success: true, saved: !!saved })
    }

    // Fetch all saved chunks for the user with chunk details and meanings
    const { data: savedChunks, error } = await supabase
      .from('saved_chunks')
      .select(`
        *,
        clip_chunk_spans (
          chunk_text,
          ref_start,
          ref_end,
          id
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('❌ [saved-chunks] Fetch error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch saved chunks', message: error.message },
        { status: 500 }
      )
    }

    // Fetch meanings for all chunk spans
    const chunkSpanIds = (savedChunks || [])
      .map((s: any) => s.clip_chunk_spans?.id)
      .filter((id: any) => id)

    let meaningsMap: Record<string, string> = {}
    if (chunkSpanIds.length > 0) {
      const { data: meanings } = await supabase
        .from('chunk_meanings')
        .select('clip_chunk_span_id, meaning_en')
        .in('clip_chunk_span_id', chunkSpanIds)

      if (meanings) {
        meaningsMap = meanings.reduce((acc: Record<string, string>, m: any) => {
          acc[m.clip_chunk_span_id] = m.meaning_en
          return acc
        }, {})
      }
    }

    // Transform to include chunk text and meaning from related tables
    const transformed = (savedChunks || [])
      .filter((saved: any) => saved.clip_chunk_spans) // Only include if chunk span exists
      .map((saved: any) => {
        const chunkSpanId = saved.clip_chunk_spans?.id
        return {
          id: saved.id,
          clip_id: saved.clip_id,
          clip_chunk_span_id: saved.clip_chunk_span_id,
          kind: saved.kind,
          created_at: saved.created_at,
          chunk_text: saved.clip_chunk_spans?.chunk_text || '',
          meaning_en: chunkSpanId ? meaningsMap[chunkSpanId] || null : null,
          ref_start: saved.clip_chunk_spans?.ref_start || 0,
          ref_end: saved.clip_chunk_spans?.ref_end || 0,
        }
      })

    // For now, all saved chunks are phrases
    return NextResponse.json({
      success: true,
      words: [],
      phrases: transformed,
      tips: [], // Future: listening feedback tips
    })
  } catch (err: any) {
    console.error('❌ [saved-chunks] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error', message: err?.message || 'Unknown error' },
      { status: 500 }
    )
  }
}
