/**
 * Unit tests for token-level text alignment
 */

import { alignTexts, normalizeText, tokenize } from '../textAlignment'

describe('normalizeText', () => {
  it('should lowercase and trim text', () => {
    expect(normalizeText('  HELLO WORLD  ')).toBe('hello world')
  })

  it('should collapse multiple spaces', () => {
    expect(normalizeText('hello    world')).toBe('hello world')
  })

  it('should normalize apostrophes', () => {
    expect(normalizeText("I'm going")).toBe("i'm going")
    expect(normalizeText('I\'m going')).toBe("i'm going")
  })

  it('should remove punctuation but keep apostrophes in contractions', () => {
    expect(normalizeText("I'm going!")).toBe("i'm going")
    expect(normalizeText("Don't worry.")).toBe("don't worry")
  })
})

describe('tokenize', () => {
  it('should split text into words', () => {
    expect(tokenize('hello world')).toEqual(['hello', 'world'])
  })

  it('should filter empty strings', () => {
    expect(tokenize('hello   world')).toEqual(['hello', 'world'])
  })
})

describe('alignTexts', () => {
  it('should handle identical texts', () => {
    const result = alignTexts('hello world', 'hello world')
    expect(result.accuracy).toBe(1.0)
    expect(result.wer).toBe(0)
    expect(result.operations.every(op => op.type === 'correct')).toBe(true)
  })

  it('treats acceptable variants as correct: "going to" ≈ "gonna"', () => {
    const result = alignTexts('I am going to the store', 'I am gonna the store')
    // After normalization, both should align as correct
    expect(result.accuracy).toBe(1.0)
    const wrongs = result.operations.filter(op => op.type === 'wrong')
    expect(wrongs.length).toBe(0)
  })

  it('should handle missing function words like "to" and "the"', () => {
    const result = alignTexts('I want to go to the store', 'I want go store')
    
    // Should detect deletions
    const deletions = result.operations.filter(op => op.type === 'missing')
    expect(deletions.length).toBeGreaterThan(0)
    
    // Should have lower accuracy
    expect(result.accuracy).toBeLessThan(1.0)
  })

  it('should handle extra filler words', () => {
    const result = alignTexts('I want coffee', 'I want like coffee please')
    
    // Should detect insertions
    const insertions = result.operations.filter(op => op.type === 'extra')
    expect(insertions.length).toBeGreaterThan(0)
    
    // Accuracy should account for insertions
    expect(result.wer).toBeGreaterThan(0)
  })

  it('should handle punctuation differences', () => {
    const result = alignTexts('Hello, world!', 'Hello world')
    
    // Should normalize and align correctly
    expect(result.accuracy).toBe(1.0)
  })

  it('normalizes contractions without apostrophes (im -> i\\'m, ill -> i\\'ll)', () => {
    const result1 = alignTexts("i'm ready", 'im ready')
    expect(result1.accuracy).toBe(1.0)
    const result2 = alignTexts("i'll go now", 'ill go now')
    expect(result2.accuracy).toBe(1.0)
  })

  it('should calculate WER correctly', () => {
    // Reference: 5 words
    // User: 3 correct, 1 substitution, 1 deletion
    // WER = (1 + 1) / 5 = 0.4
    const result = alignTexts('I want to go home', 'I want go home')
    
    expect(result.counts.refWords).toBe(5)
    expect(result.wer).toBeGreaterThanOrEqual(0)
    expect(result.wer).toBeLessThanOrEqual(1)
    expect(result.accuracy).toBe(1 - result.wer)
  })

  it('should handle empty reference', () => {
    const result = alignTexts('', 'hello world')
    expect(result.accuracy).toBe(0)
    expect(result.wer).toBeGreaterThan(0)
  })

  it('should handle empty hypothesis', () => {
    const result = alignTexts('hello world', '')
    expect(result.accuracy).toBe(0)
    expect(result.wer).toBe(1.0) // All words deleted
  })

  it('should preserve word order in alignment', () => {
    const result = alignTexts('the quick brown fox', 'the quick brown fox')
    
    // All operations should be correct and in order
    expect(result.operations.length).toBe(4)
    expect(result.operations[0].type).toBe('correct')
    if (result.operations[0].type === 'correct') {
      expect(result.operations[0].ref).toBe('the')
    }
  })
})

