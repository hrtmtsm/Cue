/**
 * Gemini TTS Generator
 * 
 * Uses Google Cloud Text-to-Speech API with the gemini-2.5-pro-tts model
 * for natural, varied speech generation.
 * 
 * Supports:
 * - Multiple Gemini voices for variation
 * - Natural speech prompts to control style
 * - Random voice + prompt selection per call
 */

import { TextToSpeechClient, protos } from '@google-cloud/text-to-speech'

// Initialize client based on available credentials
function createTTSClient(): TextToSpeechClient {
  // Check for JSON credentials (Vercel deployment)
  const credentialsJson = process.env.GOOGLE_CLOUD_CREDENTIALS_JSON
  if (credentialsJson) {
    try {
      const credentials = JSON.parse(credentialsJson)
      return new TextToSpeechClient({ credentials })
    } catch (e) {
      console.error('[Gemini TTS] Failed to parse GOOGLE_CLOUD_CREDENTIALS_JSON:', e)
    }
  }

  // Fall back to GOOGLE_APPLICATION_CREDENTIALS file path (local dev)
  // The library automatically reads this env var
  return new TextToSpeechClient()
}

let clientInstance: TextToSpeechClient | null = null

function getClient(): TextToSpeechClient {
  if (!clientInstance) {
    clientInstance = createTTSClient()
  }
  return clientInstance
}

// Available Gemini TTS voices (official Google Cloud names)
// See: https://cloud.google.com/text-to-speech/docs/gemini-tts
export const GEMINI_VOICES = [
  'Achernar',
  'Aoede',
  'Charon',
  'Fenrir',
  'Kore',
  'Leda',
  'Orus',
  'Puck',
  'Sulafat',
  'Zephyr',
] as const

export type GeminiVoice = typeof GEMINI_VOICES[number]

// Natural speech prompts for variation
// These control the speaking style to make clips sound natural and varied.
// IMPORTANT: Avoid "speak quickly/fast" — it causes Gemini to truncate short phrases.
// Instead, focus on naturalness, tone, and connected speech.
export const SPEECH_PROMPTS = [
  'Speak casually and naturally, like talking to a friend. Let words connect the way they do in real conversation.',
  'Speak in a relaxed, natural tone. Use connected speech where words blend together smoothly.',
  'Speak like you\'re having a casual conversation. Use a warm, friendly tone with natural rhythm.',
  'Speak naturally with a laid-back delivery. Don\'t over-enunciate — just say it like you normally would.',
  'Speak in a conversational way, like you\'re chatting over coffee. Keep the tone easy and natural.',
] as const

export interface TTSOptions {
  text: string
  voiceIndex?: number
  promptIndex?: number
  voice?: GeminiVoice
  prompt?: string
}

export interface TTSResult {
  audio: Buffer
  voice: string
  prompt: string
}

/**
 * Generate audio using Gemini TTS
 * 
 * If a voice doesn't support the prompt parameter in the current region,
 * automatically retries without the prompt.
 * 
 * @param options - TTS generation options
 * @returns Buffer containing MP3 audio data
 */
export async function generateGeminiTTS(options: TTSOptions): Promise<TTSResult> {
  const { text } = options

  // Determine voice
  const voice: GeminiVoice = options.voice
    || GEMINI_VOICES[(options.voiceIndex ?? Math.floor(Math.random() * GEMINI_VOICES.length)) % GEMINI_VOICES.length]

  // Determine prompt
  const prompt: string = options.prompt
    || SPEECH_PROMPTS[(options.promptIndex ?? Math.floor(Math.random() * SPEECH_PROMPTS.length)) % SPEECH_PROMPTS.length]

  console.log(`🎤 [Gemini TTS] Generating audio - voice: ${voice}, text: "${text.substring(0, 50)}..."`)

  const client = getClient()

  // Try with prompt first, fall back to without prompt if voice doesn't support it
  const attempts: Array<{ usePrompt: boolean }> = [
    { usePrompt: true },
    { usePrompt: false },
  ]

  for (const attempt of attempts) {
    const request: protos.google.cloud.texttospeech.v1.ISynthesizeSpeechRequest = {
      audioConfig: {
        audioEncoding: 'MP3' as any,
        speakingRate: 1.3,
      },
      input: {
        text: text,
      },
      voice: {
        languageCode: 'en-US',
        name: voice,
      },
    }

    // Add Gemini model name
    ;(request.voice as any).modelName = 'gemini-2.5-pro-tts'

    // Only add prompt if this attempt uses it
    if (attempt.usePrompt) {
      ;(request.input as any).prompt = prompt
    }

    try {
      const [response] = await client.synthesizeSpeech(request)

      if (!response.audioContent) {
        throw new Error('Gemini TTS returned empty audio content')
      }

      const audioBuffer = Buffer.from(response.audioContent as Uint8Array)
      console.log(`✅ [Gemini TTS] Audio generated - ${(audioBuffer.length / 1024).toFixed(1)} KB, voice: ${voice}${attempt.usePrompt ? '' : ' (no prompt)'}`)

      return {
        audio: audioBuffer,
        voice,
        prompt: attempt.usePrompt ? prompt : '(none - voice does not support prompt in this region)',
      }
    } catch (err: any) {
      // If INVALID_ARGUMENT about prompt/region, retry without prompt
      if (attempt.usePrompt && err?.code === 3 && err?.message?.includes('prompt')) {
        console.warn(`⚠️ [Gemini TTS] Voice "${voice}" does not support prompt in this region, retrying without prompt...`)
        continue
      }
      // For any other error, throw immediately
      throw err
    }
  }

  // Should never reach here, but just in case
  throw new Error(`Gemini TTS failed for voice ${voice} after all attempts`)
}

/**
 * Generate audio with random voice and prompt selection
 * Convenience function for single-clip generation
 */
export async function generateRandomGeminiTTS(text: string): Promise<TTSResult> {
  return generateGeminiTTS({
    text,
    voiceIndex: Math.floor(Math.random() * GEMINI_VOICES.length),
    promptIndex: Math.floor(Math.random() * SPEECH_PROMPTS.length),
  })
}

/**
 * Check if Gemini TTS credentials are configured
 */
export function isGeminiTTSConfigured(): boolean {
  return !!(
    process.env.GOOGLE_CLOUD_CREDENTIALS_JSON ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS
  )
}
