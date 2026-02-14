import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdminClient } from '@/lib/supabase/server'
import { resolveUserId } from '@/lib/supabase/resolveUserId'

export const runtime = 'nodejs'

const saveSchema = z.object({
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

    const validationResult = saveSchema.safeParse(body)
    if (!validationResult.success) {
      const errorMessage = validationResult.error.issues.map(e => e.message).join(', ')
      return NextResponse.json(
        { error: 'Validation error', message: errorMessage },
        { status: 400 }
      )
    }

    const { clipChunkSpanId, clipId, kind } = validationResult.data

    console.log('💾 [saved] Toggle save request', { userId, clipChunkSpanId, clipId, kind })

    // Get Supabase admin client
    const supabase = getSupabaseAdminClient()

    // Check if already saved
    const { data: existing, error: findError } = await supabase
      .from('saved_items')
      .select('id')
      .eq('user_id', userId)
      .eq('clip_chunk_span_id', clipChunkSpanId)
      .maybeSingle()

    if (findError && findError.code !== 'PGRST116') {
      console.error('❌ [saved] Find error:', findError)
      return NextResponse.json(
        { error: 'Failed to check saved status', message: findError.message },
        { status: 500 }
      )
    }

    let saved = false
    if (existing) {
      // Delete (unsave)
      const { error: deleteError } = await supabase
        .from('saved_items')
        .delete()
        .eq('id', existing.id)

      if (deleteError) {
        console.error('❌ [saved] Delete error:', deleteError)
        return NextResponse.json(
          { error: 'Failed to unsave', message: deleteError.message },
          { status: 500 }
        )
      }

      console.log('✅ [saved] Unsaved chunk', { clipChunkSpanId })
      saved = false
    } else {
      // Insert (save)
      const { error: insertError } = await supabase
        .from('saved_items')
        .insert({
          user_id: userId,
          clip_id: clipId,
          clip_chunk_span_id: clipChunkSpanId,
          kind: kind || 'phrase',
        })

      if (insertError) {
        // If duplicate key error, treat as success (idempotent)
        if (insertError.code === '23505') {
          console.log('✅ [saved] Already saved (duplicate key)', { clipChunkSpanId })
          saved = true
        } else {
          console.error('❌ [saved] Insert error:', insertError)
          return NextResponse.json(
            { error: 'Failed to save', message: insertError.message },
            { status: 500 }
          )
        }
      } else {
        console.log('✅ [saved] Saved chunk', { clipChunkSpanId })
        saved = true
      }
    }

    return NextResponse.json({ success: true, saved })
  } catch (err: any) {
    console.error('❌ [saved] Unexpected error:', err)
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
        .from('saved_items')
        .select('id')
        .eq('user_id', userId)
        .eq('clip_chunk_span_id', clipChunkSpanId)
        .maybeSingle()

      if (error && error.code !== 'PGRST116') {
        console.error('❌ [saved] Check saved error:', error)
        return NextResponse.json(
          { error: 'Failed to check saved status', message: error.message },
          { status: 500 }
        )
      }

      return NextResponse.json({ success: true, saved: !!saved })
    }

    // Fetch all saved items for the user
    const { data: savedItems, error } = await supabase
      .from('saved_items')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('❌ [saved] Fetch error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch saved items', message: error.message },
        { status: 500 }
      )
    }

    // Transform to match expected format
    const transformed = (savedItems || []).map((item: any) => ({
      id: item.id,
      clip_id: item.clip_id,
      clip_chunk_span_id: item.clip_chunk_span_id,
      kind: item.kind,
      created_at: item.created_at,
      chunk_text: item.chunk_display,
      chunk_display: item.chunk_display,
      meaning_en: item.meaning,
      example_sentence: item.example_sentence,
    }))

    console.log('✅ [saved] Fetched saved items', { count: transformed.length })

    return NextResponse.json({
      success: true,
      items: transformed,
    })
  } catch (err: any) {
    console.error('❌ [saved] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error', message: err?.message || 'Unknown error' },
      { status: 500 }
    )
  }
}
