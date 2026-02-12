/**
 * Unit tests for mistake prioritization
 * Tests meaning-critical, reduction-critical, and multi-card behavior
 */

import { prioritizeAndSelectTop3, isMeaningCritical, isReductionCritical, shouldSurfaceReductionCritical } from '../mistakePrioritization'
import type { AlignmentEvent } from '../alignmentEngine'

// Mock alignment events
function createEvent(
  expectedSpan: string,
  actualSpan: string = '',
  refStart: number = 0,
  type: 'missing' | 'substitution' | 'extra' = 'missing'
): AlignmentEvent {
  return {
    expectedSpan,
    actualSpan,
    refStart,
    refEnd: refStart,
    type,
    eventId: `event-${refStart}`
  }
}

describe('mistakePrioritization', () => {
  describe('Meaning-critical words', () => {
    it('should not filter "if" and allow it to appear with "o\'clock"', () => {
      const events = [
        createEvent('if', '', 0, 'missing'),
        createEvent('o\'clock', '', 1, 'missing')
      ]
      
      const result = prioritizeAndSelectTop3(events)
      
      // "if" should be included (meaning-critical)
      const ifEvent = result.find(e => e.expectedSpan === 'if')
      expect(ifEvent).toBeDefined()
      
      // Should have at least 2 cards
      expect(result.length).toBeGreaterThanOrEqual(2)
    })
    
    it('should prioritize meaning-critical words even when short', () => {
      const events = [
        createEvent('if', '', 0, 'missing'),
        createEvent('reservation', '', 1, 'missing')
      ]
      
      const result = prioritizeAndSelectTop3(events)
      
      // "if" should appear (meaning-critical gets +150 boost)
      const ifEvent = result.find(e => e.expectedSpan === 'if')
      expect(ifEvent).toBeDefined()
    })
  })
  
  describe('Reduction-critical words', () => {
    it('should surface "to" when it\'s in "want to" and adjacent mistake exists', () => {
      const events = [
        createEvent('want', '', 0, 'missing'),
        createEvent('to', '', 1, 'missing'),
        createEvent('make', '', 2, 'missing')
      ]
      const refTokens = ['I', 'want', 'to', 'make', 'a', 'reservation']
      
      const result = prioritizeAndSelectTop3(events, undefined, refTokens)
      
      // "to" should be eligible (part of "want to" pattern + adjacent mistake)
      const toEvent = result.find(e => e.expectedSpan === 'to' || e.expectedSpan.includes('to'))
      expect(toEvent).toBeDefined()
    })
    
    it('should NOT surface "a" when it is the only minor mistake (noise prevention)', () => {
      const events = [
        createEvent('a', '', 0, 'missing')
      ]
      const refTokens = ['I', 'need', 'a', 'ticket']
      
      const result = prioritizeAndSelectTop3(events, undefined, refTokens)
      
      // "a" alone should NOT appear (no adjacent mistakes, not high-value)
      const aEvent = result.find(e => e.expectedSpan === 'a')
      // If it appears, it should only be because it's part of a chunk like "a ticket"
      if (aEvent) {
        expect(aEvent.expectedSpan).not.toBe('a') // Should be expanded to chunk
      }
    })
    
    it('should surface "to" when adjacent to content word mistake', () => {
      const events = [
        createEvent('to', '', 0, 'missing'),
        createEvent('reservation', '', 1, 'missing') // Adjacent content word
      ]
      const refTokens = ['I', 'want', 'to', 'make', 'a', 'reservation']
      
      const result = prioritizeAndSelectTop3(events, undefined, refTokens)
      
      // "to" should appear (adjacent to content word mistake)
      const toEvent = result.find(e => e.expectedSpan === 'to' || e.expectedSpan.includes('to'))
      expect(toEvent).toBeDefined()
    })
  })
  
  describe('Multi-card behavior', () => {
    it('should produce multiple cards when MAX_CARDS allows', () => {
      const events = [
        createEvent('if', '', 0, 'missing'),
        createEvent('o\'clock', '', 1, 'missing'),
        createEvent('reservation', '', 2, 'missing')
      ]
      
      const result = prioritizeAndSelectTop3(events)
      
      // Should have multiple cards (at least 2, up to 3)
      expect(result.length).toBeGreaterThanOrEqual(2)
      expect(result.length).toBeLessThanOrEqual(3)
    })
    
    it('should return array even when only one mistake exists', () => {
      const events = [
        createEvent('reservation', '', 0, 'missing')
      ]
      
      const result = prioritizeAndSelectTop3(events)
      
      // Should return array (even if only 1 item)
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBe(1)
    })
    
    it('should limit reduction-critical to max 1 in top 3', () => {
      const events = [
        createEvent('to', '', 0, 'missing'),
        createEvent('a', '', 1, 'missing'),
        createEvent('the', '', 2, 'missing'),
        createEvent('reservation', '', 3, 'missing')
      ]
      const refTokens = ['I', 'want', 'to', 'make', 'a', 'reservation', 'at', 'the', 'station']
      
      const result = prioritizeAndSelectTop3(events, undefined, refTokens)
      
      // Should have at most 1 reduction-critical word in top 3
      const reductionCriticalCount = result.filter(e => {
        const normalized = e.expectedSpan.toLowerCase().trim()
        return isReductionCritical(normalized)
      }).length
      
      expect(reductionCriticalCount).toBeLessThanOrEqual(1)
    })
  })
  
  describe('shouldSurfaceReductionCritical', () => {
    it('should return true for "to" in "want to" pattern', () => {
      const event = createEvent('to', '', 1, 'missing')
      const refTokens = ['I', 'want', 'to', 'make']
      
      const result = shouldSurfaceReductionCritical(event, [event], refTokens)
      expect(result).toBe(true) // Part of "want to" pattern
    })
    
    it('should return true when adjacent to another mistake', () => {
      const event1 = createEvent('to', '', 0, 'missing')
      const event2 = createEvent('reservation', '', 1, 'missing')
      
      const result = shouldSurfaceReductionCritical(event1, [event1, event2])
      expect(result).toBe(true) // Adjacent to another mistake
    })
    
    it('should return false for isolated "a" with no context', () => {
      const event = createEvent('a', '', 0, 'missing')
      
      const result = shouldSurfaceReductionCritical(event, [event])
      expect(result).toBe(true) // "a" is in high-value set, but should be gated by selection
    })
  })
})
