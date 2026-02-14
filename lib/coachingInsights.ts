import OpenAI from 'openai'
import type { AlignmentEvent } from './alignmentEngine'

export type ReasonType =
  | 'words_blended'
  | 'short_word_got_swallowed'
  | 'sounds_like'
  | 'brain_autofill'
  | 'common_casual_form'

export interface CoachingInsight {
  title: string // Still generated but not displayed in UI
  what_you_might_have_heard: string
  what_it_was: string
  why_this_happens_here: string // No longer displayed in UI
  try_this: string // No longer displayed in UI
  example_sentences?: string[] // No longer displayed in UI
  replay_target: {
    text: string
    refStart: number
    refEnd: number
  }
  reason_type: ReasonType
  // New fields for chunk-level insights
  display_chunk?: string
  highlight_start_token?: number
  highlight_end_token?: number
  how_it_sounds_text?: string // No longer displayed (replaced by how_it_sounds_display)
  example_text?: string // No longer displayed (replaced by example_sentence)
  cause_type?: 'weak_form' | 'linking' | 'chunk_blur' | 'phoneme_confusion'
  // Sound-first fields
  how_it_sounds_display?: string // Format: "train station" → "trenstation"
  how_it_sounds_audio_url?: string | null
  example_sentence?: string | null // Single example sentence
  example_audio_url?: string | null
}

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null

function safeReplayText(event: AlignmentEvent): { text: string; refStart: number; refEnd: number } {
  const text = event.phraseHint?.spanText ?? event.expectedSpan ?? ''
  const refStart = event.phraseHint?.spanRefStart ?? event.refStart ?? 0
  const refEnd = event.phraseHint?.spanRefEnd ?? event.refEnd ?? refStart
  return { text, refStart, refEnd }
}

