import { NextRequest, NextResponse } from 'next/server'
import { alignTexts } from '@/lib/alignmentEngine'
import { attachPhraseSpans } from '@/lib/phraseSpans'
import { getSupabaseAdminClient } from '@/lib/supabase/server'
import type { PatternFeedback } from '@/lib/types/patternFeedback'
import { evaluateSemanticUnderstanding, type SemanticEvaluation } from '@/lib/semanticEvaluator'

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
    const clipId = body.clipId // NEW: clipId for variant-specific feedback

    // Log request details (safe info only)
    console.log('📝 [check-answer] Request:', {
      transcriptLength: transcript?.length || 0,
      userTextLength: userText?.length || 0,
      hasTranscript: !!transcript,
      hasUserText: !!userText,
      skipped,
      clipId: clipId || '(none)',
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

    if (process.env.NODE_ENV === 'development') {
      const refTokens = base.refTokens || []
      console.log('[DEBUG][check-answer] refTokens check', {
        includesGonna: refTokens.includes('gonna'),
        includesGoingTo: refTokens.includes('going') && refTokens.includes('to'),
        refTokensPreview: refTokens.slice(0, 30),
      })
    }

    const aligned = attachPhraseSpans(base)

    // Fetch clip data if clipId provided (for semantic evaluation)
    let clip: any = null
    if (clipId) {
      try {
        const supabase = getSupabaseAdminClient()
        const { data: clipData, error: clipError } = await supabase
          .from('curated_clips')
          .select('semantic_structure, critical_keywords')
          .eq('id', clipId)
          .single()
        
        if (!clipError && clipData) {
          clip = clipData
        }
      } catch (error) {
        console.warn('⚠️ [check-answer] Failed to fetch clip for semantic evaluation:', error)
        // Continue without clip data (will use fallback calculation)
      }
    }

    // Calculate accuracy: use semantic evaluation if available, otherwise use alignment stats
    let semanticEval: SemanticEvaluation | null = null
    let accuracyPercent = 0

    if (clip?.semantic_structure && clip?.critical_keywords) {
      try {
        semanticEval = evaluateSemanticUnderstanding(
          userText,
          clip.semantic_structure as any,
          clip.critical_keywords as string[]
        )
        accuracyPercent = Math.round(semanticEval.semanticScore * 100)
      } catch (error) {
        console.error('Semantic evaluation error:', error)
        const denom = aligned.stats.correct + aligned.stats.substitutions + aligned.stats.missing
        accuracyPercent = denom > 0 ? Math.round((aligned.stats.correct / denom) * 100) : 0
      }
    } else {
    const denom = aligned.stats.correct + aligned.stats.substitutions + aligned.stats.missing
      accuracyPercent = denom > 0 ? Math.round((aligned.stats.correct / denom) * 100) : 0
    }

    // Variant-specific pattern feedback (only when comprehension failed)
    let patternFeedback: PatternFeedback[] | undefined = undefined
    
    if (clipId && semanticEval && !semanticEval.understood) {
      console.log('🔍 Pattern feedback check:', {
        hasClipId: !!clipId,
        hasSemanticEval: !!semanticEval,
        understood: semanticEval?.understood,
        willFetchPatterns: !!(clipId && semanticEval && !semanticEval.understood),
      })

      try {
        const supabase = getSupabaseAdminClient()
        
        // 1. Fetch pattern spans with pattern metadata for sorting
        const { data: patternSpans, error: spansError } = await supabase
          .from('clip_pattern_spans')
          .select(`
            *,
            listening_patterns!inner (
              cefr_min,
              priority
            ),
            listening_pattern_variants(
              written_form,
              spoken_form,
              explanation_short,
              explanation_medium,
              listening_strategy,
              what_to_focus_on
            )
          `)
          .eq('clip_id', clipId)
          .eq('approved', true)
        
        console.log('🔍 Fetched spans from DB:', {
          count: patternSpans?.length || 0,
          spans: patternSpans?.map((s: any) => ({
            pattern_key: s.pattern_key,
            ref_start: s.ref_start,
            ref_end: s.ref_end,
          })),
        })

        if (spansError) {
          console.warn('⚠️ [check-answer] Failed to fetch pattern spans:', {
            clipId,
            error: spansError.message,
          })
          // Continue without pattern feedback (non-fatal)
        } else if (patternSpans && patternSpans.length > 0) {
          // 2. Filter patterns to only those affecting what the learner actually missed
          const relevantSpans = (patternSpans || []).filter((span: any) => {
            const spanText = transcript.substring(span.ref_start, span.ref_end).toLowerCase()
            
            // If they missed specific keywords, show patterns affecting those keywords
            if (semanticEval && semanticEval.missingKeywords && semanticEval.missingKeywords.length > 0) {
              const affectsMissingKeyword = semanticEval.missingKeywords.some(kw => {
                const kwLower = kw.toLowerCase()
                // Check if keyword is in span, or span is in keyword area
                return spanText.includes(kwLower) || kwLower.includes(spanText.trim())
              })
              if (affectsMissingKeyword) return true
            }
            
            // If they missed semantic units, show patterns in those areas
            if (semanticEval && semanticEval.missingUnits && semanticEval.missingUnits.length > 0) {
              const semanticStruct = clip?.semantic_structure || {}
              
              // Check if span overlaps with timing area
              if (semanticEval.missingUnits.includes('timing')) {
                const timingKeywords = (semanticStruct?.timing_keywords || []) as string[]
                const affectsTiming = timingKeywords.some((kw: string) => {
                  const kwLower = kw.toLowerCase()
                  // Match even if span is a truncated part of the keyword
                  return spanText.includes(kwLower) || kwLower.includes(spanText.trim())
                })
                if (affectsTiming) return true
              }
              
              // Check if span overlaps with action
              if (semanticEval.missingUnits.includes('action')) {
                const actionWord = semanticStruct?.action as string | undefined
                if (actionWord && spanText.includes(actionWord.toLowerCase())) {
                  return true
                }
              }
              
              // Check if span overlaps with object
              if (semanticEval.missingUnits.includes('object')) {
                const objectWord = semanticStruct?.object as string | undefined
                if (objectWord && spanText.includes(objectWord.toLowerCase())) {
                  return true
                }
              }
            }
            
            return false
          }) || []

          console.log('🔍 After filtering:', {
            relevantCount: relevantSpans?.length || 0,
            missingUnits: semanticEval?.missingUnits,
            missingKeywords: semanticEval?.missingKeywords,
            relevantSpans,
          })

          if (relevantSpans && relevantSpans.length > 0) {
            // 3. Sort by CEFR → position → priority
            relevantSpans.sort((a: any, b: any) => {
              const cefr_order: Record<string, number> = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 }
              const aCefr = cefr_order[a.listening_patterns?.cefr_min] || 99
              const bCefr = cefr_order[b.listening_patterns?.cefr_min] || 99
              
              if (aCefr !== bCefr) return aCefr - bCefr
              if (a.ref_start !== b.ref_start) return a.ref_start - b.ref_start
              return (a.listening_patterns?.priority || 0) - (b.listening_patterns?.priority || 0)
            })
            
            // 4. Take first relevant span and build feedback
            const primaryMissed = relevantSpans[0] as any
            const variant = primaryMissed.listening_pattern_variants
            
            console.log('🔍 Full primaryMissed object:', JSON.stringify(primaryMissed, null, 2))
            console.log('🔍 Checking variant:', {
              hasPrimaryMissed: !!primaryMissed,
              hasVariantsArray: !!primaryMissed?.listening_pattern_variants,
              variantsLength: primaryMissed?.listening_pattern_variants?.length,
              variant: primaryMissed?.listening_pattern_variants?.[0],
            })

            if (variant) {
              const affectedUnit = semanticEval?.missingUnits?.[0] ?? null
              const affectedKeyword = semanticEval?.missingKeywords?.[0] ?? null
              const explanationMedium = variant.explanation_medium || variant.explanation_short

              console.log('🔍 Building feedback from relevant spans:', {
                relevantSpansCount: relevantSpans?.length,
                firstSpan: relevantSpans?.[0],
                hasVariant: !!(relevantSpans?.[0]?.listening_pattern_variants?.[0]),
              })

              patternFeedback = [{
                pattern_key: primaryMissed.pattern_key,
                written_form: variant.written_form,
                spoken_form: variant.spoken_form,
                explanation_short: variant.explanation_short,
                explanation_medium: explanationMedium,
                ref_start: primaryMissed.ref_start,
                ref_end: primaryMissed.ref_end,
                patternKey: primaryMissed.pattern_key,
                writtenForm: variant.written_form,
                spokenForm: variant.spoken_form,
                explanationShort: variant.explanation_short,
                explanationMedium,
                listeningStrategy: (variant as any).listening_strategy || null,
                whatToFocusOn: (variant as any).what_to_focus_on || null,
                spanStart: primaryMissed.ref_start,
                spanEnd: primaryMissed.ref_end,
                affectedUnit,
                affectedKeyword,
              } as any]

              console.log('🔍 Constructed patternFeedback:', patternFeedback)
            } else {
              patternFeedback = []
            }
          } else {
            patternFeedback = []
          }
        } else {
          // No patterns defined for this clip, skip variant feedback
          patternFeedback = []
        }
      } catch (error: any) {
        console.error('❌ [check-answer] Error fetching pattern feedback:', {
          clipId,
          message: error?.message,
          stack: error?.stack,
        })
        // Continue without pattern feedback (non-fatal)
      }
    }

    const responseBody = {
      accuracyPercent,
      refTokens: aligned.refTokens,
      userTokens: aligned.userTokens,
      tokens: aligned.tokens,
      events: aligned.events,
      stats: aligned.stats,
      transcript,
      userText,
      semanticScore: semanticEval?.semanticScore ?? null,
      missingUnits: semanticEval?.missingUnits ?? [],
      capturedKeywords: semanticEval?.capturedKeywords ?? [],
      missingKeywords: semanticEval?.missingKeywords ?? [],
      understood: semanticEval?.understood ?? (accuracyPercent >= 70),
      ...(patternFeedback !== undefined && { patternFeedback }), // Only include if defined
    } as const

    console.log('🔍 Final pattern feedback:', responseBody.patternFeedback)

    return NextResponse.json(responseBody)
    
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


