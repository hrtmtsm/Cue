#!/usr/bin/env node

/**
 * Auto-detect listening patterns in practice clips and create clip_pattern_spans entries
 * 
 * Usage:
 *   npx tsx scripts/detectPatternSpans.ts
 */

import { config } from 'dotenv'
import { resolve } from 'path'
import { getSupabaseAdminClient } from '@/lib/supabase/server'

// Load .env.local
config({ path: resolve(process.cwd(), '.env.local') })

interface PatternMatch {
  patternKey: string
  refStart: number
  refEnd: number
  spanType: 'pattern' | 'chunk' | 'weak_form'
}

interface PatternDefinition {
  key: string
  regex: RegExp
  spanType: 'pattern' | 'chunk' | 'weak_form'
}

// Pattern definitions with regexes
const PATTERN_DEFINITIONS: PatternDefinition[] = [
  {
    key: 'gonna',
    regex: /\b(going to|gonna)\b/gi,
    spanType: 'pattern',
  },
  {
    key: 'wanna',
    regex: /\b(want to|wanna)\b/gi,
    spanType: 'pattern',
  },
  {
    key: 'gotta',
    regex: /\b(got to|gotta|have got to|'ve got to)\b/gi,
    spanType: 'pattern',
  },
  {
    key: 'shoulda',
    regex: /\b(should have|should've|shoulda)\b/gi,
    spanType: 'pattern',
  },
  {
    key: 'coulda',
    regex: /\b(could have|could've|coulda)\b/gi,
    spanType: 'pattern',
  },
  {
    key: 'woulda',
    regex: /\b(would have|would've|woulda)\b/gi,
    spanType: 'pattern',
  },
  {
    key: 'didja',
    regex: /\b(did you|didja)\b/gi,
    spanType: 'pattern',
  },
  {
    key: 'to',
    regex: /\bto\b/g,
    spanType: 'weak_form',
  },
  {
    key: 'the',
    regex: /\bthe\b/g,
    spanType: 'weak_form',
  },
]

/**
 * Detect all patterns in a transcript
 */
function detectPatterns(transcript: string): PatternMatch[] {
  const matches: PatternMatch[] = []
  
  for (const patternDef of PATTERN_DEFINITIONS) {
    const regex = new RegExp(patternDef.regex.source, patternDef.regex.flags)
    let match: RegExpExecArray | null
    
    // Reset regex lastIndex for global regexes
    regex.lastIndex = 0
    
    while ((match = regex.exec(transcript)) !== null) {
      matches.push({
        patternKey: patternDef.key,
        refStart: match.index,
        refEnd: match.index + match[0].length,
        spanType: patternDef.spanType,
      })
      
      // Prevent infinite loop for non-global regexes
      if (!regex.global) {
        break
      }
    }
  }
  
  // Sort by position in transcript
  matches.sort((a, b) => a.refStart - b.refStart)
  
  return matches
}

/**
 * Check if pattern_key exists in listening_patterns table
 * Returns true if pattern exists, false otherwise
 */
async function patternKeyExists(
  supabase: any,
  patternKey: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('listening_patterns')
      .select('pattern_key')
      .eq('pattern_key', patternKey)
      .limit(1)
      .single()
    
    return !error && data !== null
  } catch (error) {
    return false
  }
}

/**
 * Look up variant_id for a pattern_key
 * Returns the first variant's id, or null if not found
 */
async function lookupVariantId(
  supabase: any,
  patternKey: string
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('listening_pattern_variants')
      .select('id')
      .eq('pattern_key', patternKey)
      .limit(1)
      .single()
    
    if (error || !data) {
      return null
    }
    
    return data.id
  } catch (error) {
    return null
  }
}

/**
 * Check if pattern spans already exist for a clip
 */
async function getExistingSpans(
  supabase: any,
  clipId: string
): Promise<Set<string>> {
  try {
    const { data, error } = await supabase
      .from('clip_pattern_spans')
      .select('pattern_key, ref_start, ref_end')
      .eq('clip_id', clipId)
    
    if (error || !data) {
      return new Set()
    }
    
    // Create a set of unique identifiers: "pattern_key:start:end"
    return new Set(
      data.map((span: any) => 
        `${span.pattern_key}:${span.ref_start}:${span.ref_end}`
      )
    )
  } catch (error) {
    return new Set()
  }
}

/**
 * Main function to detect and create pattern spans
 */
async function detectPatternSpans() {
  console.log('🔍 Starting pattern span detection for practice clips...\n')
  
  const supabase = getSupabaseAdminClient()
  
  // Fetch all practice clips
  const { data: clips, error: clipsError } = await supabase
    .from('curated_clips')
    .select('id, transcript')
    .eq('clip_type', 'practice')
    .order('id', { ascending: true })
  
  if (clipsError) {
    console.error('❌ Failed to fetch clips:', clipsError.message)
    process.exit(1)
  }
  
  if (!clips || clips.length === 0) {
    console.warn('⚠️  No practice clips found')
    process.exit(0)
  }
  
  console.log(`📊 Found ${clips.length} practice clips to process\n`)
  
  // Track statistics
  let totalSpansCreated = 0
  let totalClipsProcessed = 0
  const skippedPatterns = new Map<string, number>() // pattern_key -> count
  const clipErrors: Array<{ clipId: string; error: string }> = []
  
  // Process clips in batches
  const BATCH_SIZE = 50
  const SPAN_BATCH_SIZE = 100
  
  for (let i = 0; i < clips.length; i += BATCH_SIZE) {
    const batch = clips.slice(i, i + BATCH_SIZE)
    const spansToInsert: any[] = []
    
    for (const clip of batch) {
      try {
        const clipId = clip.id
        const transcript = clip.transcript
        
        // Get existing spans to avoid duplicates
        const existingSpans = await getExistingSpans(supabase, clipId)
        
        // Detect patterns
        const patternMatches = detectPatterns(transcript)
        
        // Log patterns found
        const patternKeys = Array.from(new Set(patternMatches.map(m => m.patternKey)))
        console.log(
          `Processing ${clipId}... found ${patternMatches.length} patterns: ${patternKeys.join(', ')}`
        )
        
        // For each pattern match, check if pattern exists and create span
        for (const match of patternMatches) {
          // Check if this span already exists
          const spanKey = `${match.patternKey}:${match.refStart}:${match.refEnd}`
          if (existingSpans.has(spanKey)) {
            continue // Skip duplicate
          }
          
          // First, check if pattern_key exists in listening_patterns (required for FK)
          const patternExists = await patternKeyExists(supabase, match.patternKey)
          if (!patternExists) {
            // Log skipped pattern (pattern_key doesn't exist in database)
            const count = skippedPatterns.get(match.patternKey) || 0
            skippedPatterns.set(match.patternKey, count + 1)
            continue // Skip this pattern - can't insert without valid pattern_key
          }
          
          // Look up variant_id for this pattern
          const variantId = await lookupVariantId(supabase, match.patternKey)
          
          if (!variantId) {
            // Log skipped pattern (no variant found)
            const count = skippedPatterns.get(match.patternKey) || 0
            skippedPatterns.set(match.patternKey, count + 1)
            // Still create the span with pattern_key (variant_id will be null)
          }
          
          // Create span entry
          spansToInsert.push({
            clip_id: clipId,
            pattern_key: match.patternKey,
            variant_id: variantId, // Include the variant_id we looked up
            ref_start: match.refStart,
            ref_end: match.refEnd,
            confidence: 'high', // Add required confidence field
            approved: true, // Auto-detected spans are approved by default
          })
        }
        
        totalClipsProcessed++
      } catch (error: any) {
        console.error(`❌ Error processing clip ${clip.id}:`, error.message)
        clipErrors.push({
          clipId: clip.id,
          error: error.message,
        })
      }
    }
    
    // Insert spans in batches
    if (spansToInsert.length > 0) {
      for (let j = 0; j < spansToInsert.length; j += SPAN_BATCH_SIZE) {
        const spanBatch = spansToInsert.slice(j, j + SPAN_BATCH_SIZE)
        
        try {
          const { error: insertError } = await supabase
            .from('clip_pattern_spans')
            .insert(spanBatch)
          
          if (insertError) {
            console.error(`❌ Error inserting span batch:`, insertError.message)
            // Log individual errors
            spanBatch.forEach((span: any) => {
              clipErrors.push({
                clipId: span.clip_id,
                error: insertError.message,
              })
            })
          } else {
            totalSpansCreated += spanBatch.length
          }
        } catch (error: any) {
          console.error(`❌ Exception inserting span batch:`, error.message)
        }
      }
    }
    
    // Progress logging
    if ((i + BATCH_SIZE) % 50 === 0 || i + BATCH_SIZE >= clips.length) {
      console.log(`✅ Processed ${Math.min(i + BATCH_SIZE, clips.length)}/${clips.length} clips...`)
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(50))
  console.log(`✅ Created ${totalSpansCreated} pattern spans across ${totalClipsProcessed} clips`)
  
  if (skippedPatterns.size > 0) {
    console.log(`\n⚠️  Skipped ${Array.from(skippedPatterns.values()).reduce((a, b) => a + b, 0)} patterns (no variant found):`)
    for (const [patternKey, count] of Array.from(skippedPatterns.entries())) {
      console.log(`   - ${patternKey}: ${count} occurrences`)
    }
  }
  
  if (clipErrors.length > 0) {
    console.log(`\n❌ ${clipErrors.length} errors occurred:`)
    // Show first 10 errors
    clipErrors.slice(0, 10).forEach(({ clipId, error }) => {
      console.log(`   - ${clipId}: ${error}`)
    })
    if (clipErrors.length > 10) {
      console.log(`   ... and ${clipErrors.length - 10} more errors`)
    }
  }
  
  console.log('='.repeat(50) + '\n')
}

// Run the detection
detectPatternSpans().catch((error) => {
  console.error('❌ Fatal error:', error)
  process.exit(1)
})

