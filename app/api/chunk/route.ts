import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdminClient } from '@/lib/supabase/server'
import OpenAI from 'openai'

export const runtime = 'nodejs'

const chunkRequestSchema = z.object({
  clipId: z.string().min(1, 'clipId must be a non-empty string'),
  charIdx: z.number().int().nonnegative('charIdx must be a non-negative integer'),
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

  const systemMessage = 'You are an expert English listening coach. Provide a usage-based meaning and one example sentence. Follow the output format exactly. No pronunciation explanation. No dictionary/etymology.'

  const userPrompt = `Provide MEANING and EXAMPLE for this phrase.

Phrase: "${chunkText}"

Rules for MEANING:
- One sentence, 8–12 words
- Explain when/why speakers use it (usage-based)
- Do NOT translate word-by-word
- Do NOT explain pronunciation or sound changes
- Do NOT use "means", "is short for", or similar
- Do NOT repeat the phrase itself

Rules for EXAMPLE:
- One natural sentence, <= 12 words
- Must include the phrase EXACTLY as given (case/punctuation)
- Must NOT be meta or definitional (avoid "That's {phrase}.", "This is {phrase}.")
- No explanation or translation

Output format (required):

MEANING:
...

EXAMPLE:
...`

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: systemMessage,
        },
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      temperature: 0.4, // Lower temperature for more consistent formatting
      max_tokens: 140, // Increased to accommodate meaning + example
    })

    let meaning = completion.choices[0]?.message?.content?.trim() || ''

    // Remove surrounding quotes if present (but preserve internal quotes in examples)
    meaning = meaning.replace(/^["']|["']$/g, '')

    // Validate format has both MEANING: and EXAMPLE: sections
    const hasMeaning = /MEANING:/i.test(meaning)
    const hasExample = /EXAMPLE:/i.test(meaning)
    
    if (!hasMeaning || !hasExample) {
      console.warn('⚠️ [chunk] GPT output missing required format sections:', { 
        chunkText, 
        hasMeaning, 
        hasExample, 
        output: meaning.substring(0, 100) 
      })
      
      // Retry once with stricter format reminder
      const retryCompletion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: systemMessage + ' FORMAT REQUIRED: You MUST include both "MEANING:" and "EXAMPLE:" labels.',
          },
          {
            role: 'user',
            content: userPrompt,
          },
        ],
        temperature: 0.4,
        max_tokens: 140,
      })
      
      const retryMeaning = retryCompletion.choices[0]?.message?.content?.trim() || ''
      meaning = retryMeaning.replace(/^["']|["']$/g, '')
      
      // If still missing format, use fallback template
      if (!/MEANING:/i.test(meaning) || !/EXAMPLE:/i.test(meaning)) {
        console.error('❌ [chunk] GPT retry failed format validation, using fallback')
        meaning = `MEANING:\nCommon phrase in spoken English.\n\nEXAMPLE:\n${chunkText} is used in everyday conversation.`
      }
    }

    return meaning
  } catch (error: any) {
    console.error('❌ [chunk] OpenAI API error:', error)
    throw new Error(`Failed to generate meaning: ${error.message || 'Unknown error'}`)
  }
}

