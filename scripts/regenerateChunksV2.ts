/* eslint-disable no-console */
/**
 * Regenerate chunks V2 with improved quality for safe re-chunking pipeline
 * 
 * Writes directly to clip_chunk_spans (production table)
 * 
 * Usage:
 *   # Dry run (no DB writes)
 *   npx tsx scripts/regenerateChunksV2.ts --dry-run --only-ids=clip-123,clip-456
 * 
 *   # Regenerate specific clips to v2 table
 *   npx tsx scripts/regenerateChunksV2.ts --only-ids=clip-123,clip-456
 * 
 *   # Regenerate from audit report (top N worst clips)
 *   npx tsx scripts/regenerateChunksV2.ts --from-audit=audit-report.json --limit=10
 * 
 *   # Full run with concurrency and rate limiting
 *   npx tsx scripts/regenerateChunksV2.ts --only-ids=... --concurrency=2 --rate-limit=1000
 * 
 * Env vars required:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   OPENAI_API_KEY
 */

import fs from 'fs'
import path from 'path'
import { resolve } from 'path'
import { config } from 'dotenv'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import { validateChunksWithGPT } from '../lib/chunkValidationGPT'

// Load .env.local
config({ path: resolve(process.cwd(), '.env.local') })

type ClipRow = {
  id: string
  transcript: string
}

type ChunkResponse = {
  chunks: string[]
}

type Checkpoint = {
  processedClipIds: string[]
  skippedClipIds: string[]
  timestamp: string
}

type ValidationResult = {
  validChunks: string[]
  invalidChunks: Array<{ chunk: string; reason: string }>
  invalidRate: number
  gptCost?: number
  gptLatency?: number
}

const CHECKPOINT_FILE = path.join(__dirname, '.regenerateV2.checkpoint.json')
const FAILURE_REPORT_FILE = path.join(__dirname, 'regenerate-v2-failures.json')

// Function words that should not appear alone (for checking function-word-only chunks)
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
  'me', 'you', 'him', 'her', 'it', 'us', 'them',
  'i', 'he', 'she', 'we', 'they',
])

// Endings that are FORBIDDEN (true function words that shouldn't end chunks)
// Excludes object pronouns and demonstratives which are valid endings
const FORBIDDEN_ENDINGS = new Set([
  'a', 'an', 'the',
  'to', 'of', 'for', 'at', 'in', 'on', 'with', 'from', 'by', 'about', 'into', 'onto',
  'and', 'but', 'or', 'so', 'if', 'as', 'than',
  'is', 'was', 'are', 'were', 'am', 'be', 'been', 'being',
  'have', 'has', 'had', 'having',
  'do', 'does', 'did', 'doing',
  'will', 'would', 'can', 'could', 'should', 'may', 'might', 'must', 'shall',
  'my', 'your', 'his', 'her', 'its', 'our', 'their',
])

// Object pronouns and demonstratives that are ALLOWED as chunk endings
// These are valid when they function as objects (e.g., "call you", "find it")
const ALLOWED_OBJECT_ENDINGS = new Set([
  'me', 'you', 'him', 'her', 'it', 'us', 'them',
  'this', 'that', 'these', 'those',
])

// Critical patterns (meaning-breaking cuts)
const CRITICAL_PATTERNS = [
  /^you\s+an?\s+\w+$/i, // "you an email" without verb
  /^I'?m\s+gonna\s+\w+$/i, // "I'm gonna shoot" without object
  /^(send|give|shoot|tell|show)\s+\w+\s+an?$/i, // "shoot you an" - cut off
]

// Complete idiom patterns (allowed as complete chunks even if they end with go/come/get)
const COMPLETE_IDIOM_PATTERNS = [
  /^let'?s go$/i,
  /^here (we|i|he|she|they) (go|come)$/i,
  /^there (you|he|she|they) go$/i,
  /^off (we|i|you|he|she|they) go$/i,
  /^come on$/i,
  /^hold on$/i,
  /^wait up$/i,
]

/**
 * Check if text matches a complete idiom pattern
 */
