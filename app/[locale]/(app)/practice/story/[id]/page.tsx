'use client'

import { useEffect } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { getStoryByIdClient } from '@/lib/storyClient'

export default function StoryRedirectPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const storyId = params.id as string | undefined

  useEffect(() => {
    if (!storyId) {
      router.replace('/practice/select')
      return
    }

    try {
      // Optional: clipIndex from query, default 0
      const clipIndexParam = searchParams.get('clipIndex')
      const index = clipIndexParam ? parseInt(clipIndexParam, 10) : 0

      const { story } = getStoryByIdClient(storyId)
      const clips = story?.clips || []

      if (!story || clips.length === 0) {
        console.warn('⚠️ [StoryRedirect] Story not found or has no clips:', { storyId })
        router.replace('/practice/select')
        return
      }

      const safeIndex = index >= 0 && index < clips.length ? index : 0
      const targetClip = clips[safeIndex]

      console.log('🔁 [StoryRedirect] Redirecting to respond page:', {
        storyId,
        clipId: targetClip.id,
        index: safeIndex,
      })

      router.replace(
        `/practice/respond?storyId=${storyId}&clipId=${targetClip.id}&clipIndex=${safeIndex}`
      )
    } catch (error) {
      console.error('❌ [StoryRedirect] Error during redirect:', error)
      router.replace('/practice/select')
    }
  }, [storyId, searchParams, router])

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="text-gray-500 text-sm">Loading your practice...</div>
    </main>
  )
}


