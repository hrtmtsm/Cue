/**
 * Unit tests for getHowItSoundsSpeakText
 * Ensures TTS text is card-specific and never uses parent context
 */

import { getHowItSoundsSpeakText } from '../getHowItSoundsSpeakText'

describe('getHowItSoundsSpeakText', () => {
  it('should generate card-specific text for "to" (not expanded chunk)', () => {
    const card = {
      missed_text: 'to',
      sound_hint: 'This word often reduces to "tuh" in fast speech.',
      how_it_sounds: {
        compact: 'tuh'
      }
    }
    
    const speakText = getHowItSoundsSpeakText(card)
    
    // Should be about "to", not "to make a reservation"
    expect(speakText).toContain('to')
    expect(speakText).toContain('tuh')
    expect(speakText).not.toContain('reservation')
    expect(speakText).not.toContain('make')
  })

  it('should generate card-specific text for "a" (not expanded chunk)', () => {
    const card = {
      missed_text: 'a',
      sound_hint: 'This word often reduces to "uh" in fast speech.',
      how_it_sounds: {
        compact: 'uh'
      }
    }
    
    const speakText = getHowItSoundsSpeakText(card)
    
    // Should be about "a", not "a reservation"
    expect(speakText).toContain('a')
    expect(speakText).toContain('uh')
    expect(speakText).not.toContain('reservation')
  })

  it('should generate descriptive sentence for single weak-form words', () => {
    const toCard = { missed_text: 'to' }
    expect(getHowItSoundsSpeakText(toCard)).toBe('In fast speech, "to" often sounds like "tuh".')
    
    const aCard = { missed_text: 'a' }
    expect(getHowItSoundsSpeakText(aCard)).toBe('In fast speech, "a" often sounds like "uh".')
    
    const theCard = { missed_text: 'the' }
    expect(getHowItSoundsSpeakText(theCard)).toBe('In fast speech, "the" often sounds like "thuh".')
    
    const ofCard = { missed_text: 'of' }
    expect(getHowItSoundsSpeakText(ofCard)).toBe('In fast speech, "of" often sounds like "uhv".')
    
    const forCard = { missed_text: 'for' }
    expect(getHowItSoundsSpeakText(forCard)).toBe('In fast speech, "for" often sounds like "fer".')
  })

  it('should combine tip line and how it sounds for other words', () => {
    const card = {
      missed_text: 'reservation',
      sound_hint: 'Stress is on ZER.',
      how_it_sounds: {
        compact: 're-ZER-vation'
      }
    }
    
    const speakText = getHowItSoundsSpeakText(card)
    
    expect(speakText).toContain('Stress is on ZER')
    expect(speakText).toContain('reservation')
    expect(speakText).toContain('re-ZER-vation')
  })

  it('should fallback to missed_text if no hints available', () => {
    const card = {
      missed_text: 'something'
    }
    
    const speakText = getHowItSoundsSpeakText(card)
    expect(speakText).toBe('something')
  })

  it('should never include expanded chunk text from parent context', () => {
    // Even if display_chunk is expanded, speak text should use missed_token or missed_text
    const card = {
      missed_text: 'to make a reservation', // This is the expanded chunk from API
      missed_token: 'to', // This is the original token - should be used for TTS
      display_chunk: 'to make a reservation', // This is expanded, but we ignore it
      sound_hint: 'This word often reduces to "tuh" in fast speech.',
      how_it_sounds: {
        compact: 'tuh'
      }
    }
    
    const speakText = getHowItSoundsSpeakText(card)
    
    // Must NOT contain expanded chunk
    expect(speakText).not.toContain('make')
    expect(speakText).not.toContain('reservation')
    // Must contain only the missed token
    expect(speakText).toContain('to')
    expect(speakText).toContain('tuh')
  })

  it('should use missed_token when available (regression test for TTS bug)', () => {
    // This is the exact bug scenario: "to" card should speak about "to", not "to make a reservation"
    const card = {
      missed_text: 'to make a reservation', // Expanded chunk from API
      missed_token: 'to', // Original token - this should be used
      sound_hint: 'This word often reduces to "tuh" in fast speech.',
      how_it_sounds: {
        compact: 'tuh'
      }
    }
    
    const speakText = getHowItSoundsSpeakText(card)
    
    // Regression test: Must NOT contain "reservation" or "make"
    expect(speakText).not.toContain('reservation')
    expect(speakText).not.toContain('make')
    // Must contain "to" and "tuh"
    expect(speakText).toContain('to')
    expect(speakText).toContain('tuh')
    
    // Should be the descriptive sentence for "to"
    expect(speakText).toBe('In fast speech, "to" often sounds like "tuh".')
  })
})
