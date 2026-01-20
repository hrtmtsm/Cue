import { alignTexts, tokenize, normalizeText } from '../alignmentEngine'
import { attachPhraseSpans } from '../phraseSpans'
import { normalizeContractions, expandContraction, isContraction } from '../contractionNormalizer'

describe('alignmentEngine alignTexts', () => {
  it('handles insertion early without shifting everything', () => {
    const r = alignTexts('I want to go home', 'I really want to go home')
    // Expect one extra token ("really") but the later ref tokens still align
    expect(r.stats.extra).toBe(1)
    expect(r.stats.missing).toBe(0)
    expect(r.tokens.some(t => t.type === 'extra' && t.actual === 'really')).toBe(true)
    // "home" should still appear as correct somewhere
    expect(r.tokens.some(t => t.type === 'correct' && t.expected === 'home')).toBe(true)
  })

  it('handles missing function word ("want to")', () => {
    const r = alignTexts('I want to go', 'I want go')
    expect(r.stats.missing).toBeGreaterThan(0)
    expect(r.tokens.some(t => t.type === 'missing' && t.expected === 'to')).toBe(true)
  })

  it('handles substitution', () => {
    const r = alignTexts('I grab coffee', 'I get coffee')
    expect(r.stats.substitutions).toBe(1)
    expect(r.tokens.some(t => t.type === 'substitution' && t.expected === 'grab' && t.actual === 'get')).toBe(true)
  })
})

describe('phraseSpans attachPhraseSpans', () => {
  it('adds phraseHint for known patterns like "want to"', () => {
    const base = alignTexts('I want to go', 'I want go')
    const withSpans = attachPhraseSpans(base)
    const missEvent = withSpans.events.find(e => e.type === 'missing')
    expect(missEvent?.phraseHint?.spanText).toBe('want to')
  })
})

describe('contraction normalization', () => {
  describe('normalizeContractions', () => {
    it('should merge split contractions (i m -> i\'m)', () => {
      expect(normalizeContractions('i m')).toBe("i'm")
      expect(normalizeContractions('i ll')).toBe("i'll")
      expect(normalizeContractions('you re')).toBe("you're")
      expect(normalizeContractions('we re')).toBe("we're")
      expect(normalizeContractions('do n\'t')).toBe("don't")
      expect(normalizeContractions('do nt')).toBe("don't")
    })

    it('should fix missing apostrophes (im -> i\'m)', () => {
      expect(normalizeContractions('im')).toBe("i'm")
      expect(normalizeContractions('youre')).toBe("you're")
      expect(normalizeContractions('dont')).toBe("don't")
      expect(normalizeContractions('cant')).toBe("can't")
      expect(normalizeContractions('wont')).toBe("won't")
    })

    it('should preserve existing contractions (i\'m -> i\'m)', () => {
      expect(normalizeContractions("i'm")).toBe("i'm")
      expect(normalizeContractions("you're")).toBe("you're")
      expect(normalizeContractions("don't")).toBe("don't")
    })

    it('should handle contractions in sentences', () => {
      expect(normalizeContractions("i m ready")).toBe("i'm ready")
      expect(normalizeContractions("you re doing great")).toBe("you're doing great")
      expect(normalizeContractions("we dont want that")).toBe("we don't want that")
    })
  })

  describe('expandContraction', () => {
    it('should expand contractions to full forms', () => {
      expect(expandContraction("I'm")).toBe("I am")
      expect(expandContraction("you're")).toBe("you are")
      expect(expandContraction("don't")).toBe("do not")
      expect(expandContraction("can't")).toBe("cannot")
      expect(expandContraction("won't")).toBe("will not")
    })

    it('should handle unknown contractions by returning original', () => {
      expect(expandContraction("hello")).toBe("hello")
      expect(expandContraction("test")).toBe("test")
    })
  })

  describe('isContraction', () => {
    it('should identify contractions', () => {
      expect(isContraction("I'm")).toBe(true)
      expect(isContraction("you're")).toBe(true)
      expect(isContraction("don't")).toBe(true)
      expect(isContraction("can't")).toBe(true)
    })

    it('should return false for non-contractions', () => {
      expect(isContraction("hello")).toBe(false)
      expect(isContraction("test")).toBe(false)
    })
  })
})

