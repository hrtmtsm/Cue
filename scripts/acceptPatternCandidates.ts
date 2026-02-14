#!/usr/bin/env node

/**
 * Accept pattern candidates and upsert them into listening_patterns
 * 
 * This script:
 * 1. Finds all candidates with status = 'accepted'
 * 2. Creates pattern_key from phrase_text
 * 3. Upserts into listening_patterns with basic fields
 * 4. Optionally generates spans for example clips
 * 
 * Usage:
 *   npx tsx scripts/acceptPatternCandidates.ts [options]
 * 
 * Options:
 *   --candidate-id <uuid>  Accept specific candidate by ID
 *   --all                  Accept all candidates with status='accepted'
 *   --generate-spans       Generate clip_pattern_spans for example clips
 *   --dry-run              Don't write to database, just print what would be done
 */

import { config } from 'dotenv'
import { resolve } from 'path'

// Load .env.local
config({ path: resolve(process.cwd(), '.env.local') })

import { getSupabaseAdminClient } from '@/lib/supabase/server'

const DRY_RUN = process.argv.includes('--dry-run')
const GENERATE_SPANS = process.argv.includes('--generate-spans')
const CANDIDATE_ID = process.argv.find(arg => arg.startsWith('--candidate-id'))?.split('=')[1]
const ACCEPT_ALL = process.argv.includes('--all')

/**
 * Generate pattern_key from phrase_text
 * Example: "push the deadline back" -> "push-the-deadline-back"
 */
function generatePatternKey(phraseText: string): string {
  return phraseText
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .split(/\s+/)
    .filter(word => word.length > 0)
    .join('-')
}

/**
 * Generate basic pattern data for listening_patterns
 */
function generatePatternData(candidate: any) {
  const words = candidate.phrase_text
    .toLowerCase()
    .split(/\s+/)
    .filter((word: string) => word.length > 0)

  if (words.length === 0) {
    throw new Error(`Invalid phrase_text: "${candidate.phrase_text}" - no words found`)
  }

  const patternKey = generatePatternKey(candidate.phrase_text)

  // Generate basic how_it_sounds based on candidate kind
  let howItSounds = ''
  let tip = ''
  if (candidate.candidate_kind === 'semantic') {
    howItSounds = `"${candidate.phrase_text}" is a phrasal verb or idiomatic expression with a specific meaning.`
    tip = 'This phrase is often used as a single meaning chunk.'
  } else {
    howItSounds = `"${candidate.phrase_text}" can sound different in fast speech - the words may blend together.`
    tip = 'Listen for the reduced form in fast speech.'
  }

  // Ensure focus is not empty (required NOT NULL field)
  const focus = words[0] || candidate.phrase_text.toLowerCase().split(/\s+/)[0] || 'phrase'

  // Ensure all NOT NULL fields are provided with safe defaults
  return {
    pattern_key: patternKey,
    words: words,
    chunk_display: candidate.phrase_text,
    how_it_sounds: howItSounds,
    tip: tip, // Always set to non-empty string (required NOT NULL)
    priority: 100, // Default priority (required NOT NULL with default)
    is_active: true, // Required NOT NULL with default
    // Legacy fields (for backward compatibility) - all required for NOT NULL constraints
    focus: focus, // Required NOT NULL
    left1: words.length > 1 ? null : null,
    right1: words.length > 1 ? words[1] : null,
    right2: words.length > 2 ? words[2] : null,
  }
}

/**
 * Generate spans for ALL clips that contain the phrase (not just example clips)
 */
