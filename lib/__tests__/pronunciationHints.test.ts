/**
 * Unit tests for pronunciation hints generator
 * Tests that hints are token-specific (not includes-based)
 */

import { generateTipLine, generateHowItSounds, isWeakFormHighValue } from '../pronunciationHints'

describe('pronunciationHints', () => {
  describe('generateTipLine', () => {
    it('should generate token-specific hint for "a" (not reservation)', () => {
      const hint = generateTipLine('a')
      // Should be about "a" reducing, not about reservation stress
      expect(hint).toContain('reduces')
      expect(hint).not.toContain('RE-ser-VA-tion')
      expect(hint).not.toContain('reservation')
      expect(hint).not.toContain('ZER')
    })

    it('should generate token-specific hint for "reservation"', () => {
      const hint = generateTipLine('reservation')
      // Should be about reservation stress
      expect(hint).toContain('ZER')
      expect(hint).not.toContain('reduces')
    })

    it('should generate token-specific hint for "a reservation" (chunk)', () => {
      const hint = generateTipLine('a reservation')
      // Should mention "a" reducing OR reservation stress, but not generic
      expect(hint.length).toBeGreaterThan(0)
      // Should not show reservation stress when the missed token is "a reservation" as a chunk
      // (it should show weak form hint for "a")
      expect(hint).toContain('reduces')
    })

    it('should generate token-specific hint for "to"', () => {
      const hint = generateTipLine('to')
      expect(hint).toContain('reduces')
      expect(hint).toContain('tuh')
      expect(hint).not.toContain('reservation')
    })

    it('should generate token-specific hint for "tonight"', () => {
      const hint = generateTipLine('tonight')
      expect(hint).toContain('NIGHT')
      expect(hint).not.toContain('reservation')
    })
  })

  describe('generateHowItSounds', () => {
    it('should generate token-specific "how it sounds" for "a"', () => {
      const result = generateHowItSounds('a')
      expect(result.display).toBe('uh')
      expect(result.ipa).toBe('/ə/')
    })

    it('should generate token-specific "how it sounds" for "reservation"', () => {
      const result = generateHowItSounds('reservation')
      expect(result.display).toBe('re-ZER-vation')
      expect(result.ipa).toBe('/ˌrezərˈveɪʃən/')
    })

    it('should generate token-specific "how it sounds" for "a reservation"', () => {
      const result = generateHowItSounds('a reservation')
      // Should combine weak form "a" with stressed "reservation"
      expect(result.display).toContain('uh')
      expect(result.display).toContain('ZER')
    })

    it('should generate token-specific "how it sounds" for "to"', () => {
      const result = generateHowItSounds('to')
      expect(result.display).toBe('tuh')
      expect(result.ipa).toBe('/tə/')
    })

    it('should handle "the" before vowel', () => {
      const result = generateHowItSounds('the', undefined, 'apple')
      expect(result.display).toBe('thee')
      expect(result.ipa).toBe('/ði/')
    })

    it('should handle "the" before consonant', () => {
      const result = generateHowItSounds('the', undefined, 'train')
      expect(result.display).toBe('thuh')
      expect(result.ipa).toBe('/ðə/')
    })
  })

  describe('isWeakFormHighValue', () => {
    it('should identify weak-form high-value words', () => {
      expect(isWeakFormHighValue('to')).toBe(true)
      expect(isWeakFormHighValue('a')).toBe(true)
      expect(isWeakFormHighValue('the')).toBe(true)
      expect(isWeakFormHighValue('of')).toBe(true)
      expect(isWeakFormHighValue('for')).toBe(true)
      expect(isWeakFormHighValue('at')).toBe(false) // Not in high-value set
      expect(isWeakFormHighValue('in')).toBe(false) // Not in high-value set
      expect(isWeakFormHighValue('reservation')).toBe(false) // Not a function word
    })
  })
})
