/**
 * Audio URL Readiness Checker
 * Verifies that a blob URL is accessible before marking audio as ready
 */

export interface WaitForAudioUrlOptions {
  maxRetries?: number
  initialDelay?: number
  maxDelay?: number
  onRetry?: (attempt: number, delay: number) => void
}

/**
 * Wait for an audio URL to become accessible
 * Retries with exponential backoff until URL is reachable or max retries reached
 */
export async function waitForAudioUrl(
  url: string,
  options: WaitForAudioUrlOptions = {}
): Promise<{ success: boolean; error?: string; attempt?: number }> {
  const {
    maxRetries = 8,
    initialDelay = 200,
    maxDelay = 2000,
    onRetry,
  } = options

  let delay = initialDelay
  let attempt = 0

  while (attempt < maxRetries) {
    attempt++

    try {
      // Try HEAD request first (lighter, faster)
      let response: Response
      try {
        response = await fetch(url, {
          method: 'HEAD',
          cache: 'no-cache',
        })
      } catch (headError) {
        // HEAD might not be allowed, try GET with Range header
        response = await fetch(url, {
          method: 'GET',
          headers: {
            Range: 'bytes=0-1',
          },
          cache: 'no-cache',
        })
      }

      // 200 (OK) or 206 (Partial Content) means URL is accessible
      if (response.status === 200 || response.status === 206) {
        console.log(`✅ [waitForAudioUrl] URL accessible after ${attempt} attempt(s):`, {
          url: url.substring(0, 80) + '...',
          status: response.status,
          attempt,
        })
        return { success: true, attempt }
      }

      // 404 or other errors - URL not ready yet
      console.log(`⏳ [waitForAudioUrl] URL not ready (attempt ${attempt}/${maxRetries}):`, {
        url: url.substring(0, 80) + '...',
        status: response.status,
        delay,
      })

      if (onRetry) {
        onRetry(attempt, delay)
      }

      // Exponential backoff: 200ms, 500ms, 1s, 2s, 2s, 2s, 2s, 2s
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delay))
        delay = Math.min(delay * 2.5, maxDelay) // Cap at maxDelay
      }
    } catch (error: any) {
      // Network error - retry
      console.log(`⏳ [waitForAudioUrl] Network error (attempt ${attempt}/${maxRetries}):`, {
        url: url.substring(0, 80) + '...',
        error: error.message,
        delay,
      })

      if (onRetry) {
        onRetry(attempt, delay)
      }

      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delay))
        delay = Math.min(delay * 2.5, maxDelay)
      } else {
        return {
          success: false,
          error: error.message || 'Network error',
          attempt,
        }
      }
    }
  }

  // Max retries reached
  console.error(`❌ [waitForAudioUrl] URL not accessible after ${maxRetries} attempts:`, {
    url: url.substring(0, 80) + '...',
  })
  return {
    success: false,
    error: `URL not accessible after ${maxRetries} attempts`,
    attempt: maxRetries,
  }
}