async function generateSpans(
  supabase: any,
  patternKey: string,
  phraseText: string,
  exampleClipIds: string[]
) {
  if (!GENERATE_SPANS) {
    return
  }

  console.log(`   Generating spans for all clips containing "${phraseText}"...`)

  // Convert pattern_key back to phrase text for matching
  const phraseLower = phraseText.toLowerCase().trim()
  
  // Find ALL clips that contain this phrase (not just example clips)
  const { data: allClips, error: clipsError } = await supabase
    .from('curated_clips')
    .select('id, transcript')
    .not('transcript', 'is', null)
    .ilike('transcript', `%${phraseLower}%`)

  if (clipsError) {
    console.warn(`   ⚠️  Error loading clips:`, clipsError.message)
    return
  }

  if (!allClips || allClips.length === 0) {
    console.log(`   ℹ️  No clips found containing "${phraseText}"`)
    return
  }

  console.log(`   Found ${allClips.length} clips containing the phrase`)

  let spansCreated = 0
  let spansSkipped = 0
  let spansErrors = 0

  for (const clip of allClips) {
    if (!clip.transcript) continue

    const transcriptLower = clip.transcript.toLowerCase()
    
    // Find all occurrences of the phrase in the transcript
    let searchStart = 0
    let foundAny = false

    while (true) {
      const startIdx = transcriptLower.indexOf(phraseLower, searchStart)
      if (startIdx === -1) break

      foundAny = true
      const endIdx = startIdx + phraseLower.length

      // Check if span already exists for this position
      const { data: existing } = await supabase
        .from('clip_pattern_spans')
        .select('id')
        .eq('clip_id', clip.id)
        .eq('pattern_key', patternKey)
        .eq('ref_start', startIdx)
        .eq('ref_end', endIdx)
        .maybeSingle()

      if (existing) {
        spansSkipped++
        searchStart = startIdx + 1
        continue
      }

      // Insert span
      const { error } = await supabase
        .from('clip_pattern_spans')
        .insert({
          clip_id: clip.id,
          pattern_key: patternKey,
          ref_start: startIdx,
          ref_end: endIdx,
          approved: true, // Auto-approve spans for accepted patterns
        })

      if (error) {
        console.warn(`   ⚠️  Failed to create span for clip ${clip.id}:`, error.message)
        spansErrors++
      } else {
        spansCreated++
      }

      searchStart = startIdx + 1
    }

    if (!foundAny) {
      // This shouldn't happen since we filtered with ilike, but log it
      console.warn(`   ⚠️  Clip ${clip.id} matched ilike but phrase not found in transcript`)
    }
  }

  console.log(`   ✅ Created ${spansCreated} spans, skipped ${spansSkipped} (already exist), ${spansErrors} errors`)
}

/**
 * Main acceptance function
 */
async function acceptCandidates() {
  console.log('✅ Starting pattern candidate acceptance...')
  console.log(`   Dry run: ${DRY_RUN ? 'YES' : 'NO'}`)
  console.log(`   Generate spans: ${GENERATE_SPANS ? 'YES' : 'NO'}`)
  console.log('')

  const supabase = getSupabaseAdminClient()

  // Load candidates
  let query = supabase
    .from('pattern_candidates')
    .select('*')

  if (CANDIDATE_ID) {
    query = query.eq('id', CANDIDATE_ID)
    console.log(`📋 Loading candidate: ${CANDIDATE_ID}`)
  } else if (ACCEPT_ALL) {
    query = query.eq('status', 'accepted')
    console.log('📋 Loading all accepted candidates...')
  } else {
    console.error('❌ Error: Must specify --candidate-id <uuid> or --all')
    process.exit(1)
  }

  const { data: candidates, error: candidatesError } = await query

  if (candidatesError) {
    console.error('❌ Error loading candidates:', candidatesError)
    process.exit(1)
  }

  if (!candidates || candidates.length === 0) {
    console.log('ℹ️  No candidates found')
    return
  }

  console.log(`✅ Found ${candidates.length} candidate(s)`)
  console.log('')

  // Process each candidate
  let processed = 0
  let errors = 0

  for (const candidate of candidates) {
    console.log(`📝 Processing: "${candidate.phrase_text}" (${candidate.candidate_kind})`)

    const patternData = generatePatternData(candidate)
    console.log(`   Pattern key: ${patternData.pattern_key}`)
    console.log(`   Words: [${patternData.words.join(', ')}]`)

    if (DRY_RUN) {
      console.log('   🔍 DRY RUN - Would upsert to listening_patterns')
      processed++
      continue
    }

    // Upsert to listening_patterns
    const { error: upsertError } = await supabase
      .from('listening_patterns')
      .upsert(patternData, {
        onConflict: 'pattern_key',
      })

    if (upsertError) {
      console.error(`   ❌ Error upserting pattern:`, upsertError.message)
      errors++
      continue
    }

    console.log(`   ✅ Upserted to listening_patterns`)

    // Generate spans if requested (for ALL clips containing the phrase, not just examples)
    if (GENERATE_SPANS) {
      await generateSpans(supabase, patternData.pattern_key, candidate.phrase_text, candidate.example_clip_ids)
    }

    processed++
  }

  console.log('')
  console.log(`✅ Processed ${processed} candidate(s)`)
  if (errors > 0) {
    console.log(`⚠️  ${errors} error(s) occurred`)
  }
  console.log('')
  console.log('📝 Next steps:')
  console.log('   1. Review patterns in listening_patterns table')
  console.log('   2. Update how_it_sounds, tip, and other fields as needed')
  console.log('   3. Generate spans for additional clips if needed')
}

// Run acceptance
acceptCandidates().catch((error) => {
  console.error('❌ Fatal error:', error)
  process.exit(1)
})
