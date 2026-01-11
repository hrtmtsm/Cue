import crypto from 'crypto'
import { normalizeContractions } from './contractionNormalizer'

export type TokenType = 'correct' | 'substitution' | 'missing' | 'extra'

export interface AlignmentToken {
  id: string
  type: TokenType

  refIndex?: number
  userIndex?: number

  expected?: string
  actual?: string

  spanId?: string
}

export interface AlignmentEvent {
  eventId: string
  type: Exclude<TokenType, 'correct'>

  refStart: number
  refEnd: number

  userStart?: number
  userEnd?: number

  expectedSpan: string
  actualSpan?: string

  context: {
    before: string
    after: string
    fullRef: string
    fullUser: string
  }

  phraseHint?: {
    spanText: string
    spanRefStart: number
    spanRefEnd: number
  }
}

export interface AlignmentResult {
  refTokens: string[]
  userTokens: string[]
  tokens: AlignmentToken[]
  events: AlignmentEvent[]
  stats: {
    correct: number
    substitutions: number
    missing: number
    extra: number
  }
}

/** Normalize: lowercase; keep apostrophes; collapse punctuation; merge contractions */
export function normalizeText(text: string): string {
  // STEP 1: Basic normalization (lowercase, remove punctuation, keep apostrophes, collapse spaces)
  let normalized = text
    .toLowerCase()
    .replace(/[^\w\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  
  // STEP 2: Merge contractions AFTER basic cleaning but BEFORE tokenization
  // This ensures "i m" or "im" becomes "i'm" as a single unit
  normalized = normalizeContractions(normalized)
  
  // STEP 3: Collapse spaces again in case contraction merging introduced spacing issues
  return normalized.replace(/\s+/g, ' ').trim()
}

export function tokenize(text: string): string[] {
  const n = normalizeText(text)
  return n ? n.split(' ').filter(t => t.length > 0) : []
}

function makeId(parts: Record<string, unknown>) {
  const s = JSON.stringify(parts)
  return crypto.createHash('sha1').update(s).digest('hex').slice(0, 12)
}

type Op = 'match' | 'sub' | 'del' | 'ins'
interface Step {
  op: Op
  refIndex?: number
  userIndex?: number
}

// Guess an anchor reference index for insertions (best effort)
function guessAnchorRefIndex(steps: Step[], k: number): number {
  for (let i = k; i >= 0; i--) {
    if (typeof steps[i].refIndex === 'number') return steps[i].refIndex!
  }
  for (let i = k; i < steps.length; i++) {
    if (typeof steps[i].refIndex === 'number') return steps[i].refIndex!
  }
  return 0
}

/**
 * DP alignment (Levenshtein with backtrace) over token sequences.
 * Costs: match 0, sub/del/ins 1
 */
export function alignTexts(refText: string, userText: string): AlignmentResult {
  const refTokens = tokenize(refText)
  const userTokens = tokenize(userText)

  const n = refTokens.length
  const m = userTokens.length

  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    Array.from({ length: m + 1 }, () => 0)
  )
  const back: Op[][] = Array.from({ length: n + 1 }, () =>
    Array.from({ length: m + 1 }, () => 'match' as Op)
  )

  for (let i = 1; i <= n; i++) {
    dp[i][0] = i
    back[i][0] = 'del'
  }
  for (let j = 1; j <= m; j++) {
    dp[0][j] = j
    back[0][j] = 'ins'
  }

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const refW = refTokens[i - 1]
      const usrW = userTokens[j - 1]

      const costMatchOrSub = dp[i - 1][j - 1] + (refW === usrW ? 0 : 1)
      const costDel = dp[i - 1][j] + 1
      const costIns = dp[i][j - 1] + 1

      let best = costMatchOrSub
      let op: Op = refW === usrW ? 'match' : 'sub'

      if (costDel < best) {
        best = costDel
        op = 'del'
      }
      if (costIns < best) {
        best = costIns
        op = 'ins'
      }

      dp[i][j] = best
      back[i][j] = op
    }
  }

  // backtrace
  const steps: Step[] = []
  let i = n
  let j = m

  while (i > 0 || j > 0) {
    const op = back[i][j]
    if (op === 'match' || op === 'sub') {
      steps.push({ op, refIndex: i - 1, userIndex: j - 1 })
      i--
      j--
    } else if (op === 'del') {
      steps.push({ op, refIndex: i - 1 })
      i--
    } else {
      steps.push({ op, userIndex: j - 1 })
      j--
    }
  }
  steps.reverse()

  const tokens: AlignmentToken[] = []
  const events: AlignmentEvent[] = []

  const fullRef = refTokens.join(' ')
  const fullUser = userTokens.join(' ')

  function ctxAround(refStart: number, refEnd: number) {
    const before = refTokens.slice(Math.max(0, refStart - 3), refStart).join(' ')
    const after = refTokens.slice(refEnd + 1, Math.min(refTokens.length, refEnd + 4)).join(' ')
    return { before, after, fullRef, fullUser }
  }

  steps.forEach((s, k) => {
    if (s.op === 'match') {
      const expected = refTokens[s.refIndex!]
      const actual = userTokens[s.userIndex!]
      tokens.push({
        id: makeId({ t: 'c', r: s.refIndex, u: s.userIndex, w: expected }),
        type: 'correct',
        refIndex: s.refIndex,
        userIndex: s.userIndex,
        expected,
        actual,
      })
      return
    }

    if (s.op === 'sub') {
      const expected = refTokens[s.refIndex!]
      const actual = userTokens[s.userIndex!]
      const tokenId = makeId({ t: 's', r: s.refIndex, u: s.userIndex, e: expected, a: actual })
      tokens.push({
        id: tokenId,
        type: 'substitution',
        refIndex: s.refIndex,
        userIndex: s.userIndex,
        expected,
        actual,
      })

      const eventId = makeId({ event: 'sub', r: s.refIndex, u: s.userIndex, e: expected, a: actual })
      events.push({
        eventId,
        type: 'substitution',
        refStart: s.refIndex!,
        refEnd: s.refIndex!,
        userStart: s.userIndex!,
        userEnd: s.userIndex!,
        expectedSpan: expected,
        actualSpan: actual,
        context: ctxAround(s.refIndex!, s.refIndex!),
      })
      return
    }

    if (s.op === 'del') {
      const expected = refTokens[s.refIndex!]
      const tokenId = makeId({ t: 'm', r: s.refIndex, e: expected })
      tokens.push({
        id: tokenId,
        type: 'missing',
        refIndex: s.refIndex,
        expected,
      })

      const eventId = makeId({ event: 'miss', r: s.refIndex, e: expected })
      events.push({
        eventId,
        type: 'missing',
        refStart: s.refIndex!,
        refEnd: s.refIndex!,
        expectedSpan: expected,
        actualSpan: '(not heard)',
        context: ctxAround(s.refIndex!, s.refIndex!),
      })
      return
    }

    // ins
    const actual = userTokens[s.userIndex!]
    const tokenId = makeId({ t: 'x', u: s.userIndex, a: actual })
    tokens.push({
      id: tokenId,
      type: 'extra',
      userIndex: s.userIndex,
      actual,
    })

    const anchorRef = Math.max(0, Math.min(refTokens.length - 1, guessAnchorRefIndex(steps, k)))
    const eventId = makeId({ event: 'extra', u: s.userIndex, a: actual, ar: anchorRef })
    events.push({
      eventId,
      type: 'extra',
      refStart: anchorRef,
      refEnd: anchorRef,
      userStart: s.userIndex!,
      userEnd: s.userIndex!,
      expectedSpan: refTokens[anchorRef] ?? '',
      actualSpan: actual,
      context: ctxAround(anchorRef, anchorRef),
    })
  })

  const stats = {
    correct: tokens.filter((t) => t.type === 'correct').length,
    substitutions: tokens.filter((t) => t.type === 'substitution').length,
    missing: tokens.filter((t) => t.type === 'missing').length,
    extra: tokens.filter((t) => t.type === 'extra').length,
  }

  return { refTokens, userTokens, tokens, events, stats }
}


