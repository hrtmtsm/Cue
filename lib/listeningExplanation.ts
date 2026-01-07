/**
 * Generate listening-focused explanations for word-level differences
 * Focuses on SOUND, not grammar
 */

interface ExplanationParams {
  ref: string  // Expected/reference word
  hyp: string  // User's hypothesis/actual word
  type: 'wrong' | 'missing' | 'extra'
}

export function getListeningExplanation({ ref, hyp, type }: ExplanationParams): string {
  const refLower = ref.toLowerCase()
  const hypLower = hyp.toLowerCase()

  // Common reductions mapping
  const reductions: Record<string, string> = {
    'going to': 'gonna',
    'want to': 'wanna',
    'got to': 'gotta',
    'kind of': 'kinda',
    'give me': 'gimme',
    'let me': 'lemme',
    'what are': 'what\'re',
    'you are': 'you\'re',
    'we are': 'we\'re',
    'they are': 'they\'re',
    'it is': 'it\'s',
    'that is': 'that\'s',
    'there is': 'there\'s',
    'here is': 'here\'s',
    'where is': 'where\'s',
  }

  // Check if this is a reduction case
  const reductionKey = Object.keys(reductions).find(key => 
    refLower === key && hypLower === reductions[key]
  ) || Object.keys(reductions).find(key => 
    refLower === reductions[key] && hypLower === key
  )

  if (reductionKey) {
    const reduced = reductions[reductionKey]
    const expanded = reductionKey
    if (refLower === expanded && hypLower === reduced) {
      return `In casual speech, '${expanded}' is often reduced to '${reduced}'.`
    } else if (refLower === reduced && hypLower === expanded) {
      return `'${reduced}' is a reduced form of '${expanded}' that often appears in fast speech.`
    }
  }

  // Type-specific explanations
  if (type === 'missing') {
    return 'This word was likely spoken quickly or blended into nearby words.'
  }

  if (type === 'wrong') {
    // Check if words sound similar (simple heuristic)
    const similarSounds = [
      ['a', 'the'],
      ['an', 'a'],
      ['is', 'it\'s'],
      ['are', 'our'],
      ['your', 'you\'re'],
      ['their', 'there'],
      ['to', 'too', 'two'],
      ['hear', 'here'],
      ['know', 'no'],
    ]
    
    const isSimilar = similarSounds.some(group => 
      group.includes(refLower) && group.includes(hypLower)
    )

    if (isSimilar) {
      return `These can sound similar in fast speech.`
    }

    return `This likely sounded similar or blended with nearby sounds.`
  }

  if (type === 'extra') {
    return `This word may have been inferred from context but wasn't in the audio.`
  }

  // Fallback
  return `Listen carefully to how this word sounds in the audio.`
}