describe('contraction handling in tokenization', () => {
  it('should tokenize "I\'m" as single token (not split into i and m)', () => {
    const tokens = tokenize("I'm ready")
    expect(tokens).toEqual(["i'm", "ready"])
    expect(tokens.length).toBe(2)
    expect(tokens[0]).toBe("i'm")
  })

  it('should tokenize "you\'re" as single token', () => {
    const tokens = tokenize("you're doing great")
    expect(tokens).toEqual(["you're", "doing", "great"])
    expect(tokens.length).toBe(3)
    expect(tokens[0]).toBe("you're")
  })

  it('should tokenize "don\'t" as single token', () => {
    const tokens = tokenize("don't worry")
    expect(tokens).toEqual(["don't", "worry"])
    expect(tokens.length).toBe(2)
    expect(tokens[0]).toBe("don't")
  })

  it('should normalize missing apostrophes before tokenization', () => {
    const tokens1 = tokenize("im ready")
    expect(tokens1).toEqual(["i'm", "ready"])
    
    const tokens2 = tokenize("youre doing great")
    expect(tokens2).toEqual(["you're", "doing", "great"])
    
    const tokens3 = tokenize("dont worry")
    expect(tokens3).toEqual(["don't", "worry"])
  })

  it('should merge split contractions (i m -> i\'m) before tokenization', () => {
    const tokens1 = tokenize("i m ready")
    expect(tokens1).toEqual(["i'm", "ready"])
    
    const tokens2 = tokenize("you re doing great")
    expect(tokens2).toEqual(["you're", "doing", "great"])
    
    const tokens3 = tokenize("we re here")
    expect(tokens3).toEqual(["we're", "here"])
  })
})

describe('contraction alignment: user typed contractions should match target as ONE unit', () => {
  it('should match "I\'m" typed by user with target "I\'m" as ONE feedback item', () => {
    const result = alignTexts("I'm ready", "I'm ready")
    // Should have 2 correct tokens: ["i'm", "ready"]
    expect(result.stats.correct).toBe(2)
    expect(result.stats.missing).toBe(0)
    expect(result.stats.substitutions).toBe(0)
    expect(result.refTokens).toEqual(["i'm", "ready"])
    expect(result.userTokens).toEqual(["i'm", "ready"])
    
    // Verify tokens - should have ONE token for "i'm", not separate "i" and "m"
    const imTokens = result.tokens.filter(t => t.expected === "i'm" || t.actual === "i'm")
    expect(imTokens.length).toBe(1)
    expect(imTokens[0].type).toBe('correct')
    expect(imTokens[0].expected).toBe("i'm")
    expect(imTokens[0].actual).toBe("i'm")
  })

  it('should match "you\'re" typed by user with target "you\'re" as ONE feedback item', () => {
    const result = alignTexts("you're doing great", "you're doing great")
    // Should have 3 correct tokens
    expect(result.stats.correct).toBe(3)
    expect(result.stats.missing).toBe(0)
    expect(result.stats.substitutions).toBe(0)
    expect(result.refTokens).toEqual(["you're", "doing", "great"])
    expect(result.userTokens).toEqual(["you're", "doing", "great"])
    
    // Verify "you're" is ONE token
    const youreTokens = result.tokens.filter(t => t.expected === "you're" || t.actual === "you're")
    expect(youreTokens.length).toBe(1)
    expect(youreTokens[0].type).toBe('correct')
  })

  it('should match "don\'t" typed by user with target "don\'t" as ONE feedback item', () => {
    const result = alignTexts("don't worry", "don't worry")
    // Should have 2 correct tokens
    expect(result.stats.correct).toBe(2)
    expect(result.stats.missing).toBe(0)
    expect(result.stats.substitutions).toBe(0)
    expect(result.refTokens).toEqual(["don't", "worry"])
    expect(result.userTokens).toEqual(["don't", "worry"])
    
    // Verify "don't" is ONE token
    const dontTokens = result.tokens.filter(t => t.expected === "don't" || t.actual === "don't")
    expect(dontTokens.length).toBe(1)
    expect(dontTokens[0].type).toBe('correct')
  })

  it('should handle user typing missing apostrophe (im -> i\'m) and match correctly', () => {
    const result = alignTexts("I'm ready", "im ready")
    // Should match as correct after normalization
    expect(result.refTokens).toEqual(["i'm", "ready"])
    expect(result.userTokens).toEqual(["i'm", "ready"])
    expect(result.stats.correct).toBe(2)
    expect(result.stats.missing).toBe(0)
  })

  it('should handle user typing split contraction (i m -> i\'m) and match correctly', () => {
    const result = alignTexts("I'm ready", "i m ready")
    // Should match as correct after normalization
    expect(result.refTokens).toEqual(["i'm", "ready"])
    expect(result.userTokens).toEqual(["i'm", "ready"])
    expect(result.stats.correct).toBe(2)
    expect(result.stats.missing).toBe(0)
  })

  it('should create ONE feedback event for missing contraction, not separate events for i and m', () => {
    const result = alignTexts("I'm ready", "ready")
    // Should have ONE missing event for "i'm", not separate events for "i" and "m"
    const missingEvents = result.events.filter(e => e.type === 'missing')
    expect(missingEvents.length).toBe(1)
    expect(missingEvents[0].expectedSpan).toBe("i'm")
    expect(missingEvents[0].refStart).toBe(0)
    expect(missingEvents[0].refEnd).toBe(0) // Single token span
  })
})