function matchesCompleteIdiom(text: string): boolean {
  return COMPLETE_IDIOM_PATTERNS.some(pattern => pattern.test(text.trim()))
}

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
      return { processedClipIds: [], skippedClipIds: [], timestamp: new Date().toISOString() }
    }
    const raw = fs.readFileSync(CHECKPOINT_FILE, 'utf8')
    return JSON.parse(raw) as Checkpoint
  } catch (err) {
    console.error('⚠️ Failed to load checkpoint, starting fresh:', err)
    return { processedClipIds: [], skippedClipIds: [], timestamp: new Date().toISOString() }
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
 * Build improved GPT prompt with stricter rules
 */
function buildImprovedPrompt(transcript: string, isRetry: boolean = false): string {
  const strictPrefix = isRetry ? 'FORMAT REQUIRED - FOLLOW ALL RULES STRICTLY:\n\n' : ''
  
  return strictPrefix + [
    'You are an expert English listening coach.',
    'Segment this transcript into MEANING-SAFE listening chunks.',
    '',
    '🚨 FIRST STEP - CHECK TRANSCRIPT LENGTH:',
    'Count the words in the transcript. If ≤7 words, return the ENTIRE transcript as ONE chunk and STOP.',
    'Example: "Let\'s touch base later today" has 5 words → return as ["Let\'s touch base later today"]',
    '',
    'ONLY proceed with chunking rules below if the transcript has 8+ words.',
    '',
    '════════════════════════════════════════',
    '',
    'CRITICAL RULES (violations = rejection):',
    '',
    '⚠️ RULE 0 - MODAL SEPARATION (HIGHEST PRIORITY):',
    'Modals (gonna, wanna, gotta, shoulda, coulda, etc.) must ALWAYS be their own chunk.',
    'NEVER combine modals with the following verb.',
    '',
    'This rule OVERRIDES all other rules. Separate modals FIRST, then chunk the rest.',
    '',
    'Modal separation examples (ALWAYS separate):',
    '✓ "I\'m gonna" | "call you later" (modal alone + verb phrase)',
    '✓ "She\'s gonna" | "go to the store" (modal alone + verb phrase)',
    '✓ "We wanna" | "see that movie" (modal alone + verb phrase)',
    '✓ "I\'m gonna" | "shoot you an email" (modal alone + complete idiom)',
    '✓ "He\'s gotta" | "tell you something" (modal alone + verb phrase)',
    '',
    '✗ "I\'m gonna call" (NO - modal + verb together)',
    '✗ "She\'s gonna go" (NO - modal + verb together)',
    '✗ "I\'m gonna shoot" (NO - breaks idioms AND combines modal + verb)',
    '',
    'EXCEPTION: Modal stacks (2+ modals) stay together:',
    '✓ "We\'re gonna have to" | "catch the train" (modal stack + verb)',
    '✓ "I wanna be able to" | "help you" (modal stack + verb)',
    '',
    '⚠️ RULE 0.5 - SHORT SENTENCE OVERRIDE:',
    'If the ENTIRE transcript is 7 words or fewer, return it as ONE SINGLE CHUNK.',
    'Count the words first. If count ≤ 7, stop and return the entire sentence.',
    '',
    'Short sentence examples (return as 1 chunk):',
    '✓ "We\'re gonna go to the airport" (6 words) → ["We\'re gonna go to the airport"]',
    '✓ "They gotta tell you" (4 words) → ["They gotta tell you"]',
    '✓ "It\'s kind of easy to miss" (6 words) → ["It\'s kind of easy to miss"]',
    '✓ "He\'s gonna have to wait" (6 words) → ["He\'s gonna have to wait"]',
    '',
    'ONLY apply other chunking rules if the transcript is 8+ words.',
    '',
    '1. Each chunk MUST be 1-8 words (for transcripts 8+ words)',
    '2. NEVER break idioms or phrasal verbs:',
    '   ✓ "shoot you an email" (complete)',
    '   ✗ "shoot you an" (incomplete - FORBIDDEN)',
    '   ✗ "I\'m gonna shoot" (incomplete - FORBIDDEN)',
    '3. If verb needs object, INCLUDE IT:',
    '   ✓ "send me a message"',
    '   ✗ "send me a" (FORBIDDEN)',
    '4. Do NOT end with articles/prepositions/auxiliaries: a, an, the, to, of, for, with, by, at, in, on, etc.',
    '   BUT object pronouns (you, me, him, her, it, us, them) and demonstratives (this, that) ARE ALLOWED as endings',
    '   ✓ "call you", "tell you", "find it", "asked him" (valid endings)',
    '   ✗ "go to", "kind of", "have to" (invalid endings)',
    '5. Do NOT create function-word-only chunks',
    '6. Keep contractions together: "I\'m", "you\'re", "she\'s"',
    '7. SINGLE MODALS: "gonna/wanna/gotta" must be SEPARATED from the verb (see RULE 0)',
    '8. MODAL STACKS MUST STAY TOGETHER: Keep modal stacks (2+ modals) in one chunk',
    '   ✓ "We\'re gonna have to" (modal stack - keep together)',
    '   ✓ "I wanna be able to" (modal stack - keep together)',
    '   ✓ "You shoulda been able to" (modal stack - keep together)',
    '   ✓ "used to have to" (modal stack - keep together)',
    '   ✗ "We\'re gonna" + "have to" (FORBIDDEN - splits modal stack)',
    '   ✗ "I wanna" + "be able to" (FORBIDDEN - splits modal stack)',
    '   Note: Modal stacks are complete WITHOUT the main verb. The verb goes in the next chunk.',
    '9. VERB/DESTINATION COMPLETENESS: If a chunk contains "go", "come", or "get", it MUST include either:',
    '   - its object/destination phrase (e.g., "to the airport"), OR',
    '   - be standalone imperative ("Let\'s go")',
    '   NOTE: With RULE 0, modals are separated, so the verb chunk gets the destination:',
    '   ✓ "We\'re gonna" + "go to the airport" (modal separated + verb with destination)',
    '   ✓ "I wanna" + "come with you" (modal separated + verb with destination)',
    '   ✓ "You gotta" + "get to the meeting" (modal separated + verb with destination)',
    '   ✓ "go to the airport" (single chunk with destination when no modal)',
    '   ✗ "We\'re gonna" + "the airport" (FORBIDDEN - drops "go" verb)',
    '   ✗ "I wanna" + "with you" (FORBIDDEN - drops "come" verb)',
    '   ✗ "go to" (FORBIDDEN - incomplete destination)',
    '10. SUBORDINATING CLAUSE INTEGRITY (with length limit):',
    '   Do NOT split subordinating conjunctions (before, after, when, if, because, while, since) from the clause that follows.',
    '   LENGTH CONSTRAINT:',
    '   - If the subordinate clause is ≤ 8 words → keep it as one chunk',
    '   - If the subordinate clause is > 8 words → split at coordinating conjunctions (and, but, or)',
    '   ✓ "before we can board" (4 words - keep intact)',
    '   ✓ "when I get home" (4 words - keep intact)',
    '   ✓ "before we finish packing" + "and call a taxi" (long clause, split at "and")',
    '   ✓ "after we checked our bags" + "and went through security" (long clause, split at "and")',
    '   ✗ "before we" + "can board" (FORBIDDEN - splits clause unnecessarily)',
    '   ✗ "when I" + "get home" (FORBIDDEN - splits clause unnecessarily)',
    '   ✗ "before we finish packing our bags and call a taxi and lock the front door" (18 words - FORBIDDEN - too long!)',
    '',
    'CORRECT EXAMPLES:',
    '✓ "I\'ll shoot you an email later" → ["I\'ll", "shoot you an email", "later"]',
    '✓ "Can you pick up the kids" → ["Can you", "pick up the kids"]',
    '✓ "I\'m gonna call you back" → ["I\'m gonna", "call you back"] (modal separated!)',
    '✓ "Send me a message" → ["Send me a message"]',
    '✓ "Let me call you" → ["Let me", "call you"] (object pronoun ending OK)',
    '✓ "I\'ll find it later" → ["I\'ll", "find it", "later"] (object pronoun ending OK)',
    '✓ "We\'re gonna go to the airport" → ["We\'re gonna", "go to the airport"] (modal separated!)',
    '✓ "She\'s gonna shoot you an email" → ["She\'s gonna", "shoot you an email"] (modal separated, idiom intact)',
    '✓ "We\'re gonna have to catch the train" → ["We\'re gonna have to", "catch the train"] (modal stack + verb)',
    '✓ "I wanna be able to help" → ["I wanna be able to", "help"] (modal stack + verb)',
    '✓ "Check in before we can board" → ["Check in", "before we can board"] (clause integrity)',
    '✓ "I\'ll call you when I get home" → ["I\'ll call you", "when I get home"] (subordinate clause intact)',
    '',
    'FORBIDDEN EXAMPLES:',
    '✗ ["I\'m gonna call"] (FORBIDDEN - modal + verb together, violates RULE 0)',
    '✗ ["She\'s gonna go"] (FORBIDDEN - modal + verb together, violates RULE 0)',
    '✗ ["I\'m gonna shoot"] (FORBIDDEN - modal + verb together AND incomplete idiom)',
    '✗ ["We wanna see"] (FORBIDDEN - modal + verb together, violates RULE 0)',
    '✗ ["you an email"] (incomplete - where\'s the verb?)',
    '✗ ["send me a"] (incomplete - cut off)',
    '✗ ["the"] (function-word-only)',
    '✗ ["pick", "up"] (split phrasal verb)',
    '✗ ["We\'re gonna", "the airport"] (FORBIDDEN - drops "go" verb)',
    '✗ ["We\'re gonna", "have to", "catch the train"] (FORBIDDEN - splits modal stack)',
    '✗ ["I wanna", "be able to", "help"] (FORBIDDEN - splits modal stack)',
    '✗ ["before we", "can board"] (FORBIDDEN - splits subordinate clause)',
    '✗ ["when I", "get home"] (FORBIDDEN - splits subordinate clause)',
    '',
    'Transcript:',
    transcript,
    '',
    'Return ONLY JSON: { "chunks": ["...", "..."] }',
    'Each chunk MUST be an exact substring of the transcript.',
  ].join('\n')
}

/**
 * Validate a single chunk strictly
 */
function validateChunk(chunk: string, transcript: string): string | null {
  const norm = chunk.toLowerCase().trim()
  const tokens = norm.split(/\s+/)
  
  // 1. Exact substring check
  if (!transcript.includes(chunk)) {
    return 'Not exact substring of transcript'
  }
  
  // 2. Empty or too short
  if (norm.length < 2) {
    return 'Too short (< 2 characters)'
  }
  
  // 3. Critical patterns (meaning-breaking cuts)
  for (const pattern of CRITICAL_PATTERNS) {
    if (pattern.test(chunk)) {
      return 'CRITICAL: Incomplete phrase/idiom pattern'
    }
  }
  
  // 4. Function-word-only chunk
  if (tokens.length === 1 && FUNCTION_WORDS.has(tokens[0])) {
    return 'Function-word-only chunk'
  }
  
  // 5. All function words (no content)
  if (tokens.every(t => FUNCTION_WORDS.has(t))) {
    return 'No content words (all function words)'
  }
  
  // 6. Ends with truly forbidden function word (unless contraction)
  // Allow object pronouns (me, you, him, her, it, us, them) and demonstratives (this, that, these, those)
  const lastToken = tokens[tokens.length - 1]
  if (!lastToken.includes("'")) {
    // Allow object pronouns and demonstratives as endings
    if (!ALLOWED_OBJECT_ENDINGS.has(lastToken) && FORBIDDEN_ENDINGS.has(lastToken)) {
      return 'Ends with forbidden function word'
    }
  }
  
  // 7. "Dangling gonna/wanna/gotta" check
  // Reject chunks like "We're gonna" or "I'm gonna" without a following verb
  if (/^(we'?re|i'?m|you'?re|they'?re)\s+gonna$/i.test(chunk)) {
    return 'Dangling "gonna" without verb (incomplete)'
  }
  if (/^(we'?re|i'?m|you'?re|they'?re)\s+wanna$/i.test(chunk)) {
    return 'Dangling "wanna" without verb (incomplete)'
  }
  if (/^(we'?re|i'?m|you'?re|they'?re)\s+gotta$/i.test(chunk)) {
    return 'Dangling "gotta" without verb (incomplete)'
  }
  
  // 8. Subordinating conjunction + pronoun dangling check
  // Reject chunks like "before we", "after I", "when you" that are clearly incomplete
  if (/^(before|after|when|if|while|since|because)\s+(we|i|you|he|she|they)$/i.test(chunk)) {
    return 'Dangling subordinating clause (splits clause from verb)'
  }
  
  // 9. Stranded go/come/get without destination check (with idiom exceptions)
  // Reject chunks ending with "go", "come", "get" without object or destination
  // Allow complete idioms and complete verb phrases
  const endsWithGoComGet = /\b(go|come|get)$/i.test(chunk)
  if (endsWithGoComGet) {
    const lastWord = tokens[tokens.length - 1]
    
    // Allow complete idioms like "Let's go", "Here we go", "There you go"
    if (matchesCompleteIdiom(chunk)) {
      // OK - complete idiom
    } 
    // Allow complete verb phrases: gonna/wanna/gotta + go/come/get
    // Examples: "We're gonna go", "I wanna come", "You gotta get"
    // Destination can be in next chunk
    else if (/\b(gonna|wanna|gotta)\s+(go|come|get)$/i.test(chunk)) {
      // OK - complete verb phrase (modal + motion verb)
    }
    else {
      // Check if it's truly stranded (no destination/object in chunk)
      const hasDestination = /\s(to|from|into|onto|back|over|here|home|there)\s/i.test(chunk)
      if (!hasDestination) {
        return `Stranded "${lastWord}" without destination (incomplete)`
      }
    }
  }
  
  // 10. Chunk too long with coordinating conjunction
  // Reject chunks > 10 words that contain "and"/"but"/"or" (should be split)
  const wordCount = tokens.length
  const hasCoordinatingConjunction = /\b(and|but|or)\b/i.test(chunk)
  
  if (wordCount > 10 && hasCoordinatingConjunction) {
    return `Chunk too long (${wordCount} words) - should split at coordinating conjunction`
  }
  
  return null // Valid
}

/**
 * Fetch chunks from OpenAI with hybrid validation (TypeScript critical + GPT semantic)
 */
async function fetchChunksWithValidation(
  openai: OpenAI,
  transcript: string,
  attempt: number = 1
): Promise<ValidationResult & { gptCost: number; gptLatency: number }> {
  const maxAttempts = 2
  const isRetry = attempt > 1
  
  const prompt = buildImprovedPrompt(transcript, isRetry)
  
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 600,
    temperature: isRetry ? 0.2 : 0.3, // Lower temp on retry
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
  })
  
  const content = response.choices[0]?.message?.content
  if (!content) {
    throw new Error('OpenAI returned empty content')
  }
  
  const parsed = JSON.parse(content) as ChunkResponse
  
  if (!parsed.chunks || !Array.isArray(parsed.chunks)) {
    throw new Error('OpenAI response missing "chunks" array')
  }
  
  // PHASE 1: Critical TypeScript checks (only critical patterns)
  const tsValidChunks: string[] = []
  const tsCriticalInvalid: Array<{ chunk: string; reason: string }> = []
  
  for (const chunk of parsed.chunks) {
    // Check 1: Must be exact substring
    if (!transcript.includes(chunk)) {
      tsCriticalInvalid.push({ chunk, reason: 'Not exact substring' })
      continue
    }
    
    // Check 2: Must be >= 2 characters
    if (chunk.trim().length < 2) {
      tsCriticalInvalid.push({ chunk, reason: 'Too short' })
      continue
    }
    
    // Check 3: Critical broken patterns only
    let hasCriticalPattern = false
    for (const pattern of CRITICAL_PATTERNS) {
      if (pattern.test(chunk)) {
        tsCriticalInvalid.push({ chunk, reason: 'CRITICAL: Incomplete phrase/idiom' })
        hasCriticalPattern = true
        break
      }
    }
    
    if (!hasCriticalPattern) {
      tsValidChunks.push(chunk)
    }
  }
  
  if (tsCriticalInvalid.length > 0) {
    console.log(`   ⚠️  TypeScript: Rejected ${tsCriticalInvalid.length}/${parsed.chunks.length} critical issues`)
  }
  
  // PHASE 2: GPT semantic validation
  const gptResult = await validateChunksWithGPT(tsValidChunks, transcript)
  
  console.log(`   🤖 GPT: ${gptResult.valid.length}/${tsValidChunks.length} valid (${Math.round(gptResult.validRate * 100)}%), cost: $${gptResult.cost.toFixed(5)}, latency: ${gptResult.latencyMs}ms`)
  
  // Debug: Always log GPT rejections for modal stack debugging
  if (gptResult.invalid.length > 0) {
    console.log(`   📋 GPT rejected chunks:`)
    gptResult.invalid.forEach(({ chunk, reason }) => {
      console.log(`      - "${chunk}" (${reason})`)
    })
  }
  
  // Combined invalid chunks
  const allInvalidChunks = [
    ...tsCriticalInvalid,
    ...gptResult.invalid
  ]
  
  const totalInvalidRate = allInvalidChunks.length / parsed.chunks.length
  
  // Log validation details
  if (allInvalidChunks.length > 0 && process.env.NODE_ENV === 'development') {
    console.log(`   📋 Invalid chunks (showing first 3):`)
    allInvalidChunks.slice(0, 3).forEach(({ chunk, reason }) => {
      console.log(`      - "${chunk}" (${reason})`)
    })
  }
  
  // Retry logic
  if (totalInvalidRate > 0.3 && attempt < maxAttempts) {
    console.log(`   🔄 Invalid rate too high (${Math.round(totalInvalidRate * 100)}%), retrying with stricter prompt...`)
    await sleep(500) // Brief pause before retry
    return fetchChunksWithValidation(openai, transcript, attempt + 1)
  }
  
  return { 
    validChunks: gptResult.valid, 
    invalidChunks: allInvalidChunks, 
    invalidRate: totalInvalidRate,
    gptCost: gptResult.cost,
    gptLatency: gptResult.latencyMs
  }
}

