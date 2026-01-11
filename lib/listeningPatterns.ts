/**
 * Local listening patterns for pattern-based feedback
 * Synchronous JSON-based approach (no Supabase)
 */

export interface ListeningPattern {
  id: string
  words: string[]            // e.g. ["went", "to", "the"]
  chunkDisplay: string       // e.g. "went-to-the"
  howItSounds: string        // Explanation text
  tip?: string               // Optional listening tip
  priority: number           // Higher = better match
}

export const LISTENING_PATTERNS: ListeningPattern[] = [
  // "went to the" pattern
  {
    id: 'went-to-the',
    words: ['went', 'to', 'the'],
    chunkDisplay: 'went-to-the',
    howItSounds: 'In fast speech, "went to the" sounds like "wento thuh" - the words blend together.',
    tip: 'Listen for the "t" sound that links "went" and "to".',
    priority: 100,
  },
  {
    id: 'went-to',
    words: ['went', 'to'],
    chunkDisplay: 'went-to',
    howItSounds: 'In fast speech, "went to" sounds like "wento" - the words blend together.',
    tip: 'The "t" at the end of "went" links to "to".',
    priority: 90,
  },
  
  // "want to" pattern
  {
    id: 'want-to',
    words: ['want', 'to'],
    chunkDisplay: 'want-to',
    howItSounds: 'In casual speech, "want to" often sounds like "wanna".',
    tip: 'The "t" between "want" and "to" disappears in fast speech.',
    priority: 100,
  },
  
  // "going to" pattern
  {
    id: 'going-to',
    words: ['going', 'to'],
    chunkDisplay: 'going-to',
    howItSounds: 'In fast speech, "going to" often sounds like "gonna".',
    tip: 'The "ing" and "to" blend together in casual speech.',
    priority: 100,
  },
  
  // Verb chunks: patterns that END with verbs
  // "gonna go" pattern
  {
    id: 'gonna-go',
    words: ['gonna', 'go'],
    chunkDisplay: 'gonna-go',
    howItSounds: 'In casual speech, "gonna go" sounds like "gunna go" - the words flow together as one chunk.',
    tip: 'Listen for the whole chunk "gonna-go", not just the word "go".',
    priority: 100,
  },
  // "going to go" pattern
  {
    id: 'going-to-go',
    words: ['going', 'to', 'go'],
    chunkDisplay: 'going-to-go',
    howItSounds: 'In fast speech, "going to go" often sounds like "gonna go" - the "ing to" reduces to "na".',
    tip: 'The "ing to" part reduces, making it sound like "gonna go".',
    priority: 100,
  },
  // "want to go" pattern
  {
    id: 'want-to-go',
    words: ['want', 'to', 'go'],
    chunkDisplay: 'want-to-go',
    howItSounds: 'In casual speech, "want to go" often sounds like "wanna go" - "want to" reduces to "wanna".',
    tip: 'Listen for "wanna go" as one flowing chunk.',
    priority: 100,
  },
  
  // "a lot of" pattern
  {
    id: 'a-lot-of',
    words: ['a', 'lot', 'of'],
    chunkDisplay: 'a-lot-of',
    howItSounds: 'In fast speech, "a lot of" sounds like "a lotta" - the "f" in "of" is dropped.',
    tip: 'The "f" at the end of "of" disappears before consonants.',
    priority: 100,
  },
  {
    id: 'lot-of',
    words: ['lot', 'of'],
    chunkDisplay: 'lot-of',
    howItSounds: 'In fast speech, "lot of" sounds like "lotta" - the "f" is dropped.',
    tip: 'The "f" in "of" disappears in casual speech.',
    priority: 90,
  },
  
  // "kind of" pattern
  {
    id: 'kind-of',
    words: ['kind', 'of'],
    chunkDisplay: 'kind-of',
    howItSounds: 'In fast speech, "kind of" sounds like "kinda" - the "f" in "of" is dropped.',
    tip: 'The "f" in "of" disappears in casual speech.',
    priority: 90,
  },
  
  // Single-word "to" fallback
  {
    id: 'to-fallback',
    words: ['to'],
    chunkDisplay: 'to',
    howItSounds: 'In fast speech, "to" often sounds like "tuh" - the vowel is reduced.',
    tip: 'Listen for the reduced vowel sound, not the full "oo" sound.',
    priority: 80,
  },
  
  // Single-word "of" fallback
  {
    id: 'of-fallback',
    words: ['of'],
    chunkDisplay: 'of',
    howItSounds: 'In fast speech, "of" often sounds like "uh" - the vowel is reduced and the "f" can be dropped.',
    tip: 'The "f" can be dropped or the vowel reduced depending on context.',
    priority: 80,
  },
]

