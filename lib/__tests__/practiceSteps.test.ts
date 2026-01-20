/**
 * Unit tests for practice steps and feedback item generation
 */

import { extractPracticeSteps, type FeedbackItem, type FeedbackCategory } from '../practiceSteps'
import type { AlignmentEvent } from '../alignmentEngine'

describe('extractPracticeSteps', () => {
  const mockEvents: AlignmentEvent[] = [
    {
      eventId: 'event-1',
      type: 'missing',
      refStart: 0,
      refEnd: 1,
      expectedSpan: "you're",
      actualSpan: undefined,
      context: {
        before: '',
        after: 'doing great',
        fullRef: "you're doing great",
        fullUser: 'doing great',
      },
      phraseHint: {
        spanText: "you're",
        spanRefStart: 0,
        spanRefEnd: 1,
      },
    },
    {
      eventId: 'event-2',
      type: 'missing',
      refStart: 3,
      refEnd: 5,
      expectedSpan: 'later today',
      actualSpan: undefined,
      context: {
        before: 'see you',
        after: '',
        fullRef: 'see you later today',
        fullUser: 'see you today',
      },
      phraseHint: {
        spanText: 'later today',
        spanRefStart: 3,
        spanRefEnd: 5,
      },
    },
  ]

  const refTokens = ["you're", 'doing', 'great', 'later', 'today']
  const userTokens = ['doing', 'great', 'today']

  it('should generate FeedbackItems with all required fields', () => {
    const steps = extractPracticeSteps(mockEvents, refTokens, userTokens, 5, "you're doing great later today")
    
    expect(steps.length).toBeGreaterThan(0)
    
    steps.forEach((step) => {
      // Required fields validation
      expect(step.meaningInContext).toBeDefined()
      expect(step.meaningInContext.length).toBeGreaterThan(0)
      expect(step.soundRule).toBeDefined()
      expect(step.soundRule.length).toBeGreaterThan(0)
      expect(step.inSentence).toBeDefined()
      expect(step.inSentence.original).toBeDefined()
      expect(step.inSentence.original.length).toBeGreaterThan(0)
      expect(step.inSentence.highlighted).toBeDefined()
      expect(step.inSentence.heardAs).toBeDefined()
      // extraExample is optional - if present, it must have a sentence (no placeholders)
      if (step.extraExample) {
        expect(step.extraExample.sentence).toBeDefined()
        expect(step.extraExample.sentence.length).toBeGreaterThan(0)
        // Should NOT contain placeholder templates
        expect(step.extraExample.sentence).not.toContain('Use X in another sentence')
        expect(step.extraExample.sentence).not.toContain('Here\'s another example using')
      }
      expect(step.category).toBeDefined()
      expect(step.target).toBeDefined()
    })
  })

  it('should default heardAs for contractions correctly', () => {
    const contractionEvent: AlignmentEvent = {
      eventId: 'event-contraction',
      type: 'missing',
      refStart: 0,
      refEnd: 1,
      expectedSpan: "you're",
      actualSpan: undefined,
      context: {
        before: '',
        after: 'ready',
        fullRef: "you're ready",
        fullUser: 'ready',
      },
      phraseHint: {
        spanText: "you're",
        spanRefStart: 0,
        spanRefEnd: 1,
      },
    }

    const steps = extractPracticeSteps([contractionEvent], ["you're", 'ready'], ['ready'], 1, "you're ready")
    
    expect(steps.length).toBe(1)
    const step = steps[0]
    
    // Contractions should default to reduced forms
    if (step.category === 'contraction') {
      expect(step.inSentence.heardAs).toBe('yer')
    }
  })

  it('should default heardAs for other contractions (I\'m, we\'re)', () => {
    const imEvent: AlignmentEvent = {
      eventId: 'event-im',
      type: 'missing',
      refStart: 0,
      refEnd: 1,
      expectedSpan: "I'm",
      actualSpan: undefined,
      context: {
        before: '',
        after: 'tired',
        fullRef: "I'm tired",
        fullUser: 'tired',
      },
      phraseHint: {
        spanText: "I'm",
        spanRefStart: 0,
        spanRefEnd: 1,
      },
    }

    const werEvent: AlignmentEvent = {
      eventId: 'event-were',
      type: 'missing',
      refStart: 0,
      refEnd: 1,
      expectedSpan: "we're",
      actualSpan: undefined,
      context: {
        before: '',
        after: 'done',
        fullRef: "we're done",
        fullUser: 'done',
      },
      phraseHint: {
        spanText: "we're",
        spanRefStart: 0,
        spanRefEnd: 1,
      },
    }

    const steps1 = extractPracticeSteps([imEvent], ["I'm", 'tired'], ['tired'], 1, "I'm tired")
    expect(steps1[0].inSentence.heardAs).toBe('im')

    const steps2 = extractPracticeSteps([werEvent], ["we're", 'done'], ['done'], 1, "we're done")
    expect(steps2[0].inSentence.heardAs).toBe('wer')
  })

  it('should maintain backward compatibility with legacy fields', () => {
    const steps = extractPracticeSteps(mockEvents, refTokens, userTokens, 5, "you're doing great later today")
    
    steps.forEach((step) => {
      // Legacy fields should be present and match new fields
      expect(step.expectedSpan).toBeDefined()
      expect(step.expectedSpan).toBe(step.target)
      expect(step.meaning).toBeDefined()
      expect(step.meaning).toBe(step.meaningInContext)
      expect(step.howItSounds).toBeDefined()
      expect(step.howItSounds).toBe(step.soundRule)
    })
  })

  it('should categorize feedback items correctly', () => {
    const contractionEvent: AlignmentEvent = {
      eventId: 'event-contraction',
      type: 'missing',
      refStart: 0,
      refEnd: 1,
      expectedSpan: "you're",
      actualSpan: undefined,
      context: {
        before: '',
        after: 'ready',
        fullRef: "you're ready",
        fullUser: 'ready',
      },
      phraseHint: {
        spanText: "you're",
        spanRefStart: 0,
        spanRefEnd: 1,
      },
    }

    const linkingEvent: AlignmentEvent = {
      eventId: 'event-linking',
      type: 'missing',
      refStart: 2,
      refEnd: 4,
      expectedSpan: 'want to',
      actualSpan: undefined,
      context: {
        before: 'I',
        after: 'go',
        fullRef: 'I want to go',
        fullUser: 'I go',
      },
      phraseHint: {
        spanText: 'want to',
        spanRefStart: 2,
        spanRefEnd: 4,
      },
    }

    const steps1 = extractPracticeSteps([contractionEvent], ["you're", 'ready'], ['ready'], 1, "you're ready")
    expect(steps1[0].category).toBe('contraction')

    const steps2 = extractPracticeSteps([linkingEvent], ['I', 'want', 'to', 'go'], ['I', 'go'], 1, 'I want to go')
    expect(steps2[0].category).toBe('linking')
  })
})

