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

// Available Gemini voices for variation
export const GEMINI_VOICES = [
  'Achernar',
  'Adhara',
  'Algenib',
  'Alphard',
  'Bellatrix',
  'Capella',
  'Deneb',
  'Fomalhaut',
  'Polaris',
  'Rigel',
] as const

export type GeminiVoice = typeof GEMINI_VOICES[number]

// Natural speech prompts for variation
// These control the speaking style to make clips sound natural and varied
export const SPEECH_PROMPTS = [
  'Speak quickly and casually like in a TV drama. Mumble slightly, let words run together naturally.',
  'Speak at a fast natural pace with words blending together like native casual speech.',
  'Talk quickly like you\'re thinking out loud. Let sounds connect smoothly, don\'t enunciate every syllable.',
  'Speak in a relaxed, fast-paced way. Words should flow together casually, not perfectly articulated.',
  'Speak naturally with words connecting like real conversation. Use a warm, casual tone.',
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

  const request: protos.google.cloud.texttospeech.v1.ISynthesizeSpeechRequest = {
    audioConfig: {
      audioEncoding: 'MP3' as any,
      speakingRate: 1.0,
    },
    input: {
      text: text,
    },
    voice: {
      languageCode: 'en-US',
      name: voice,
    },
  }

  // For Gemini TTS, add the model name and prompt via the voice config
  // The Gemini model supports prompt-based style control
  ;(request.voice as any).modelName = 'gemini-2.5-pro-tts'
  ;(request.input as any).prompt = prompt

  const [response] = await client.synthesizeSpeech(request)

  if (!response.audioContent) {
    throw new Error('Gemini TTS returned empty audio content')
  }

  const audioBuffer = Buffer.from(response.audioContent as Uint8Array)
  console.log(`✅ [Gemini TTS] Audio generated - ${(audioBuffer.length / 1024).toFixed(1)} KB, voice: ${voice}`)

  return {
    audio: audioBuffer,
    voice,
    prompt,
  }
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
