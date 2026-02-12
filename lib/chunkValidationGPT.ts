/* eslint-disable no-console */
/**
 * GPT-based semantic chunk validation
 * 
 * Replaces rigid rule-based validation (Checks 6-10) with flexible semantic validation.
 * Uses GPT-4o-mini to identify incomplete or problematic chunks.
 */

import OpenAI from 'openai'

let openaiInstance: OpenAI | null = null

function getOpenAI(): OpenAI {
  if (!openaiInstance) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('Missing OPENAI_API_KEY environment variable')
    }
    openaiInstance = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  }
  return openaiInstance
}

const VALIDATION_PROMPT = `You are a chunk validator for an English listening comprehension app.

TASK: Review each chunk and identify any that are semantically incomplete or problematic.

CRITERIA FOR REJECTION:
1. Incomplete subordinate clauses: "before we", "when I" (missing main clause)
2. Stranded function words alone: "to", "the", "a" (no content)
3. Incomplete phrasal verbs: "pick" without "up", "turn" without "on"
4. Broken idioms: "shoot you an" (should be "shoot you an email")

NOTE: DO NOT reject chunks containing modals (gonna, wanna, gotta, etc.). All modal patterns are VALID.

CRITERIA FOR ACCEPTANCE:
✅ Modal + verb: "I'm gonna call", "She's gonna go", "I wanna schedule", "He's gonna grab"
✅ Modal + verb phrase: "gonna go to the store", "wanna come with us"
✅ Complete phrasal verbs: "pick up", "turn on", "figure out"
✅ Motion verb + preposition: "go to", "walk to", "come to"
✅ Complete prepositional phrases: "to the airport", "in the morning"
✅ Complete noun phrases: "the red car", "my best friend"
✅ Complete clauses: "when I get home", "before we can board"
✅ Complete object phrases: "you an email", "him a call" (when they're complete objects)

**IMPORTANT - MODAL STACKS:**

Modal stacks are COMPLETE phrases even without the main verb:
✅ "gonna have to" (modal + modal) - VALID
✅ "We're gonna have to" (modal + modal) - VALID
✅ "wanna be able to" (modal + modal) - VALID
✅ "shoulda been able to" (modal + modal + modal) - VALID
✅ "coulda been" (modal + modal) - VALID
✅ "used to have to" (modal + modal) - VALID
✅ "going to need to" (modal + modal) - VALID

The main verb can be in the next chunk. These are NOT dangling modals.

**IMPORTANT: ALL MODALS ARE VALID:**
✅ Single modal alone: "I'm gonna", "We wanna", "He's gotta" - VALID
✅ Modal + verb: "I'm gonna call", "She's gonna go" - VALID
✅ Modal stack: "gonna have to", "wanna be able to" - VALID

DO NOT reject any chunk that contains modal words (gonna, wanna, gotta, shoulda, coulda, etc.).

**Examples of VALID chunks (modal + verb):**
✅ "I'm gonna call" (modal + verb "call")
✅ "She's gonna go" (modal + verb "go")
✅ "I wanna schedule" (modal + verb "schedule")
✅ "He's gonna grab some coffee" (modal + verb + object)
✅ "We gotta tell you" (modal + verb + object)
✅ "I'm gonna shoot you an email" (modal + verb + complete idiom)

**Examples of VALID chunks (modal stack):**
✅ "We're gonna have to" (modal stack, verb in next chunk is OK)
✅ "You shoulda been able to" (modal stack)
✅ "I wanna be able to" (modal stack)
✅ "gonna have to catch" (modal stack + verb)

**Examples of VALID chunks (modal alone):**
✅ "I'm gonna" (modal alone is VALID - don't reject)
✅ "We wanna" (modal alone is VALID - don't reject)
✅ "You shoulda" (modal alone is VALID - don't reject)
✅ "He's gotta" (modal alone is VALID - don't reject)

GENERAL RULE:
- Be lenient with chunks that could stand alone in conversation
- Chunks ending with object pronouns (me, you, him, her, it, us, them) are VALID
- "gonna go", "wanna come" are COMPLETE verb phrases (destination in next chunk is fine)

Return ONLY invalid chunks as JSON array with reasons.
If all chunks are valid, return: { "invalid": [] }

Example output:
{
  "invalid": [
    { "chunk": "before we", "reason": "Incomplete subordinate clause" },
    { "chunk": "the", "reason": "Stranded function word alone" }
  ]
}

REMEMBER: ALL modal patterns are VALID. Never reject chunks with gonna, wanna, gotta, etc.`

