/**
 * Client-side Audio API
 * Fetches audio status and URLs from the database
 */

import { generateTextHash } from './audioHash'

// Lazy import to avoid initialization errors if Supabase isn't configured
async function getSupabaseClient() {
  // Dynamic import ensures this only runs when called, not at module load
  const supabaseModule = await import('./supabase/client')
  // Use the getter function for true lazy initialization
  return supabaseModule.getSupabase()
}

export type AudioStatus = 'needs_generation' | 'generating' | 'ready' | 'error'

export interface AudioMetadata {
  clipId: string
  transcript: string
  transcriptHash: string
  audioStatus: AudioStatus
  audioUrl?: string
  variantKey?: string
}

/**
 * Get audio status and URL for a clip
 * Uses server-side API to support dev guest users
 */
export async function getAudioMetadata(
  clipId: string,
  transcript: string,
  variantKey: string = 'clean_normal'
): Promise<AudioMetadata> {
  const transcriptHash = generateTextHash(transcript)
  
  try {
    const supabase = await getSupabaseClient()
    
    // Get session if available
    const { data: { session }, error: authError } = await supabase.auth.getSession()
    
    // Build headers - include auth token if available, otherwise let server handle dev guest
    // Server will use DEV_GUEST_USER_ID in dev mode if no auth token is provided
    const headers: HeadersInit = {}
    if (!authError && session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`
    }

    // Use server-side API endpoint that can handle dev guest users
    // Allow empty transcript - server will use fallback lookup
    const transcriptParam = transcript || ''
    const response = await fetch(
      `/api/audio/metadata?clipId=${encodeURIComponent(clipId)}&variantKey=${encodeURIComponent(variantKey)}&transcript=${encodeURIComponent(transcriptParam)}`,
      {
        headers,
      }
    )

    if (response.ok) {
      const data = await response.json()
      return {
        clipId: data.clipId,
        transcript: data.transcript,
        transcriptHash: data.transcriptHash,
        audioStatus: data.audioStatus as AudioStatus,
        audioUrl: data.audioUrl,
        variantKey: data.variantKey,
      }
    }

    // If API call fails, return needs_generation
    console.warn('Error fetching audio metadata from API:', response.status)
    return {
      clipId,
      transcript,
      transcriptHash,
      audioStatus: 'needs_generation',
    }
  } catch (error) {
    // If Supabase isn't configured or there's an error, return needs_generation
    console.warn('Error in getAudioMetadata:', error)
    return {
      clipId,
      transcript,
      transcriptHash,
      audioStatus: 'needs_generation',
    }
  }
}

/**
 * Stream audio directly from OpenAI TTS to client
 * Returns a ReadableStream that can be converted to Blob/URL for playback
 */
export async function streamAudio(
  clipId: string,
  transcript: string,
  variantKey: string = 'clean_normal',
  cache: boolean = true
): Promise<{ success: boolean; stream?: ReadableStream<Uint8Array>; error?: string; code?: string; message?: string }> {
  try {
    const supabase = await getSupabaseClient()
    
    // Get session if available
    const { data: { session }, error: authError } = await supabase.auth.getSession()
    
    // Build headers - include auth token if available, otherwise let server handle dev guest
    const headers: HeadersInit = {}
    if (!authError && session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`
    }

    const streamUrl = `/api/audio/stream?clipId=${encodeURIComponent(clipId)}&transcript=${encodeURIComponent(transcript)}&variantKey=${encodeURIComponent(variantKey)}&cache=${cache ? 'true' : 'false'}`
    
    const response = await fetch(streamUrl, {
      headers,
    })

    if (!response.ok) {
      // Try to parse error JSON
      const error = await response.json().catch(() => ({ error: 'Unknown error', code: 'UNKNOWN' }))
      return { 
        success: false, 
        error: error.error || 'Stream failed',
        code: error.code || 'UNKNOWN',
        message: error.message || error.error || 'Stream failed',
      }
    }

    // Check if redirected to cached blob URL (server returns 302 redirect)
    if (response.redirected || response.url.includes('blob.vercel-storage.com')) {
      return {
        success: true,
        stream: undefined, // Will use response.url as audioUrl instead
      }
    }
    
    // Check if response is JSON (error case)
    const contentType = response.headers.get('content-type')
    if (contentType?.includes('application/json')) {
      const error = await response.json()
      return { 
        success: false, 
        error: error.error || 'Stream failed',
        code: error.code || 'UNKNOWN',
        message: error.message || error.error || 'Stream failed',
      }
    }

    // Return the stream
    if (response.body) {
      return {
        success: true,
        stream: response.body,
      }
    }

    return { success: false, error: 'No stream available', code: 'NO_STREAM' }
  } catch (error: any) {
    console.error('Error in streamAudio:', error)
    return { 
      success: false, 
      error: error.message || 'Stream failed',
      code: 'NETWORK_ERROR',
      message: error.message || 'Network error. Please check your connection.',
    }
  }
}

/**
 * Generate audio for a clip
 */
export async function generateAudio(
  clipId: string,
  transcript: string,
  variantKey: string = 'clean_normal'
): Promise<{ success: boolean; audioUrl?: string; error?: string; code?: string; message?: string; details?: string }> {
  try {
    const supabase = await getSupabaseClient()
    
    // Get session if available
    const { data: { session }, error: authError } = await supabase.auth.getSession()
    
    // Build headers - include auth token if available, otherwise let server handle dev guest
    // Server will use DEV_GUEST_USER_ID in dev mode if no auth token is provided
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    }
    if (!authError && session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`
    }

    const response = await fetch('/api/audio/generate', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        clipId,
        transcript,
        variantKey,
      }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error', code: 'UNKNOWN' }))
      return { 
        success: false, 
        error: error.error || 'Generation failed',
        code: error.code || 'UNKNOWN',
        message: error.message || error.error || 'Generation failed',
        details: error.details,
      }
    }

    const data = await response.json()
    
    // Use blobPath directly from response, but wait for URL readiness before returning
    if (data.success && data.blobPath) {
      // Import and use waitForAudioUrl to ensure URL is accessible
      const { waitForAudioUrl } = await import('./audioUrlReadiness')
      
      console.log('⏳ [generateAudio] Waiting for blob URL to become accessible...', {
        url: data.blobPath.substring(0, 80) + '...',
      })
      
      const readinessResult = await waitForAudioUrl(data.blobPath, {
        onRetry: (attempt, delay) => {
          console.log(`⏳ [generateAudio] Retry ${attempt}: waiting ${delay}ms...`)
        },
      })
      
      if (readinessResult.success) {
        console.log('✅ [generateAudio] Blob URL is accessible:', {
          url: data.blobPath.substring(0, 80) + '...',
          attempts: readinessResult.attempt,
        })
        return {
          success: true,
          audioUrl: data.blobPath, // blobPath is the full URL from Vercel Blob
        }
      } else {
        console.warn('⚠️ [generateAudio] Blob URL not accessible after retries, but returning URL anyway:', {
          url: data.blobPath.substring(0, 80) + '...',
          error: readinessResult.error,
        })
        // Return URL anyway - client can retry or fall back to polling
        return {
          success: true,
          audioUrl: data.blobPath,
        }
      }
    }

    return { success: false, error: 'Generation failed', code: 'UNKNOWN' }
  } catch (error: any) {
    console.error('Error in generateAudio:', error)
    return { 
      success: false, 
      error: error.message || 'Generation failed',
      code: 'NETWORK_ERROR',
      message: error.message || 'Network error. Please check your connection.',
    }
  }
}
