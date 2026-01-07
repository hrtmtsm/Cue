import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { ClipProfile, Clip } from '@/lib/clipTypes'
import { createClipProfiles } from '@/lib/clipProfileMapper'
import type { OnboardingData } from '@/lib/onboardingStore'
import { generateTitlesForClips } from '@/lib/clipTitleGenerator'
import { mapTargetStyleToSituation } from '@/lib/situationMapper'

// Log API key status at module load (for debugging)
console.log('🔍 API Route loaded. OPENAI_API_KEY present:', !!process.env.OPENAI_API_KEY)
console.log('🔍 USE_MOCK_CLIPS:', process.env.USE_MOCK_CLIPS)

function generateId(): string {
  return `clip_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

function buildPrompt(profile: ClipProfile): string {
  const { focus, targetStyle, lengthSec, difficulty } = profile
  
  let prompt = `Generate a natural, conversational English sentence or two that would take approximately ${lengthSec} seconds to speak. 
  
Requirements:
- 1-2 sentences maximum
- 10-20 words total
- Natural conversational tone
- Easy vocabulary (no rare words)
- Target style: ${targetStyle}
- Difficulty: ${difficulty || 'medium'}
- No bullet points or lists
- No special symbols or formatting

`

  // Add focus-specific constraints
  if (focus.includes('connected_speech')) {
    prompt += `Focus on CONNECTED SPEECH: Use contractions (gonna, wanna, kinda, 'cause, etc.) and natural reductions. Make it sound like how people actually speak, not formal written English.
`
  }
  
  if (focus.includes('speed')) {
    prompt += `Focus on SPEED: Use short clauses with minimal pauses. Keep it flowing naturally but at a conversational pace.
`
  }
  
  if (focus.includes('parsing') || focus.includes('syntax_load')) {
    prompt += `Focus on PARSING/SYNTAX: Use multi-clause sentences but keep vocabulary simple. Create a structure that requires parsing multiple ideas together.
`
  }
  
  if (focus.includes('vocab')) {
    prompt += `Focus on VOCABULARY: Include common expressions and phrasal verbs that might be unfamiliar. Use everyday conversational phrases.
`
  }

  prompt += `\nRespond with ONLY the sentence(s), no explanation, no quotes, no formatting.`

  return prompt
}

function validateOutput(text: string): boolean {
  // Remove quotes if present
  const cleaned = text.trim().replace(/^["']|["']$/g, '')
  
  // Check length (10-20 words)
  const words = cleaned.split(/\s+/).filter(w => w.length > 0)
  if (words.length < 10 || words.length > 20) {
    return false
  }
  
  // Check for bullet points
  if (cleaned.includes('•') || cleaned.includes('- ') || cleaned.includes('* ')) {
    return false
  }
  
  // Check for weird symbols
  if (/[^\w\s.,!?'"-]/.test(cleaned)) {
    return false
  }
  
  // Check sentence count (1-2 sentences)
  const sentences = cleaned.split(/[.!?]+/).filter(s => s.trim().length > 0)
  if (sentences.length < 1 || sentences.length > 2) {
    return false
  }
  
  return true
}

async function generateText(profile: ClipProfile, openai: OpenAI): Promise<string> {
  const prompt = buildPrompt(profile)
  const model = 'gpt-4o-mini'
  
  console.log(`🟢 [REAL OPENAI] Making API call for ${profile.difficulty} clip...`)
  console.log(`🟢 [REAL OPENAI] Model: ${model}`)
  
  try {
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: 'You are a language learning content generator. Generate natural, conversational English sentences that help learners practice listening.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.8,
      max_tokens: 100,
    })
    
    const requestId = completion.id
    console.log(`🟢 [REAL OPENAI] Request ID: ${requestId}`)
    
    let text = completion.choices[0]?.message?.content?.trim() || ''
    
    // Remove quotes if present
    text = text.replace(/^["']|["']$/g, '')
    
    // Validate output
    if (!validateOutput(text)) {
      // Regenerate once with stricter constraints
      const strictPrompt = prompt + '\n\nIMPORTANT: Respond with exactly 1-2 sentences, 10-20 words total, no formatting, no bullets, no symbols.'
      console.log(`🟢 [REAL OPENAI] First attempt failed validation, retrying with stricter constraints...`)
      const retryCompletion = await openai.chat.completions.create({
        model,
        messages: [
          {
            role: 'system',
            content: 'You are a language learning content generator. Generate natural, conversational English sentences that help learners practice listening.',
          },
          {
            role: 'user',
            content: strictPrompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 80,
      })
      console.log(`🟢 [REAL OPENAI] Retry Request ID: ${retryCompletion.id}`)
      text = retryCompletion.choices[0]?.message?.content?.trim() || ''
      text = text.replace(/^["']|["']$/g, '')
    }
    
    return text
  } catch (error: any) {
    console.error('OpenAI API error:', error)
    throw new Error(`Failed to generate text: ${error.message || 'Unknown error'}`)
  }
}

async function generateAudio(text: string, clipId: string, openai: OpenAI): Promise<string> {
  try {
    console.log('🔊 [TTS] Generating audio for text:', text.substring(0, 50) + '...')
    console.log('🔊 [TTS] Clip ID:', clipId)
    
    // Call OpenAI TTS API
    const mp3 = await openai.audio.speech.create({
      model: 'tts-1',
      voice: 'alloy', // Options: alloy, echo, fable, onyx, nova, shimmer
      input: text,
    })
    
    // Convert response to buffer
    const buffer = Buffer.from(await mp3.arrayBuffer())
    console.log('🔊 [TTS] Audio generated, size:', buffer.length, 'bytes')
    
    // Ensure audio directory exists
    const fs = await import('fs')
    const path = await import('path')
    
    const audioDir = path.join(process.cwd(), 'public', 'audio', 'generated')
    if (!fs.existsSync(audioDir)) {
      fs.mkdirSync(audioDir, { recursive: true })
      console.log('🔊 [TTS] Created audio directory:', audioDir)
    }
    
    // Generate filename using clip ID (exactly `${clipId}.mp3`)
    const filename = `${clipId}.mp3`
    const filePath = path.join(audioDir, filename)
    
    // Save file
    fs.writeFileSync(filePath, buffer)
    console.log('🔊 [TTS] Audio saved to:', filePath)
    
    // Sanity check: verify file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`Audio file was not created at ${filePath}`)
    }
    const stats = fs.statSync(filePath)
    console.log('✅ [TTS] File verified - size:', stats.size, 'bytes')
    
    // Return URL path (public files are served from /)
    const audioUrl = `/audio/generated/${filename}`
    console.log('✅ [TTS] Final audio URL:', audioUrl)
    return audioUrl
  } catch (error: any) {
    console.error('🔴 [TTS] Error generating audio:', error)
    throw error // Re-throw to let caller handle - don't create invalid URLs
  }
}

// Mock clip generator for development/fallback
async function generateMockClips(profiles: ClipProfile[], openai?: OpenAI | null): Promise<Clip[]> {
  const mockTexts = [
    "I'd like to get a large coffee with oat milk, please.",
    "Could you tell me about your previous work experience?",
    "Nice weather today, isn't it? Perfect for a walk in the park.",
    "What time does the train leave for the city center?",
    "I think we should discuss this with the team first.",
    "Did you watch the latest episode of that show?",
    "Can we reschedule our meeting for next week?",
    "The restaurant is just around the corner from here.",
  ]
  
  const clips: Clip[] = []
  
  // Generate mock clips for all profiles (up to available mock texts)
  for (let index = 0; index < Math.min(profiles.length, mockTexts.length); index++) {
    const profile = profiles[index]
    const text = mockTexts[index] || "This is a sample listening practice clip."
    const clipId = generateId()
    
    // Try to generate real audio even for mock clips if OpenAI is available
    let audioUrl: string
    if (openai) {
      try {
        audioUrl = await generateAudio(text, clipId, openai)
        console.log(`🔊 [TTS] Generated audio for mock clip ${index + 1}`)
      } catch (error) {
        console.warn(`🔊 [TTS] Failed to generate audio for mock clip, clip will have no audio`)
        // Don't create invalid URLs - clip will have empty audioUrl and should be handled by UI
        audioUrl = ''
      }
    } else {
      // In pure mock mode without OpenAI, we can't generate audio
      audioUrl = ''
    }
    
    clips.push({
      id: clipId,
      text,
      title: '', // Will be generated after all clips are created
      audioUrl,
      focus: profile.focus,
      targetStyle: profile.targetStyle || 'Everyday conversations',
      situation: mapTargetStyleToSituation(profile.targetStyle || 'Everyday conversations'),
      lengthSec: profile.lengthSec || 15,
      difficulty: profile.difficulty,
      createdAt: new Date().toISOString(),
    })
  }
  
  return clips
}

export async function POST(request: NextRequest) {
  console.log('🟢 CLIP GENERATION API ROUTE HIT')
  console.log('🟢 Request method:', request.method)
  console.log('🟢 Request URL:', request.url)
  
  // Check environment at request-time (not module load time)
  const hasApiKey = !!process.env.OPENAI_API_KEY
  const useMockClipsExplicit = process.env.USE_MOCK_CLIPS === 'true'
  
  // Only use mock mode if explicitly enabled
  const useMockMode = useMockClipsExplicit
  
  // Explicit mode decision logging
  console.log('CLIPS_MODE', { 
    useMockMode, 
    hasKey: hasApiKey, 
    USE_MOCK_CLIPS: process.env.USE_MOCK_CLIPS,
    decision: useMockMode ? 'MOCK' : (hasApiKey ? 'OPENAI' : 'ERROR_NO_KEY')
  })
  
  console.log('🟢 [MODE CHECK] OPENAI_API_KEY present:', hasApiKey)
  console.log('🟢 [MODE CHECK] USE_MOCK_CLIPS:', process.env.USE_MOCK_CLIPS)
  console.log(`🟢 [MODE CHECK] MODE=${useMockMode ? 'mock' : 'openai'}`)
  
  // If mock mode not explicitly enabled, we REQUIRE OpenAI API key
  if (!useMockMode && !hasApiKey) {
    console.error('🔴 [ERROR] OPENAI_API_KEY missing and USE_MOCK_CLIPS not set')
    return NextResponse.json(
      {
        error: 'OPENAI_API_KEY missing',
        code: 'MISSING_API_KEY',
        hint: 'Set it in .env.local and restart dev server. Or set USE_MOCK_CLIPS=true for development mode.',
      },
      { status: 500 }
    )
  }
  
  // Initialize OpenAI client at request-time
  let openai: OpenAI | null = null
  if (!useMockMode) {
    try {
      openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY!,
      })
      console.log('🟢 [REAL OPENAI] Client initialized successfully')
    } catch (error) {
      console.error('🔴 [REAL OPENAI] Client initialization failed:', error)
      return NextResponse.json(
        {
          error: 'OpenAI client initialization failed',
          code: 'CLIENT_INIT_ERROR',
          details: 'Failed to initialize OpenAI client. Please check your OPENAI_API_KEY.',
        },
        { status: 500 }
      )
    }
  } else {
    console.log('🟡 [MOCK MODE] Using mock clip generation (USE_MOCK_CLIPS=true)')
  }

  try {
    const body = await request.json()
    console.log('🟢 Request body received:', JSON.stringify(body, null, 2))
    
    // Support both { profile: ClipProfile } and { onboardingData: OnboardingData }
    let profiles: ClipProfile[]
    
    if (body.profile) {
      // Single profile (for backwards compatibility, but we generate 3 anyway)
      profiles = [body.profile]
    } else if (body.onboardingData) {
      // Onboarding data - create 3 profiles
      profiles = createClipProfiles(body.onboardingData)
    } else {
      // Default: generate 3 profiles with default settings
      profiles = [
        { focus: ['connected_speech'], targetStyle: 'Everyday conversations', lengthSec: 10, difficulty: 'easy' },
        { focus: ['connected_speech'], targetStyle: 'Everyday conversations', lengthSec: 15, difficulty: 'medium' },
        { focus: ['connected_speech'], targetStyle: 'Everyday conversations', lengthSec: 18, difficulty: 'hard' },
      ]
    }

    // Ensure we have at least 3 profiles (fallback if none provided)
    if (profiles.length < 3) {
      const baseProfile = profiles[0] || { focus: ['connected_speech'], targetStyle: 'Everyday conversations' }
      profiles = [
        { ...baseProfile, lengthSec: 10, difficulty: 'easy' },
        { ...baseProfile, lengthSec: 15, difficulty: 'medium' },
        { ...baseProfile, lengthSec: 18, difficulty: 'hard' },
      ]
    }

    // Generate clips for all profiles (15-24 clips expected)
    let clips: Clip[] = []
    let determinedSource: 'mock' | 'openai' | null = null
    
    console.log(`🟢 [GENERATION] Generating clips for ${profiles.length} profiles`)
    
    // Use mock mode only if explicitly enabled
    if (useMockMode) {
      console.log('🟡 [MOCK MODE] Generating mock clips (USE_MOCK_CLIPS=true)')
      // For mock mode, limit to 3 clips to match original behavior
      clips = await generateMockClips(profiles.slice(0, 3), openai)
      determinedSource = 'mock'
      console.log(`🟡 [MOCK MODE] Generated ${clips.length} mock clips, source set to: ${determinedSource}`)
    } else if (openai) {
      // Generate with REAL OpenAI for all profiles
      determinedSource = 'openai'
      console.log('🟢 [REAL OPENAI] Starting clip generation...')
      console.log(`🟢 [REAL OPENAI] Will generate ${profiles.length} clips`)
      console.log('🟢 [REAL OPENAI] Source will be set to: openai')
      let apiFailed = false
      let quotaError = false
      let lastError: Error | null = null
      
      // Generate clips for all profiles (not just first 3)
      for (const profile of profiles) {
        try {
          console.log(`🟢 [REAL OPENAI] Generating clip for difficulty: ${profile.difficulty}`)
          
          // Generate clip ID FIRST (before generating audio)
          const clipId = generateId()
          console.log(`🟢 [REAL OPENAI] Generated clip ID: ${clipId}`)
          
          // Check if overrideText is provided (for single clip generation from transcript)
          let text: string
          if (body.overrideText && profiles.length === 1) {
            // Use provided transcript directly
            text = body.overrideText
            console.log(`🟢 [REAL OPENAI] Using overrideText for single clip generation`)
          } else {
            // Generate text using OpenAI
            text = await generateText(profile, openai)
            console.log(`🟢 [REAL OPENAI] Generated text for ${profile.difficulty}:`, text.substring(0, 50) + '...')
          }
          
          // Generate audio using OpenAI TTS (pass clipId to ensure filename matches)
          const audioUrl = await generateAudio(text, clipId, openai)
          console.log(`🔊 [TTS] Audio URL for ${profile.difficulty}:`, audioUrl)

          // Create clip object
          const clip: Clip = {
            id: clipId,
            text,
            title: '', // Will be generated after all clips are created
            audioUrl,
            focus: profile.focus,
            targetStyle: profile.targetStyle || 'Everyday conversations',
            situation: mapTargetStyleToSituation(profile.targetStyle || 'Everyday conversations'),
            lengthSec: profile.lengthSec || 15,
            difficulty: profile.difficulty,
            createdAt: new Date().toISOString(),
          }

          // Sanity check: verify audioUrl matches clipId
          const expectedUrl = `/audio/generated/${clipId}.mp3`
          if (audioUrl !== expectedUrl) {
            console.warn(`⚠️ [WARNING] Audio URL mismatch! Expected: ${expectedUrl}, Got: ${audioUrl}`)
            // Fix it
            clip.audioUrl = expectedUrl
            console.log(`✅ [FIXED] Audio URL corrected to: ${expectedUrl}`)
          }

          clips.push(clip)
          console.log(`🟢 [REAL OPENAI] Successfully created clip ${clips.length}/${profiles.length} with ID: ${clipId}`)
        } catch (error: any) {
          // Extract safe error information
          const errorMessage = error.message || 'Unknown error'
          const statusCode = error.status || error.response?.status || 'unknown'
          
          console.error(`🔴 [REAL OPENAI] Error generating clip for ${profile.difficulty}:`)
          console.error(`🔴 [REAL OPENAI] Status code: ${statusCode}`)
          console.error(`🔴 [REAL OPENAI] Error message: ${errorMessage}`)
          
          lastError = error
          
          // Check if it's a quota/billing error
          const errorMsg = errorMessage.toLowerCase()
          if (statusCode === 429 || errorMsg.includes('quota') || errorMsg.includes('billing') || errorMsg.includes('exceeded')) {
            quotaError = true
            console.error('🔴 [REAL OPENAI] Quota/billing error detected')
          }
          
          apiFailed = true
          // Continue trying other clips
        }
      }
      
      // Handle failures - NO silent fallback to mock
      if (apiFailed && clips.length === 0) {
        // All clips failed - return error, don't fall back to mock
        const errorCode = quotaError ? 'QUOTA_EXCEEDED' : 'GENERATION_FAILED'
        let errorDetails = lastError?.message || 'Failed to generate clips'
        
        // Extract safe error info from OpenAI errors
        if (lastError && 'status' in lastError) {
          const statusCode = (lastError as any).status
          const statusText = (lastError as any).statusText || ''
          console.error(`🔴 [REAL OPENAI] OpenAI error - Status: ${statusCode}, Message: ${errorDetails}`)
          errorDetails = `OpenAI API error (${statusCode}): ${errorDetails}`
        }
        
        if (quotaError) {
          errorDetails = 'OpenAI API quota exceeded. Please check your billing or set USE_MOCK_CLIPS=true for development mode.'
        }
        
        console.error(`🔴 [REAL OPENAI] All clips failed. Code: ${errorCode}, Details: ${errorDetails}`)
        return NextResponse.json(
          {
            error: 'Failed to generate clips',
            code: errorCode,
            details: errorDetails,
          },
          { status: 500 }
        )
      } else if (clips.length > 0 && clips.length < profiles.length) {
        // Partial success - log warning but return what we have
        console.warn(`🟡 [REAL OPENAI] Partial success: ${clips.length}/${profiles.length} clips generated`)
      }
      
      // Generate titles for real OpenAI clips
      const titleMap = generateTitlesForClips(clips)
      for (const clip of clips) {
        clip.title = titleMap.get(clip.id) || 'Practice Clip'
      }
      
      // Dev-only validation: log titles
      if (process.env.NODE_ENV === 'development') {
        console.log('📋 [TITLES] Generated clip titles (OpenAI):')
        clips.forEach((c, idx) => {
          console.log(`  ${idx + 1}. ${c.difficulty || 'medium'}: "${c.title}"`)
          console.log(`     Text preview: ${c.text.substring(0, 40)}...`)
        })
      }
    } else {
      // Should not reach here, but handle edge case
      console.error('🔴 [ERROR] No OpenAI client and not in mock mode')
      return NextResponse.json(
        {
          error: 'Invalid configuration',
          code: 'CONFIG_ERROR',
          details: 'Unable to determine clip generation mode.',
        },
        { status: 500 }
      )
    }
    
    // Verify clips were generated
    if (clips.length === 0) {
      return NextResponse.json(
        {
          error: 'No clips were generated',
          code: 'NO_CLIPS',
          details: 'Clip generation completed but no clips were produced.',
        },
        { status: 500 }
      )
    }

    // Generate situational titles for all clips (deterministic, ensures uniqueness)
    const titleMap = generateTitlesForClips(clips)
    for (const clip of clips) {
      clip.title = titleMap.get(clip.id) || 'Practice Clip'
    }
    
    // Dev-only validation: log titles to verify they don't leak content
    if (process.env.NODE_ENV === 'development') {
      console.log('📋 [TITLES] Generated clip titles:')
      clips.forEach((c, idx) => {
        console.log(`  ${idx + 1}. ${c.difficulty || 'medium'}: "${c.title}"`)
        console.log(`     Text preview: ${c.text.substring(0, 40)}...`)
      })
    }

    // Determine source - should have been set during generation
    if (!determinedSource) {
      console.error('🔴 [ERROR] Source was not determined during generation!')
      console.error('🔴 [ERROR] useMockMode:', useMockMode, 'openai exists:', !!openai, 'clips.length:', clips.length)
      // This should never happen, but fallback to prevent undefined source
      determinedSource = useMockMode ? 'mock' : 'openai'
      console.error('🔴 [ERROR] Using fallback source:', determinedSource)
    }
    
    const source: 'mock' | 'openai' = determinedSource
    const modeLabel = source === 'mock' ? 'MOCK MODE' : 'REAL OPENAI'
    
    // Final validation - source must be valid
    if (source !== 'mock' && source !== 'openai') {
      console.error('🔴 [ERROR] Source is invalid after all checks:', source)
      return NextResponse.json(
        {
          error: 'Internal error: invalid clip source',
          code: 'INVALID_SOURCE',
          details: `Source validation failed: ${source}`,
        },
        { status: 500 }
      )
    }
    
    // Defensive check - source must be valid
    if (source !== 'mock' && source !== 'openai') {
      console.error('🔴 [ERROR] Invalid source value:', source)
      return NextResponse.json(
        {
          error: 'Internal error: invalid clip source',
          code: 'INVALID_SOURCE',
          details: `Clip generation completed but source is invalid: ${source}`,
        },
        { status: 500 }
      )
    }
    
    console.log(`✅ [${modeLabel}] Generated ${clips.length} clips successfully`)
    console.log(`✅ [${modeLabel}] Returning clips with source: ${source}`)
    console.log(`✅ [${modeLabel}] Response will be:`, { clipsCount: clips.length, source })
    console.log(`✅ [${modeLabel}] Clips with audio URLs:`)
    clips.forEach((c, idx) => {
      console.log(`  ${idx + 1}. ID: ${c.id}`)
      console.log(`     Audio URL: ${c.audioUrl}`)
      console.log(`     Expected: /audio/generated/${c.id}.mp3`)
      console.log(`     Match: ${c.audioUrl === `/audio/generated/${c.id}.mp3` ? '✅' : '❌'}`)
      console.log(`     Text: ${c.text.substring(0, 50)}...`)
    })
    
    // Optionally save to filesystem in dev mode only (not relied upon)
    if (process.env.NODE_ENV === 'development') {
      try {
        const { saveClip } = await import('@/lib/clipStorage')
        for (const clip of clips) {
          await saveClip(clip).catch((err) => {
            console.warn('Failed to save clip to filesystem (non-critical):', err)
          })
        }
      } catch (err) {
        // Ignore filesystem save failures
      }
    }

    const response = { clips, source }
    console.log(`✅ [${modeLabel}] Final response structure:`, { hasClips: !!response.clips, clipsLength: response.clips?.length, source: response.source })
    return NextResponse.json(response)
  } catch (error: any) {
    console.error('🔴 [ERROR] Unexpected error in clip generation:', error)
    return NextResponse.json(
      {
        error: 'Unexpected error occurred',
        code: 'UNEXPECTED_ERROR',
        details: error.message || 'Unknown error occurred',
      },
      { status: 500 }
    )
  }
}

// Health check endpoint to verify API key status
export async function GET(request: NextRequest) {
  const hasApiKey = !!process.env.OPENAI_API_KEY
  const useMockClips = process.env.USE_MOCK_CLIPS === 'true'
  
  return NextResponse.json({
    status: 'ok',
    openaiApiKeyPresent: hasApiKey,
    useMockClips,
    mode: useMockClips || !hasApiKey ? 'mock' : 'real',
  })
}