/**
 * Normalize text for matching (handle quotes, case)
 */
function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/['']/g, "'")
    .replace(/[""]/g, '"')
    .trim()
}

/**
 * Match chunks to transcript to get ref_start/ref_end (character indices)
 * Reused logic from bulkChunkClips.ts
 */
function matchChunks(
  transcript: string,
  chunks: string[]
): Array<{ chunkText: string; refStart: number; refEnd: number }> {
  const results: Array<{ chunkText: string; refStart: number; refEnd: number }> = []
  let searchFrom = 0
  
  for (const chunk of chunks) {
    if (!chunk || !chunk.trim()) {
      results.push({ chunkText: chunk, refStart: -1, refEnd: -1 })
      continue
    }
    
    // Try exact match first
    const exactIdx = transcript.indexOf(chunk, searchFrom)
    if (exactIdx !== -1) {
      results.push({
        chunkText: chunk,
        refStart: exactIdx,
        refEnd: exactIdx + chunk.length,
      })
      searchFrom = exactIdx + chunk.length
      continue
    }
    
    // Try normalized match (quotes, case)
    const chunkNorm = normalizeForMatch(chunk)
    const transcriptNorm = normalizeForMatch(transcript.slice(searchFrom))
    const normIdx = transcriptNorm.indexOf(chunkNorm)
    
    if (normIdx !== -1) {
      const actualStart = searchFrom + normIdx
      results.push({
        chunkText: chunk,
        refStart: actualStart,
        refEnd: actualStart + chunk.length,
      })
      searchFrom = actualStart + chunk.length
    } else {
      // Not found
      results.push({ chunkText: chunk, refStart: -1, refEnd: -1 })
    }
  }
  
  return results
}

