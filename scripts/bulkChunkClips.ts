/* eslint-disable no-console */
/**
 * Bulk chunk all curated_clips using OpenAI GPT and save spans to Supabase.
 *
 * Tables:
 * - Read:  public.curated_clips (id, transcript, cefr, clip_type, approved)
 * - Write: public.clip_chunk_spans
 * - Log:   public.chunk_generation_log
 *
 * Usage examples:
 *   # Dry run on first 20 clips (no DB writes)
 *   npx tsx scripts/bulkChunkClips.ts --dry-run --max-clips=20
 *
 *   # Real run on all remaining clips
 *   npx tsx scripts/bulkChunkClips.ts
 *
 *   # Regenerate specific clips (useful after audit)
 *   npx tsx scripts/bulkChunkClips.ts --only-ids=clip-123,clip-456
 *
 * Env vars required:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   OPENAI_API_KEY
 *
 * ============================================================
 * SAFE EXECUTION PLAN (Chunk Quality Improvement)
 * ============================================================
 *
 * STEP 1: Audit existing chunks
 *   npx tsx scripts/auditChunkSpans.ts --export=audit-report.json
 *   → Review report, identify top N worst clips
 *
 * STEP 2: Test improved pipeline on worst clips (dry run)
 *   npx tsx scripts/bulkChunkClips.ts --dry-run --only-ids=clip-123,clip-456 --print-sample
 *   → Verify new chunks are better quality
 *
 * STEP 3: Regenerate top 10-20 worst clips (REAL)
 *   # Delete old spans first to avoid duplicates
 *   DELETE FROM clip_chunk_spans WHERE clip_id IN ('clip-123', 'clip-456', ...);
 *   
 *   # Then regenerate
 *   npx tsx scripts/bulkChunkClips.ts --only-ids=clip-123,clip-456,...
 *
 * STEP 4: Verify in UI
 *   - Open practice page for regenerated clips
 *   - Click words → check Chunk Dictionary shows correct boundaries
 *   - Make mistakes → check "Why this is hard" uses correct context
 *
 * STEP 5: Expand to more clips gradually
 *   - Regenerate next 50 clips
 *   - Monitor for regression
 *   - Eventually regenerate all clips with issues
 *
 * ============================================================
 */

import fs from 'fs'
import path from 'path'
import { resolve } from 'path'
import { config } from 'dotenv'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

// Load .env.local
config({ path: resolve(process.cwd(), '.env.local') })

type ClipRow = {
  id: string
  transcript: string
  cefr?: string | null
  clip_type?: string | null
  approved?: boolean | null
}

type ChunkResponse = {
  chunks: string[]
}

type Checkpoint = {
  processedClipIds: string[]
}

const BATCH_SIZE = 50
const RATE_LIMIT_DELAY_MS = 1200 // ~1 call/sec
const CHECKPOINT_FILE = path.join(__dirname, '.bulkChunkClips.checkpoint.json')

function getEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required env var: ${name}`)
  }
  return value
}

function loadCheckpoint(): Checkpoint {
  try {
    if (!fs.existsSync(CHECKPOINT_FILE)) {
      return { processedClipIds: [] }
    }
    const raw = fs.readFileSync(CHECKPOINT_FILE, 'utf8')
    return JSON.parse(raw) as Checkpoint
  } catch (err) {
    console.error('⚠️ Failed to load checkpoint, starting fresh:', err)
    return { processedClipIds: [] }
  }
}

function saveCheckpoint(cp: Checkpoint) {
  try {
    fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(cp, null, 2), 'utf8')
  } catch (err) {
    console.error('⚠️ Failed to save checkpoint:', err)
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Normalize text for matching:
 * - lowercase
 * - smart quotes → straight quotes
 * - punctuation .,?!;: → spaces
 * - collapse whitespace
 */
function normalizeText(text: string): string {
  let t = text
  // smart quotes
  t = t.replace(/[‘’]/g, "'")
  t = t.replace(/[“”]/g, '"')
  // lowercase
  t = t.toLowerCase()
  // punctuation to space
  t = t.replace(/[.,!?;:]/g, ' ')
  // collapse whitespace
  t = t.replace(/\s+/g, ' ').trim()
  return t
}

/**
 * Build normalized transcript and mapping from normalized index to original index.
 */
function normalizeTranscriptWithMap(input: string): { normalized: string; normToOrig: number[] } {
  let normalized = ''
  const normToOrig: number[] = []

  const pushChar = (ch: string, origIndex: number) => {
    normalized += ch
    normToOrig.push(origIndex)
  }

  for (let i = 0; i < input.length; i++) {
    let ch = input[i]
    // smart quotes → straight
    if (ch === '‘' || ch === '’') ch = "'"
    if (ch === '“' || ch === '”') ch = '"'

    // punctuation to space
    if (/[.,!?;:]/.test(ch)) {
      ch = ' '
    }

    // lowercase
    ch = ch.toLowerCase()

    if (/\s/.test(ch)) {
      // collapse spaces
      if (normalized.length === 0 || normalized[normalized.length - 1] === ' ') {
        continue
      }
      pushChar(' ', i)
    } else {
      pushChar(ch, i)
    }
  }

  // trim trailing space
  if (normalized.endsWith(' ')) {
    normalized = normalized.slice(0, -1)
    normToOrig.pop()
  }

  return { normalized, normToOrig }
}

/**
 * Build lightly normalized transcript and mapping (for secondary matching):
 * - normalize smart quotes to straight quotes
 * - collapse whitespace
 * - remove zero-width characters
 * Does NOT lowercase or remove punctuation (preserves original structure).
 */
function normalizeTranscriptLightWithMap(
  input: string
): { normalized: string; normToOrig: number[] } {
  let normalized = ''
  const normToOrig: number[] = []

  const pushChar = (ch: string, origIndex: number) => {
    normalized += ch
    normToOrig.push(origIndex)
  }

  for (let i = 0; i < input.length; i++) {
    let ch = input[i]

    // Remove zero-width characters
    if (/[\u200B-\u200D\uFEFF]/.test(ch)) {
      continue
    }

    // smart quotes → straight
    if (ch === '\u2018' || ch === '\u2019') ch = "'" // ' or '
    if (ch === '\u201C' || ch === '\u201D') ch = '"' // " or "

    if (/\s/.test(ch)) {
      // collapse spaces
      if (normalized.length === 0 || normalized[normalized.length - 1] === ' ') {
        continue
      }
      pushChar(' ', i)
    } else {
      pushChar(ch, i)
    }
  }

  // trim trailing space
  if (normalized.endsWith(' ')) {
    normalized = normalized.slice(0, -1)
    normToOrig.pop()
  }

  return { normalized, normToOrig }
}

/**
 * Normalize text for secondary matching (lighter normalization):
 * - normalize smart quotes to straight quotes
 * - collapse whitespace
 * - remove zero-width characters
 * Does NOT lowercase or remove punctuation (to preserve original structure better).
 */
function normalizeForSecondaryMatch(text: string): string {
  let t = text
  // smart quotes → straight
  t = t.replace(/[''']/g, "'")
  t = t.replace(/[""]/g, '"')
  // remove zero-width characters
  t = t.replace(/[\u200B-\u200D\uFEFF]/g, '')
  // collapse whitespace
  t = t.replace(/\s+/g, ' ').trim()
  return t
}

/**
 * Match chunks to transcript:
 * 1) First try exact match on original transcript
 * 2) If not found, try normalized match (smart quotes, whitespace only)
 * Returns array of { chunkText, refStart, refEndExclusive }.
 */
function matchChunks(
  transcript: string,
  chunks: string[]
): Array<{ chunkText: string; refStart: number; refEnd: number }> {
  const results: Array<{ chunkText: string; refStart: number; refEnd: number }> = []
  let searchFrom = 0

  for (const rawChunk of chunks) {
    if (!rawChunk || !rawChunk.trim()) {
      results.push({ chunkText: rawChunk, refStart: -1, refEnd: -1 })
      continue
    }

    // Step 1: Try exact match on original transcript
    const exactIdx = transcript.indexOf(rawChunk, searchFrom)
    if (exactIdx !== -1) {
      results.push({
        chunkText: rawChunk,
        refStart: exactIdx,
        refEnd: exactIdx + rawChunk.length, // end-exclusive
      })
      searchFrom = exactIdx + rawChunk.length
      continue
    }

    // Step 2: Try normalized match (smart quotes, whitespace only)
    const chunkNorm = normalizeForSecondaryMatch(rawChunk)
    if (!chunkNorm) {
      results.push({ chunkText: rawChunk, refStart: -1, refEnd: -1 })
      continue
    }

    // Build lightly normalized transcript with mapping
    const { normalized, normToOrig } = normalizeTranscriptLightWithMap(transcript)
    
    // Find approximate search start in normalized space
    // Simple approach: search from beginning (mapping searchFrom is non-trivial)
    const normIdx = normalized.indexOf(chunkNorm)

    if (normIdx === -1) {
      // Not found even after normalization
      results.push({ chunkText: rawChunk, refStart: -1, refEnd: -1 })
      continue
    }

    // Map back to original indices
    const startNorm = normIdx
    const endNorm = normIdx + chunkNorm.length

    if (startNorm >= normToOrig.length || endNorm > normToOrig.length) {
      // Mapping would be out of bounds - mark as failed
      results.push({ chunkText: rawChunk, refStart: -1, refEnd: -1 })
      continue
    }

    const startOrig = normToOrig[startNorm]
    // For end, find the last character's original position
    const endNormLast = endNorm - 1
    if (endNormLast >= normToOrig.length) {
      results.push({ chunkText: rawChunk, refStart: -1, refEnd: -1 })
      continue
    }
    const endOrig = normToOrig[endNormLast] + 1 // end-exclusive

    results.push({
      chunkText: rawChunk,
      refStart: startOrig,
      refEnd: endOrig,
    })

    // Update searchFrom based on original transcript position
    searchFrom = endOrig
  }

  return results
}

function buildOpenAIPrompt(transcript: string): string {
  return [
    'You are an expert English listening coach.',
    'Segment the following transcript into small *listening-meaning* chunks.',
    '',
    'CRITICAL RULES:',
    '- Return JSON ONLY in this exact format: { "chunks": ["...", "..."] }',
    '- Do NOT include any explanations or extra keys.',
    '- Each chunk should be 1 to 6 words.',
    '- Chunks should follow natural listening units that learners hear as one piece.',
    '- Prioritize MEANING UNITS and IDIOMS. Keep phrasal verbs and idioms together.',
    '',
    'PROHIBITED PATTERNS:',
    '- Do NOT end a chunk with function words: a, an, the, to, of, at, in, on, for, with, by, from, about, into, onto, is, are, was, were, am, be, been, being, have, has, had, do, does, did, will, would, could, should, may, might, can, must, shall.',
    '- Do NOT start chunks mid-phrase (e.g., "you an email" is INVALID - missing verb).',
    '- Do NOT create function-word-only chunks (e.g., "the", "a" alone).',
    '- Do NOT split phrasal verbs (e.g., "pick up", "hang out" must stay together).',
    '- Do NOT split common idioms (e.g., "shoot you an email" is ONE chunk).',
    '',
    'CORRECT EXAMPLES:',
    '✓ "I\'ll shoot you an email" → ["I\'ll", "shoot you an email"]',
    '✓ "Can you pick up" → ["Can you", "pick up"]',
    '✓ "at seven thirty" → ["at seven thirty"]',
    '✓ "I want to go" → ["I want to", "go"]',
    '',
    'INCORRECT EXAMPLES:',
    '✗ "I\'ll shoot you an email" → ["I\'ll shoot", "you an email"] (mid-phrase)',
    '✗ "Can you pick up" → ["Can you pick", "up"] (split phrasal verb)',
    '✗ "I want to go" → ["I want to"] (ends with function word)',
    '✗ "the train arrived" → ["the", "train arrived"] (function-word-only chunk)',
    '',
    'Keep time expressions and set phrases together:',
    '- "at seven thirty", "this afternoon", "for a few minutes", "next Friday evening"',
    '',
    'It is OK if chunks overlap in meaning; prioritize what a listener would perceive as one unit.',
    '',
    'Transcript:',
    '<<<',
    transcript,
    '>>>',
    '',
    'Now return ONLY a single JSON object in this exact shape:',
    '{ "chunks": ["chunk one", "chunk two", "..."] }',
  ].join('\n')
}

// Function words that should not appear alone or at chunk end
const FUNCTION_WORDS = new Set([
  'a', 'an', 'the',
  'to', 'of', 'for', 'at', 'in', 'on', 'with', 'from', 'by', 'about', 'into', 'onto',
  'and', 'but', 'or', 'so', 'if', 'as', 'than',
  'is', 'was', 'are', 'were', 'am', 'be', 'been', 'being',
  'have', 'has', 'had', 'having',
  'do', 'does', 'did', 'doing',
  'will', 'would', 'can', 'could', 'should', 'may', 'might', 'must', 'shall',
  'this', 'that', 'these', 'those',
  'my', 'your', 'his', 'her', 'its', 'our', 'their',
])

/**
 * Validate a single chunk for quality issues
 * Returns null if valid, or error message if invalid
 */
function validateChunk(chunk: string): string | null {
  const normalized = chunk.toLowerCase().trim()
  const tokens = normalized.split(/\s+/)
  
  // Empty or whitespace-only
  if (!normalized || tokens.length === 0) {
    return 'Empty chunk'
  }
  
  // Too short (< 2 chars)
  if (normalized.length < 2) {
    return 'Too short (< 2 characters)'
  }
  
  // Function-word-only chunk (single token)
  if (tokens.length === 1 && FUNCTION_WORDS.has(tokens[0])) {
    return 'Function-word-only chunk'
  }
  
  // All function words (no content)
  if (tokens.every(t => FUNCTION_WORDS.has(t))) {
    return 'No content words (all function words)'
  }
  
  // Ends with function word (unless it's a contraction like "I'm", "you're")
  const lastToken = tokens[tokens.length - 1]
  if (!lastToken.includes("'") && FUNCTION_WORDS.has(lastToken)) {
    return 'Ends with function word'
  }
  
  // Mid-phrase patterns (heuristic)
  if (/^you\s+(a|an|the)\s+\w+$/i.test(normalized) && !/(send|give|tell|show|bring)/.test(normalized)) {
    return 'Mid-phrase pattern (e.g., "you an email" without verb)'
  }
  
  if (/^(a|an|the)\s+\w+$/i.test(normalized) && tokens.length === 2) {
    return 'Incomplete phrase (e.g., "an email" without verb)'
  }
  
  return null // Valid
}

async function fetchChunksFromOpenAI(openai: OpenAI, transcript: string, retryCount = 0): Promise<string[]> {
  const prompt = buildOpenAIPrompt(transcript)
  const maxRetries = 1

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 512,
    temperature: retryCount > 0 ? 0.2 : 0.3, // Lower temp on retry for more conservative chunks
    messages: [
      {
        role: 'user',
        content: retryCount > 0 ? prompt + '\n\nFORMAT REQUIRED: Follow all rules strictly. No mid-phrase chunks.' : prompt,
      },
    ],
    response_format: { type: 'json_object' },
  })

  const content = response.choices[0]?.message?.content
  if (!content) {
    throw new Error('OpenAI returned empty content')
  }

  const text = content.trim()
  let parsed: ChunkResponse
  try {
    parsed = JSON.parse(text) as ChunkResponse
  } catch (err) {
    console.error('❌ Failed to parse OpenAI JSON:', text)
    throw err
  }

  if (!parsed.chunks || !Array.isArray(parsed.chunks)) {
    throw new Error('OpenAI response missing "chunks" array')
  }

  // Validate chunks
  const validChunks: string[] = []
  const invalidChunks: Array<{ chunk: string; reason: string }> = []
  
  for (const chunk of parsed.chunks) {
    const error = validateChunk(chunk)
    if (error) {
      invalidChunks.push({ chunk, reason: error })
    } else {
      validChunks.push(chunk)
    }
  }
  
  // Log validation results
  if (invalidChunks.length > 0) {
    console.log(`⚠️  Rejected ${invalidChunks.length} invalid chunks:`)
    invalidChunks.slice(0, 5).forEach(({ chunk, reason }) => {
      console.log(`   - "${chunk}" (${reason})`)
    })
  }
  
  // If too many invalid chunks (>30%), retry once
  const invalidRate = invalidChunks.length / parsed.chunks.length
  if (invalidRate > 0.3 && retryCount < maxRetries) {
    console.log(`⚠️  High invalid rate (${Math.round(invalidRate * 100)}%), retrying with stricter prompt...`)
    return fetchChunksFromOpenAI(openai, transcript, retryCount + 1)
  }
  
  // If still too many invalid chunks after retry, log warning
  if (validChunks.length < parsed.chunks.length * 0.5) {
    console.warn(`⚠️  Only ${validChunks.length}/${parsed.chunks.length} chunks passed validation`)
  }

  return validChunks
}

async function processClip(
  supabase: SupabaseClient,
  openai: OpenAI,
  clip: ClipRow,
  options: { dryRun: boolean; printSample: boolean }
): Promise<void> {
  const { id: clipId, transcript } = clip

  console.log(`\n🎧 Processing clip ${clipId}`)

  if (!transcript || !transcript.trim()) {
    console.log('⚠️ Empty transcript, skipping')
    return
  }

  const chunks = await fetchChunksFromOpenAI(openai, transcript)
  console.log(`   OpenAI returned ${chunks.length} chunks`)

  const matches = matchChunks(transcript, chunks)

  const spansToInsert = matches.filter(m => m.refStart >= 0 && m.refEnd > m.refStart)
  const failed = matches.filter(m => m.refStart < 0)

  console.log(`   Matched spans: ${spansToInsert.length}, failed: ${failed.length}`)

  // Print sample details if requested
  if (options.printSample) {
    console.log('\n📋 Sample Details:')
    console.log('   Transcript:')
    console.log(`   "${transcript}"`)
    console.log('\n   Chunks array:')
    console.log(`   ${JSON.stringify(chunks, null, 2)}`)
    console.log('\n   Matched spans:')
    spansToInsert.forEach(span => {
      console.log(`   - "${span.chunkText}" [${span.refStart}, ${span.refEnd}]`)
    })
    if (failed.length > 0) {
      console.log('\n   Failed chunks (not found in transcript):')
      failed.forEach(span => {
        console.log(`   - "${span.chunkText}"`)
      })
    }
    console.log('')
  }

  if (options.dryRun) {
    console.log('🔎 Dry-run: not writing to DB')
    return
  }

  // Insert spans
  if (spansToInsert.length > 0) {
    const { error } = await supabase
      .from('clip_chunk_spans')
      .upsert(
        spansToInsert.map(span => ({
          clip_id: clipId,
          chunk_text: span.chunkText,
          ref_start: span.refStart,
          ref_end: span.refEnd,
          confidence: 'low',
          approved: false,
          chunk_source: 'llm_auto',
        })),
        {
          onConflict: 'clip_id,ref_start,ref_end,chunk_text',
        }
      )

    if (error) {
      console.error('❌ Error inserting spans:', error)
    } else {
      console.log('✅ Inserted/updated spans in clip_chunk_spans')
    }
  }

  // Log failures
  if (failed.length > 0) {
    const { error: logError } = await supabase.from('chunk_generation_log').insert(
      failed.map(span => ({
        clip_id: clipId,
        status: 'failed',
        message: 'Chunk not found in transcript after normalization',
        chunk_text: span.chunkText,
      }))
    )
    if (logError) {
      console.error('❌ Error logging failures:', logError)
    } else {
      console.log('📝 Logged failed chunks to chunk_generation_log')
    }
  } else {
    const { error: logOkError } = await supabase.from('chunk_generation_log').insert({
      clip_id: clipId,
      status: 'ok',
      message: `Generated ${spansToInsert.length} spans`,
    })
    if (logOkError) {
      console.error('❌ Error logging success:', logOkError)
    }
  }
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const maxClipsArg = args.find(a => a.startsWith('--max-clips='))
  const maxClips = maxClipsArg ? parseInt(maxClipsArg.split('=')[1] || '0', 10) : 0
  const printSamplesArg = args.find(a => a.startsWith('--print-samples='))
  const printSamples = printSamplesArg ? parseInt(printSamplesArg.split('=')[1] || '0', 10) : 0
  const onlyIdsArg = args.find(a => a.startsWith('--only-ids='))
  const onlyIds = onlyIdsArg
    ? onlyIdsArg
        .split('=')[1]
        ?.split(',')
        .map(id => id.trim())
        .filter(id => id.length > 0) || []
    : []

  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!SUPABASE_URL) {
    throw new Error('Missing required env var: SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL')
  }
  const SUPABASE_SERVICE_ROLE_KEY = getEnv('SUPABASE_SERVICE_ROLE_KEY')
  const OPENAI_API_KEY = getEnv('OPENAI_API_KEY')

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
    },
  })

  const openai = new OpenAI({ apiKey: OPENAI_API_KEY })

  const checkpoint = loadCheckpoint()
  const processedSet = new Set(checkpoint.processedClipIds)

  console.log('🚀 Starting bulk chunking')
  console.log('   Dry run:', dryRun)
  if (maxClips > 0) {
    console.log('   Max clips:', maxClips)
  }
  if (printSamples > 0) {
    console.log('   Print samples:', printSamples)
  }
  if (onlyIds.length > 0) {
    console.log('   Only IDs:', onlyIds.length, 'clip(s)')
  }

  let offset = 0
  let processedThisRun = 0
  let samplesPrinted = 0

  // eslint-disable-next-line no-constant-condition
  while (true) {
    let query = supabase
      .from('curated_clips')
      .select('id, transcript, cefr, clip_type, approved')
      .eq('approved', true)
      .eq('clip_type', 'practice')

    // If --only-ids is specified, filter by those IDs
    if (onlyIds.length > 0) {
      query = query.in('id', onlyIds)
    }

    const { data, error } = await query.order('id', { ascending: true }).range(offset, offset + BATCH_SIZE - 1)

    if (error) {
      console.error('❌ Error fetching curated_clips:', error)
      break
    }

    if (!data || data.length === 0) {
      console.log('✅ No more clips to process')
      break
    }

    const batch = data as ClipRow[]
    console.log(`\n📦 Fetched batch of ${batch.length} clips (offset ${offset})`)

    for (const clip of batch) {
      // If --only-ids is specified, skip clips not in the list
      if (onlyIds.length > 0 && !onlyIds.includes(clip.id)) {
        continue
      }

      if (processedSet.has(clip.id)) {
        console.log(`⏩ Skipping already processed clip ${clip.id}`)
        continue
      }

      if (maxClips > 0 && processedThisRun >= maxClips) {
        console.log('⏹ Reached maxClips limit for this run')
        saveCheckpoint({ processedClipIds: Array.from(processedSet) })
        return
      }

      try {
        const shouldPrintSample = printSamples > 0 && samplesPrinted < printSamples
        await processClip(supabase, openai, clip, { dryRun, printSample: shouldPrintSample })
        if (shouldPrintSample) {
          samplesPrinted += 1
        }
        processedSet.add(clip.id)
        processedThisRun += 1
        saveCheckpoint({ processedClipIds: Array.from(processedSet) })
      } catch (err) {
        console.error(`❌ Error processing clip ${clip.id}:`, err)
      }

      // Rate limit OpenAI calls
      await sleep(RATE_LIMIT_DELAY_MS)
    }

    offset += BATCH_SIZE
  }

  saveCheckpoint({ processedClipIds: Array.from(processedSet) })
  console.log('\n🎉 Done')
}

// Run if executed directly
if (require.main === module) {
  main().catch(err => {
    console.error('Fatal error in bulkChunkClips:', err)
    process.exit(1)
  })
}

