import { NextRequest, NextResponse } from 'next/server'
import { alignTexts } from '@/lib/textAlignment'
import { analyzeMistakes, generateSummary } from '@/lib/mistakeAnalysis'
import { generateOperationBasedSummary } from '@/lib/operationBasedSummary'
import { AlignmentOperation } from '@/lib/textAlignment'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    // Support both old format (userAnswer/correctAnswer) and new format (userText/transcript)
    const userText = body.userText || body.userAnswer
    const transcript = body.transcript || body.correctAnswer
    const mode = body.mode || 'type' // 'type' | 'speak'

    if (!userText || !transcript) {
      return NextResponse.json(
        { error: 'Missing transcript or userText' },
        { status: 400 }
      )
    }

    // Perform token-level alignment
    const alignment = alignTexts(transcript, userText)

    // Analyze mistakes (conservative approach)
    const topMistakes = analyzeMistakes(alignment.operations)
    
    // Generate summary based on operation patterns (more reliable than mistake analysis)
    const operationSummary = generateOperationBasedSummary(alignment.operations)
    
    // Use operation-based summary as primary, mistake-based as fallback
    let summary = operationSummary || generateSummary(topMistakes)

    // Supportive one-liner per spec based on dominant pattern
    // Prefer finer-grained rule: many missing on function words
    const functionWords = new Set([
      'a','an','the','to','for','of','in','on','at','by','with',
      'and','or','but','is','are','was','were','be','been','have','has','had',
      'do','does','did','will','would','could','should','i','you','he','she','it','we','they',
      'my','your','his','her','its','our','their'
    ])
    const totalMissing = alignment.operations.filter(op => op.type === 'missing').length
    const functionMissing = alignment.operations.filter(
      op => op.type === 'missing' && functionWords.has(op.ref.toLowerCase())
    ).length
    const totalExtra = alignment.operations.filter(op => op.type === 'extra').length
    const totalWrong = alignment.operations.filter(op => op.type === 'wrong').length
    if (functionMissing >= 2 && functionMissing >= totalMissing * 0.6) {
      summary = 'Short function words often disappear in fast speech.'
    } else if (totalWrong >= 2 && totalWrong >= (totalMissing + totalExtra + totalWrong) * 0.5) {
      summary = 'Word boundaries can shift when sounds connect.'
    } else if (totalExtra >= 2 && totalExtra >= (totalMissing + totalExtra + totalWrong) * 0.5) {
      summary = 'It’s common to fill gaps using context when audio is unclear.'
    }

    // Format alignment operations for API response
    const alignmentFormatted = alignment.operations.map(op => {
      if (op.type === 'correct') {
        return {
          type: 'correct' as const,
          ref: op.ref,
          hyp: op.hyp,
          refIndex: op.refIndex,
          hypIndex: op.hypIndex,
        }
      } else if (op.type === 'wrong') {
        return {
          type: 'wrong' as const,
          ref: op.ref,
          hyp: op.hyp,
          refIndex: op.refIndex,
          hypIndex: op.hypIndex,
        }
      } else if (op.type === 'missing') {
        return {
          type: 'missing' as const,
          ref: op.ref,
          refIndex: op.refIndex,
        }
      } else {
        return {
          type: 'extra' as const,
          hyp: op.hyp,
          hypIndex: op.hypIndex,
        }
      }
    })

    // Build new tokens array per spec
    const tokens = alignment.operations.map(op => {
      if (op.type === 'correct') {
        return {
          status: 'CORRECT' as const,
          original: op.ref,
          user: op.hyp,
          confidence: 'HIGH' as const,
          startMs: null as number | null,
          endMs: null as number | null,
        }
      }
      if (op.type === 'missing') {
        return {
          status: 'MISSING' as const,
          original: op.ref,
          user: null as string | null,
          confidence: 'MED' as const,
          startMs: null as number | null,
          endMs: null as number | null,
        }
      }
      if (op.type === 'extra') {
        return {
          status: 'EXTRA' as const,
          original: null as string | null,
          user: op.hyp,
          confidence: 'MED' as const,
          startMs: null as number | null,
          endMs: null as number | null,
        }
      }
      // wrong
      const conf = (op as AlignmentOperation & { confidence?: number }).confidence ?? 0.0
      const bucket = conf >= 0.75 ? 'HIGH' : conf >= 0.55 ? 'MED' : 'LOW'
      return {
        status: 'MISHEARD' as const,
        original: op.ref,
        user: op.hyp,
        confidence: bucket as 'HIGH' | 'MED' | 'LOW',
        startMs: null as number | null,
        endMs: null as number | null,
      }
    })

    // Top patterns summary object
    const top_patterns = {
      counts: {
        correct: alignment.counts.correct,
        misheard: alignment.operations.filter(o => o.type === 'wrong').length,
        missing: alignment.counts.deletion,
        extra: alignment.counts.insertion,
      },
      totals: {
        original_tokens: alignment.counts.refWords,
      },
    }

    const result = {
      accuracy: alignment.accuracy,
      wer: alignment.wer,
      counts: alignment.counts,
      alignment: alignmentFormatted,
      topMistakes: topMistakes.map(m => ({
        kind: m.kind,
        evidence: m.evidence,
      })),
      summary,
      tokens,
      top_patterns,
      // Legacy fields for backward compatibility
      accuracyPercent: Math.round(alignment.accuracy * 100),
      similarity: alignment.accuracy,
      tokensLegacy: alignmentFormatted.map(op => {
        if (op.type === 'correct') {
          return { type: 'correct', word: op.ref }
        } else if (op.type === 'wrong') {
          return { type: 'wrong', expected: op.ref, actual: op.hyp }
        } else if (op.type === 'missing') {
          return { type: 'missing', expected: op.ref }
        } else {
          return { type: 'extra', actual: op.hyp }
        }
      }),
      stats: {
        total: alignment.counts.refWords,
        correct: alignment.counts.correct,
        wrong: alignment.counts.substitution,
        missing: alignment.counts.deletion,
        extra: alignment.counts.insertion,
      },
    }
    
    console.log('✅ [check-answer] Result:', {
      accuracy: result.accuracy,
      wer: result.wer,
      topMistakes: result.topMistakes.length,
      summary: result.summary,
    })
    
    return NextResponse.json(result)
    
  } catch (error) {
    console.error('❌ [check-answer] Error:', error)
    return NextResponse.json(
      { error: 'Failed to check answer' },
      { status: 500 }
    )
  }
}


