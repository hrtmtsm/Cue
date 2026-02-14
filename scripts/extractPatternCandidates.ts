#!/usr/bin/env node

/**
 * Extract pattern candidates from curated_clips transcripts
 * 
 * Extracts frequent n-grams (2-4 words) and phrasal verb patterns from all transcripts.
 * Writes candidates to pattern_candidates table for manual review.
 * 
 * Usage:
 *   npx tsx scripts/extractPatternCandidates.ts [options]
 * 
 * Options:
 *   --min-freq <number>    Minimum frequency for n-grams (default: 3)
 *   --max-ngram <number>   Maximum n-gram size (default: 4)
 *   --top-n <number>       Top N candidates to save per kind (default: 100)
 *   --dry-run              Don't write to database, just print stats
 */

import { config } from 'dotenv'
import { resolve } from 'path'

// Load .env.local
config({ path: resolve(process.cwd(), '.env.local') })

import { getSupabaseAdminClient } from '@/lib/supabase/server'

// Configuration
const MIN_FREQUENCY = parseInt(process.argv.find(arg => arg.startsWith('--min-freq'))?.split('=')[1] || '3', 10)
const MAX_NGRAM = parseInt(process.argv.find(arg => arg.startsWith('--max-ngram'))?.split('=')[1] || '4', 10)
const TOP_N = parseInt(process.argv.find(arg => arg.startsWith('--top-n'))?.split('=')[1] || '100', 10)
const DRY_RUN = process.argv.includes('--dry-run')

// Phrasal verb particles
const PARTICLES = ['up', 'out', 'off', 'back', 'down', 'in', 'on', 'over', 'away', 'through', 'around', 'along', 'about', 'across']

interface Candidate {
  phrase_text: string
  candidate_kind: 'listening' | 'semantic'
  frequency: number
  example_clip_ids: string[]
}

/**
 * Tokenize text into lowercase words
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ') // Replace punctuation with spaces
    .split(/\s+/)
    .filter(word => word.length > 0)
}

/**
 * Extract n-grams from tokenized text
 */
function extractNGrams(tokens: string[], minSize: number, maxSize: number): Map<string, number> {
  const ngrams = new Map<string, number>()
  
  for (let size = minSize; size <= maxSize; size++) {
    for (let i = 0; i <= tokens.length - size; i++) {
      const ngram = tokens.slice(i, i + size).join(' ')
      ngrams.set(ngram, (ngrams.get(ngram) || 0) + 1)
    }
  }
  
  return ngrams
}

/**
 * Extract phrasal verb patterns (verb + particle)
 */
function extractPhrasalVerbs(tokens: string[]): Map<string, number> {
  const phrasalVerbs = new Map<string, number>()
  
  for (let i = 0; i < tokens.length - 1; i++) {
    const verb = tokens[i]
    const next = tokens[i + 1]
    
    // Check if next token is a particle
    if (PARTICLES.includes(next)) {
      const phrase = `${verb} ${next}`
      phrasalVerbs.set(phrase, (phrasalVerbs.get(phrase) || 0) + 1)
    }
  }
  
  return phrasalVerbs
}

/**
 * Main extraction function
 */
