/**
 * Audio Generation Queue
 * Manages concurrent audio generation with priority support
 * Uses new DB-backed API
 */

export type AudioStatus = 'ready' | 'needs_generation' | 'generating' | 'error'

export interface QueuedClip {
  id: string
  storyId: string
  transcript: string
  priority?: number // Higher = more priority (default: 0)
  retryCount?: number
}

export type GenerationCallback = (clipId: string, result: { audioUrl: string } | { error: string; code?: string; message?: string; details?: string }) => void

class AudioGenerationQueue {
  private queue: QueuedClip[] = []
  private running: Set<string> = new Set() // Track clips currently being generated
  private concurrency: number = 2
  private callbacks: Map<string, GenerationCallback> = new Map()

  constructor(concurrency: number = 2) {
    this.concurrency = concurrency
  }

  /**
   * Add a clip to the queue
   */
  enqueue(clip: QueuedClip, callback: GenerationCallback) {
    // Remove if already in queue
    this.queue = this.queue.filter(c => c.id !== clip.id)
    
    // Add with priority
    this.queue.push(clip)
    this.queue.sort((a, b) => (b.priority || 0) - (a.priority || 0))
    
    this.callbacks.set(clip.id, callback)
    this.process()
  }

  /**
   * Prioritize a clip (move to front of queue)
   */
  prioritize(clipId: string) {
    const clip = this.queue.find(c => c.id === clipId)
    if (clip) {
      clip.priority = (clip.priority || 0) + 1000 // High priority
      this.queue.sort((a, b) => (b.priority || 0) - (a.priority || 0))
    }
  }

  /**
   * Process the queue
   */
  private async process() {
    // Don't start more than concurrency limit
    while (this.running.size < this.concurrency && this.queue.length > 0) {
      const clip = this.queue.shift()
      if (!clip) break

      // Skip if already running
      if (this.running.has(clip.id)) continue

      this.running.add(clip.id)
      this.generateAudio(clip).finally(() => {
        this.running.delete(clip.id)
        this.process() // Process next in queue
      })
    }
  }

  /**
   * Generate audio for a clip using new DB-backed API
   */
  private async generateAudio(clip: QueuedClip): Promise<void> {
    const callback = this.callbacks.get(clip.id)
    if (!callback) return

    const retryCount = clip.retryCount || 0
    const maxRetries = 1
    let lastResult: { success: boolean; error?: string; code?: string; message?: string; details?: string } | null = null

    try {
      // Import dynamically to avoid SSR issues
      const { generateAudio: generateAudioApi } = await import('./audioApi')
      
      const result = await generateAudioApi(clip.id, clip.transcript)
      lastResult = result
      
      if (result.success && result.audioUrl) {
        callback(clip.id, { audioUrl: result.audioUrl })
      } else {
        // Don't retry for certain error codes (auth, table missing, etc.)
        const nonRetryableCodes = ['AUTH_REQUIRED', 'TABLE_MISSING', 'MISSING_FIELDS']
        if (result.code && nonRetryableCodes.includes(result.code)) {
          throw new Error(result.message || result.error || 'Generation failed')
        }
        throw new Error(result.message || result.error || 'Generation failed')
      }
    } catch (error: any) {
      // Auto-retry once for transient errors (but not for non-retryable codes)
      const nonRetryableCodes = ['AUTH_REQUIRED', 'TABLE_MISSING', 'MISSING_FIELDS']
      const errorCode = lastResult?.code || (error.message?.includes('AUTH_REQUIRED') ? 'AUTH_REQUIRED' : null)
      const shouldRetry = retryCount < maxRetries && !(errorCode && nonRetryableCodes.includes(errorCode))
      
      if (shouldRetry) {
        console.log(`🔄 [Queue] Retrying generation for clip ${clip.id} (attempt ${retryCount + 1})`)
        clip.retryCount = retryCount + 1
        this.queue.unshift(clip) // Add back to front of queue
        this.process()
      } else {
        console.error(`🔴 [Queue] Generation failed for clip ${clip.id}:`, error)
        // Use lastResult if available, otherwise construct error response
        callback(clip.id, { 
          error: lastResult?.error || error.message || 'Generation failed',
          code: lastResult?.code,
          message: lastResult?.message || error.message || 'Generation failed',
          details: lastResult?.details,
        })
      }
    } finally {
      this.callbacks.delete(clip.id)
    }
  }

  /**
   * Check if a clip is in queue or running
   */
  isProcessing(clipId: string): boolean {
    return this.running.has(clipId) || this.queue.some(c => c.id === clipId)
  }

  /**
   * Clear queue (for cleanup)
   */
  clear() {
    this.queue = []
    this.callbacks.clear()
  }
}

// Singleton instance
let queueInstance: AudioGenerationQueue | null = null

export function getAudioGenerationQueue(): AudioGenerationQueue {
  if (!queueInstance) {
    queueInstance = new AudioGenerationQueue(2) // concurrency = 2
  }
  return queueInstance
}

