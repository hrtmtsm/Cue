import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdminClient } from '@/lib/supabase/server'
import OpenAI from 'openai'

export const runtime = 'nodejs'

const meaningRequestSchema = z.object({
  chunkId: z.string().uuid('chunkId must be a valid UUID'),
})

// Initialize OpenAI client
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  : null

/**
 * Generate chunk meaning using OpenAI
 */
async function generateChunkMeaning(chunkText: string): Promise<string> {
  if (!openai) {
    throw new Error('OPENAI_API_KEY not configured')
  }

  const prompt = `Explain the meaning of this English phrase in one short sentence.
Use simple English. No examples.

Phrase:
"${chunkText}"`

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a language learning assistant. Provide clear, simple explanations of English phrases.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 50, // Limit to ~15 words
    })

    let meaning = completion.choices[0]?.message?.content?.trim() || ''

    // Remove quotes if present
    meaning = meaning.replace(/^["']|["']$/g, '')

    // Validate length (approximately 15 words max)
    const words = meaning.split(/\s+/)
    if (words.length > 15) {
      // Truncate to 15 words
      meaning = words.slice(0, 15).join(' ')
    }

    return meaning
  } catch (error: any) {
    console.error('❌ [chunk/meaning] OpenAI API error:', error)
    throw new Error(`Failed to generate meaning: ${error.message || 'Unknown error'}`)
  }
}

export async function POST(req: NextRequest) {
  try {
    // Parse JSON body
    let body: unknown
    try {
      body = await req.json()
    } catch (parseError: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('❌ [chunk/meaning] Error parsing request body:', parseError?.message)
      }
      return NextResponse.json(
        { error: 'Invalid request body - must be valid JSON' },
        { status: 400 }
      )
    }

    // Validate with Zod
    const validationResult = meaningRequestSchema.safeParse(body)
    if (!validationResult.success) {
      const errorMessage = validationResult.error.errors.map(e => e.message).join(', ')
      if (process.env.NODE_ENV === 'development') {
        console.error('❌ [chunk/meaning] Validation error:', validationResult.error.errors)
      }
      return NextResponse.json(
        { error: errorMessage },
        { status: 400 }
      )
    }

    const { chunkId } = validationResult.data

    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 [chunk/meaning] Request:', { chunkId })
    }

    // Get Supabase admin client
    const supabase = getSupabaseAdminClient()

    // Step 1: Check if meaning already exists
    const { data: existingMeaning, error: fetchError } = await supabase
      .from('chunk_meanings')
      .select('meaning_en')
      .eq('clip_chunk_span_id', chunkId)
      .single()

    if (fetchError && fetchError.code !== 'PGRST116') {
      // PGRST116 = no rows returned (expected if meaning doesn't exist)
      if (process.env.NODE_ENV === 'development') {
        console.error('❌ [chunk/meaning] Error fetching existing meaning:', fetchError)
      }
      return NextResponse.json(
        { error: 'Database error', message: fetchError.message },
        { status: 500 }
      )
    }

    // If meaning exists, return it
    if (existingMeaning) {
      if (process.env.NODE_ENV === 'development') {
        console.log('✅ [chunk/meaning] Found existing meaning')
      }
      return NextResponse.json({
        meaning: existingMeaning.meaning_en,
        cached: true,
      })
    }

    // Step 2: Get chunk text from clip_chunk_spans
    const { data: chunkSpan, error: chunkError } = await supabase
      .from('clip_chunk_spans')
      .select('chunk_text')
      .eq('id', chunkId)
      .single()

    if (chunkError || !chunkSpan) {
      if (process.env.NODE_ENV === 'development') {
        console.error('❌ [chunk/meaning] Chunk not found:', chunkError)
      }
      return NextResponse.json(
        { error: 'Chunk not found', message: chunkError?.message || 'Chunk does not exist' },
        { status: 404 }
      )
    }

    // Step 3: Generate meaning using OpenAI
    if (!openai) {
      return NextResponse.json(
        { error: 'OpenAI API not configured', message: 'OPENAI_API_KEY is required' },
        { status: 500 }
      )
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('🤖 [chunk/meaning] Generating meaning for:', chunkSpan.chunk_text)
    }

    let meaning: string
    try {
      meaning = await generateChunkMeaning(chunkSpan.chunk_text)
    } catch (genError: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('❌ [chunk/meaning] Generation failed:', genError)
      }
      return NextResponse.json(
        { error: 'Failed to generate meaning', message: genError.message },
        { status: 500 }
      )
    }

    // Step 4: Save to database
    const { error: insertError } = await supabase
      .from('chunk_meanings')
      .insert({
        clip_chunk_span_id: chunkId,
        meaning_en: meaning,
      })

    if (insertError) {
      if (process.env.NODE_ENV === 'development') {
        console.error('❌ [chunk/meaning] Failed to save meaning:', insertError)
      }
      // Still return the meaning even if save fails
      return NextResponse.json({
        meaning,
        cached: false,
        warning: 'Failed to save to database',
      })
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('✅ [chunk/meaning] Generated and saved meaning')
    }

    return NextResponse.json({
      meaning,
      cached: false,
    })
  } catch (err: any) {
    if (process.env.NODE_ENV === 'development') {
      console.error('❌ [chunk/meaning] Unexpected error:', err)
    }
    return NextResponse.json(
      { error: 'Internal server error', message: err?.message || 'Unknown error' },
      { status: 500 }
    )
  }
}
