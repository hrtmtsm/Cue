import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdminClient } from '@/lib/supabase/server'
import { resolveUserId } from '@/lib/supabase/resolveUserId'
import OpenAI from 'openai'

export const runtime = 'nodejs'

const toggleSchema = z.object({
  clipId: z.string().min(1, 'clipId must be a non-empty string'),
  clipChunkSpanId: z.string().uuid('clipChunkSpanId must be a valid UUID'),
  chunkDisplay: z.string().min(1, 'chunkDisplay must be a non-empty string'),
  meaning: z.string().optional(),
})

// Initialize OpenAI client
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  : null

/**
 * Generate example sentence using OpenAI
 */
async function generateExampleSentence(chunkDisplay: string): Promise<string> {
  if (!openai) {
    throw new Error('OPENAI_API_KEY not configured')
  }

  const prompt = `Generate one short, natural example sentence using this English phrase. Keep it simple and conversational.

Phrase: "${chunkDisplay}"

Example sentence:`

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a language learning assistant. Generate simple, natural example sentences.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 30,
    })

    let sentence = completion.choices[0]?.message?.content?.trim() || ''

    // Remove quotes if present
    sentence = sentence.replace(/^["']|["']$/g, '')

    // Ensure it ends with punctuation
    if (sentence && !/[.!?]$/.test(sentence)) {
      sentence += '.'
    }

    return sentence
  } catch (error: any) {
    console.error('❌ [saved/toggle] OpenAI API error:', error)
    throw new Error(`Failed to generate example sentence: ${error.message || 'Unknown error'}`)
  }
}

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

    const validationResult = toggleSchema.safeParse(body)
    if (!validationResult.success) {
      const errorMessage = validationResult.error.errors.map(e => e.message).join(', ')
      return NextResponse.json(
        { error: 'Validation error', message: errorMessage },
        { status: 400 }
      )
    }

    const { clipId, clipChunkSpanId, chunkDisplay, meaning } = validationResult.data

    console.log('💾 [saved/toggle] Toggle request', { 
      userId, 
      clipChunkSpanId, 
      clipId, 
      chunkDisplay: chunkDisplay.substring(0, 30) 
    })

    // Get Supabase admin client
    const supabase = getSupabaseAdminClient()

    // Check if already saved
    const { data: existing, error: findError } = await supabase
      .from('saved_items')
      .select('*')
      .eq('user_id', userId)
      .eq('clip_chunk_span_id', clipChunkSpanId)
      .maybeSingle()

    if (findError && findError.code !== 'PGRST116') {
      console.error('❌ [saved/toggle] Find error:', findError)
      return NextResponse.json(
        { error: 'Failed to check saved status', message: findError.message },
        { status: 500 }
      )
    }

    let saved = false
    let item: any = null

    if (existing) {
      // Delete (unsave)
      const { error: deleteError } = await supabase
        .from('saved_items')
        .delete()
        .eq('id', existing.id)

      if (deleteError) {
        console.error('❌ [saved/toggle] Delete error:', deleteError)
        return NextResponse.json(
          { error: 'Failed to unsave', message: deleteError.message },
          { status: 500 }
        )
      }

      console.log('✅ [saved/toggle] Unsaved item', { clipChunkSpanId })
      saved = false
    } else {
      // Insert (save) - generate example sentence if OpenAI is available
      let exampleSentence: string | null = null
      
      if (openai) {
        try {
          console.log('🤖 [saved/toggle] Generating example sentence for:', chunkDisplay)
          exampleSentence = await generateExampleSentence(chunkDisplay)
          console.log('✅ [saved/toggle] Generated example sentence:', exampleSentence)
        } catch (genError: any) {
          console.warn('⚠️ [saved/toggle] Failed to generate example sentence:', genError.message)
          // Continue without example sentence
        }
      }

      const { data: inserted, error: insertError } = await supabase
        .from('saved_items')
        .insert({
          user_id: userId,
          clip_id: clipId,
          clip_chunk_span_id: clipChunkSpanId,
          chunk_display: chunkDisplay,
          kind: 'phrase',
          meaning: meaning || null,
          example_sentence: exampleSentence,
        })
        .select()
        .single()

      if (insertError) {
        // If duplicate key error, treat as success (idempotent)
        if (insertError.code === '23505') {
          console.log('✅ [saved/toggle] Already saved (duplicate key)', { clipChunkSpanId })
          // Fetch the existing item
          const { data: existingItem } = await supabase
            .from('saved_items')
            .select('*')
            .eq('user_id', userId)
            .eq('clip_chunk_span_id', clipChunkSpanId)
            .single()
          
          saved = true
          item = existingItem
        } else {
          console.error('❌ [saved/toggle] Insert error:', insertError)
          return NextResponse.json(
            { error: 'Failed to save', message: insertError.message },
            { status: 500 }
          )
        }
      } else {
        console.log('✅ [saved/toggle] Saved item', { clipChunkSpanId, hasExample: !!exampleSentence })
        saved = true
        item = inserted
      }
    }

    return NextResponse.json({ 
      success: true, 
      saved,
      item: item ? {
        id: item.id,
        chunk_display: item.chunk_display,
        meaning: item.meaning,
        example_sentence: item.example_sentence,
        created_at: item.created_at,
      } : undefined,
    })
  } catch (err: any) {
    console.error('❌ [saved/toggle] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error', message: err?.message || 'Unknown error' },
      { status: 500 }
    )
  }
}
