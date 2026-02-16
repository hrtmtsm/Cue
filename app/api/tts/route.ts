import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { generateGeminiTTS, isGeminiTTSConfigured } from '@/lib/gemini-tts'
import { getCachedAudio, setCachedAudio } from '@/lib/audio-cache'

export const runtime = 'nodejs'

// In-memory LRU cache for audio (MVP - also for non-Gemini fallback)
interface CacheEntry {
  audio: Buffer
  timestamp: number
}

const audioCache = new Map<string, CacheEntry>()
const MAX_CACHE_SIZE = 200

function generateCacheKey(text: string, mode: string): string {
  const hash = crypto.createHash('sha256')
  hash.update(`${text}:${mode}`)
  return hash.digest('hex')
}

function evictOldestIfNeeded() {
  if (audioCache.size >= MAX_CACHE_SIZE) {
    let oldestKey: string | null = null
    let oldestTime = Date.now()
    
    for (const [key, entry] of Array.from(audioCache.entries())) {
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

export async function POST(req: NextRequest) {
  try {
    const { text, mode = 'normal', cacheKey } = await req.json()

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

    // Normalize text
    const normalizedText = text
      .trim()
      .replace(/^["']|["']$/g, '')
      .replace(/\s+/g, ' ')
      .replace(/->/g, '')
      .trim()

    // Check local cache
    const cacheKeyFinal = cacheKey || generateCacheKey(normalizedText, mode)
    const cached = audioCache.get(cacheKeyFinal)
    
    if (cached) {
      return new NextResponse(new Uint8Array(cached.audio), {
        headers: {
          'Content-Type': 'audio/mpeg',
          'Cache-Control': 'public, max-age=31536000, immutable',
          'X-Cache': 'HIT',
          'X-Source': 'local-cache',
        },
      })
    }

    // Also check session cache
    const sessionCached = getCachedAudio(cacheKeyFinal)
    if (sessionCached) {
      return new NextResponse(new Uint8Array(sessionCached), {
        headers: {
          'Content-Type': 'audio/mpeg',
          'Cache-Control': 'public, max-age=31536000, immutable',
          'X-Cache': 'HIT',
          'X-Source': 'session-cache',
        },
      })
    }

    let audioBuffer: Buffer
    let source: string

    // Try Gemini TTS first
    if (isGeminiTTSConfigured()) {
      try {
        const result = await generateGeminiTTS({ text: normalizedText })
        audioBuffer = result.audio
        source = `gemini:${result.voice}`
      } catch (geminiError: any) {
        console.error('⚠️ [TTS] Gemini TTS failed, trying OpenAI fallback:', geminiError.message)
        // Fall through to OpenAI
        audioBuffer = await generateWithOpenAI(normalizedText, mode)
        source = 'openai-fallback'
      }
    } else if (process.env.OPENAI_API_KEY) {
      audioBuffer = await generateWithOpenAI(normalizedText, mode)
      source = 'openai'
    } else {
      return NextResponse.json(
        { error: 'TTS service not available' },
        { status: 503 }
      )
    }

    // Store in both caches
    evictOldestIfNeeded()
    audioCache.set(cacheKeyFinal, {
      audio: audioBuffer,
      timestamp: Date.now(),
    })
    setCachedAudio(cacheKeyFinal, audioBuffer)

    return new NextResponse(audioBuffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Source': source,
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

async function generateWithOpenAI(text: string, mode: string): Promise<Buffer> {
  const OpenAI = (await import('openai')).default
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  
  const { getNaturalSpeechInstructions, getVariedSpeed, getIntimateVoice } = await import('@/lib/naturalSpeechVariation')
  const voice = getIntimateVoice()
  const speed = getVariedSpeed('medium')
  const instructions = getNaturalSpeechInstructions()

  const response = await openai.audio.speech.create({
    model: 'gpt-4o-mini-tts',
    voice: voice,
    input: text,
    speed: speed,
    instructions: instructions,
  })

  return Buffer.from(await response.arrayBuffer())
}