export interface InvalidChunk {
  chunk: string
  reason: string
}

export interface ValidationResult {
  valid: string[]
  invalid: InvalidChunk[]
  validRate: number
  cost: number
  latencyMs: number
}

/**
 * Validate chunks using GPT-4o-mini semantic analysis
 * 
 * @param chunks - Array of chunk strings to validate
 * @param transcript - Full transcript (for context)
 * @returns Validation result with valid/invalid chunks, cost, and latency
 */
export async function validateChunksWithGPT(
  chunks: string[],
  transcript: string
): Promise<ValidationResult> {
  const startTime = Date.now()
  
  if (chunks.length === 0) {
    return {
      valid: [],
      invalid: [],
      validRate: 0,
      cost: 0,
      latencyMs: 0,
    }
  }

  const chunkList = chunks.map((c, i) => `${i + 1}. "${c}"`).join('\n')
  
  try {
    const openai = getOpenAI()
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: VALIDATION_PROMPT },
        {
          role: 'user',
          content: `Transcript: "${transcript}"\n\nChunks to validate:\n${chunkList}`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 500, // Enough for validation results
    })

    const latencyMs = Date.now() - startTime
    
    // Parse result
    const result = JSON.parse(response.choices[0].message.content || '{"invalid":[]}')
    const invalidChunks: InvalidChunk[] = result.invalid || []
    
    // Calculate cost (gpt-4o-mini: $0.150/1M input tokens, $0.600/1M output tokens)
    const inputTokens = response.usage?.prompt_tokens || 0
    const outputTokens = response.usage?.completion_tokens || 0
    const cost = (inputTokens * 0.150 / 1_000_000) + (outputTokens * 0.600 / 1_000_000)
    
    // Build valid/invalid sets
    const invalidTexts = new Set(invalidChunks.map(c => c.chunk.trim()))
    const valid = chunks.filter(c => !invalidTexts.has(c.trim()))
    
    return {
      valid,
      invalid: invalidChunks,
      validRate: valid.length / chunks.length,
      cost,
      latencyMs,
    }
  } catch (error: any) {
    console.error('❌ GPT validation error:', error.message)
    
    // Fallback: accept all chunks on error
    return {
      valid: chunks,
      invalid: [],
      validRate: 1.0,
      cost: 0,
      latencyMs: Date.now() - startTime,
    }
  }
}

/**
 * Batch validate multiple clips' chunks at once
 * More efficient for large batches, but less granular error handling
 * 
 * @param clipChunks - Array of { clipId, transcript, chunks }
 * @returns Map of clipId -> ValidationResult
 */
export async function validateChunksBatch(
  clipChunks: Array<{ clipId: string; transcript: string; chunks: string[] }>
): Promise<Map<string, ValidationResult>> {
  const results = new Map<string, ValidationResult>()
  
  // Process in parallel (max 5 concurrent)
  const concurrency = 5
  const batches = []
  
  for (let i = 0; i < clipChunks.length; i += concurrency) {
    batches.push(clipChunks.slice(i, i + concurrency))
  }
  
  for (const batch of batches) {
    const promises = batch.map(async ({ clipId, transcript, chunks }) => {
      const result = await validateChunksWithGPT(chunks, transcript)
      results.set(clipId, result)
    })
    
    await Promise.all(promises)
  }
  
  return results
}
