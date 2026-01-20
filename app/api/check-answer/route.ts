import { NextRequest, NextResponse } from 'next/server'
import { alignTexts } from '@/lib/alignmentEngine'
import { attachPhraseSpans } from '@/lib/phraseSpans'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    let body: any
    try {
      body = await request.json()
    } catch (parseError: any) {
      console.error('❌ [check-answer] Error parsing request body:', {
        message: parseError?.message,
        name: parseError?.name,
        stack: parseError?.stack,
        err: parseError,
      })
      return NextResponse.json(
        { 
          error: 'Invalid request body',
          message: 'Request body must be valid JSON',
        },
        { status: 400 }
      )
    }

    // Support both old format (userAnswer/correctAnswer) and new format (userText/transcript)
    const userText = body.userText || body.userAnswer
    const transcript = body.transcript || body.correctAnswer
    const skipped = body.skipped === true

    // Log request details (safe info only)
    console.log('📝 [check-answer] Request:', {
      transcriptLength: transcript?.length || 0,
      userTextLength: userText?.length || 0,
      hasTranscript: !!transcript,
      hasUserText: !!userText,
      skipped,
    })

    if (!transcript) {
      return NextResponse.json(
        { 
          error: 'Missing transcript',
          message: 'Transcript is required',
        },
        { status: 400 }
      )
    }

    // Handle skipped submissions: return 0% accuracy without alignment
    if (skipped || !userText || userText.trim().length === 0) {
      return NextResponse.json({
        accuracyPercent: 0,
        refTokens: [],
        userTokens: [],
        tokens: [],
        events: [],
        stats: {
          correct: 0,
          substitutions: 0,
          missing: 0,
          extra: 0,
        },
        transcript,
        userText: userText || '',
        skipped: true,
      })
    }

    const base = alignTexts(transcript, userText)
    const aligned = attachPhraseSpans(base)

    const denom = aligned.stats.correct + aligned.stats.substitutions + aligned.stats.missing
    const accuracyPercent = denom > 0 ? Math.round((aligned.stats.correct / denom) * 100) : 0

    return NextResponse.json({
      accuracyPercent,
      refTokens: aligned.refTokens,
      userTokens: aligned.userTokens,
      tokens: aligned.tokens,
      events: aligned.events,
      stats: aligned.stats,
      transcript,
      userText,
    })
    
  } catch (error: any) {
    console.error('❌ [check-answer] Error:', {
      message: error?.message,
      name: error?.name,
      stack: error?.stack,
      err: error,
    })
    return NextResponse.json(
      { 
        error: 'Failed to check answer',
        message: error?.message || 'An unexpected error occurred while checking your answer',
      },
      { status: 500 }
    )
  }
}


