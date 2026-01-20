import { NextResponse } from 'next/server'
import { getSupabaseAdminClient } from '@/lib/supabase/server'
import { LISTENING_PATTERNS } from '@/lib/listeningPatterns' // Fallback patterns

export const runtime = 'nodejs'

// Cache for 10 minutes, allow stale for another 10 minutes
export const revalidate = 600

interface SupabasePattern {
  id: string
  pattern_key: string
  words: string[] | null // Primary: words[] array (new schema)
  chunk_display: string
  reduced_form: string | null
  how_it_sounds: string
  tip: string | null
  priority: number
  is_active: boolean
  meaning_general: string | null
  meaning_approved: string | null
  meaning_status: string
  parent_pattern_key: string | null
  // Parent pattern data (from JOIN)
  parent?: {
    chunk_display: string
    meaning_general: string | null
  } | null
  // Legacy columns (for backward compatibility)
  focus?: string
  left1?: string | null
  right1?: string | null
  right2?: string | null
}

interface ListeningPattern {
  id: string
  words: string[]
  chunkDisplay: string
  reducedForm?: string
  howItSounds: string
  tip?: string
  priority: number
  meaningGeneral?: string
  meaningApproved?: string
  meaningStatus: 'none' | 'general' | 'approved' | 'revoked'
  parentPatternKey?: string
  parentChunkDisplay?: string
  parentMeaningGeneral?: string
}

/**
 * Convert Supabase pattern to client format
 * 
 * New schema: uses words[] directly (no conversion needed)
 * Legacy fallback: converts from focus/left1/right1/right2 if words[] is null (shouldn't happen after migration)
 */
function convertSupabasePattern(pattern: any): ListeningPattern {
  // Primary: use words[] directly (new schema)
  let words: string[]
  if (pattern.words && pattern.words.length > 0) {
    words = pattern.words
  } else {
    // Legacy fallback: reconstruct from focus/left1/right1/right2 (for backward compatibility)
    // This should only happen if migration hasn't run yet
    console.warn(`⚠️ [listening-patterns] Pattern ${pattern.pattern_key} missing words[], using legacy conversion`)
    words = [pattern.focus || '']
    if (pattern.left1) words.unshift(pattern.left1)
    if (pattern.right1) words.push(pattern.right1)
    if (pattern.right2) words.push(pattern.right2)
  }

  // Handle parent: Supabase returns it as array if joined, or single object if not
  const parent = Array.isArray(pattern.parent) ? pattern.parent[0] : pattern.parent
  
  return {
    id: pattern.pattern_key || pattern.id,
    words,
    chunkDisplay: pattern.chunk_display,
    reducedForm: pattern.reduced_form || undefined,
    howItSounds: pattern.how_it_sounds,
    tip: pattern.tip || undefined,
    priority: pattern.priority,
    meaningGeneral: pattern.meaning_general || undefined,
    meaningApproved: pattern.meaning_approved || undefined,
    meaningStatus: (pattern.meaning_status || 'none') as 'none' | 'general' | 'approved' | 'revoked',
    parentPatternKey: pattern.parent_pattern_key || undefined,
    parentChunkDisplay: parent?.chunk_display || undefined,
    parentMeaningGeneral: parent?.meaning_general || undefined,
  }
}

/**
 * GET /api/listening-patterns
 * Returns active listening patterns from Supabase, ordered by priority DESC
 * Falls back to local patterns if DB fetch fails
 */