export async function POST(req: Request) {
  try {
    // Parse JSON body
    let body: unknown
    try {
      body = await req.json()
    } catch (parseError: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('❌ [chunk] Error parsing request body:', parseError?.message)
      }
      return NextResponse.json(
        { hit: null, error: 'Invalid request body - must be valid JSON' },
        { status: 400 }
      )
    }

    // Validate with Zod
    const validationResult = chunkRequestSchema.safeParse(body)
    if (!validationResult.success) {
      const errorMessage = validationResult.error.errors.map(e => e.message).join(', ')
      if (process.env.NODE_ENV === 'development') {
        console.error('❌ [chunk] Validation error:', validationResult.error.errors)
      }
      return NextResponse.json(
        { hit: null, error: errorMessage },
        { status: 400 }
      )
    }

    const { clipId, charIdx } = validationResult.data

    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 [chunk] Request:', { clipId, charIdx })
    }

    // Get Supabase admin client
    const supabase = getSupabaseAdminClient()

    // Step 1: Find chunk span using RPC
    const { data: chunkSpansData, error: chunkSpansError } = await supabase.rpc('get_clip_chunk_hit', {
      p_clip_id: clipId,
      p_char_idx: charIdx,
    })

    if (chunkSpansError) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('⚠️ [chunk] get_clip_chunk_hit error:', chunkSpansError.message)
      }
    }

    // If no chunk span found, return null
    if (!chunkSpansData || chunkSpansData.length === 0) {
      if (process.env.NODE_ENV === 'development') {
        console.log('❌ [chunk] No chunk span found for:', { clipId, charIdx })
      }
      return NextResponse.json({ hit: null })
    }

    const spanData = chunkSpansData[0]

    // Step 2: Get the chunk span ID and chunk_text from RPC response
    const spanId: string = spanData.id
    const chunkText: string = spanData.chunk_text
    const refStart: number = spanData.ref_start
    const refEnd: number = spanData.ref_end

    if (!spanId || !chunkText) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('⚠️ [chunk] Invalid chunk span data:', {
          clipId,
          charIdx,
          hasId: !!spanId,
          hasChunkText: !!chunkText,
        })
      }
      return NextResponse.json({ hit: null })
    }

    // Step 3: Look up meaning in chunk_meanings
    let meaning: string | null = null
    let meaningCached = false

    if (spanId) {
      const { data: existingMeaning, error: meaningError } = await supabase
        .from('chunk_meanings')
        .select('meaning_en')
        .eq('clip_chunk_span_id', spanId)
        .maybeSingle()

      if (!meaningError && existingMeaning) {
        meaning = existingMeaning.meaning_en
        meaningCached = true
        console.log('✅ [chunk] Meaning cache hit for span:', spanId, { meaningCached: true })
      } else if (meaningError && meaningError.code !== 'PGRST116') {
        // PGRST116 = no rows (expected if meaning doesn't exist)
        if (process.env.NODE_ENV === 'development') {
          console.warn('⚠️ [chunk] Error fetching meaning:', meaningError.message)
        }
      }
    }

    // Step 4: Generate meaning if not found
    if (!meaning && spanId && chunkText) {
      if (openai) {
        try {
          if (process.env.NODE_ENV === 'development') {
            console.log('🤖 [chunk] Generating meaning for:', chunkText)
          }
          
          meaning = await generateChunkMeaning(chunkText)
          
          // Save to database (UPSERT to avoid duplicates - idempotent)
          const { error: upsertError } = await supabase
            .from('chunk_meanings')
            .upsert({
              clip_chunk_span_id: spanId,
              meaning_en: meaning,
            }, {
              onConflict: 'clip_chunk_span_id',
            })

          if (upsertError) {
            console.error('❌ [chunk] Failed to upsert meaning:', upsertError)
            // Continue anyway - meaning is generated, just not saved
          } else {
            console.log('✅ [chunk] Generated and saved meaning for span:', spanId, { meaningCached: false })
          }
        } catch (genError: any) {
          if (process.env.NODE_ENV === 'development') {
            console.error('❌ [chunk] Meaning generation failed:', genError)
          }
          // Continue without meaning
        }
      } else {
        if (process.env.NODE_ENV === 'development') {
          console.warn('⚠️ [chunk] OpenAI not configured, cannot generate meaning')
        }
      }
    }

    // Step 5: Build ChunkHit response matching the interface
    const hit = {
      clip_id: clipId,
      pattern_key: null,
      chunk_display: chunkText || spanData.chunk_display || '',
      pattern_kind: meaning ? 'meaning' : (spanData.pattern_kind || null),
      gloss: meaning || spanData.gloss || null,
      translation_ja: null,
      ref_start: refStart,
      ref_end: refEnd,
      chunk_id: spanId, // Include chunk_id for saving
    }

    console.log('✅ [chunk] Returning ChunkHit:', {
      chunk_display: hit.chunk_display,
      hasMeaning: !!meaning,
      meaningCached,
      chunk_id: spanId,
      ref_start: hit.ref_start,
      ref_end: hit.ref_end,
    })

    return NextResponse.json({ hit, meaningCached })
  } catch (err: any) {
    if (process.env.NODE_ENV === 'development') {
      console.error('❌ [chunk] Unexpected error:', err)
    }
    return NextResponse.json(
      { hit: null, error: err?.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
