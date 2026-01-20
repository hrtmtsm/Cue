/**
 * Client-side Audio API
 * Fetches audio status and URLs from the database
 */

import { generateTextHash } from './audioHash'
import { getSupabase } from './supabase/client'

// Get Supabase client (already lazy-initialized)
function getSupabaseClient() {
  // getSupabase() is already lazy - only initializes when called
  return getSupabase()
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
    const supabase = getSupabaseClient()
    
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
    let errorText = ''
    try {
      errorText = await response.text()
    } catch (e) {
      // Ignore text parsing errors
    }
    console.error('[Diagnosis] Error', {
      message: `Audio metadata fetch failed: ${response.status}`,
      name: 'ResponseError',
      status: response.status,
      statusText: response.statusText,
      errorText,
      err: response,
    })
    return {
      clipId,
      transcript,
      transcriptHash,
      audioStatus: 'needs_generation',
    }
  } catch (error: any) {
    // If Supabase isn't configured or there's an error, return needs_generation
    console.error('[Diagnosis] Error', {
      message: error?.message || 'Error in getAudioMetadata',
      name: error?.name,
      stack: error?.stack,
      err: error,
    })
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
    const supabase = getSupabaseClient()
    
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
      let errorText = ''
      let errorJson: any = {}
      try {
        errorText = await response.text()
        try {
          errorJson = JSON.parse(errorText)
        } catch {
          // Not JSON, keep as text
        }
      } catch (e) {
        // Ignore parsing errors
      }
      
      console.error('[Diagnosis] Error', {
        message: `Audio stream failed: ${response.status}`,
        name: 'ResponseError',
        status: response.status,
        statusText: response.statusText,
        errorText,
        err: response,
      })
      
      return { 
        success: false, 
        error: errorJson.error || 'Stream failed',
        code: errorJson.code || 'UNKNOWN',
        message: errorJson.message || errorJson.error || 'Stream failed',
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
      let errorJson: any
      try {
        errorJson = await response.json()
      } catch (err: any) {
        console.error('[Diagnosis] Error', {
          message: err?.message || 'Failed to parse error JSON',
          name: err?.name,
          stack: err?.stack,
          err,
        })
        return {
          success: false,
          error: 'Failed to parse error response',
          code: 'PARSE_ERROR',
          message: 'Stream failed',
        }
      }
      return { 
        success: false, 
        error: errorJson.error || 'Stream failed',
        code: errorJson.code || 'UNKNOWN',
        message: errorJson.message || errorJson.error || 'Stream failed',
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
    console.error('[Diagnosis] Error', {
      message: error?.message,
      name: error?.name,
      stack: error?.stack,
      err: error,
    })
    return { 
      success: false, 
      error: error?.message || 'Stream failed',
      code: 'NETWORK_ERROR',
      message: error?.message || 'Network error. Please check your connection.',
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
    const supabase = getSupabaseClient()
    
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
      let errorText = ''
      let errorJson: any = {}
      try {
        errorText = await response.text()
        try {
          errorJson = JSON.parse(errorText)
        } catch {
          // Not JSON, keep as text
        }
      } catch (e) {
        // Ignore parsing errors
      }
      
      console.error('[Diagnosis] Error', {
        message: `Audio generation failed: ${response.status}`,
        name: 'ResponseError',
        status: response.status,
        statusText: response.statusText,
        errorText,
        err: response,
      })
      
      return { 
        success: false, 
        error: errorJson.error || 'Generation failed',
        code: errorJson.code || 'UNKNOWN',
        message: errorJson.message || errorJson.error || 'Generation failed',
        details: errorJson.details,
      }
    }

    let data: any
    try {
      data = await response.json()
    } catch (err: any) {
      console.error('[Diagnosis] Error', {
        message: err?.message || 'Failed to parse response JSON',
        name: err?.name,
        stack: err?.stack,
        err,
      })
      return {
        success: false,
        error: 'Failed to parse response',
        code: 'PARSE_ERROR',
        message: 'Failed to parse server response',
      }
    }
    
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
    console.error('[Diagnosis] Error', {
      message: error?.message,
      name: error?.name,
      stack: error?.stack,
      err: error,
    })
    return { 
      success: false, 
      error: error?.message || 'Generation failed',
      code: 'NETWORK_ERROR',
      message: error?.message || 'Network error. Please check your connection.',
    }
  }
}
