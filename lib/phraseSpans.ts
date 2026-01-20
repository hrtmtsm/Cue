import crypto from 'crypto'
import type { AlignmentResult, AlignmentEvent, AlignmentToken } from './alignmentEngine'

function hash(s: string) {
  return crypto.createHash('sha1').update(s).digest('hex').slice(0, 10)
}

// Small, curated phrase patterns (expand over time from real usage logs)
const PHRASE_PATTERNS: string[][] = [
  ['want', 'to'],
  ['going', 'to'],
  ['got', 'to'],
  ['have', 'to'],
  ["it'll", 'be'],
  ['catch', 'up'],
  ['hang', 'out'],
  ['pick', 'up'],
  ['grab', 'a'],
  ['grab', 'some'],
  ['what', 'do', 'you', 'say'],
]

function matchPatternAt(tokens: string[], start: number, pattern: string[]) {
  if (start + pattern.length > tokens.length) return false
  for (let i = 0; i < pattern.length; i++) {
    if (tokens[start + i] !== pattern[i]) return false
  }
  return true
}

function findBestSpan(refTokens: string[], refIndex: number) {
  for (const pat of PHRASE_PATTERNS) {
    for (let start = Math.max(0, refIndex - (pat.length - 1)); start <= refIndex; start++) {
      if (matchPatternAt(refTokens, start, pat)) {
        const end = start + pat.length - 1
        return { start, end, text: refTokens.slice(start, end + 1).join(' ') }
      }
    }
  }
  return { start: refIndex, end: refIndex, text: refTokens[refIndex] ?? '' }
}

export function attachPhraseSpans(result: AlignmentResult): AlignmentResult {
  const { refTokens } = result
  const spanByRange = new Map<string, { spanId: string; start: number; end: number; text: string }>()

  function getSpan(start: number, end: number, text: string) {
    const key = `${start}:${end}:${text}`
    const existing = spanByRange.get(key)
    if (existing) return existing
    const spanId = `sp_${hash(key)}`
    const s = { spanId, start, end, text }
    spanByRange.set(key, s)
    return s
  }

  const events = result.events.map((e: AlignmentEvent) => {
    const best = findBestSpan(refTokens, e.refStart)
    const span = getSpan(best.start, best.end, best.text)
    return {
      ...e,
      phraseHint: {
        spanText: span.text,
        spanRefStart: span.start,
        spanRefEnd: span.end,
      },
    }
  })

  const tokens = result.tokens.map((t: AlignmentToken) => {
    if (typeof t.refIndex === 'number') {
      const best = findBestSpan(refTokens, t.refIndex)
      const span = getSpan(best.start, best.end, best.text)
      return { ...t, spanId: span.spanId }
    }
    return t
  })

  return { ...result, events, tokens }
}



