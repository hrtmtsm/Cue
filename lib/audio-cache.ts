/**
 * Audio Session Cache
 * 
 * In-memory cache with TTL for audio buffers.
 * Used to cache generated audio for the duration of a session,
 * providing instant playback on replay without re-generation.
 * 
 * Features:
 * - TTL-based expiration (default: 1 hour)
 * - LRU-like eviction when cache exceeds max size
 * - Simple key-value interface
 */

interface CacheEntry {
  audio: Buffer
  timestamp: number
}

const cache = new Map<string, CacheEntry>()
const CACHE_TTL = 60 * 60 * 1000 // 1 hour
const MAX_CACHE_SIZE = 1000

/**
 * Get cached audio buffer by key
 * Returns null if not found or expired
 */
export function getCachedAudio(key: string): Buffer | null {
  const entry = cache.get(key)
  if (!entry) return null

  // Check if expired
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    cache.delete(key)
    return null
  }

  return entry.audio
}

/**
 * Store audio buffer in cache
 * Automatically evicts oldest entry if cache exceeds max size
 */
export function setCachedAudio(key: string, audio: Buffer): void {
  cache.set(key, {
    audio,
    timestamp: Date.now(),
  })

  // Evict oldest entries if over max size
  if (cache.size > MAX_CACHE_SIZE) {
    const entries = Array.from(cache.entries())
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp)
    // Remove oldest 10% to avoid frequent eviction
    const toRemove = Math.ceil(MAX_CACHE_SIZE * 0.1)
    for (let i = 0; i < toRemove && i < entries.length; i++) {
      cache.delete(entries[i][0])
    }
  }
}

/**
 * Generate a cache key from clip ID and user ID
 */
export function getCacheKey(clipId: string, userId: string): string {
  return `${userId}:${clipId}`
}

/**
 * Clear the entire cache
 * Useful for testing or manual cleanup
 */
export function clearCache(): void {
  cache.clear()
}

/**
 * Get current cache size (for monitoring)
 */
export function getCacheSize(): number {
  return cache.size
}
