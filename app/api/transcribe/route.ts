import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function POST(request: NextRequest) {
  try {
    console.log('🎤 [Transcribe] Request received')
    
    const formData = await request.formData()
    const audioFile = formData.get('audio') as File
    
    if (!audioFile) {
      console.error('❌ [Transcribe] No audio file provided')
      return NextResponse.json(
        { error: 'No audio file provided' },
        { status: 400 }
      )
    }

    console.log('🎤 [Transcribe] Audio file received:', {
      name: audioFile.name,
      type: audioFile.type,
      size: audioFile.size,
    })

    // Call OpenAI Whisper API
    const startTime = Date.now()
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      language: 'en', // Force English for this app
    })
    const duration = Date.now() - startTime

    console.log('✅ [Transcribe] Success:', {
      text: transcription.text,
      duration: `${duration}ms`,
    })

    return NextResponse.json({ 
      text: transcription.text,
      duration,
    })
  } catch (error: any) {
    console.error('❌ [Transcribe] Error:', error)
    return NextResponse.json(
      { 
        error: 'Transcription failed',
        message: error.message || 'Unknown error',
      },
      { status: 500 }
    )
  }
}