export async function GET() {
  try {
    const supabase = getSupabaseAdminClient()

    // Step 1: Fetch all active patterns
    const { data: patterns, error } = await supabase
      .from('listening_patterns')
      .select(`
        id,
        pattern_key,
        words,
        chunk_display,
        reduced_form,
        how_it_sounds,
        tip,
        priority,
        is_active,
        meaning_general,
        meaning_approved,
        meaning_status,
        parent_pattern_key,
        focus,
        left1,
        right1,
        right2
      `)
      .eq('is_active', true)
      .order('priority', { ascending: false })

    if (error) {
      console.error('❌ [listening-patterns] Supabase error:', error)
      console.error('❌ [listening-patterns] Error details:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      })
      // Fallback to local patterns
      return NextResponse.json(LISTENING_PATTERNS, {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=60', // Shorter cache on fallback
        },
      })
    }

    // If no data or empty array, fallback to local patterns
    if (!patterns || patterns.length === 0) {
      console.warn('⚠️ [listening-patterns] No patterns found in DB, using local fallback')
      return NextResponse.json(LISTENING_PATTERNS, {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=60',
        },
      })
    }

    // Step 2: Fetch parent chunk_display and meaning_general for patterns that have a parent
    const patternsWithParent = patterns.filter(p => p.parent_pattern_key)
    
    if (patternsWithParent.length > 0) {
      // Extract unique parent keys (filter out null/undefined)
      const parentKeySet = new Set<string>()
      patternsWithParent.forEach(p => {
        if (p.parent_pattern_key) {
          parentKeySet.add(p.parent_pattern_key)
        }
      })
      const parentKeys = Array.from(parentKeySet)
      
      const { data: parents, error: parentError } = await supabase
        .from('listening_patterns')
        .select('pattern_key, chunk_display, meaning_general')
        .in('pattern_key', parentKeys)

      if (!parentError && parents) {
        // Create lookup map for parent data
        const parentMap = new Map(
          parents.map(p => [p.pattern_key, { chunk_display: p.chunk_display, meaning_general: p.meaning_general }])
        )
        
        // Attach parent data to each pattern (using type assertion for dynamic property)
        patterns.forEach((pattern: any) => {
          if (pattern.parent_pattern_key) {
            const parentData = parentMap.get(pattern.parent_pattern_key)
            if (parentData) {
              // Add parent data as a "parent" object for convertSupabasePattern compatibility
              pattern.parent = parentData
            }
          }
        })
      } else if (parentError) {
        console.warn('⚠️ [listening-patterns] Failed to fetch parent patterns:', parentError)
        // Continue without parent data (non-fatal)
      }
    }

    // Step 3: Convert Supabase patterns to client format
    const convertedPatterns = patterns.map(convertSupabasePattern)

    // Debug: Log sample pattern with parent (e.g., 'gonna')
    if (process.env.NODE_ENV === 'development') {
      const gonnaPattern = convertedPatterns.find(p => p.id === 'gonna' || p.chunkDisplay === 'gonna')
      if (gonnaPattern) {
        console.log('🔍 [listening-patterns] Sample pattern (gonna):', {
          id: gonnaPattern.id,
          chunkDisplay: gonnaPattern.chunkDisplay,
          parentPatternKey: gonnaPattern.parentPatternKey || '(none)',
          parentChunkDisplay: gonnaPattern.parentChunkDisplay || '(none)',
          parentMeaningGeneral: gonnaPattern.parentMeaningGeneral || '(none)',
        })
      }
      
      // Also log raw pattern before conversion
      const rawGonna = patterns.find((p: any) => p.pattern_key === 'gonna') as any
      if (rawGonna) {
        console.log('🔍 [listening-patterns] Raw pattern before conversion (gonna):', {
          pattern_key: rawGonna.pattern_key,
          parent_pattern_key: rawGonna.parent_pattern_key || '(none)',
          parent: rawGonna.parent || '(none)',
          parent_chunk_display: rawGonna.parent?.chunk_display || '(none)',
        })
      }
    }

    return NextResponse.json(convertedPatterns, {
      headers: {
        'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=600',
      },
    })
  } catch (error) {
    console.error('❌ [listening-patterns] Unexpected error:', error)
    // Fallback to local patterns
    return NextResponse.json(LISTENING_PATTERNS, {
      status: 200, // Return 200 even on error to allow fallback
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=60',
      },
    })
  }
}

