import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import crypto from 'crypto'

export const runtime = 'nodejs'

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null

// Available OpenAI TTS voices (curated list)
const AVAILABLE_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] as const
type VoiceName = typeof AVAILABLE_VOICES[number]

// In-memory LRU cache for audio (MVP)
interface CacheEntry {
  audio: Buffer
  timestamp: number
}

const audioCache = new Map<string, CacheEntry>()
const MAX_CACHE_SIZE = 200

// Generate cache key from text, mode, voice, and model
function generateCacheKey(text: string, mode: string, voice: string, model: string = 'tts-1'): string {
  const hash = crypto.createHash('sha256')
  hash.update(`${text}:${mode}:${voice}:${model}`)
  return hash.digest('hex')
}

// LRU cache eviction
function evictOldestIfNeeded() {
  if (audioCache.size >= MAX_CACHE_SIZE) {
    // Find oldest entry
    let oldestKey: string | null = null
    let oldestTime = Date.now()
    
    for (const [key, entry] of audioCache.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp
        oldestKey = key
      }
    }
    
    if (oldestKey) {
      audioCache.delete(oldestKey)
    }
  }
}

// Select random voice (or use seed for stability)
function selectVoice(voiceSeed?: string): VoiceName {
  if (voiceSeed) {
    // Use seed to deterministically select voice
    const seedHash = crypto.createHash('md5').update(voiceSeed).digest('hex')
    const index = parseInt(seedHash.substring(0, 8), 16) % AVAILABLE_VOICES.length
    return AVAILABLE_VOICES[index]
  }
  // Random selection
  return AVAILABLE_VOICES[Math.floor(Math.random() * AVAILABLE_VOICES.length)]
}

export async function POST(req: NextRequest) {
  try {
    const { text, mode = 'normal', voiceSeed, cacheKey } = await req.json()

    if (!text || typeof text !== 'string' || text.trim() === '') {
      return NextResponse.json(
        { error: 'Missing or invalid text parameter' },
        { status: 400 }
      )
    }

    if (mode !== 'normal' && mode !== 'slow_clear') {
      return NextResponse.json(
        { error: 'Invalid mode. Must be "normal" or "slow_clear"' },
        { status: 400 }
      )
    }

    if (!openai) {
      console.error('OpenAI API key not configured')
      return NextResponse.json(
        { error: 'TTS service not available' },
        { status: 503 }
      )
    }

    // Select voice (stable based on seed)
    const selectedVoice = selectVoice(voiceSeed)

    // Normalize text: remove extra quotes/spaces that cause pauses, ensure whole phrase
    const normalizedText = text
      .trim()
      .replace(/^["']|["']$/g, '') // Remove surrounding quotes
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/->/g, '') // Remove arrow notation (visual only)
      .trim()

    // Use tts-1 for faster generation (lower latency)
    const model = 'tts-1'

    // Check cache
    const cacheKeyFinal = cacheKey || generateCacheKey(normalizedText, mode, selectedVoice, model)
    const cached = audioCache.get(cacheKeyFinal)
    
    if (cached) {
      // Cache hit - return immediately
      return new NextResponse(cached.audio, {
        headers: {
          'Content-Type': 'audio/mpeg',
          'Cache-Control': 'public, max-age=31536000, immutable',
          'X-Cache': 'HIT',
          'X-Voice': selectedVoice,
          'X-Mode': mode,
        },
      })
    }

    // Generate audio with OpenAI TTS
    // Note: OpenAI TTS API doesn't support speed parameter directly
    // We generate at natural pace and adjust via playbackRate on client
    // Use normalized text to ensure connected speech (no choppy boundaries)
    const response = await openai.audio.speech.create({
      model: model,
      voice: selectedVoice,
      input: normalizedText, // Use normalized text for natural connected speech
    })

    // Convert response to buffer
    const audioBuffer = Buffer.from(await response.arrayBuffer())

    // Store in cache
    evictOldestIfNeeded()
    audioCache.set(cacheKeyFinal, {
      audio: audioBuffer,
      timestamp: Date.now(),
    })

    // Return audio with appropriate headers
    return new NextResponse(audioBuffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Voice': selectedVoice, // Include voice in header for debugging
        'X-Mode': mode, // Include mode in header
      },
    })
  } catch (error: any) {
    console.error('TTS API error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to generate TTS audio' },
      { status: 500 }
    )
  }
}
