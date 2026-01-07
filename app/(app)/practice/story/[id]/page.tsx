'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Play, CheckCircle2, Clock } from 'lucide-react'
import { Story, StoryClip } from '@/lib/storyTypes'
import { getAudioGenerationQueue } from '@/lib/audioGenerationQueue'
import { generateTextHash } from '@/lib/audioHash'
import { getStoryByIdClient } from '@/lib/storyClient'

// Helper to format clip duration
const formatClipDuration = (startMs: number, endMs: number): string => {
  const durationSec = Math.round((endMs - startMs) / 1000)
  return `${durationSec}s`
}

// Helper to format focus skill badge
const formatFocusSkill = (skill?: string): string => {
  if (!skill) return 'General'
  return skill.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}

// Load completion state from localStorage
const getClipCompletion = (storyId: string, clipId: string): boolean => {
  if (typeof window === 'undefined') return false
  const key = `cue_done_${storyId}_${clipId}`
  return localStorage.getItem(key) === 'true'
}

// Load audio status and URL from localStorage with hash validation
const getClipAudioData = (clipId: string, currentTranscript: string): { audioUrl?: string; audioStatus?: StoryClip['audioStatus']; audioTextHash?: string; audioGeneratedFrom?: string } => {
  if (typeof window === 'undefined') return {}
  
  try {
    const userClips = localStorage.getItem('userClips')
    if (userClips) {
      const clips = JSON.parse(userClips)
      const clip = clips.find((c: any) => c.id === clipId)
      if (clip && clip.audioUrl) {
        // Validate hash match
        const currentHash = generateTextHash(currentTranscript)
        const storedHash = clip.audioTextHash
        
        if (storedHash && storedHash !== currentHash) {
          // Mismatch detected - audio was generated for different text
          console.warn(`⚠️ [AudioHash] Mismatch for clip ${clipId}: stored hash ${storedHash} !== current hash ${currentHash}`)
          return { audioStatus: 'needs_generation' } // Clear audioUrl by not returning it
        }
        
        return {
          audioUrl: clip.audioUrl,
          audioStatus: 'ready',
          audioTextHash: clip.audioTextHash,
          audioGeneratedFrom: clip.audioGeneratedFrom,
        }
      }
    }
  } catch (error) {
    console.error('Error loading clip audio data:', error)
  }
  
  return {}
}

