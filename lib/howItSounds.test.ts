/**
 * Unit tests for howItSounds helper functions
 * Run with: npx jest lib/howItSounds.test.ts
 */

import { toHowItSoundsRemap, formatHowItSoundsDisplay } from './howItSounds'

describe('toHowItSoundsRemap', () => {
  test('reduces function words: the -> thuh', () => {
    expect(toHowItSoundsRemap('the train')).toBe('thuh train')
  })

  test('reduces function words: to -> tuh', () => {
    expect(toHowItSoundsRemap('to get')).toBe('tuh get')
  })

  test('reduces function words: of -> uv', () => {
    expect(toHowItSoundsRemap('of the')).toBe('uv thuh')
  })

  test('reduces function words: and -> n', () => {
    expect(toHowItSoundsRemap('and the')).toBe('n thuh')
  })

  test('handles known casual forms: gonna -> gunna', () => {
    expect(toHowItSoundsRemap('gonna')).toBe('gunna')
  })

  test('handles known casual forms: wanna -> wanna', () => {
    expect(toHowItSoundsRemap('wanna')).toBe('wanna')
  })

  test('handles multiple function words', () => {
    expect(toHowItSoundsRemap('to the train')).toBe('tuh thuh train')
  })

  test('preserves content words unchanged', () => {
    expect(toHowItSoundsRemap('train station')).toBe('train station')
  })

  test('handles empty string', () => {
    expect(toHowItSoundsRemap('')).toBe('')
  })

  test('handles single word chunks', () => {
    expect(toHowItSoundsRemap('the')).toBe('thuh')
    expect(toHowItSoundsRemap('train')).toBe('train')
  })

  test('does not concatenate words weirdly', () => {
    const result = toHowItSoundsRemap('the train')
    expect(result).not.toContain('thetrain')
    expect(result).toBe('thuh train')
  })
})

describe('formatHowItSoundsDisplay', () => {
  test('formats with arrow notation', () => {
    expect(formatHowItSoundsDisplay('the train', 'thuh train')).toBe('"the train" → "thuh train"')
  })

  test('handles casual forms', () => {
    expect(formatHowItSoundsDisplay('gonna', 'gunna')).toBe('"gonna" → "gunna"')
  })

  test('handles multi-word chunks', () => {
    expect(formatHowItSoundsDisplay('to get to', 'tuh get tuh')).toBe('"to get to" → "tuh get tuh"')
  })
})
