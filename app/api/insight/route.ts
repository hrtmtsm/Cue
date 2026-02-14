import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { generateTipLine, generateHowItSounds } from '@/lib/pronunciationHints'

export const runtime = 'nodejs'

const cache = new Map<string, any>()

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null

// Strict schema for insight card
// CRITICAL: TTS fields (howSpeak, exampleSpeak) are NEVER built from UI text
type InsightCard = {
  id?: string // Card identifier (phraseId:mistakeId)
  missed_text: string
  heard_text?: string | null
  context_chunk?: string | null // NEW: Phrase context containing missed_text (e.g., "she's gonna")
  sound_hint?: string // Short guiding sentence (max 8 words) - DISPLAY ONLY, never spoken
  how_it_sounds: {
    phonetic?: string // Simple phonetic respelling (e.g., SHAWRT, WAH-nuh, THOH)
    ipa?: string // IPA notation (e.g., /ʃɔrt/, /ðoʊ/) - DEPRECATED
    simplified?: string // DEPRECATED: Use phonetic instead
    compact?: string // DEPRECATED: Use phonetic instead
    tts_text?: string // DEPRECATED: Use howSpeak instead
    speaking_rate: number
  }
  howSpeak?: string // Explicit speak text for "How it sounds" button - MUST be short, card-scoped only
  example: {
    text: string // Display only
    tts_text?: string // DEPRECATED: Use exampleSpeak instead
    speaking_rate: number
  }
  exampleSpeak?: string // Explicit speak text for "One example" button - just the sentence
  // Legacy fields (kept for backward compatibility)
  howItSoundsSpeakText?: string // DEPRECATED: Use howSpeak
  exampleSpeakText?: string // DEPRECATED: Use exampleSpeak
}

// Generate stress-based "how it sounds" form (using new pronunciation hints)
function generateCompactForm(text: string, prevToken?: string, nextToken?: string): string {
  const result = generateHowItSounds(text, prevToken, nextToken)
  return result.display
}

// Generate short sound hint (max 8 words) - TOKEN-SPECIFIC (no includes-based checks)
function generateSoundHint(text: string, heardText: string | null, prevToken?: string, nextToken?: string): string {
  // Use the new pronunciation hints generator which is token-specific
  return generateTipLine(text, heardText || null, prevToken, nextToken)
}

// Generate simple example sentence (short, spoken English) - NEVER "Can you repeat"
function generateSimpleExample(missedText: string): string {
  const lower = missedText.toLowerCase().trim()
  const words = lower.split(/\s+/)
  
  // Single word examples
  if (words.length === 1) {
    const word = words[0]
    // Weak forms and common contractions
    if (word === 'to') return 'I want to go home now.'
    if (word === 'a') return 'I need a ticket for the show.'
    if (word === 'the') return 'I saw the train arrive late.'
    if (word === 'of') return 'A lot of people came today.'
    if (word === 'for') return 'I waited for you at the station.'
    if (word === 'if') return 'I wonder if it works now.'
    if (word === 'not') return 'I did not see it coming.'
    if (word === 'gonna') return 'I\'m gonna call you later tonight.'
    if (word === 'wanna') return 'I wanna learn that skill too.'
    if (word === 'gotta') return 'We gotta leave right now.'
    // Content words
    if (word === 'reservation') return 'I made a reservation for dinner.'
    if (word === 'train') return 'I missed the train this morning.'
    if (word === 'station') return 'The station is close to here.'
    if (word === 'tonight') return 'Let\'s meet up tonight after work.'
    if (word === 'though') return 'Real quick though, can we talk?'
    if (word === 'schedule') return 'Let me schedule a meeting for tomorrow.'
    // Generic - use in natural context (NOT "Can you repeat")
    return `I heard ${missedText} in the conversation.`
  }
  
  // Multi-word examples
  if (lower === 'get to') return 'I need to get to work early.'
  if (lower === 'the train') return 'I saw the train leave.'
  if (lower === 'a reservation') return 'I made a reservation for two.'
  if (lower === 'to get to') return 'I need to get to the airport.'
  if (lower.includes('gonna')) return `I\'m ${missedText} do that tomorrow.`
  if (lower.includes('wanna')) return `I ${missedText} try that place.`
  
  // Generic multi-word - use in natural context (NOT "Can you repeat")
  return `She said ${missedText} during the meeting.`
}

