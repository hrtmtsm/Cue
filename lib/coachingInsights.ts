import OpenAI from 'openai'
import type { AlignmentEvent } from './alignmentEngine'

export type ReasonType =
  | 'words_blended'
  | 'short_word_got_swallowed'
  | 'sounds_like'
  | 'brain_autofill'
  | 'common_casual_form'

export interface CoachingInsight {
  title: string
  what_you_might_have_heard: string
  what_it_was: string
  why_this_happens_here: string
  try_this: string
  replay_target: {
    text: string
    refStart: number
    refEnd: number
  }
  reason_type: ReasonType
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
}): CoachingInsight {
  const { event } = input
  const replay = safeReplayText(event)
  const heard = event.actualSpan ?? '(not heard)'
  const was = replay.text || event.expectedSpan

  if (event.type === 'missing') {
    return {
      title: 'That part can disappear',
      what_you_might_have_heard: heard,
      what_it_was: was,
      why_this_happens_here: `In this sentence, “${was}” sits between other words, so it can blend in and be easy to miss.`,
      try_this: `Replay “${was}” and listen for it as one small piece, not word-by-word.`,
      replay_target: replay,
      reason_type: 'short_word_got_swallowed',
    }
  }
  if (event.type === 'extra') {
    return {
      title: 'Your ear may have filled a gap',
      what_you_might_have_heard: heard,
      what_it_was: was,
      why_this_happens_here: `When the sentence flows, it can feel like there’s an extra word in the middle—even if it wasn’t said.`,
      try_this: `Replay “${was}” and focus on the flow into the next words.`,
      replay_target: replay,
      reason_type: 'brain_autofill',
    }
  }
  return {
    title: 'Two parts can sound close',
    what_you_might_have_heard: heard,
    what_it_was: was,
    why_this_happens_here: `In this spot, the surrounding words make this part easy to confuse with something that sounds close.`,
    try_this: `Replay “${was}” and listen for how it connects to the words around it.`,
    replay_target: replay,
    reason_type: 'sounds_like',
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
}): Promise<CoachingInsight> {
  const { event, transcript, userText } = input
  const replay = safeReplayText(event)
  const actualSpan = event.actualSpan ?? '(not heard)'

  if (!openai) {
    return minimalFallback({ event, transcript, userText })
  }

  // TypeScript now knows openai is not null after the check above
  const openaiClient = openai

  const system = [
    'You are a friendly English listening coach.',
    'Explain ONE mistake in a way that feels personal and useful.',
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
    `Transcript (correct): "${transcript}"`,
    `User typed: "${userText}"`,
    '',
    'Event:',
    `- type: ${event.type}`,
    `- expectedSpan: "${event.expectedSpan}"`,
    `- actualSpan: "${actualSpan}"`,
    `- replayPhrase: "${replay.text}"`,
    `- contextBefore: "${event.context?.before ?? ''}"`,
    `- contextAfter: "${event.context?.after ?? ''}"`,
    '',
    'Return JSON:',
    `{
  "title": "short friendly title",
  "what_you_might_have_heard": "must include actualSpan exactly",
  "what_it_was": "use replayPhrase if present",
  "why_this_happens_here": "1-2 sentences tied to THIS sentence",
  "try_this": "1 sentence actionable tip",
  "replay_target": { "text": "${replay.text}", "refStart": ${replay.refStart}, "refEnd": ${replay.refEnd} },
  "reason_type": "words_blended | short_word_got_swallowed | sounds_like | brain_autofill | common_casual_form"
}`,
  ].join('\n')

  async function callOnce(extraNudge?: string) {
    const completion = await openaiClient.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.6,
      max_tokens: 280,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: extraNudge ? `${user}\n\n${extraNudge}` : user },
      ],
    })
    const content = completion.choices?.[0]?.message?.content ?? '{}'
    const parsed = extractJsonObject(content) ?? {}
    return parsed
  }

  // First attempt
  let parsed = await callOnce()
  if (!hasRequiredReference(parsed, actualSpan)) {
    // Retry once with stronger nudge
    parsed = await callOnce(
      `Important: In what_you_might_have_heard, you MUST include exactly: "${actualSpan}".`
    )
  }

  if (!hasRequiredReference(parsed, actualSpan)) {
    return minimalFallback({ event, transcript, userText })
  }

  const fallback = minimalFallback({ event, transcript, userText })
  return {
    title: String(parsed.title || fallback.title),
    what_you_might_have_heard: String(parsed.what_you_might_have_heard || fallback.what_you_might_have_heard),
    what_it_was: String(parsed.what_it_was || fallback.what_it_was),
    why_this_happens_here: String(parsed.why_this_happens_here || fallback.why_this_happens_here),
    try_this: String(parsed.try_this || fallback.try_this),
    replay_target: parsed.replay_target || fallback.replay_target,
    reason_type: (parsed.reason_type as ReasonType) || fallback.reason_type,
  }
}