function minimalFallback(input: {
  event: AlignmentEvent
  transcript: string
  userText: string
  display_chunk?: string
  cause_type?: 'weak_form' | 'linking' | 'chunk_blur' | 'phoneme_confusion'
}): CoachingInsight {
  const { event, display_chunk, cause_type } = input
  const replay = safeReplayText(event)
  const heard = event.actualSpan ?? '(not heard)'
  const was = display_chunk || replay.text || event.expectedSpan

  // Generate fallback how_it_sounds_display with phonetic approximation
  let how_it_sounds_display: string | undefined = undefined
  if (was) {
    const words = was.toLowerCase().split(/\s+/)
    let phonetic: string
    
    switch (cause_type) {
      case 'weak_form':
        // Reduce function words
        phonetic = words.map(w => {
          if (w === 'the') return "th'"
          if (w === 'to') return "t'"
          if (w === 'a') return "uh"
          if (w === 'an') return "uhn"
          if (w === 'of') return "uhv"
          return w
        }).join(' ')
        break
      case 'linking':
        // Blend words
        phonetic = words.join('')
        break
      case 'chunk_blur':
        // Blend and simplify sounds
        phonetic = words.join('')
          .replace(/ai/g, 'e')
          .replace(/ay/g, 'e')
        break
      case 'phoneme_confusion':
        const actual = event.actualSpan || ''
        phonetic = actual || was.toLowerCase().replace(/ai/g, 'a')
        break
      default:
        phonetic = words.join('')
    }
    
    // Ensure it's different from original
    const normalizedOriginal = was.toLowerCase().replace(/\s+/g, '')
    const normalizedPhonetic = phonetic.replace(/\s+/g, '').replace(/['"]/g, '')
    
    if (normalizedOriginal !== normalizedPhonetic) {
      how_it_sounds_display = `"${was}" → "${phonetic}"`
    } else {
      // Force difference
      const forced = was.toLowerCase()
        .replace(/\bthe\b/g, "th'")
        .replace(/\bto\b/g, "t'")
        .replace(/\s+/g, '')
      how_it_sounds_display = `"${was}" → "${forced}"`
    }
  }
  
  // Generate short example
  let example_sentence: string | null = null
  if (was) {
    const words = was.split(/\s+/)
    if (was.includes('train')) {
      example_sentence = 'Take the train.'
    } else if (was.includes('get to')) {
      example_sentence = 'I need to get to work.'
    } else if (words.length <= 3) {
      example_sentence = `${was.charAt(0).toUpperCase() + was.slice(1)}.`
    } else {
      example_sentence = `Use ${was}.`
    }
    
    // Enforce max length
    const exampleWords = example_sentence.split(/\s+/)
    if (exampleWords.length > 10) {
      example_sentence = exampleWords.slice(0, 10).join(' ') + '.'
    }
  }
  
  const baseInsight = {
    display_chunk: display_chunk || was,
    cause_type: cause_type,
    how_it_sounds_display: how_it_sounds_display,
    how_it_sounds_audio_url: null, // TODO: Implement TTS
    example_sentence: example_sentence,
    example_audio_url: null, // TODO: Implement TTS
  }
  
  if (event.type === 'missing') {
    return {
      title: 'That part can disappear',
      what_you_might_have_heard: heard,
      what_it_was: was,
      why_this_happens_here: `In this sentence, "${was}" sits between other words, so it can blend in and be easy to miss.`,
      try_this: `Replay "${was}" and listen for it as one small piece, not word-by-word.`,
      replay_target: replay,
      reason_type: 'short_word_got_swallowed',
      ...baseInsight,
    }
  }
  if (event.type === 'extra') {
    return {
      title: 'Your ear may have filled a gap',
      what_you_might_have_heard: heard,
      what_it_was: was,
      why_this_happens_here: `When the sentence flows, it can feel like there's an extra word in the middle—even if it wasn't said.`,
      try_this: `Replay "${was}" and focus on the flow into the next words.`,
      replay_target: replay,
      reason_type: 'brain_autofill',
      ...baseInsight,
    }
  }
  return {
    title: 'Two parts can sound close',
    what_you_might_have_heard: heard,
    what_it_was: was,
    why_this_happens_here: `In this spot, the surrounding words make this part easy to confuse with something that sounds close.`,
    try_this: `Replay "${was}" and listen for how it connects to the words around it.`,
    replay_target: replay,
    reason_type: 'sounds_like',
    ...baseInsight,
  }
}

function extractJsonObject(text: string): any {
  // Best-effort: find first/last braces
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
}

function hasRequiredReference(insight: any, actualSpan: string): boolean {
  const s = String(insight?.what_you_might_have_heard || '')
  if (!actualSpan) return s.includes('(not heard)')
  return s.toLowerCase().includes(actualSpan.toLowerCase())
}

export async function generateCoachingInsight(input: {
  event: AlignmentEvent
  transcript: string
  userText: string
  userLocale: string
  display_chunk?: string
  highlight_start_token?: number
  highlight_end_token?: number
}): Promise<CoachingInsight> {
  const { event, transcript, userText, userLocale, display_chunk, highlight_start_token, highlight_end_token } = input
  const replay = safeReplayText(event)
  const actualSpan = event.actualSpan ?? '(not heard)'
  
  // Task B: Determine cause_type with simple rules
  const chunk = display_chunk || replay.text || event.expectedSpan || ''
  const chunkWords = chunk.toLowerCase().split(/\s+/)
  const FUNCTION_WORDS = new Set(['to', 'the', 'a', 'an', 'of', 'at', 'in', 'on', 'for', 'and', 'but'])
  const hasFunctionWords = chunkWords.some(w => FUNCTION_WORDS.has(w))
  const isMultiWord = chunkWords.length >= 2
  
  // Check if expected vs actual are close spelling (simple Levenshtein-like check)
  const expected = (event.expectedSpan || '').toLowerCase().trim()
  const actual = (actualSpan || '').toLowerCase().trim()
  const editDistance = (s1: string, s2: string): number => {
    if (s1.length === 0) return s2.length
    if (s2.length === 0) return s1.length
    const matrix: number[][] = []
    for (let i = 0; i <= s2.length; i++) {
      matrix[i] = [i]
    }
    for (let j = 0; j <= s1.length; j++) {
      matrix[0][j] = j
    }
    for (let i = 1; i <= s2.length; i++) {
      for (let j = 1; j <= s1.length; j++) {
        if (s2[i - 1] === s1[j - 1]) {
          matrix[i][j] = matrix[i - 1][j - 1]
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          )
        }
      }
    }
    return matrix[s2.length][s1.length]
  }
  const distance = editDistance(expected, actual)
  const maxLen = Math.max(expected.length, actual.length)
  const isCloseSpelling = maxLen > 0 && distance / maxLen < 0.3 // Within 30% edit distance
  
  let cause_type: 'weak_form' | 'linking' | 'chunk_blur' | 'phoneme_confusion' | undefined
  if (hasFunctionWords) {
    cause_type = isMultiWord ? 'linking' : 'weak_form'
  } else if (isMultiWord) {
    cause_type = 'chunk_blur'
  } else if (isCloseSpelling) {
    cause_type = 'phoneme_confusion'
  }
  
  console.log('🔍 [Insight] Determined cause_type:', {
    display_chunk: chunk,
    hasFunctionWords,
    isMultiWord,
    isCloseSpelling,
    cause_type,
    expected,
    actual,
    editDistance: distance
  })

  if (!openai) {
    console.log('⚠️ [Insight] No OPENAI_API_KEY found - using fallback template')
    return {
      ...minimalFallback({ event, transcript, userText, display_chunk: chunk, cause_type }),
      display_chunk: chunk || undefined,
      highlight_start_token: highlight_start_token,
      highlight_end_token: highlight_end_token,
      how_it_sounds_text: cause_type === 'chunk_blur' 
        ? `"${chunk}" can sound like one word when spoken quickly.`
        : undefined,
      example_text: chunk ? `Example: "${chunk}" appears in different contexts.` : undefined,
      cause_type: cause_type,
    }
  }

  console.log('✅ [Insight] OpenAI key detected - calling GPT-4o-mini')

  // TypeScript now knows openai is not null after the check above
  const openaiClient = openai

  const system = [
    'You are a friendly English listening coach.',
    'Explain ONE mistake in a way that feels personal and useful.',
    '',
    `LANGUAGE: Respond in ${userLocale === 'ja' ? 'JAPANESE' : 'ENGLISH'}. All fields (title, explanations, tips) must be in ${userLocale === 'ja' ? 'Japanese' : 'English'}.`,
    '',
    'Hard rules:',
    '- Be specific to THIS transcript and THIS userText.',
    '- Never claim certainty about the audio.',
    '- Avoid technical terms and jargon.',
    `- MUST include the user's guess exactly ("${actualSpan}") in what_you_might_have_heard.`,
    '- Focus on phrases, not single words.',
    '- Output JSON only.',
  ].join('\n')

  const user = [
    `Language: ${userLocale === 'ja' ? 'Japanese' : 'English'}`,
    `Transcript (correct): "${transcript}"`,
    `User typed: "${userText}"`,
    '',
    'Event:',
    `- type: ${event.type}`,
    `- expectedSpan: "${event.expectedSpan}"`,
    `- actualSpan: "${actualSpan}"`,
    `- replayPhrase: "${replay.text}"`,
    `- display_chunk: "${chunk}"`,
    `- cause_type: "${cause_type || 'unknown'}"`,
    `- contextBefore: "${event.context?.before ?? ''}"`,
    `- contextAfter: "${event.context?.after ?? ''}"`,
    ...((event as any).nearbyBefore?.length > 0 ? [
      `- nearbyBefore: ${(event as any).nearbyBefore.join(', ')}`
    ] : []),
    ...((event as any).nearbyAfter?.length > 0 ? [
      `- nearbyAfter: ${(event as any).nearbyAfter.join(', ')}`
    ] : []),
    '',
    'IMPORTANT: If nearbyBefore or nearbyAfter exist, check if expectedSpan forms a phrasal verb or idiom with nearby words.',
    'Examples:',
    '- "caught" + nearbyAfter["up", "with"] = "caught up with" (phrasal verb)',
    '- "get" + nearbyAfter["along"] = "get along" (phrasal verb)',
    '- "kind" + nearbyAfter["of"] = "kind of" (reduction)',
    '',
    'If a phrasal verb or idiom is detected, explain the FULL phrase in what_it_was and why_this_happens_here.',
    '',
    'PRONUNCIATION/REDUCTION INFO:',
    '- In try_this, explain HOW the word/phrase sounds in THIS specific sentence context.',
    '- Mention specific reductions, linking, or elision that happened (e.g., "In this sentence, \'wanna\' reduces the \'t\' sound, making \'join\' blend with it").',
    '- Explain pronunciation changes that occur when words connect in natural speech.',
    '',
    `SOUND-FIRST FIELDS (cause_type is "${cause_type || 'unknown'}"):`,
    `- how_it_sounds_display: REQUIRED. Phonetic-like approximation showing written → spoken.`,
    `  CRITICAL RULES:`,
    `  - Must include → arrow: "${chunk}" → "phonetic"`,
    `  - Must be <= 40 characters total`,
    `  - Must NOT be identical to "${chunk}" (must show sound change)`,
    `  - Use simple phonetic spelling (NO IPA, NO technical symbols)`,
    `  - Examples:`,
    `    * "train station" → "trenstation" (blending)`,
    `    * "the train" → "th' train" or "thuh train" (weak form)`,
    `    * "to get to" → "tuh-get-tuh" or "togetto" (linking)`,
    `    * "want to" → "wanna" (reduction)`,
    `  - For weak_form: show reduction (e.g., "the" → "th'", "to" → "t'")`,
    `  - For linking: show connection (e.g., "get to" → "getto")`,
    `  - For chunk_blur: show blending (e.g., "train station" → "trenstation")`,
    `  - For phoneme_confusion: show similar sound (e.g., "train" → "tran")`,
    `- example_sentence: REQUIRED. Exactly ONE short example sentence (7-10 words MAX).`,
    `  - Must use "${chunk}" naturally`,
    `  - Keep it minimal and focused`,
    `  - Examples: "Take the train." / "Catch the train." / "I need to get to work."`,
    `  - NO long explanations, NO complex sentences`,
    '',
    'Return JSON:',
    `{
    "title": "short friendly title (for internal use only)",
    "what_you_might_have_heard": "must include actualSpan exactly",
    "what_it_was": "use display_chunk if present, else replayPhrase",
    "why_this_happens_here": "1-2 sentences (for internal use, not displayed)",
    "try_this": "1-2 sentences (for internal use, not displayed)",
    "example_sentences": ["legacy field, not displayed"],
    "replay_target": { "text": "${replay.text}", "refStart": ${replay.refStart}, "refEnd": ${replay.refEnd} },
    "reason_type": "words_blended | short_word_got_swallowed | sounds_like | brain_autofill | common_casual_form",
    "how_it_sounds_display": "${chunk}" → "phonetic-approximation",
    "example_sentence": "Short example (7-10 words max)"
  }`,
  ].join('\n')

  async function callOnce(extraNudge?: string) {
    const completion = await openaiClient.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.6,
      max_tokens: 400,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: extraNudge ? `${user}\n\n${extraNudge}` : user },
      ],
    })
    
    console.log('✅ [Insight] OpenAI response received:', {
      model: completion.model,
      tokens: completion.usage,
      hasContent: !!completion.choices[0]?.message?.content
    })
    
    const content = completion.choices?.[0]?.message?.content ?? '{}'
    const parsed = extractJsonObject(content) ?? {}
    return parsed
  }

  // First attempt
  let parsed = await callOnce()
  if (!hasRequiredReference(parsed, actualSpan)) {
    console.log('⚠️ [Insight] First attempt missing user guess - retrying with stronger nudge')
    // Retry once with stronger nudge
    parsed = await callOnce(
      `Important: In what_you_might_have_heard, you MUST include exactly: "${actualSpan}".`
    )
  }

  if (!hasRequiredReference(parsed, actualSpan)) {
    console.log('❌ [Insight] OpenAI response failed validation - falling back to template')
    return {
      ...minimalFallback({ event, transcript, userText, display_chunk: chunk, cause_type }),
      display_chunk: chunk || undefined,
      highlight_start_token: highlight_start_token,
      highlight_end_token: highlight_end_token,
    }
  }
  
  console.log('✅ [Insight] OpenAI feedback validated successfully')

  const fallback = minimalFallback({ event, transcript, userText, display_chunk: chunk, cause_type })
  
  // Generate fallback how_it_sounds_display if LLM didn't provide
  let how_it_sounds_display = parsed.how_it_sounds_display
  let example_sentence = parsed.example_sentence || (Array.isArray(parsed.example_sentences) && parsed.example_sentences.length > 0 ? parsed.example_sentences[0] : null)
  
  // Helper: Generate phonetic approximation
  function generatePhoneticApproximation(text: string, cause: typeof cause_type): string {
    const words = text.toLowerCase().split(/\s+/)
    
    switch (cause) {
      case 'weak_form':
        // Reduce function words: "the" → "th'", "to" → "t'", "a" → "uh"
        return words.map(w => {
          if (w === 'the') return "th'"
          if (w === 'to') return "t'"
          if (w === 'a') return "uh"
          if (w === 'an') return "uhn"
          if (w === 'of') return "uhv"
          if (w === 'at') return "uht"
          if (w === 'in') return "ihn"
          if (w === 'on') return "uhn"
          if (w === 'for') return "f'r"
          return w
        }).join(' ')
        
      case 'linking':
        // Remove spaces, blend: "get to" → "getto"
        return words.join('')
        
      case 'chunk_blur':
        // Blend and simplify: "train station" → "trenstation"
        const blended = words.join('')
        // Common sound changes in fast speech
        return blended
          .replace(/ai/g, 'e')  // train → tren
          .replace(/ay/g, 'e')
          .replace(/ou/g, 'uh')
          .replace(/ow/g, 'uh')
        
      case 'phoneme_confusion':
        // Use actual if available, else show common confusion
        if (actualSpan && actualSpan !== '(not heard)') {
          return actualSpan.toLowerCase()
        }
        // Common confusions
        return text.toLowerCase()
          .replace(/ai/g, 'a')  // train → tran
          .replace(/ay/g, 'a')
        
      default:
        // Generic: blend words
        return words.join('')
    }
  }
  
  if (!how_it_sounds_display && chunk) {
    const chunkText = chunk || event.expectedSpan || ''
    const phonetic = generatePhoneticApproximation(chunkText, cause_type)
    
    // Ensure it's different from original
    const normalizedOriginal = chunkText.toLowerCase().replace(/\s+/g, '')
    const normalizedPhonetic = phonetic.replace(/\s+/g, '').replace(/['"]/g, '')
    
    if (normalizedOriginal === normalizedPhonetic) {
      // Force a difference: add common reductions
      const forced = chunkText.toLowerCase()
        .replace(/\bthe\b/g, "th'")
        .replace(/\bto\b/g, "t'")
        .replace(/\ba\b/g, "uh")
        .replace(/\s+/g, '')
      how_it_sounds_display = `"${chunkText}" → "${forced}"`
    } else {
      how_it_sounds_display = `"${chunkText}" → "${phonetic}"`
    }
    
    // Enforce max length
    if (how_it_sounds_display.length > 40) {
      const shortPhonetic = phonetic.substring(0, 20)
      how_it_sounds_display = `"${chunkText}" → "${shortPhonetic}..."`
    }
  }
  
  // Validate: ensure it's not identical
  if (how_it_sounds_display) {
    const match = how_it_sounds_display.match(/→\s*"([^"]+)"/)
    if (match) {
      const phoneticPart = match[1].toLowerCase().replace(/['"]/g, '').replace(/\s+/g, '')
      const originalPart = (chunk || event.expectedSpan || '').toLowerCase().replace(/\s+/g, '')
      if (phoneticPart === originalPart) {
        // Force difference
        const forced = phoneticPart.replace(/the/g, "th'").replace(/to/g, "t'")
        how_it_sounds_display = how_it_sounds_display.replace(/→\s*"[^"]+"/, `→ "${forced}"`)
      }
    }
  }
  
  // Generate short, natural example if missing
  if (!example_sentence && chunk) {
    const chunkText = chunk || event.expectedSpan || ''
    const words = chunkText.split(/\s+/)
    
    // Generate natural examples that match how chunk appears in speech
    if (chunkText.includes('get to')) {
      example_sentence = 'I need to get to the office by nine.'
    } else if (chunkText.includes('the train')) {
      example_sentence = 'I missed the train this morning.'
    } else if (chunkText.includes('train') && !chunkText.includes('the')) {
      example_sentence = 'The train arrives in five minutes.'
    } else if (chunkText.includes('to the')) {
      example_sentence = `Let's go to the ${words[words.length - 1] || 'store'}.`
    } else if (chunkText.includes('gonna')) {
      example_sentence = 'I\'m gonna finish this project today.'
    } else if (chunkText.includes('wanna')) {
      example_sentence = 'Do you wanna come with us?'
    } else if (chunkText.includes('shoulda')) {
      example_sentence = 'I shoulda called you earlier.'
    } else if (words.length <= 2) {
      // Short chunks: create natural sentence
      const capitalized = chunkText.charAt(0).toUpperCase() + chunkText.slice(1)
      if (chunkText.includes('the')) {
        example_sentence = `I saw ${chunkText} yesterday.`
      } else {
        example_sentence = `${capitalized} is important.`
      }
    } else {
      // Multi-word: use in natural context
      example_sentence = `I heard ${chunkText} in the conversation.`
    }
    
    // Enforce 7-10 words max
    const exampleWords = example_sentence.split(/\s+/)
    if (exampleWords.length > 10) {
      example_sentence = exampleWords.slice(0, 10).join(' ') + '.'
    }
  } else if (example_sentence) {
    // Ensure example is short and natural
    const exampleWords = example_sentence.split(/\s+/)
    if (exampleWords.length > 10) {
      // Try to keep sentence natural by cutting at punctuation or clause boundary
      const truncated = exampleWords.slice(0, 10).join(' ')
      example_sentence = truncated.endsWith('.') ? truncated : truncated + '.'
    }
  }
  
  return {
    title: String(parsed.title || fallback.title),
    what_you_might_have_heard: String(parsed.what_you_might_have_heard || fallback.what_you_might_have_heard),
    what_it_was: String(parsed.what_it_was || display_chunk || fallback.what_it_was),
    why_this_happens_here: String(parsed.why_this_happens_here || fallback.why_this_happens_here), // Not displayed
    try_this: String(parsed.try_this || fallback.try_this), // Not displayed
    example_sentences: Array.isArray(parsed.example_sentences) ? parsed.example_sentences.map(String) : undefined, // Not displayed
    replay_target: parsed.replay_target || fallback.replay_target,
    reason_type: (parsed.reason_type as ReasonType) || fallback.reason_type,
    display_chunk: display_chunk || chunk || undefined,
    highlight_start_token: highlight_start_token,
    highlight_end_token: highlight_end_token,
    how_it_sounds_text: parsed.how_it_sounds_text || undefined, // Legacy, not displayed
    example_text: parsed.example_text || undefined, // Legacy, not displayed
    cause_type: cause_type,
    // Sound-first fields (REQUIRED)
    how_it_sounds_display: how_it_sounds_display || (() => {
      // Last resort fallback - should never happen if LLM/fallback works
      const chunkText = display_chunk || chunk || event.expectedSpan || ''
      const forced = chunkText.toLowerCase()
        .replace(/\bthe\b/g, "th'")
        .replace(/\bto\b/g, "t'")
        .replace(/\s+/g, '')
      return `"${chunkText}" → "${forced}"`
    })(),
    how_it_sounds_audio_url: null, // TODO: Implement TTS audio generation
    example_sentence: example_sentence || null,
    example_audio_url: null, // TODO: Implement TTS audio generation
  }
}


