/**
 * Chunk synthesis utilities for dynamic chunk generation
 * Synthesizes chunks from context when pattern matching doesn't find useful matches
 */

/**
 * Check if chunkDisplay is meaningful (not just the target word itself)
 * Returns true if chunkDisplay is empty OR equals target (allowing synthesis)
 */
export function shouldSynthesizeChunk(target: string, chunkDisplay: string | undefined): boolean {
  if (!chunkDisplay) {
    return true // No chunkDisplay, allow synthesis
  }
  
  // Normalize both for comparison (lowercase, trim)
  const targetNorm = target.toLowerCase().trim()
  const chunkNorm = chunkDisplay.toLowerCase().trim()
  
  // If chunkDisplay equals target, it's not meaningful (e.g., "to" === "to")
  if (chunkNorm === targetNorm) {
    return true // Allow synthesis to override single-word pattern
  }
  
  // If chunkDisplay contains hyphens or spaces, it's multi-word (meaningful)
  if (chunkDisplay.includes('-') || chunkDisplay.includes(' ')) {
    return false // Keep multi-word pattern, don't synthesize
  }
  
  // Default: don't synthesize if chunkDisplay is set to something other than target
  return false
}

/**
 * Check if a word is eligible for chunk synthesis
 * Common function words that benefit from chunk synthesis
 */
export function isEligibleForChunkSynthesis(word: string): boolean {
  const eligible = ['to', 'of', 'in', 'on', 'at', 'for', 'and', 'a', 'an', 'the']
  return eligible.includes(word.toLowerCase().trim())
}

/**
 * Check if a word is a determiner (the, a, an)
 */
export function isDeterminer(word: string | null): boolean {
  if (!word) return false
  const determiners = ['the', 'a', 'an']
  return determiners.includes(word.toLowerCase().trim())
}

/**
 * Synthesize chunkDisplay for a function word based on right context
 * Returns the synthesized chunk or undefined if synthesis is not possible
 */
export function synthesizeChunk(
  target: string,
  right1: string | null,
  right2: string | null
): string | undefined {
  if (!right1) {
    return undefined // No right context, can't synthesize
  }
  
  // If right1 is a determiner and right2 exists, create 3-word chunk
  if (isDeterminer(right1) && right2) {
    return `${target}-${right1}-${right2}`
  }
  
  // Otherwise create 2-word chunk
  return `${target}-${right1}`
}


