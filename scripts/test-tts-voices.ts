#!/usr/bin/env node

/**
 * Test all 6 OpenAI TTS voices for our language learning app
 * 
 * Usage:
 *   npx tsx scripts/test-tts-voices.ts
 * 
 * This script generates the same text in all 6 voices and saves them
 * as separate MP3 files for comparison.
 */

import { config } from 'dotenv'
import { resolve } from 'path'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import OpenAI from 'openai'
import { getNaturalConversationSpeed } from '@/lib/audioProcessing'

// Load .env.local
config({ path: resolve(process.cwd(), '.env.local') })

const text = "Hey, how's it going? I was thinking we could grab coffee later if you're free. There's this new place downtown that everyone's been talking about."

const voices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] as const

// Output directory
const outputDir = resolve(process.cwd(), 'public', 'test-voices')

// Test with natural conversation speed (1.25x)
const naturalSpeed = getNaturalConversationSpeed('clean_normal')

async function main() {
  // Check for API key
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ Error: OPENAI_API_KEY environment variable is not set')
    console.error('   Make sure .env.local contains OPENAI_API_KEY')
    process.exit(1)
  }

  // Initialize OpenAI client
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })

  // Create output directory if it doesn't exist
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true })
    console.log(`📁 Created output directory: ${outputDir}`)
  }

  console.log(`🎤 Testing ${voices.length} OpenAI TTS voices...`)
  console.log(`📝 Text: "${text}"`)
  console.log(`📂 Output: ${outputDir}`)
  console.log(`⚡ Speed: ${naturalSpeed}x (natural conversation pace)`)
  console.log('')

  // Generate audio for each voice
  for (const voice of voices) {
    try {
      console.log(`🎵 Generating ${voice}...`)
      
      const response = await openai.audio.speech.create({
        model: 'gpt-4o-mini-tts',
        voice: voice,
        input: text,
        response_format: 'mp3',
        speed: naturalSpeed, // Use natural conversation speed (1.3x)
        instructions: "Speak naturally like a casual conversation. Use natural pauses and conversational rhythm. Sound like you're talking to a friend, not reading a script.",
      })

      // Convert response to buffer
      const buffer = Buffer.from(await response.arrayBuffer())
      
      // Save to file
      const filePath = resolve(outputDir, `${voice}.mp3`)
      writeFileSync(filePath, buffer)
      
      console.log(`✅ Saved ${voice}.mp3 (${(buffer.length / 1024).toFixed(2)} KB)`)
    } catch (error: any) {
      console.error(`❌ Error generating ${voice}:`, error.message)
    }
  }

  console.log('')
  console.log('✨ Done! All voice files saved to:', outputDir)
  console.log('')
  console.log('📋 Files generated:')
  voices.forEach(voice => {
    console.log(`   - ${voice}.mp3`)
  })
}

main().catch((error) => {
  console.error('❌ Fatal error:', error)
  process.exit(1)
})
