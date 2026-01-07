/**
 * Audio Text Hash Utility
 * Generates a simple hash for transcript text to detect mismatches
 */

/**
 * Generate a simple hash from text (for mismatch detection)
 * Uses a simple string hash algorithm
 */
export function generateTextHash(text: string): string {
  let hash = 0
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36)
}

/**
 * Get first 30 characters of text (for display/debugging)
 */
export function getTextPreview(text: string): string {
  return text.substring(0, 30).trim()
}
