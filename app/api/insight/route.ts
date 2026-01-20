import { NextRequest, NextResponse } from 'next/server'
import { generateCoachingInsight } from '@/lib/coachingInsights'
import type { AlignmentEvent } from '@/lib/alignmentEngine'

export const runtime = 'nodejs'

const cache = new Map<string, any>()

export async function POST(req: NextRequest) {
  try {
    const { event, transcript, userText, userLocale } = await req.json()

    if (!event?.eventId || !transcript || !userText) {
      return NextResponse.json({ error: 'Missing event/transcript/userText' }, { status: 400 })
    }

    const e = event as AlignmentEvent
    const cacheKey = `${e.eventId}:${transcript}:${userText}:${userLocale || 'en'}`
    const cached = cache.get(cacheKey)
    if (cached) return NextResponse.json(cached)

    const insight = await generateCoachingInsight({
      event: e,
      transcript,
      userText,
      userLocale: userLocale ?? 'en',
    })

    cache.set(cacheKey, insight)
    return NextResponse.json(insight)
  } catch (err) {
    console.error('insight route error', err)
    return NextResponse.json({ error: 'Failed to generate insight' }, { status: 500 })
  }
}