export default function StoryDetailPage() {
  const params = useParams()
  const router = useRouter()
  const storyId = params.id as string

  const [story, setStory] = useState<Story | null>(null)
  const [clips, setClips] = useState<StoryClip[]>([])

  // Load story data, completion state, and audio status
  useEffect(() => {
    if (!storyId) {
      return
    }
    
    // Find the story from unified source (user stories -> mock fallback)
    const { story: foundStory, source } = getStoryByIdClient(storyId)
    if (foundStory) {
      console.log('✅ [StoryDetail] Loaded story by id:', {
        storyId,
        source,
        title: foundStory.title,
        clipCount: foundStory.clips.length,
      })
      setStory(foundStory)
      
      // Load completion state and audio data for each clip (with hash validation)
      const clipsWithState = foundStory.clips.map(clip => {
        const audioData = getClipAudioData(clip.id, clip.transcript)
        
        // If hash mismatch detected, clear audioUrl
        let finalAudioUrl = audioData.audioUrl || clip.audioUrl
        let finalAudioStatus = audioData.audioStatus || clip.audioStatus || 'needs_generation'
        
        if (audioData.audioStatus === 'needs_generation' && audioData.audioUrl) {
          // Hash mismatch - clear the audioUrl
          finalAudioUrl = undefined
          // Clear from localStorage too
          try {
            const userClips = localStorage.getItem('userClips')
            if (userClips) {
              const clips = JSON.parse(userClips)
              const clipIndex = clips.findIndex((c: any) => c.id === clip.id)
              if (clipIndex >= 0) {
                clips[clipIndex] = { ...clips[clipIndex], audioUrl: undefined, audioStatus: 'needs_generation' }
                localStorage.setItem('userClips', JSON.stringify(clips))
              }
            }
          } catch (error) {
            console.error('Error clearing mismatched audio:', error)
          }
        }
        
        return {
          ...clip,
          done: getClipCompletion(storyId, clip.id),
          audioUrl: finalAudioUrl,
          audioStatus: finalAudioStatus,
          audioTextHash: audioData.audioTextHash,
          audioGeneratedFrom: audioData.audioGeneratedFrom,
        }
      })
      
      setClips(clipsWithState)
    } else {
      console.warn('⚠️ [StoryDetail] Story not found for id:', storyId)
      setStory(null)
      setClips([])
    }
  }, [storyId])

  // Start audio generation for all clips that need it
  useEffect(() => {
    if (!story || !storyId || clips.length === 0) return

    const queue = getAudioGenerationQueue()
    let mounted = true

    // Queue all clips that need generation
    clips.forEach(clip => {
      const currentStatus = clip.audioStatus || 'needs_generation'
      if (currentStatus === 'needs_generation' && !queue.isProcessing(clip.id)) {
        // Set status to generating
        if (mounted) {
          setClips(prev => prev.map(c => 
            c.id === clip.id ? { ...c, audioStatus: 'generating' } : c
          ))
        }

        // Queue for generation
        queue.enqueue(
          {
            id: clip.id,
            storyId,
            transcript: clip.transcript,
            priority: 0,
          },
          (clipId, result) => {
            if (!mounted) return
            if ('audioUrl' in result) {
              // Success: update clip with audioUrl and ready status
              // Hash is already stored in localStorage by the queue
              const clip = clips.find(c => c.id === clipId)
              if (clip) {
                const textHash = generateTextHash(clip.transcript)
                setClips(prev => prev.map(c =>
                  c.id === clipId
                    ? { 
                        ...c, 
                        audioUrl: result.audioUrl, 
                        audioStatus: 'ready',
                        audioTextHash: textHash,
                        audioGeneratedFrom: clip.transcript.substring(0, 30).trim(),
                      }
                    : c
                ))
              }
            } else {
              // Error: set error status (after retries)
              setClips(prev => prev.map(c =>
                c.id === clipId ? { ...c, audioStatus: 'error' } : c
              ))
            }
          }
        )
      }
    })

    // Cleanup on unmount
    return () => {
      mounted = false
      // Don't clear queue - let it finish processing
    }
  }, [story?.id, storyId]) // Only run when story changes, not on every clip update

  // Use story.clips as fallback if clips state is empty (shouldn't happen, but safety check)
  const displayClips = clips.length > 0 ? clips : (story?.clips || [])
  
  // Check if all clips are done
  const allClipsDone = displayClips.length > 0 && displayClips.every(clip => clip.done)
  const completedCount = displayClips.filter(c => c.done).length

  // Handle clip navigation with priority generation (non-blocking)
  const handleClipSelect = (clipId: string, audioStatus?: StoryClip['audioStatus'], completed?: boolean) => {
    const clip = clips.find(c => c.id === clipId)
    if (!clip) return

    // Debug log
    console.log('🔍 [StoryDetail] Clip clicked:', {
      storyId,
      clipId,
      audioStatus: audioStatus || clip.audioStatus,
      completed: completed !== undefined ? completed : clip.done,
    })

    // If clip is not ready, prioritize it in the queue (non-blocking)
    if (clip.audioStatus !== 'ready' && clip.audioStatus !== 'generating') {
      const queue = getAudioGenerationQueue()
      
      // If not in queue yet, add it with high priority
      if (!queue.isProcessing(clip.id)) {
        setClips(prev => prev.map(c =>
          c.id === clipId ? { ...c, audioStatus: 'generating' } : c
        ))

        queue.enqueue(
          {
            id: clip.id,
            storyId,
            transcript: clip.transcript,
            priority: 1000, // High priority
          },
          (clipId, result) => {
            if ('audioUrl' in result) {
              // Hash is already stored in localStorage by the queue
              const clip = clips.find(c => c.id === clipId)
              if (clip) {
                const textHash = generateTextHash(clip.transcript)
                setClips(prev => prev.map(c =>
                  c.id === clipId
                    ? { 
                        ...c, 
                        audioUrl: result.audioUrl, 
                        audioStatus: 'ready',
                        audioTextHash: textHash,
                        audioGeneratedFrom: clip.transcript.substring(0, 30).trim(),
                      }
                    : c
                ))
              }
            } else {
              setClips(prev => prev.map(c =>
                c.id === clipId ? { ...c, audioStatus: 'error' } : c
              ))
            }
          }
        )
      } else {
        // Already in queue, just prioritize it
        queue.prioritize(clip.id)
      }
    } else if (clip.audioStatus === 'generating') {
      // Already generating, just prioritize it
      const queue = getAudioGenerationQueue()
      queue.prioritize(clip.id)
    }
    
    // Always navigate immediately (non-blocking)
    // The respond page will handle audio generation if needed
  }

  // Handle full story playback
  const handlePlayFullStory = () => {
    if (!story) return

    if (story.fullAudioUrl) {
      // Play full audio file if available
      const audio = new Audio(story.fullAudioUrl)
      audio.play().catch(err => {
        console.error('Error playing full story:', err)
        alert('Failed to play full story audio.')
      })
    } else {
      // Sequential playback of clips
      playClipsSequentially()
    }
  }

  const playClipsSequentially = () => {
    const clipsToPlay = clips.length > 0 ? clips : (story?.clips || [])
    if (clipsToPlay.length === 0) return

    let currentIndex = 0

    const playNextClip = () => {
      if (currentIndex >= clipsToPlay.length) {
        return
      }

      const clip = clipsToPlay[currentIndex]
      if (!clip.audioUrl) {
        currentIndex++
        playNextClip()
        return
      }

      const audio = new Audio(clip.audioUrl)
      
      audio.addEventListener('ended', () => {
        currentIndex++
        playNextClip()
      })

      audio.addEventListener('error', (err) => {
        console.error('Error playing clip:', err)
        currentIndex++
        playNextClip()
      })

      audio.play().catch(err => {
        console.error('Error playing clip audio:', err)
        currentIndex++
        playNextClip()
      })
    }

    playNextClip()
  }

  if (!story) {
    // Show loading state while params are being resolved
    if (!storyId) {
      return (
        <main className="flex min-h-screen flex-col px-6 py-6">
          <div className="text-center py-12">
            <p className="text-gray-500">Loading story...</p>
          </div>
        </main>
      )
    }
    
    return (
      <main className="flex min-h-screen flex-col px-6 py-6">
        <div className="text-center py-12">
          <p className="text-gray-500">Story not found</p>
          <Link href="/practice/select" className="text-blue-600 mt-4 inline-block">
            Back to stories
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen flex-col px-6 py-6">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/practice/select"
          className="text-blue-600 font-medium text-lg py-2 px-1 -ml-1 inline-flex items-center gap-1"
        >
          <ChevronLeft className="w-5 h-5" />
          Back
        </Link>
      </div>

      {/* Story Title */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{story.title}</h1>
        
        {/* Context Box */}
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl mb-4">
          <h2 className="font-semibold text-blue-900 mb-2">Context</h2>
          <p className="text-blue-800 text-sm leading-relaxed">{story.context}</p>
        </div>

        {/* Story Metadata */}
        <div className="flex items-center gap-3 text-sm text-gray-600 flex-wrap">
          <span className="px-2 py-1 bg-gray-100 rounded-full">
            {displayClips.length} clips
          </span>
          <span className="px-2 py-1 bg-gray-100 rounded-full">
            {Math.floor(story.durationSec / 60)}m {story.durationSec % 60}s
          </span>
          <span className="px-2 py-1 bg-gray-100 rounded-full capitalize">
            {story.difficulty}
          </span>
          {story.tags.length > 0 && (
            story.tags.map((tag, idx) => (
              <span key={idx} className="px-2 py-1 bg-gray-100 rounded-full">
                {tag}
              </span>
            ))
          )}
        </div>
      </div>

      {/* Progress Indicator */}
      {displayClips.length > 0 && (
        <div className="mb-4 p-3 bg-gray-50 rounded-xl">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-gray-700 font-medium">Progress</span>
            <span className="text-gray-600">{completedCount} / {displayClips.length} clips completed</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${displayClips.length > 0 ? (completedCount / displayClips.length) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Clips List */}
      <div className="flex-1 space-y-3 pb-6">
        <h2 className="text-lg font-semibold text-gray-900">Practice Clips</h2>
        {displayClips.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>No clips available for this story.</p>
            <p className="text-sm mt-2">Story has {story.clips?.length || 0} clips in data.</p>
          </div>
        ) : (
          displayClips.map((clip, index) => (
            <div
              key={clip.id}
              className="w-full rounded-xl border-2 border-gray-200 bg-white relative"
            >
              {/* Clip Number Badge */}
              <div className="absolute -top-2 -left-2 z-10 w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shadow-lg pointer-events-none">
                {index + 1}
              </div>

              {/* Done Badge */}
              {clip.done && (
                <div className="absolute -top-2 -right-2 z-10 w-7 h-7 rounded-full bg-green-500 text-white flex items-center justify-center shadow-lg pointer-events-none">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              )}

              {/* Simple Clip Cell - Always clickable via Link */}
              <Link
                href={`/practice/respond?storyId=${storyId}&clipId=${clip.id}`}
                onClick={() => handleClipSelect(clip.id, clip.audioStatus, clip.done)}
                className="block w-full text-left p-4 hover:bg-gray-50 active:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all"
              >
                <div className="flex items-center justify-between gap-4">
                  {/* Clip Info */}
                  <div className="flex-1 min-w-0 space-y-2">
                    {/* Clip Title (first line of transcript) */}
                    <p className="font-medium text-gray-900 line-clamp-2">
                      {clip.transcript.split('\n')[0] || clip.transcript}
                    </p>
                    
                    {/* Tags and Metadata */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {clip.focusSkill && (
                        <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full pointer-events-none">
                          {formatFocusSkill(clip.focusSkill)}
                        </span>
                      )}
                      <span className="text-xs text-gray-500 flex items-center gap-1 pointer-events-none">
                        <Clock className="w-3 h-3" />
                        {formatClipDuration(clip.startMs, clip.endMs)}
                      </span>
                      
                      {/* Status Badge */}
                      {clip.done ? (
                        <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-medium pointer-events-none">
                          Done
                        </span>
                      ) : clip.audioStatus === 'ready' ? (
                        <span className="text-xs px-2 py-0.5 bg-green-50 text-green-700 rounded-full font-medium pointer-events-none">
                          Ready
                        </span>
                      ) : clip.audioStatus === 'generating' ? (
                        <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full pointer-events-none">
                          Preparing...
                        </span>
                      ) : clip.audioStatus === 'error' ? (
                        <span className="text-xs px-2 py-0.5 bg-yellow-50 text-yellow-700 rounded-full pointer-events-none">
                          Error
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full pointer-events-none">
                          Pending
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Arrow Icon */}
                  <div className="flex-shrink-0 pointer-events-none">
                    <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </Link>
            </div>
          ))
        )}
      </div>

      {/* Play Full Story Button */}
      <div className="pt-6 pb-6 border-t border-gray-200">
        {allClipsDone ? (
          <button
            onClick={handlePlayFullStory}
            className="w-full py-4 px-6 rounded-xl font-semibold text-lg transition-colors flex items-center justify-center gap-2 bg-blue-600 text-white active:bg-blue-700 shadow-lg"
          >
            <Play className="w-5 h-5" />
            Play Full Conversation
          </button>
        ) : (
          <div className="w-full py-4 px-6 rounded-xl bg-gray-100 text-gray-600 text-center font-medium">
            Complete all clips to unlock full conversation
            <div className="text-sm mt-1 text-gray-500">
              {completedCount} / {displayClips.length} clips completed
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