async function extractCandidates() {
  console.log('🔍 Starting pattern candidate extraction...')
  console.log(`   Min frequency: ${MIN_FREQUENCY}`)
  console.log(`   Max n-gram size: ${MAX_NGRAM}`)
  console.log(`   Top N per kind: ${TOP_N}`)
  console.log(`   Dry run: ${DRY_RUN ? 'YES' : 'NO'}`)
  console.log('')

  const supabase = getSupabaseAdminClient()

  // Load all curated clips
  console.log('📥 Loading transcripts from curated_clips...')
  const { data: clips, error: clipsError } = await supabase
    .from('curated_clips')
    .select('id, transcript')
    .not('transcript', 'is', null)

  if (clipsError) {
    console.error('❌ Error loading clips:', clipsError)
    process.exit(1)
  }

  if (!clips || clips.length === 0) {
    console.error('❌ No clips found')
    process.exit(1)
  }

  console.log(`✅ Loaded ${clips.length} clips`)
  console.log('')

  // Aggregate n-grams and phrasal verbs across all transcripts
  const ngramMap = new Map<string, { frequency: number; clipIds: Set<string> }>()
  const phrasalVerbMap = new Map<string, { frequency: number; clipIds: Set<string> }>()

  console.log('🔍 Extracting patterns from transcripts...')
  let processed = 0
  for (const clip of clips) {
    if (!clip.transcript) continue

    const tokens = tokenize(clip.transcript)
    
    // Extract n-grams
    const ngrams = extractNGrams(tokens, 2, MAX_NGRAM)
    for (const [ngram, count] of Array.from(ngrams.entries())) {
      if (!ngramMap.has(ngram)) {
        ngramMap.set(ngram, { frequency: 0, clipIds: new Set() })
      }
      const entry = ngramMap.get(ngram)!
      entry.frequency += count
      entry.clipIds.add(clip.id)
    }

    // Extract phrasal verbs
    const phrasalVerbs = extractPhrasalVerbs(tokens)
    for (const [phrase, count] of Array.from(phrasalVerbs.entries())) {
      if (!phrasalVerbMap.has(phrase)) {
        phrasalVerbMap.set(phrase, { frequency: 0, clipIds: new Set() })
      }
      const entry = phrasalVerbMap.get(phrase)!
      entry.frequency += count
      entry.clipIds.add(clip.id)
    }

    processed++
    if (processed % 100 === 0) {
      console.log(`   Processed ${processed}/${clips.length} clips...`)
    }
  }

  console.log(`✅ Processed ${processed} clips`)
  console.log(`   Found ${ngramMap.size} unique n-grams`)
  console.log(`   Found ${phrasalVerbMap.size} unique phrasal verbs`)
  console.log('')

  // Filter by minimum frequency and sort
  const ngramCandidates: Candidate[] = Array.from(ngramMap.entries())
    .filter(([_, data]) => data.frequency >= MIN_FREQUENCY)
    .sort((a, b) => b[1].frequency - a[1].frequency)
    .slice(0, TOP_N)
    .map(([phrase, data]) => ({
      phrase_text: phrase,
      candidate_kind: 'listening' as const,
      frequency: data.frequency,
      example_clip_ids: Array.from(data.clipIds).slice(0, 10), // Limit to 10 example clips
    }))

  const phrasalVerbCandidates: Candidate[] = Array.from(phrasalVerbMap.entries())
    .filter(([_, data]) => data.frequency >= MIN_FREQUENCY)
    .sort((a, b) => b[1].frequency - a[1].frequency)
    .slice(0, TOP_N)
    .map(([phrase, data]) => ({
      phrase_text: phrase,
      candidate_kind: 'semantic' as const,
      frequency: data.frequency,
      example_clip_ids: Array.from(data.clipIds).slice(0, 10),
    }))

  console.log(`📊 Candidate summary:`)
  console.log(`   Listening (n-grams): ${ngramCandidates.length} candidates`)
  console.log(`   Semantic (phrasal verbs): ${phrasalVerbCandidates.length} candidates`)
  console.log('')

  // Show top 10 examples
  console.log('📋 Top 10 n-gram candidates:')
  ngramCandidates.slice(0, 10).forEach((c, i) => {
    console.log(`   ${i + 1}. "${c.phrase_text}" (frequency: ${c.frequency})`)
  })
  console.log('')

  console.log('📋 Top 10 phrasal verb candidates:')
  phrasalVerbCandidates.slice(0, 10).forEach((c, i) => {
    console.log(`   ${i + 1}. "${c.phrase_text}" (frequency: ${c.frequency})`)
  })
  console.log('')

  if (DRY_RUN) {
    console.log('🔍 DRY RUN - Not writing to database')
    return
  }

  // Write to database
  console.log('💾 Writing candidates to pattern_candidates table...')
  const allCandidates = [...ngramCandidates, ...phrasalVerbCandidates]

  // Batch insert in chunks of 100
  const chunkSize = 100
  let inserted = 0
  for (let i = 0; i < allCandidates.length; i += chunkSize) {
    const chunk = allCandidates.slice(i, i + chunkSize)
    const { error } = await supabase
      .from('pattern_candidates')
      .insert(chunk)

    if (error) {
      console.error(`❌ Error inserting chunk ${i / chunkSize + 1}:`, error)
    } else {
      inserted += chunk.length
      console.log(`   Inserted ${inserted}/${allCandidates.length} candidates...`)
    }
  }

  console.log(`✅ Successfully inserted ${inserted} candidates`)
  console.log('')
  console.log('📝 Next steps:')
  console.log('   1. Review candidates in pattern_candidates table')
  console.log('   2. Mark accepted candidates with: UPDATE pattern_candidates SET status = \'accepted\' WHERE id = \'...\'')
  console.log('   3. Run acceptPatternCandidates.ts to upsert accepted candidates to listening_patterns')
}

// Run extraction
extractCandidates().catch((error) => {
  console.error('❌ Fatal error:', error)
  process.exit(1)
})