// Generate simple phonetic respelling (fallback - common words only)
function generatePhoneticRespelling(text: string): string {
  const lower = text.toLowerCase().trim()
  
  // Common words with phonetic respelling (simple, readable)
  const phoneticMap: Record<string, string> = {
    'to': 'tuh',
    'a': 'uh',
    'the': 'thuh',
    'of': 'uhv',
    'for': 'fer',
    'and': 'uhnd',
    'gonna': 'GAH-nuh',
    'wanna': 'WAH-nuh',
    'gotta': 'GAH-duh',
    'though': 'THOH',
    'through': 'THROO',
    'thought': 'THAWT',
    'short': 'SHAWRT',
    'schedule': 'SKEH-jool',
    'train': 'TRAYN',
    'station': 'STAY-shun',
    'tonight': 'tuh-NITE',
    'water': 'WAH-der',
    'better': 'BEH-der',
    'little': 'LIH-dul',
    'about': 'uh-BOWT',
    'can': 'kun',
    'have': 'huv',
    'because': 'bih-KUZ',
  }
  
  return phoneticMap[lower] || text.toUpperCase()
}

// Fallback deterministic card (TOKEN-SPECIFIC)
function generateFallbackCard(
  missedText: string, 
  heardText: string | null,
  contextChunk: string | null,
  prevToken?: string,
  nextToken?: string
): InsightCard {
  const compact = generateCompactForm(missedText, prevToken, nextToken)
  const example = generateSimpleExample(missedText)
  const soundHint = generateSoundHint(missedText, heardText, prevToken, nextToken)
  
  // Generate phonetic respelling (simple, readable)
  const phonetic = generatePhoneticRespelling(missedText)
  
  // howSpeak should be JUST the word/phrase (for TTS to say)
  const howSpeak = missedText
  const exampleSpeak = example
  
  return {
    missed_text: missedText,
    heard_text: heardText,
    context_chunk: contextChunk,
    sound_hint: soundHint,
    howSpeak: howSpeak,
    how_it_sounds: {
      phonetic: phonetic,
      speaking_rate: 1.08
    },
    example: {
      text: example,
      speaking_rate: 1.0
    },
    exampleSpeak: exampleSpeak,
    // Legacy fields
    howItSoundsSpeakText: howSpeak,
    exampleSpeakText: exampleSpeak
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { target_text, heard_text, context_chunk, transcript, userText, userLocale, chunkRefStart, chunkRefEnd } = body

    // Support legacy field name (missed_text) for backward compatibility
    const missedText = target_text || body.missed_text

    if (!missedText || !transcript || !userText) {
      return NextResponse.json({ error: 'Missing target_text/transcript/userText' }, { status: 400 })
    }

    // Extract context tokens (prev/next) from transcript for better pronunciation hints
    let prevToken: string | undefined
    let nextToken: string | undefined
    if (typeof chunkRefStart === 'number' && typeof chunkRefEnd === 'number') {
      const transcriptTokens = transcript.split(/\s+/)
      if (chunkRefStart > 0) {
        prevToken = transcriptTokens[chunkRefStart - 1]
      }
      if (chunkRefEnd < transcriptTokens.length) {
        nextToken = transcriptTokens[chunkRefEnd]
      }
    }

    const cacheKey = `${missedText}:${heard_text || 'null'}:${context_chunk || 'null'}:${transcript}:${userText}:${userLocale || 'en'}:${prevToken || ''}:${nextToken || ''}`
    const cached = cache.get(cacheKey)
    if (cached) return NextResponse.json(cached)

    // If no OpenAI, use fallback
    if (!openai) {
      const fallback = generateFallbackCard(missedText, heard_text || null, context_chunk || null, prevToken, nextToken)
      return NextResponse.json(fallback)
    }

    // Generate constrained LLM output
    const system = [
      'You are an English listening coach. Generate a minimal insight card in strict JSON format.',
      '',
      `LANGUAGE: Respond in ${userLocale === 'ja' ? 'JAPANESE' : 'ENGLISH'}.`,
      '',
      'RULES:',
      '- Output ONLY the JSON schema below. No extra fields, no explanations.',
      '- Keep outputs short and focused.',
      '',
      '- For "how_it_sounds.phonetic": Use SIMPLE ENGLISH sounds, NOT IPA symbols.',
      '  * Use hyphens to separate syllables',
      '  * Capitalize stressed syllables',
      '  * Use intuitive spellings',
      '',
      '  CRITICAL: DO NOT use IPA symbols like /ʃ/, /ð/, /ɔ/, etc.',
      '',
      '  Vowel sounds (use these):',
      '  * "ah" for \'a\' in father',
      '  * "aw" for \'o\' in short',
      '  * "oh" for \'o\' in go',
      '  * "uh" for unstressed vowels',
      '  * "ee" for \'e\' in see',
      '  * "ay" for \'a\' in day',
      '  * "eye" for \'i\' in I',
      '',
      '  Consonant sounds (use these):',
      '  * "sh" for \'sh\' in short',
      '  * "ch" for \'ch\' in church',
      '  * "th" for \'th\' in the/think',
      '  * "zh" for \'s\' in measure',
      '  * "ng" for \'ng\' in sing',
      '',
      '  Good examples:',
      '  * "to" → "tuh"',
      '  * "short" → "SHAWRT"',
      '  * "wanna" → "WAH-nuh"',
      '  * "though" → "THOH"',
      '  * "schedule" → "SKEH-jool"',
      '  * "water" → "WAH-der"',
      '  * "better" → "BEH-der"',
      '  * "going to" → "GOH-ing tuh" or "gonna" → "GAH-nuh"',
      '',
      '- For "sound_hint": Be SPECIFIC about phonetic phenomena. Avoid vague tips.',
      '  GOOD examples:',
      '  * "The \'gh\' is silent - focus on \'th\' and \'o\' sounds"',
      '  * "Listen for the reduced vowel in the unstressed syllable"',
      '  * "The \'want to\' combines into one smooth sound"',
      '  * "Pay attention to how the \'r\' sound disappears"',
      '  BAD examples (too vague):',
      '  * "Listen for the stressed syllable" ❌',
      '  * "Pay attention to pronunciation" ❌',
      '  * "Focus on the sound" ❌',
      '',
      '- For "howSpeak": ONLY the word itself (no explanations like "sounds like"). This will be spoken by TTS.',
      '',
      '- For example sentence: MUST be natural, conversational (NOT "Can you repeat X").',
      '  GOOD examples:',
      '  * For "wanna": "I wanna try that new restaurant"',
      '  * For "gonna": "She\'s gonna love this gift"',
      '  * For "schedule": "Let me schedule a meeting for tomorrow"',
      '  BAD examples:',
      '  * "Can you repeat X for me?" ❌',
      '  * "That\'s X." or "This is X." ❌',
      '  Use real situational examples that sound like native conversation.',
      '',
      '- If heard_text is null, do NOT include it in output.',
      '- If context_chunk exists, the sound_hint should reference it (e.g., "Part of X spoken as one unit").',
      '',
      'JSON Schema:',
      '{',
      '  "missed_text": "string (minimal span user missed)",',
      '  "heard_text": "string | null (only if user typed something)",',
      '  "context_chunk": "string | null (phrase containing missed_text, if applicable)",',
      '  "sound_hint": "string (specific phonetic tip, max 12 words)",',
      '  "howSpeak": "string (ONLY the word/phrase itself, will be spoken by TTS)",',
      '  "how_it_sounds": {',
      '    "phonetic": "string (simple phonetic respelling using English sounds, e.g., SHAWRT, WAH-nuh, THOH)",',
      '    "speaking_rate": 1.08',
      '  },',
      '  "example": {',
      '    "text": "string (natural conversational sentence, 6-12 words, NOT \'Can you repeat X\')",',
      '    "speaking_rate": 1.0',
      '  },',
      '  "exampleSpeak": "string (same as example.text)"',
      '}',
    ].join('\n')

    const user = [
      `Transcript: "${transcript}"`,
      `User typed: "${userText}"`,
      `Target text (what they missed): "${missedText}"`,
      heard_text ? `Heard text (what they typed): "${heard_text}"` : 'Heard text: null (user missed it entirely)',
      context_chunk ? `Context chunk: "${context_chunk}" (phrase containing target)` : 'Context: none',
      '',
      'CRITICAL RULES:',
      '1. If context_chunk exists, explain that target_text is part of context_chunk.',
      '2. Do NOT claim user missed the entire context_chunk unless target_text equals context_chunk.',
      '',
      '3. For example sentence - YOU MUST GENERATE A NATURAL, CONVERSATIONAL SENTENCE:',
      '   ✅ GOOD EXAMPLES:',
      `   - For "wanna": "I wanna try that new restaurant"`,
      `   - For "gonna": "She's gonna love this gift"`,
      `   - For "short": "It was a short meeting"`,
      `   - For "though": "I liked it though"`,
      `   - For "schedule": "Let me schedule that for you"`,
      '',
      '   ❌ FORBIDDEN PATTERNS (NEVER USE THESE):',
      '   - "Can you repeat X for me?" ← NEVER',
      '   - "Say X in a sentence" ← NEVER',
      '   - "How do you pronounce X?" ← NEVER',
      '   - "Practice saying X" ← NEVER',
      '   - Any sentence asking to repeat, practice, or explain the word',
      '',
      '4. The example MUST sound like real conversation, not a language exercise.',
      '',
      'Generate the insight card JSON now:',
    ].join('\n')

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.6,
        max_tokens: 300,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      })

      const content = completion.choices[0]?.message?.content || '{}'
      const parsed = JSON.parse(content) as Partial<InsightCard>

      // Validate and fill missing fields (use token-specific generators)
      const compactForm = generateCompactForm(missedText, prevToken, nextToken)
      const soundHint = parsed.sound_hint || generateSoundHint(missedText, heard_text || null, prevToken, nextToken)
      
      // VALIDATE EXAMPLE: Check for forbidden patterns
      let exampleText = parsed.example?.text || ''
      const badPatterns = [
        /can you repeat/i,
        /say.*in a sentence/i,
        /how do you (say|pronounce)/i,
        /practice saying/i,
        /repeat.*for me/i,
      ]
      
      const hasBadPattern = badPatterns.some(pattern => pattern.test(exampleText))
      
      if (hasBadPattern || !exampleText || exampleText.split(/\s+/).length < 4) {
        console.warn('⚠️ [API] Bad or missing example detected, using fallback:', exampleText)
        exampleText = generateSimpleExample(missedText)
      }
      
      // CRITICAL: Generate card-scoped speak text (never includes phrase context)
      // Structure: { id, missed, stressHintDisplay, howDisplay, howSpeak, exampleText, exampleSpeak }
      const { getHowItSoundsSpeakText, getExampleSpeakText } = require('@/lib/getHowItSoundsSpeakText')
      
      // Build structured card data with explicit TTS fields
      const mistakeToken = missedText // Original token (use consistent variable name)
      const stressHintDisplay = soundHint // Display only - NEVER spoken
      const howDisplay = compactForm // Visual display (e.g., "a" → "uh")
      
      // howSpeak should be JUST the word/phrase itself (for TTS)
      // If GPT provided howSpeak, use it; otherwise use the word itself
      let howSpeak = parsed.howSpeak || mistakeToken
      
      // Clean up: ensure howSpeak does NOT contain explanations
      if (howSpeak.includes('sounds like') || howSpeak.includes('Stress is on')) {
        console.warn('⚠️ [API] howSpeak contains explanation text - using word only')
        howSpeak = mistakeToken
      }
      
      // Use validated example (already checked for bad patterns above)
      const exampleDisplay = exampleText
      let exampleSpeak = exampleText
      
      // Clean up exampleSpeak: remove UI text but keep full sentence
      // Don't truncate at first period unless there's extra commentary
      if (exampleSpeak.includes('Stress is on')) {
        console.error('❌ [API] exampleSpeak contains "Stress is on" - removing it')
        exampleSpeak = exampleSpeak.replace(/Stress is on[^.]*\.?\s*/gi, '').trim()
      }
      
      // Only truncate if there are multiple sentences (extra commentary)
      const sentences = exampleSpeak.split(/\.\s+/)
      if (sentences.length > 1 && sentences[0].split(/\s+/).length >= 4) {
        // First sentence is substantial, use it
        exampleSpeak = sentences[0].trim()
      }
      
      // Final validation: ensure it's not too short or meta
      if (exampleSpeak.split(/\s+/).length < 4 || /^(that's|this is|it's)\s+\w+\.?$/i.test(exampleSpeak)) {
        console.warn('⚠️ [API] Example too short or meta, using fallback')
        exampleSpeak = exampleText // Use deterministic fallback
      }
      
      const cleanedExampleSpeak = exampleSpeak
      
      const insight: InsightCard = {
        missed_text: parsed.missed_text || missedText,
        heard_text: heard_text || parsed.heard_text || null,
        context_chunk: context_chunk || null, // NEW: Pass through phrase context
        sound_hint: stressHintDisplay, // Display only - NEVER used for TTS
        how_it_sounds: {
          phonetic: parsed.how_it_sounds?.phonetic || generatePhoneticRespelling(missedText),
          // Keep legacy fields for backward compatibility
          ipa: parsed.how_it_sounds?.ipa,
          simplified: parsed.how_it_sounds?.simplified || howDisplay,
          speaking_rate: 1.08
        },
        howSpeak: howSpeak, // Explicit speak text for "How it sounds" button - JUST the word
        example: parsed.example || {
          text: exampleDisplay,
          speaking_rate: 1.0
        },
        exampleSpeak: exampleSpeak, // Explicit speak text for "One example" button - MUST be used by TTS
        // Legacy fields for backward compatibility
        howItSoundsSpeakText: howSpeak,
        exampleSpeakText: cleanedExampleSpeak
      }

    cache.set(cacheKey, insight)
    return NextResponse.json(insight)
    } catch (llmError) {
      console.error('LLM error, using fallback:', llmError)
      const fallback = generateFallbackCard(missedText, heard_text || null, context_chunk || null, prevToken, nextToken)
      return NextResponse.json(fallback)
    }
  } catch (err) {
    console.error('insight route error', err)
    return NextResponse.json({ error: 'Failed to generate insight' }, { status: 500 })
  }
}