/**
 * Process a single clip: generate chunks, validate, write to v2 table
 */
async function processClip(
  supabase: SupabaseClient,
  openai: OpenAI,
  clip: ClipRow,
  options: { dryRun: boolean }
): Promise<{ success: boolean; chunksInserted: number; reason?: string }> {
  const { id: clipId, transcript } = clip
  
  console.log(`\n🎧 Processing ${clipId}`)
  console.log(`   Transcript: "${transcript.substring(0, 60)}${transcript.length > 60 ? '...' : ''}"`)
  
  if (!transcript || !transcript.trim()) {
    console.log('   ⚠️  Empty transcript, skipping')
    return { success: false, chunksInserted: 0, reason: 'Empty transcript' }
  }
  
  // Fetch chunks with validation and retry
  let validationResult: ValidationResult
  try {
    validationResult = await fetchChunksWithValidation(openai, transcript)
  } catch (error: any) {
    console.error(`   ❌ OpenAI error: ${error.message}`)
    return { success: false, chunksInserted: 0, reason: `OpenAI error: ${error.message}` }
  }
  
  const { validChunks, invalidChunks, invalidRate, gptCost, gptLatency } = validationResult
  
  // Log GPT metrics
  if (gptCost !== undefined && gptLatency !== undefined) {
    console.log(`   💰 Validation cost: $${gptCost.toFixed(5)}, latency: ${gptLatency}ms`)
  }
  
  // If still too many invalid chunks after retry, skip
  if (invalidRate > 0.5) {
    console.error(`   ❌ Invalid rate still too high (${Math.round(invalidRate * 100)}%) after retry, skipping clip`)
    return { 
      success: false, 
      chunksInserted: 0, 
      reason: `Invalid rate ${Math.round(invalidRate * 100)}% after retry`
    }
  }
  
  if (validChunks.length === 0) {
    console.error(`   ❌ No valid chunks generated, skipping`)
    return { success: false, chunksInserted: 0, reason: 'No valid chunks' }
  }
  
  console.log(`   ✓ Generated ${validChunks.length} valid chunks`)
  
  // Match chunks to transcript
  const matches = matchChunks(transcript, validChunks)
  const spansToInsert = matches.filter(m => m.refStart >= 0 && m.refEnd > m.refStart)
  const failed = matches.filter(m => m.refStart < 0)
  
  if (failed.length > 0) {
    console.log(`   ⚠️  ${failed.length} chunks failed to match transcript`)
  }
  
  if (spansToInsert.length === 0) {
    console.error(`   ❌ No chunks matched transcript, skipping`)
    return { success: false, chunksInserted: 0, reason: 'No chunks matched' }
  }
  
  console.log(`   ✓ Matched ${spansToInsert.length} chunks to transcript`)
  
  if (options.dryRun) {
    console.log('   🔎 DRY RUN: not writing to DB')
    console.log('   Sample chunks:')
    spansToInsert.slice(0, 5).forEach(span => {
      console.log(`      "${span.chunkText}" [${span.refStart}, ${span.refEnd}]`)
    })
    return { success: true, chunksInserted: spansToInsert.length }
  }
  
  // Write to production table
  // First, delete existing spans for this clip (idempotent)
  const { error: deleteError } = await supabase
    .from('clip_chunk_spans')
    .delete()
    .eq('clip_id', clipId)
  
  if (deleteError) {
    console.error(`   ❌ Error deleting old spans: ${deleteError.message}`)
    return { success: false, chunksInserted: 0, reason: `Delete error: ${deleteError.message}` }
  }
  
  // Insert new spans
  const { error: insertError } = await supabase
    .from('clip_chunk_spans')
    .insert(
      spansToInsert.map(span => ({
        clip_id: clipId,
        chunk_text: span.chunkText,
        ref_start: span.refStart,
        ref_end: span.refEnd,
        confidence: 'medium',
        approved: false,
        chunk_source: 'llm_auto',
        model_tag: 'gpt-4o-mini',
        prompt_tag: 'v2_hybrid_gpt_validation',
      }))
    )
  
  if (insertError) {
    console.error(`   ❌ Error inserting spans: ${insertError.message}`)
    return { success: false, chunksInserted: 0, reason: `Insert error: ${insertError.message}` }
  }
  
  console.log(`   ✅ Inserted ${spansToInsert.length} chunks into clip_chunk_spans`)
  
  return { success: true, chunksInserted: spansToInsert.length }
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const onlyIdsArg = args.find(a => a.startsWith('--only-ids='))?.split('=')[1]
  const fromAuditArg = args.find(a => a.startsWith('--from-audit='))?.split('=')[1]
  const limitArg = args.find(a => a.startsWith('--limit='))?.split('=')[1]
  const concurrencyArg = args.find(a => a.startsWith('--concurrency='))?.split('=')[1]
  const rateLimitArg = args.find(a => a.startsWith('--rate-limit='))?.split('=')[1]
  
  const limit = limitArg ? parseInt(limitArg, 10) : undefined
  const concurrency = concurrencyArg ? parseInt(concurrencyArg, 10) : 1
  const rateLimitMs = rateLimitArg ? parseInt(rateLimitArg, 10) : 1200
  
  console.log('🚀 Starting chunk regeneration V2...')
  console.log(`   Mode: ${dryRun ? 'DRY RUN (no DB writes)' : 'REAL (writing to v2 table)'}`)
  console.log(`   Concurrency: ${concurrency}`)
  console.log(`   Rate limit: ${rateLimitMs}ms between requests`)
  
  // Get clip IDs to process
  let clipIds: string[] = []
  
  if (onlyIdsArg) {
    clipIds = onlyIdsArg.split(',').map(id => id.trim())
    console.log(`   Processing ${clipIds.length} specific clips`)
  } else if (fromAuditArg) {
    try {
      const auditReport = JSON.parse(fs.readFileSync(fromAuditArg, 'utf8'))
      const topClips = auditReport.top_clips || []
      clipIds = topClips.slice(0, limit).map((c: any) => c.clip_id)
      console.log(`   Loaded ${clipIds.length} clips from audit report (limit: ${limit || 'none'})`)
    } catch (error: any) {
      console.error(`❌ Failed to load audit report: ${error.message}`)
      process.exit(1)
    }
  } else {
    console.error('❌ Must specify --only-ids or --from-audit')
    process.exit(1)
  }
  
  if (clipIds.length === 0) {
    console.log('⚠️  No clips to process')
    process.exit(0)
  }
  
  // Load checkpoint
  const checkpoint = loadCheckpoint()
  const remainingClips = clipIds.filter(id => !checkpoint.processedClipIds.includes(id))
  
  if (remainingClips.length < clipIds.length) {
    console.log(`   Resuming from checkpoint: ${remainingClips.length}/${clipIds.length} clips remaining`)
  }
  
  // Initialize clients
  const SUPABASE_URL = getEnv('NEXT_PUBLIC_SUPABASE_URL') || getEnv('SUPABASE_URL')
  const SUPABASE_SERVICE_ROLE_KEY = getEnv('SUPABASE_SERVICE_ROLE_KEY')
  const OPENAI_API_KEY = getEnv('OPENAI_API_KEY')
  
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
  
  const openai = new OpenAI({ apiKey: OPENAI_API_KEY })
  
  // Fetch clip data
  const { data: clips, error: fetchError } = await supabase
    .from('curated_clips')
    .select('id, transcript')
    .in('id', remainingClips)
  
  if (fetchError || !clips) {
    console.error('❌ Error fetching clips:', fetchError)
    process.exit(1)
  }
  
  console.log(`📦 Loaded ${clips.length} clips from database`)
  console.log('─'.repeat(60))
  
  // Process clips with concurrency control
  let processedCount = 0
  let successCount = 0
  let skippedCount = 0
  const failures: Array<{ clipId: string; reason: string }> = []
  
  for (let i = 0; i < clips.length; i += concurrency) {
    const batch = clips.slice(i, i + concurrency)
    
    const results = await Promise.all(
      batch.map(async (clip) => {
        const result = await processClip(supabase, openai, clip, { dryRun })
        
        // Rate limiting
        await sleep(rateLimitMs)
        
        return { clipId: clip.id, result }
      })
    )
    
    // Update stats and checkpoint
    for (const { clipId, result } of results) {
      processedCount++
      
      if (result.success) {
        successCount++
        checkpoint.processedClipIds.push(clipId)
      } else {
        skippedCount++
        checkpoint.skippedClipIds.push(clipId)
        failures.push({ clipId, reason: result.reason || 'Unknown error' })
      }
    }
    
    // Save checkpoint every batch
    checkpoint.timestamp = new Date().toISOString()
    saveCheckpoint(checkpoint)
    
    // Progress log
    console.log(`\n📊 Progress: ${processedCount}/${clips.length} clips (${successCount} success, ${skippedCount} skipped)`)
  }
  
  // Final summary
  console.log('\n' + '═'.repeat(60))
  console.log('✅ REGENERATION COMPLETE')
  console.log('═'.repeat(60))
  console.log(`Total clips processed:  ${processedCount}`)
  console.log(`Successful:             ${successCount}`)
  console.log(`Skipped:                ${skippedCount}`)
  console.log(`Mode:                   ${dryRun ? 'DRY RUN' : 'REAL'}`)
  
  if (failures.length > 0) {
    console.log(`\n⚠️  ${failures.length} clips failed:`)
    failures.slice(0, 10).forEach(({ clipId, reason }) => {
      console.log(`   - ${clipId}: ${reason}`)
    })
    
    // Save failure report
    const failureReport = {
      timestamp: new Date().toISOString(),
      total_failures: failures.length,
      failures: failures,
    }
    fs.writeFileSync(FAILURE_REPORT_FILE, JSON.stringify(failureReport, null, 2), 'utf8')
    console.log(`\n📄 Failure report saved to: ${FAILURE_REPORT_FILE}`)
  }
  
  if (!dryRun && successCount > 0) {
    console.log(`\n✅ ${successCount} clips written to clip_chunk_spans (production)`)
    console.log('Next steps:')
    console.log('  1. Verify in Supabase: SELECT * FROM clip_chunk_spans WHERE clip_id IN (...)')
    console.log('  2. Test in UI to confirm chunks display correctly')
    console.log('  3. Check chunk dictionary for meaning generation')
  }
  
  console.log('\n✅ Done')
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
