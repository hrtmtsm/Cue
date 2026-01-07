'use client'

import { useState, useRef, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { ChevronLeft, AlertCircle } from 'lucide-react'
import Link from 'next/link'
import AudioWaveLine from '@/components/AudioWaveLine'
import Snackbar from '@/components/Snackbar'
import FullScreenLoader from '@/components/FullScreenLoader'
import TopStatusSnackbar from '@/components/TopStatusSnackbar'
import { getStoryByIdClient } from '@/lib/storyClient'
import { getAudioMetadata, generateAudio } from '@/lib/audioApi'

interface PracticeData {
  audioUrl: string
  transcript: string
}

// Mock data - removed quick.mp3 fallback
// Clips should always come from localStorage/sessionStorage or be generated
const mockPracticeData: Record<string, PracticeData> = {
  '1': {
    audioUrl: '/audio/clip1.mp3',
    transcript: 'Can I get a large coffee with oat milk, please?',
  },
  '2': {
    audioUrl: '/audio/clip2.mp3',
    transcript: 'Tell me about your previous work experience and why you\'re interested in this role.',
  },
  '3': {
    audioUrl: '/audio/clip3.mp3',
    transcript: 'Nice weather today, isn\'t it? Perfect for a walk in the park.',
  },
  '4': {
    audioUrl: '/audio/clip4.mp3',
    transcript: 'I\'d like to order the pasta with marinara sauce and a side salad.',
  },
}

function RespondPageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  
  // Support both old clip-based routing, story-based routing, and session-based routing
  const clipId = searchParams.get('clip')
  const storyId = searchParams.get('storyId')
  const storyClipId = searchParams.get('clipId') // Clip ID within a story
  const sessionId = searchParams.get('session') || 'quick'
  const phraseIndex = parseInt(searchParams.get('index') || '0', 10)
  const phraseId = searchParams.get('phraseId')
  const focusInsightId = searchParams.get('focusInsightId')
  
  const [inputMode, setInputMode] = useState<'type' | 'speak'>('type')
  const [userInput, setUserInput] = useState('')
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLooping, setIsLooping] = useState(!!focusInsightId) // Auto-enable loop if focused
  const [voiceMode, setVoiceMode] = useState<'generated' | 'device'>('generated')
  const [playBlockedHint, setPlayBlockedHint] = useState(false) // subtle autoplay hint only
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [uiPhase, setUiPhase] = useState<'boot' | 'checking' | 'generating' | 'ready' | 'error' | 'waiting_transcript'>('boot')
  const [loaderStartTime, setLoaderStartTime] = useState<number | null>(null)
  const [snackbarOpen, setSnackbarOpen] = useState(false)
  const snackbarTimerRef = useRef<NodeJS.Timeout | null>(null)
  const snackbarVisibleSinceRef = useRef<number | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const ttsRef = useRef<SpeechSynthesisUtterance | null>(null)
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const hasTriggeredGenerationRef = useRef<string | null>(null) // Key: clipId+variantKey+hash
  const initialLoadCompleteRef = useRef<boolean>(false) // Track if initial load is complete (once true, never show full-screen loader again)
  const [userPlayToastOpen, setUserPlayToastOpen] = useState(false) // Toast for user-triggered play attempts
  const userPlayToastTimerRef = useRef<NodeJS.Timeout | null>(null)
  const objectUrlRef = useRef<string | null>(null) // Track object URLs for cleanup
  const userInitiatedPlayRef = useRef<boolean>(false) // Track if user actually attempted playback
  const [practiceData, setPracticeData] = useState<PracticeData & { audioStatus?: 'ready' | 'needs_generation' | 'error' | 'generating' }>({
    audioUrl: '',
    transcript: 'Loading...',
    audioStatus: 'needs_generation',
  })
  
  // Single source of truth for audioStatus
  const audioStatus = practiceData?.audioStatus ?? 'needs_generation'
  
  // Get clipId from query params (required)
  const effectiveClipId = storyClipId || clipId

  // Single derived state for UI busy/loading (used to disable buttons, NOT to show spinners)
  // Buttons should be disabled when busy, but never show spinners (only global indicators show loading)
  const uiBusy = uiPhase === 'boot' || uiPhase === 'checking' || uiPhase === 'generating'

  // Define playability in one place: audio is ready and has URL
  const isPlayable = audioStatus === 'ready' && !!practiceData?.audioUrl

  // UI Phase transitions based on audioStatus
  useEffect(() => {
    if (audioStatus === 'ready') {
      // Apply minimum loader display time before transitioning to ready
      if (loaderStartTime !== null) {
        const elapsed = performance.now() - loaderStartTime
        const minDuration = 300
        if (elapsed >= minDuration) {
          setUiPhase('ready')
          initialLoadCompleteRef.current = true // Mark initial load as complete
        } else {
          const delay = minDuration - elapsed
          setTimeout(() => {
            setUiPhase('ready')
            initialLoadCompleteRef.current = true // Mark initial load as complete
          }, delay)
        }
      } else {
        setUiPhase('ready')
        initialLoadCompleteRef.current = true // Mark initial load as complete
      }
    } else if (audioStatus === 'generating') {
      // Only transition to generating if initial load is complete
      // Otherwise stay in boot/checking
      if (initialLoadCompleteRef.current) {
        setUiPhase('generating')
      }
    } else if (audioStatus === 'error') {
      setUiPhase('error')
      initialLoadCompleteRef.current = true // Mark initial load as complete even on error
    } else if (audioStatus === 'needs_generation') {
      // If we're still in boot/checking, stay there; otherwise move to generating (only if initial load complete)
      if (uiPhase === 'boot' || uiPhase === 'checking') {
        // Stay in checking while we trigger generation
      } else if (initialLoadCompleteRef.current) {
        setUiPhase('generating')
      }
    }
  }, [audioStatus, loaderStartTime, uiPhase])

  // Snackbar debouncing - only show ERROR if state persists > 350ms, and keep visible at least 600ms
  useEffect(() => {
    // Clear any existing timer
    if (snackbarTimerRef.current) {
      clearTimeout(snackbarTimerRef.current)
      snackbarTimerRef.current = null
    }

    // Only show snackbar for 'error' status (with debounce)
    // Don't show for 'waiting_transcript' - that's not an error
    if (uiPhase === 'error' && audioStatus === 'error') {
      snackbarTimerRef.current = setTimeout(() => {
        setSnackbarOpen(true)
        snackbarVisibleSinceRef.current = Date.now()
      }, 350)
    } else {
      // Close snackbar for non-error states, but respect minimum visible duration if already shown
      if (snackbarVisibleSinceRef.current !== null) {
        const elapsedVisible = Date.now() - snackbarVisibleSinceRef.current
        const minVisible = 600
        if (elapsedVisible < minVisible) {
          const remaining = minVisible - elapsedVisible
          snackbarTimerRef.current = setTimeout(() => {
            setSnackbarOpen(false)
            snackbarVisibleSinceRef.current = null
          }, remaining)
          return
        }
      }
      setSnackbarOpen(false)
      snackbarVisibleSinceRef.current = null
    }

    return () => {
      if (snackbarTimerRef.current) {
        clearTimeout(snackbarTimerRef.current)
        snackbarTimerRef.current = null
      }
    }
  }, [uiPhase])

  // Polling function for generating status
  const startPolling = (clipId: string, transcript: string) => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current)
    }

    pollingIntervalRef.current = setInterval(async () => {
      try {
        const metadata = await getAudioMetadata(clipId, transcript, 'clean_normal')
        
        if (metadata.audioStatus === 'ready' && metadata.audioUrl) {
          // Stop polling and set audio
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current)
            pollingIntervalRef.current = null
          }
          setPracticeData(prev => ({
            ...prev,
            audioUrl: metadata.audioUrl!,
            audioStatus: 'ready',
          }))
          console.log('✅ [RespondPage] Phase: ready (polling complete)')
        } else if (metadata.audioStatus === 'error') {
          // Stop polling on error (only if DB explicitly returns error)
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current)
            pollingIntervalRef.current = null
          }
          // STRUCTURED LOG: Error trigger point
          console.error('🔴 [AUDIO_FLOW] ERROR TRIGGERED:', {
            reason: 'startPolling_metadata_error',
            transcriptLength: transcript.length,
            audioStatus: 'error',
            audioUrl: metadata.audioUrl || practiceData?.audioUrl || null,
            audioRefSrc: audioRef.current?.src || null,
            audioRefCurrentSrc: audioRef.current?.currentSrc || null,
            audioRefErrorCode: audioRef.current?.error?.code || null,
            lastMetadataStatus: metadata.audioStatus,
            lastMetadataUrl: metadata.audioUrl || null,
          })
          setPracticeData(prev => ({
            ...prev,
            audioStatus: 'error',
          }))
          setErrorMessage('Audio generation failed. Please try again.')
          console.error('❌ [RespondPage] Phase: error (polling failed)')
        }
        // Continue polling if still generating
      } catch (error: any) {
        console.error('❌ [RespondPage] Error during polling:', error)
      }
    }, 1000) // Poll every 1 second
  }

  // Trigger audio generation (with guard to prevent repeated calls)
  const triggerGeneration = async (clipId: string, transcript: string, storyId: string | null) => {
    // Validate transcript before proceeding
    if (!transcript || transcript.trim() === '') {
      console.warn('⚠️ [RespondPage] Cannot trigger generation: transcript is empty', { clipId })
      // STRUCTURED LOG: Error trigger point
      console.error('🔴 [AUDIO_FLOW] ERROR TRIGGERED:', {
        reason: 'triggerGeneration_transcript_empty',
        transcriptLength: 0,
        audioStatus: 'error',
        audioUrl: practiceData?.audioUrl || null,
        audioRefSrc: audioRef.current?.src || null,
        audioRefCurrentSrc: audioRef.current?.currentSrc || null,
        audioRefErrorCode: audioRef.current?.error?.code || null,
        lastMetadataStatus: 'N/A',
        lastMetadataUrl: 'N/A',
        clipId,
      })
      setPracticeData(prev => ({
        ...prev,
        audioStatus: 'error',
      }))
      setErrorMessage('Transcript not available. Cannot generate audio.')
      return
    }
    
    // Generate unique key for this generation request
    const generationKey = `${clipId}_clean_normal_${transcript.substring(0, 30)}`
    
    // Guard: don't trigger if already triggered for this clip/transcript
    if (hasTriggeredGenerationRef.current === generationKey) {
      return
    }
    
    hasTriggeredGenerationRef.current = generationKey
    
    // Set generating status immediately
    setPracticeData(prev => ({
      ...prev,
      audioStatus: 'generating',
    }))
    
    try {
      // Try streaming first for faster time-to-first-audio
      const { streamAudio } = await import('@/lib/audioApi')
      const streamResult = await streamAudio(clipId, transcript, 'clean_normal', true)
      
      if (streamResult.success && streamResult.stream) {
        // Stream available - convert to blob URL for immediate playback
        console.log('🎵 [RespondPage] Streaming audio - converting stream to blob...')
        
        try {
          // Convert ReadableStream to Blob
          const reader = streamResult.stream.getReader()
          const chunks: Uint8Array[] = []
          
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            if (value) {
              chunks.push(value)
            }
          }
          
          // Combine chunks into Blob (cast to BlobPart[] to satisfy TypeScript)
          const audioBlob = new Blob(chunks as BlobPart[], { type: 'audio/mpeg' })
          
          // Create object URL for immediate playback
          // CRITICAL: blob: URLs are ephemeral and must NEVER be persisted
          // Use blob: URL ONLY as temporary in-memory playback source
          const objectUrl = URL.createObjectURL(audioBlob)
          
          // Clean up any previous object URL
          if (objectUrlRef.current) {
            URL.revokeObjectURL(objectUrlRef.current)
          }
          objectUrlRef.current = objectUrl
          
          // Set audio URL immediately for temporary playback
          // On refresh, this blob: URL will not work - prefer persisted https URL
          setPracticeData(prev => ({
            ...prev,
            audioUrl: objectUrl, // Temporary blob: URL for immediate playback only
            audioStatus: 'ready',
          }))
          console.log('✅ [RespondPage] Phase: ready (streaming complete, using temporary blob: URL for immediate playback)')
          console.log('⚠️ [RespondPage] Note: blob: URL is ephemeral - will not work on refresh. Prefer persisted https URL.')
          
          // Background upload to blob storage happens automatically via cache=true
          // No polling needed - we have the audio ready
          return
        } catch (streamError: any) {
          console.error('❌ [RespondPage] Stream conversion error:', streamError)
          // Fall through to non-streaming path
        }
      } else if (streamResult.success && !streamResult.stream) {
        // Redirected to cached https URL - fetch the URL from metadata
        // This means audio is already cached with durable https URL
        const { getAudioMetadata } = await import('@/lib/audioApi')
        const metadata = await getAudioMetadata(clipId, transcript, 'clean_normal')
        if (metadata.audioUrl && metadata.audioUrl.startsWith('https://')) {
          // Prefer persisted https URL over temporary blob: URL
          setPracticeData(prev => ({
            ...prev,
            audioUrl: metadata.audioUrl!, // Durable https URL
            audioStatus: 'ready',
          }))
          console.log('✅ [RespondPage] Phase: ready (using cached https URL)')
          return
        }
        // Fall through if metadata fetch fails or returns invalid URL
      }
      
      // Fallback to non-streaming generation if streaming failed
      console.log('🔄 [RespondPage] Falling back to non-streaming generation...')
      const result = await generateAudio(clipId, transcript, 'clean_normal')
      
      if (result.success && result.audioUrl) {
        // Generation complete - use audioUrl immediately (no polling needed)
        setPracticeData(prev => ({
          ...prev,
          audioUrl: result.audioUrl!,
          audioStatus: 'ready',
        }))
        console.log('✅ [RespondPage] Phase: ready (generation complete, using direct URL)')
        // Skip polling - we have the URL directly
      } else if (result.success && !result.audioUrl) {
        // Generation started but no URL yet - start polling as fallback
        console.log('✅ [RespondPage] Phase: generating (triggered, polling for URL)')
        startPolling(clipId, transcript)
      } else {
        // Generation API explicitly failed - set error
        // STRUCTURED LOG: Error trigger point
        console.error('🔴 [AUDIO_FLOW] ERROR TRIGGERED:', {
          reason: 'triggerGeneration_api_failed',
          transcriptLength: transcript.length,
          audioStatus: 'error',
          audioUrl: practiceData?.audioUrl || null,
          audioRefSrc: audioRef.current?.src || null,
          audioRefCurrentSrc: audioRef.current?.currentSrc || null,
          audioRefErrorCode: audioRef.current?.error?.code || null,
          lastMetadataStatus: 'N/A',
          lastMetadataUrl: 'N/A',
          apiResponse: { success: result.success, error: result.error, message: result.message },
        })
        setPracticeData(prev => ({
          ...prev,
          audioStatus: 'error',
        }))
        setErrorMessage(result.message || result.error || 'Failed to generate audio')
        console.error('❌ [RespondPage] Phase: error (generation failed)')
        hasTriggeredGenerationRef.current = null // Allow retry
      }
    } catch (error: any) {
      // Generation API error - set error
      // STRUCTURED LOG: Error trigger point
      console.error('🔴 [AUDIO_FLOW] ERROR TRIGGERED:', {
        reason: 'triggerGeneration_exception',
        transcriptLength: transcript.length,
        audioStatus: 'error',
        audioUrl: practiceData?.audioUrl || null,
        audioRefSrc: audioRef.current?.src || null,
        audioRefCurrentSrc: audioRef.current?.currentSrc || null,
        audioRefErrorCode: audioRef.current?.error?.code || null,
        lastMetadataStatus: 'N/A',
        lastMetadataUrl: 'N/A',
        exceptionMessage: error.message,
        exceptionStack: error.stack,
      })
      setPracticeData(prev => ({
        ...prev,
        audioStatus: 'error',
      }))
      setErrorMessage(error.message || 'Failed to generate audio')
      console.error('❌ [RespondPage] Phase: error (generation exception)')
      hasTriggeredGenerationRef.current = null // Allow retry
    }
  }
  
  // Load transcript from story data, then fetch audio status from DB
  useEffect(() => {
    if (typeof window === 'undefined') return

    try {
      // Reset state when clipId changes
      // Only show full-screen loader if initial load hasn't been completed yet
      if (!initialLoadCompleteRef.current) {
        setUiPhase('boot')
        setLoaderStartTime(performance.now())
      } else {
        // If initial load is complete, still update phase but don't show full-screen loader
        setUiPhase('checking')
      }
      setErrorMessage(null)
      hasTriggeredGenerationRef.current = null
      userInitiatedPlayRef.current = false // Reset play flag on clipId change
      
      // Stop any existing polling
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
        pollingIntervalRef.current = null
      }
      
      if (!effectiveClipId) {
        // STRUCTURED LOG: Error trigger point
        console.error('🔴 [AUDIO_FLOW] ERROR TRIGGERED:', {
          reason: 'useEffect_no_clipId',
          transcriptLength: 0,
          audioStatus: 'error',
          audioUrl: null,
          audioRefSrc: audioRef.current?.src || null,
          audioRefCurrentSrc: audioRef.current?.currentSrc || null,
          audioRefErrorCode: audioRef.current?.error?.code || null,
          lastMetadataStatus: 'N/A',
          lastMetadataUrl: 'N/A',
        })
        setPracticeData({
          audioUrl: '',
          transcript: 'No clip selected. Please select a clip from the practice list.',
          audioStatus: 'error',
        })
        setUiPhase('error')
        return
      }

    // Step 1: Get transcript from story data (if storyId provided) or fallback
    let transcript = ''
    let foundClip = false

    if (storyId && storyClipId) {
      const { story, source } = getStoryByIdClient(storyId)
      if (story) {
        const clip = story.clips.find(c => c.id === storyClipId)
        if (clip) {
          transcript = clip.transcript
          foundClip = true
        }
      }
    }

    // Fallback: Try to get transcript from legacy sources (for backward compatibility)
    if (!foundClip && clipId) {
      try {
        const storedClip = sessionStorage.getItem(`clip_${clipId}`)
        if (storedClip) {
          const clip = JSON.parse(storedClip)
          transcript = clip.text || ''
          foundClip = true
        }
      } catch (error) {
        // Silent fail
      }
    }

    if (!foundClip) {
      // STRUCTURED LOG: Error trigger point
      console.error('🔴 [AUDIO_FLOW] ERROR TRIGGERED:', {
        reason: 'useEffect_clip_not_found',
        transcriptLength: 0,
        audioStatus: 'error',
        audioUrl: null,
        audioRefSrc: audioRef.current?.src || null,
        audioRefCurrentSrc: audioRef.current?.currentSrc || null,
        audioRefErrorCode: audioRef.current?.error?.code || null,
        lastMetadataStatus: 'N/A',
        lastMetadataUrl: 'N/A',
        effectiveClipId,
        storyId,
        storyClipId,
      })
      setPracticeData({
        audioUrl: '',
        transcript: 'Clip not found. Please select a clip from the practice list.',
        audioStatus: 'error',
      })
      setUiPhase('error')
      return
    }

    // Step 2: Set transcript (may be empty temporarily)
    setPracticeData(prev => ({
      ...prev,
      transcript: transcript || '',
      audioStatus: 'needs_generation', // Will be updated by getAudioMetadata
    }))

    // Step 3: Fetch audio metadata from Supabase (single source of truth)
    // Allow empty transcript - server will use fallback to return latest ready audio
    const loadAudioMetadata = async () => {
      // STRUCTURED LOG: Metadata call start
      console.log('📞 [AUDIO_FLOW] loadAudioMetadata called:', {
        reason: 'initial_load',
        transcriptLength: transcript?.length || 0,
        effectiveClipId,
        currentAudioStatus: practiceData?.audioStatus || 'unknown',
        currentAudioUrl: practiceData?.audioUrl || null,
      })
      try {
        // Call with transcript (may be empty) - server will handle fallback
        const metadata = await getAudioMetadata(effectiveClipId, transcript || '', 'clean_normal')
        
        // STRUCTURED LOG: Metadata response
        console.log('📥 [AUDIO_FLOW] loadAudioMetadata response:', {
          reason: 'metadata_received',
          transcriptLength: transcript?.length || 0,
          metadataStatus: metadata.audioStatus,
          metadataUrl: metadata.audioUrl ? metadata.audioUrl.substring(0, 80) + '...' : null,
          effectiveClipId,
        })

        if (metadata.audioStatus === 'ready' && metadata.audioUrl) {
          // Audio is ready - set it (even if transcript was empty, we got cached audio)
          setPracticeData(prev => ({
            ...prev,
            audioUrl: metadata.audioUrl!,
            audioStatus: 'ready',
          }))
          console.log('✅ [RespondPage] Phase: ready (metadata loaded)')
          setUiPhase('ready')
        } else if (metadata.audioStatus === 'generating') {
          // Audio is generating - start polling (only if transcript available)
          if (transcript && transcript.trim() !== '') {
            setPracticeData(prev => ({
              ...prev,
              audioStatus: 'generating',
            }))
            console.log('✅ [RespondPage] Phase: generating (metadata says generating)')
            setUiPhase('generating')
            startPolling(effectiveClipId, transcript)
          } else {
            // Transcript empty but audio is generating - wait for transcript
            console.log('⏳ [RespondPage] Phase: waiting_transcript (audio generating but transcript empty)')
            setUiPhase('waiting_transcript')
          }
        } else if (metadata.audioStatus === 'needs_generation') {
          // Audio needs generation - auto-trigger (only if transcript is valid)
          if (transcript && transcript.trim() !== '') {
            setPracticeData(prev => ({
              ...prev,
              audioStatus: 'needs_generation',
            }))
            console.log('✅ [RespondPage] Phase: generating (auto-triggering)')
            setUiPhase('generating')
            await triggerGeneration(effectiveClipId, transcript, storyId)
          } else {
            // Transcript empty - wait for it, don't show error
            console.log('⏳ [RespondPage] Phase: waiting_transcript (needs generation but transcript empty)')
            setUiPhase('waiting_transcript')
            setPracticeData(prev => ({
              ...prev,
              audioStatus: 'needs_generation',
            }))
            // Don't set error message - this is expected when transcript loads later
          }
        } else if (metadata.audioStatus === 'error') {
          // Audio generation failed - only if DB explicitly returns error
          // STRUCTURED LOG: Error trigger point
          console.error('🔴 [AUDIO_FLOW] ERROR TRIGGERED:', {
            reason: 'loadAudioMetadata_db_error',
            transcriptLength: transcript.length,
            audioStatus: 'error',
            audioUrl: metadata.audioUrl || practiceData?.audioUrl || null,
            audioRefSrc: audioRef.current?.src || null,
            audioRefCurrentSrc: audioRef.current?.currentSrc || null,
            audioRefErrorCode: audioRef.current?.error?.code || null,
            lastMetadataStatus: metadata.audioStatus,
            lastMetadataUrl: metadata.audioUrl || null,
          })
          setPracticeData(prev => ({
            ...prev,
            audioStatus: 'error',
          }))
          setErrorMessage('Audio generation failed. Please try again.')
          console.error('❌ [RespondPage] Phase: error (metadata says error)')
          setUiPhase('error')
        } else {
          // Unknown status - set to checking
          setUiPhase('checking')
        }
      } catch (error: any) {
        console.error('❌ [RespondPage] Phase: error (metadata fetch failed)')
        // Only set error if transcript is available (real error)
        // If transcript is empty, this might be expected
        if (transcript && transcript.trim() !== '') {
          // STRUCTURED LOG: Error trigger point
          console.error('🔴 [AUDIO_FLOW] ERROR TRIGGERED:', {
            reason: 'loadAudioMetadata_fetch_failed',
            transcriptLength: transcript.length,
            audioStatus: 'error',
            audioUrl: practiceData?.audioUrl || null,
            audioRefSrc: audioRef.current?.src || null,
            audioRefCurrentSrc: audioRef.current?.currentSrc || null,
            audioRefErrorCode: audioRef.current?.error?.code || null,
            lastMetadataStatus: 'N/A (fetch failed)',
            lastMetadataUrl: 'N/A',
            exceptionMessage: error.message,
            exceptionStack: error.stack,
          })
          setPracticeData(prev => ({
            ...prev,
            audioStatus: 'error',
          }))
          setErrorMessage(error.message || 'Failed to load audio status')
          setUiPhase('error')
        } else {
          // Transcript empty - wait for it
          console.log('⏳ [RespondPage] Phase: waiting_transcript (metadata fetch failed but transcript empty)')
          setUiPhase('waiting_transcript')
        }
      }
    }

    // Set initial phase based on transcript availability
    if (!transcript || transcript.trim() === '') {
      setUiPhase('waiting_transcript')
      userInitiatedPlayRef.current = false // Reset play flag when waiting for transcript
      console.log('⏳ [RespondPage] Transcript empty, setting phase to waiting_transcript')
    } else {
      setUiPhase('checking')
      userInitiatedPlayRef.current = false // Reset play flag when checking
    }

    loadAudioMetadata()
    } catch (error: any) {
      console.error('❌ [RespondPage] Error in useEffect:', error)
      // STRUCTURED LOG: Error trigger point
      console.error('🔴 [AUDIO_FLOW] ERROR TRIGGERED:', {
        reason: 'useEffect_exception',
        transcriptLength: practiceData?.transcript?.length || 0,
        audioStatus: 'error',
        audioUrl: null,
        audioRefSrc: audioRef.current?.src || null,
        audioRefCurrentSrc: audioRef.current?.currentSrc || null,
        audioRefErrorCode: audioRef.current?.error?.code || null,
        lastMetadataStatus: 'N/A',
        lastMetadataUrl: 'N/A',
        exceptionMessage: error.message,
        exceptionStack: error.stack,
      })
      setPracticeData({
        audioUrl: '',
        transcript: 'Error loading clip. Please try again.',
        audioStatus: 'error',
      })
      setUiPhase('error')
      setErrorMessage(error.message || 'Failed to load clip')
    }

    // Cleanup polling on unmount
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
        pollingIntervalRef.current = null
      }
    }
  }, [effectiveClipId, storyId, storyClipId, clipId])

  // Get focus insight title for banner (simplified - in real app, would fetch from API)
  const focusInsightTitle = focusInsightId ? (
    focusInsightId.includes('connected') ? 'Connected speech' :
    focusInsightId.includes('function') ? 'Function words' :
    focusInsightId.includes('speed') ? 'Speed & chunking' :
    'Focus practice'
  ) : null

  useEffect(() => {
    // Create/refresh Audio() instance whenever audioUrl becomes available (isPlayable)
    // Ensure Audio() is created whenever audioUrl becomes available
    if (!isPlayable) {
      // Clean up audio if not playable
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
        audioRef.current.load()
        audioRef.current = null
      }
      return
    }

    const resolvedAudioUrl = practiceData?.audioUrl
    if (!resolvedAudioUrl) {
      return
    }

    // Validate audioUrl format (must be http/https/blob URL)
    if (!resolvedAudioUrl.startsWith('http') && !resolvedAudioUrl.startsWith('blob:')) {
      console.warn('⚠️ [RespondPage] Invalid audioUrl format, skipping Audio element creation:', {
        audioUrl: resolvedAudioUrl.substring(0, 80) + '...',
      })
      return
    }

    if (typeof window !== 'undefined') {
      console.log('🔊 [RespondPage] Creating audio element with URL:', resolvedAudioUrl.substring(0, 80) + '...')

      // Cleanup previous audio element
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
        audioRef.current.load()
        audioRef.current = null
      }

      // ✅ ONLY revoke if it's a DIFFERENT blob URL than the one we're about to use
      // ❌ DON'T revoke the URL we're about to use!
      if (objectUrlRef.current && objectUrlRef.current !== resolvedAudioUrl) {
        console.log('🧹 [RespondPage] Revoking old blob URL (different from current)')
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }
      
      // Reset state
      setPracticeData(prev => ({ ...prev, audioStatus: 'ready' }))
      setVoiceMode('generated')
      setPlayBlockedHint(false)
      userInitiatedPlayRef.current = false // Reset play flag when creating new Audio element (audioUrl changed)
      
      // Create new audio element with preload enabled for faster playback
      const audio = new Audio(resolvedAudioUrl)
      audio.preload = 'auto' // Enable preloading for faster perceived speed
      
      // Ensure src is explicitly set (constructor should do this, but be explicit)
      if (!audio.src || audio.src.trim() === '') {
        console.log('🔧 [AUDIO_FLOW] Audio src is empty after constructor, setting explicitly')
        audio.src = resolvedAudioUrl
      }
      
      audioRef.current = audio
      
      // Track this blob URL for later cleanup
      if (resolvedAudioUrl.startsWith('blob:')) {
        objectUrlRef.current = resolvedAudioUrl
      }
      
      // Call audio.load() to start preloading immediately
      // This ensures audio is ready when user clicks play
      console.log('📥 [AUDIO_FLOW] Calling audio.load() to start preloading, src:', audio.src.substring(0, 80) + '...')
      audio.load()
      
      // Store event handlers for cleanup
      const handleAudioError = async (e: Event) => {
        const audioEl = e.target as HTMLAudioElement
        
        // Only handle error if this is still the current audio element
        if (audioRef.current !== audio) {
          return
        }
        
        // Only set error if user actually initiated playback
        if (!userInitiatedPlayRef.current) {
          console.warn('⚠️ [RespondPage] Audio error event but user did not initiate play - ignoring', {
            errorCode: audioEl.error?.code,
            currentSrc: audioEl.currentSrc?.substring(0, 80) + '...',
            networkState: audioEl.networkState,
            readyState: audioEl.readyState,
          })
          setIsPlaying(false)
          return
        }
        
        // Ignore MEDIA_ERR_ABORTED (error code 1) - common during src swaps/cleanup
        if (audioEl.error?.code === 1) {
          console.warn('⚠️ [RespondPage] Audio error MEDIA_ERR_ABORTED - ignoring (likely cleanup)', {
            currentSrc: audioEl.currentSrc?.substring(0, 80) + '...',
          })
          setIsPlaying(false)
          return
        }
        
        // Only set error if currentSrc is non-empty (audio was actually trying to load)
        if (!audioEl.currentSrc || audioEl.currentSrc.trim() === '') {
          console.warn('⚠️ [RespondPage] Audio error event but currentSrc is empty - ignoring')
          setIsPlaying(false)
          return
        }
        
        // Log detailed error information
        const error = audioEl.error
        console.error('🔴 [RespondPage] Audio element error:', {
          errorCode: error?.code,
          errorMessage: error?.message,
          currentSrc: audioEl.currentSrc,
          src: audioEl.src,
          networkState: audioEl.networkState, // 0=EMPTY, 1=IDLE, 2=LOADING, 3=NO_SOURCE
          readyState: audioEl.readyState, // 0=HAVE_NOTHING, 1=HAVE_METADATA, 2=HAVE_CURRENT_DATA, 3=HAVE_FUTURE_DATA, 4=HAVE_ENOUGH_DATA
          audioStatus,
          audioUrl: practiceData?.audioUrl?.substring(0, 80) + '...',
          userInitiatedPlay: userInitiatedPlayRef.current,
        })
        
        // Try to fetch the URL to see if it's accessible
        fetch(audioEl.src)
          .then(response => {
            console.log('✅ [RespondPage] Audio URL is accessible:', {
              url: audioEl.src.substring(0, 80) + '...',
              status: response.status,
              contentType: response.headers.get('content-type'),
            })
          })
          .catch(fetchError => {
            console.error('🔴 [RespondPage] Audio URL fetch failed:', {
              url: audioEl.src.substring(0, 80) + '...',
              error: fetchError.message,
            })
          })
        
        // Validate the URL by fetching it with Range header
        let shouldSetError = false
        try {
          const response = await fetch(audioEl.currentSrc, {
            method: 'GET',
            headers: { 'Range': 'bytes=0-1' },
            cache: 'no-cache',
          })
          
          const contentType = response.headers.get('content-type')
          const isAudioContent = contentType?.startsWith('audio/') ?? false
          
          if (!response.ok || !isAudioContent) {
            // URL is not accessible or not audio content - true media error
            console.error('🔴 [RespondPage] Audio URL validation failed (true media error):', {
              url: audioEl.currentSrc.substring(0, 80) + '...',
              status: response.status,
              statusText: response.statusText,
              contentType,
            })
            shouldSetError = true
          } else {
            // URL is accessible and is audio - likely transient error, don't set error
            console.warn('⚠️ [RespondPage] Audio URL is accessible - error was likely transient, not setting error state', {
              url: audioEl.currentSrc.substring(0, 80) + '...',
              status: response.status,
              contentType,
            })
            shouldSetError = false
          }
        } catch (fetchError: any) {
          // Fetch failed - could be network issue, but don't assume it's a media error
          // Only set error if we can confirm it's a decode/src not supported error
          console.error('🔴 [RespondPage] Audio URL fetch failed:', {
            url: audioEl.currentSrc.substring(0, 80) + '...',
            error: fetchError.message,
          })
          // Only set error if error code indicates decode/src issue (not network)
          // MEDIA_ERR_SRC_NOT_SUPPORTED = 4, MEDIA_ERR_DECODE = 3
          if (audioEl.error?.code === 3 || audioEl.error?.code === 4) {
            shouldSetError = true
          } else {
            shouldSetError = false // Network issues are transient
          }
        }
        
        // Only set error if validation confirms it's a real error
        if (shouldSetError && audioStatus === 'ready' && audioRef.current === audio && audioEl.currentSrc && audioEl.currentSrc.trim() !== '') {
          // STRUCTURED LOG: Error trigger point
          console.error('🔴 [AUDIO_FLOW] ERROR TRIGGERED:', {
            reason: 'audio_element_error_event',
            transcriptLength: practiceData?.transcript?.length || 0,
            audioStatus: 'error',
            audioUrl: practiceData?.audioUrl ? practiceData.audioUrl.substring(0, 80) + '...' : null,
            audioRefSrc: audioEl.src || null,
            audioRefCurrentSrc: audioEl.currentSrc || null,
            audioRefErrorCode: audioEl.error?.code || null,
            audioRefErrorMessage: audioEl.error?.message || null,
            networkState: audioEl.networkState,
            readyState: audioEl.readyState,
            lastMetadataStatus: 'N/A',
            lastMetadataUrl: 'N/A',
          })
          setPracticeData(prev => ({ ...prev, audioStatus: 'error' }))
          console.error('❌ [RespondPage] Phase: error (audio load failed)')
        }
        setIsPlaying(false)
      }
      
      // Handle successful load - audio is ready to play
      const handleLoadedData = () => {
        if (audioRef.current === audio) {
          setPracticeData(prev => ({ ...prev, audioStatus: 'ready' }))
          console.log('✅ [RespondPage] Audio loaded and ready to play')
        }
      }
      
      // Handle canplay event - audio can start playing
      const handleCanPlay = () => {
        if (audioRef.current === audio) {
          console.log('✅ [RespondPage] Audio can play (readyState:', audio.readyState, ')')
        }
      }
      
      // Handle play/pause events to sync state
      // ONLY set isPlaying from the 'play' event - never from play() promise
      const handleAudioPlay = () => {
        if (audioRef.current === audio) {
          console.log('🎵 [AUDIO_FLOW] CASE C: "play" event fired - setting isPlaying=true')
          setIsPlaying(true)
        }
      }
      
      const handleAudioPause = () => {
        if (audioRef.current === audio) {
          setIsPlaying(false)
        }
      }
      
      const handleAudioEnded = () => {
        console.log('🏁 [RespondPage] Audio playback ended')
        
        if (audioRef.current === audio && isLooping && voiceMode === 'generated' && audioStatus === 'ready') {
          audioRef.current.currentTime = 0
          // Do NOT set userInitiatedPlayRef for loop replay - only for user-initiated play
          audioRef.current.play().catch((err) => {
            console.error('🔴 [RespondPage] Error replaying audio:', err)
            if (err.name === 'NotAllowedError') {
              setPlayBlockedHint(true)
            } else {
              // STRUCTURED LOG: Error trigger point
              console.error('🔴 [AUDIO_FLOW] ERROR TRIGGERED:', {
                reason: 'handleAudioEnded_replay_error',
                transcriptLength: practiceData?.transcript?.length || 0,
                audioStatus: 'error',
                audioUrl: practiceData?.audioUrl ? practiceData.audioUrl.substring(0, 80) + '...' : null,
                audioRefSrc: audioRef.current?.src || null,
                audioRefCurrentSrc: audioRef.current?.currentSrc || null,
                audioRefErrorCode: audioRef.current?.error?.code || null,
                lastMetadataStatus: 'N/A',
                lastMetadataUrl: 'N/A',
                replayErrorName: err.name,
                replayErrorMessage: err.message,
              })
              setPracticeData(prev => ({ ...prev, audioStatus: 'error' }))
            }
            setIsPlaying(false)
          })
        } else {
          setIsPlaying(false)
        }
        
        // Now we can safely revoke the blob URL since playback is complete
        // Only revoke if this is still the current audio and it's a blob URL
        if (audioRef.current === audio && objectUrlRef.current && objectUrlRef.current.startsWith('blob:')) {
          console.log('🧹 [RespondPage] Revoking blob URL after playback ended')
          URL.revokeObjectURL(objectUrlRef.current)
          objectUrlRef.current = null
        }
      }
      
      audio.addEventListener('error', handleAudioError)
      audio.addEventListener('loadeddata', handleLoadedData)
      audio.addEventListener('canplay', handleCanPlay)
      audio.addEventListener('play', handleAudioPlay)
      audio.addEventListener('pause', handleAudioPause)
      audio.addEventListener('ended', handleAudioEnded)
      
      // Cleanup function for this audio instance
      return () => {
        if (audioRef.current === audio) {
          audio.pause()
          audio.src = '' // Clear src to stop loading
          audio.removeEventListener('error', handleAudioError)
          audio.removeEventListener('loadeddata', handleLoadedData)
          audio.removeEventListener('canplay', handleCanPlay)
          audio.removeEventListener('play', handleAudioPlay)
          audio.removeEventListener('pause', handleAudioPause)
          audio.removeEventListener('ended', handleAudioEnded)
          if (audioRef.current === audio) {
            audioRef.current = null
          }
        }
        // Don't revoke the blob URL here - it might still be needed
        // It will be revoked in handleAudioEnded after playback completes
      }
    }
  }, [isPlayable, practiceData?.audioUrl, practiceData?.transcript, isLooping])

  // Cleanup TTS, toast timers, and object URLs on unmount
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel()
      }
      if (userPlayToastTimerRef.current) {
        clearTimeout(userPlayToastTimerRef.current)
        userPlayToastTimerRef.current = null
      }
      // Clean up audio element first
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
        audioRef.current = null
      }
      // Then clean up object URLs
      if (objectUrlRef.current) {
        console.log('🧹 [RespondPage] Cleaning up blob URL on unmount')
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }
    }
  }, [])

  const handlePlayPause = async () => {
    // INSTRUMENTATION: Log at start with all relevant state
    console.log('🎮 [AUDIO_FLOW] handlePlayPause START:', {
      audioStatus,
      audioUrl: practiceData?.audioUrl ? practiceData.audioUrl.substring(0, 80) + '...' : null,
      transcriptLength: practiceData?.transcript?.length || 0,
      hasAudioRef: !!audioRef.current,
      audioSrc: audioRef.current?.src || null,
      audioReadyState: audioRef.current?.readyState ?? null,
      audioNetworkState: audioRef.current?.networkState ?? null,
      isPlayable,
      isPlaying,
      uiPhase,
      voiceMode,
    })

    // If using device voice
    if (voiceMode === 'device') {
      if (isPlaying) {
        // Stop device voice
        if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel()
        }
        setIsPlaying(false)
      } else {
        // Start device voice
        if (typeof window !== 'undefined' && window.speechSynthesis && practiceData?.transcript) {
        const utterance = new SpeechSynthesisUtterance(practiceData.transcript)
          utterance.onend = () => setIsPlaying(false)
          utterance.onerror = (e) => {
            console.error('🔴 [RespondPage] Device voice error:', e)
            // Don't set error for device voice - it's a fallback, just stop playing
            setIsPlaying(false)
          }
          ttsRef.current = utterance
          window.speechSynthesis.speak(utterance)
          setIsPlaying(true)
        }
        // Don't set error if device voice unavailable - just don't play
      }
      return
    }

    // If audio is not playable, show toast and try to prepare it
    if (!isPlayable) {
      // Check if transcript is empty
      if (!practiceData?.transcript || practiceData.transcript.trim() === '') {
        // Transcript not loaded yet - show lightweight message (no error banner)
        console.log('⏳ [RespondPage] Play clicked but transcript empty - waiting for transcript')
        setUserPlayToastOpen(true)
        if (userPlayToastTimerRef.current) {
          clearTimeout(userPlayToastTimerRef.current)
        }
        userPlayToastTimerRef.current = setTimeout(() => {
          setUserPlayToastOpen(false)
          userPlayToastTimerRef.current = null
        }, 2000)
        return
      }

      // Show "Preparing audio..." toast (non-error)
      setUserPlayToastOpen(true)
      if (userPlayToastTimerRef.current) {
        clearTimeout(userPlayToastTimerRef.current)
      }
      userPlayToastTimerRef.current = setTimeout(() => {
        setUserPlayToastOpen(false)
        userPlayToastTimerRef.current = null
      }, 2000)

      // Try to load metadata and trigger generation if needed
      try {
        const { getAudioMetadata } = await import('@/lib/audioApi')
        const rawTranscript = practiceData?.transcript
        if (!rawTranscript || typeof rawTranscript !== 'string' || rawTranscript.trim() === '') {
          console.log('⏳ [RespondPage] Cannot load metadata: transcript is empty')
          return
        }
        const transcriptForMetadata: string = rawTranscript.trim()
        
        if (!effectiveClipId) {
          console.log('⏳ [RespondPage] Cannot load metadata: clipId is missing')
          return
        }
        
        const metadata = await getAudioMetadata(effectiveClipId, transcriptForMetadata, 'clean_normal')
        
        // STRUCTURED LOG: Metadata response from play click
        console.log('📥 [AUDIO_FLOW] loadAudioMetadata response (from play click):', {
          reason: 'metadata_received_play_click',
          transcriptLength: transcriptForMetadata.length,
          metadataStatus: metadata.audioStatus,
          metadataUrl: metadata.audioUrl ? metadata.audioUrl.substring(0, 80) + '...' : null,
          effectiveClipId,
        })
        
        if (metadata.audioStatus === 'ready' && metadata.audioUrl) {
          // Audio is ready - set it
          setPracticeData(prev => ({
            ...prev,
            audioUrl: metadata.audioUrl!,
            audioStatus: 'ready',
          }))
          console.log('✅ [RespondPage] Audio loaded from metadata after play click')
          // Audio element will be created by useEffect, then user can try play again
        } else if (metadata.audioStatus === 'needs_generation') {
          // Trigger generation if transcript exists
          await triggerGeneration(effectiveClipId, transcriptForMetadata, storyId || null)
        } else if (metadata.audioStatus === 'generating') {
          // Already generating - just wait
          setPracticeData(prev => ({
            ...prev,
            audioStatus: 'generating',
          }))
          startPolling(effectiveClipId, transcriptForMetadata)
        }
      } catch (error: any) {
        console.error('❌ [RespondPage] Error loading metadata after play click:', error)
        // Don't set error state - just log and let user try again later
      }
      
      return
    }

    // Audio is playable - proceed with playback
    if (!audioRef.current) {
      console.warn('⚠️ [AUDIO_FLOW] CASE A: isPlayable is true but audioRef.current is null - guard returns early')
      console.log('🔍 [AUDIO_FLOW] Audio element should be created by useEffect when isPlayable becomes true')
      return
    }

    if (isPlaying) {
      // Pause audio
      console.log('⏸️ [AUDIO_FLOW] Pausing audio')
      audioRef.current.pause()
      // Do NOT reset userInitiatedPlayRef on pause - it should only control error banner
      // State will be updated by the 'pause' event listener
      return
    }

    // Play audio - set flag to indicate user initiated playback (for error banner gating)
    userInitiatedPlayRef.current = true
    
    // INSTRUMENTATION: Log right before calling play()
    const audio = audioRef.current
    console.log('▶️ [AUDIO_FLOW] About to call play():', {
      audioSrc: audio.src,
      audioCurrentSrc: audio.currentSrc,
      readyState: audio.readyState,
      networkState: audio.networkState,
      paused: audio.paused,
      practiceDataAudioUrl: practiceData?.audioUrl ? practiceData.audioUrl.substring(0, 80) + '...' : null,
    })
    
    // CRITICAL: Ensure Audio element has a valid src before calling play()
    // NotSupportedError occurs when src is empty or invalid
    if (!audio.src || audio.src.trim() === '' || audio.src === window.location.href) {
      // Audio element doesn't have a valid src - set it from practiceData.audioUrl
      if (practiceData?.audioUrl && practiceData.audioUrl.trim() !== '') {
        console.log('🔧 [AUDIO_FLOW] Audio src is empty, setting from practiceData.audioUrl:', practiceData.audioUrl.substring(0, 80) + '...')
        audio.src = practiceData.audioUrl
        audio.load() // Load the new source
      } else {
        console.error('❌ [AUDIO_FLOW] Cannot play: Audio element has no src and practiceData.audioUrl is empty')
        setUserPlayToastOpen(true)
        if (userPlayToastTimerRef.current) {
          clearTimeout(userPlayToastTimerRef.current)
        }
        userPlayToastTimerRef.current = setTimeout(() => {
          setUserPlayToastOpen(false)
          userPlayToastTimerRef.current = null
        }, 2000)
        return
      }
    }
    
    // Call play() directly without awaiting anything before it
    // Wrap in try/catch and log resolve/reject
    try {
      const playPromise = audio.play()
      console.log('✅ [AUDIO_FLOW] play() called immediately in click handler, promise created')
      
      playPromise
        .then(() => {
          console.log('✅ [AUDIO_FLOW] play() promise RESOLVED - audio should start playing')
          // Do NOT set isPlaying here - only the 'play' event should set it
        })
        .catch((error: any) => {
          // Improved logging: log { name, message, code } from the error
          console.error('❌ [AUDIO_FLOW] CASE B: play() promise REJECTED:', {
            errorName: error.name,
            errorMessage: error.message,
            errorCode: error.code,
            errorStack: error.stack,
          })
          
          // Error handling based on error type
          if (error.name === 'NotAllowedError') {
            // NotAllowedError: show toast, DO NOT set audioStatus='error'
            console.log('🔒 [AUDIO_FLOW] NotAllowedError - showing toast "Tap to play", NOT setting error')
            setUserPlayToastOpen(true)
            if (userPlayToastTimerRef.current) {
              clearTimeout(userPlayToastTimerRef.current)
            }
            userPlayToastTimerRef.current = setTimeout(() => {
              setUserPlayToastOpen(false)
              userPlayToastTimerRef.current = null
            }, 2000)
            setPlayBlockedHint(true)
            // Do NOT set audioStatus='error' - this is expected behavior
          } else if (error.name === 'AbortError') {
            // AbortError: do not show banner; retry by calling audio.load() and let user tap again
            console.log('⏸️ [AUDIO_FLOW] AbortError - calling audio.load() to retry, NOT showing banner')
            audio.load() // Retry by reloading
            // Do NOT show banner - let user tap again
          } else if (error.name === 'NotSupportedError') {
            // NotSupportedError: Audio element has no supported sources
            // Try to fix by ensuring src is set and reloading
            console.error('❌ [AUDIO_FLOW] NotSupportedError - Audio element has no supported sources')
            if (practiceData?.audioUrl && practiceData.audioUrl.trim() !== '') {
              console.log('🔧 [AUDIO_FLOW] Attempting to fix: setting audio.src and reloading')
              audio.src = practiceData.audioUrl
              audio.load()
              // Show toast to let user know to try again
              setUserPlayToastOpen(true)
              if (userPlayToastTimerRef.current) {
                clearTimeout(userPlayToastTimerRef.current)
              }
              userPlayToastTimerRef.current = setTimeout(() => {
                setUserPlayToastOpen(false)
                userPlayToastTimerRef.current = null
              }, 2000)
            } else {
              console.error('❌ [AUDIO_FLOW] Cannot fix NotSupportedError: practiceData.audioUrl is empty')
              // This is a real error - audioUrl should exist if isPlayable is true
            }
            // Do NOT set audioStatus='error' - let user try again after reload
          } else {
            // Other errors: only escalate to banner for true media errors
            // (decode/src not supported) confirmed by Range fetch content-type
            console.error('🔴 [AUDIO_FLOW] Other playback error - will validate with Range fetch before showing banner')
            // Audio error handler will validate with Range fetch and decide banner
          }
          // Do NOT call setIsPlaying(false) here - let the 'play' event handle state
        })
    } catch (error: any) {
      console.error('❌ [AUDIO_FLOW] Exception calling play():', {
        errorName: error.name,
        errorMessage: error.message,
      })
      // Do NOT change isPlaying - only 'play' event should set it
    }
    
    // State will be updated by the 'play' event listener (handleAudioPlay)
  }

  const handleReplay = () => {
    // If using device voice, replay device voice
    if (voiceMode === 'device') {
      if (typeof window !== 'undefined' && window.speechSynthesis && practiceData?.transcript) {
      window.speechSynthesis.cancel()
        const utterance = new SpeechSynthesisUtterance(practiceData.transcript)
        utterance.onend = () => setIsPlaying(false)
        ttsRef.current = utterance
        window.speechSynthesis.speak(utterance)
        setIsPlaying(true)
      }
      return
    }

    // Generated audio replay
    if (!audioRef.current) {
      return
    }
    audioRef.current.currentTime = 0
    if (!isPlaying) {
      // Set flag for replay (user-initiated action)
      userInitiatedPlayRef.current = true
      audioRef.current.play().catch((error) => {
        if (error.name === 'NotAllowedError') {
          setPlayBlockedHint(true)
        }
      })
    }
  }

  const handleRetry = async () => {
    if (!effectiveClipId || !practiceData?.transcript) {
      return
    }

    // Reset generation guard to allow retry
    hasTriggeredGenerationRef.current = null
    setErrorMessage(null)
    userInitiatedPlayRef.current = false // Reset play flag on retry
    setPracticeData(prev => ({ ...prev, audioStatus: 'generating' }))

    // Reload metadata from DB
    try {
      const metadata = await getAudioMetadata(effectiveClipId, practiceData.transcript, 'clean_normal')
      
      if (metadata.audioStatus === 'ready' && metadata.audioUrl) {
        setPracticeData(prev => ({
          ...prev,
          audioUrl: metadata.audioUrl!,
          audioStatus: 'ready',
        }))
      } else if (metadata.audioStatus === 'generating') {
        startPolling(effectiveClipId, practiceData.transcript)
      } else if (metadata.audioStatus === 'needs_generation') {
        await triggerGeneration(effectiveClipId, practiceData.transcript, storyId)
      } else if (metadata.audioStatus === 'error') {
        // Only set error if DB explicitly returns error status
        // STRUCTURED LOG: Error trigger point
        console.error('🔴 [AUDIO_FLOW] ERROR TRIGGERED:', {
          reason: 'handleRetry_metadata_error',
          transcriptLength: practiceData?.transcript?.length || 0,
          audioStatus: 'error',
          audioUrl: metadata.audioUrl || practiceData?.audioUrl || null,
          audioRefSrc: audioRef.current?.src || null,
          audioRefCurrentSrc: audioRef.current?.currentSrc || null,
          audioRefErrorCode: audioRef.current?.error?.code || null,
          lastMetadataStatus: metadata.audioStatus,
          lastMetadataUrl: metadata.audioUrl || null,
        })
        setPracticeData(prev => ({ ...prev, audioStatus: 'error' }))
        setErrorMessage('Audio generation failed. Please try again.')
      }
    } catch (error: any) {
      // API error - set error
      // STRUCTURED LOG: Error trigger point
      console.error('🔴 [AUDIO_FLOW] ERROR TRIGGERED:', {
        reason: 'handleRetry_api_exception',
        transcriptLength: practiceData?.transcript?.length || 0,
        audioStatus: 'error',
        audioUrl: practiceData?.audioUrl || null,
        audioRefSrc: audioRef.current?.src || null,
        audioRefCurrentSrc: audioRef.current?.currentSrc || null,
        audioRefErrorCode: audioRef.current?.error?.code || null,
        lastMetadataStatus: 'N/A (fetch failed)',
        lastMetadataUrl: 'N/A',
        exceptionMessage: error.message,
        exceptionStack: error.stack,
      })
      setPracticeData(prev => ({ ...prev, audioStatus: 'error' }))
      setErrorMessage(error.message || 'Failed to retry')
    }
  }

  const handleGenerateAudio = async ({ storyId, clipId, transcript }: { storyId?: string; clipId?: string; transcript: string }) => {
    // Set generating status immediately
    setPracticeData(prev => ({ ...prev, audioStatus: 'generating' }))
    
    // Use the queue system
    const { getAudioGenerationQueue } = await import('@/lib/audioGenerationQueue')
    const queue = getAudioGenerationQueue()
    
    return new Promise<string | null>((resolve) => {
      if (!storyId) {
        // STRUCTURED LOG: Error trigger point
        console.error('🔴 [AUDIO_FLOW] ERROR TRIGGERED:', {
          reason: 'handleGenerateAudio_no_storyId',
          transcriptLength: transcript.length,
          audioStatus: 'error',
          audioUrl: practiceData?.audioUrl || null,
          audioRefSrc: audioRef.current?.src || null,
          audioRefCurrentSrc: audioRef.current?.currentSrc || null,
          audioRefErrorCode: audioRef.current?.error?.code || null,
          lastMetadataStatus: 'N/A',
          lastMetadataUrl: 'N/A',
        })
        setPracticeData(prev => ({ ...prev, audioStatus: 'error' }))
        resolve(null)
        return
      }

      queue.enqueue(
        {
          id: clipId || storyClipId || `temp_${Date.now()}`,
          storyId,
          transcript,
          priority: 1000, // High priority for user-initiated generation
        },
        (generatedClipId, result) => {
          if ('audioUrl' in result) {
            // Success: update practiceData
            setPracticeData(prev => ({
              ...prev,
              audioUrl: result.audioUrl,
              audioStatus: 'ready',
            }))
            setErrorMessage(null) // Clear any previous errors
            resolve(result.audioUrl)
          } else {
            // Error: set error status and show message
            // STRUCTURED LOG: Error trigger point
            console.error('🔴 [AUDIO_FLOW] ERROR TRIGGERED:', {
              reason: 'handleGenerateAudio_queue_error',
              transcriptLength: transcript.length,
              audioStatus: 'error',
              audioUrl: practiceData?.audioUrl || null,
              audioRefSrc: audioRef.current?.src || null,
              audioRefCurrentSrc: audioRef.current?.currentSrc || null,
              audioRefErrorCode: audioRef.current?.error?.code || null,
              lastMetadataStatus: 'N/A',
              lastMetadataUrl: 'N/A',
              queueError: result.message || result.error || 'Failed to generate audio',
            })
            const errorMsg = result.message || result.error || 'Failed to generate audio'
            setErrorMessage(errorMsg)
            setPracticeData(prev => ({ ...prev, audioStatus: 'error' }))
            resolve(null)
          }
        }
      )
    })
  }

  const handleUseDeviceVoice = () => {
    setVoiceMode('device')
    setPracticeData(prev => ({ ...prev, audioStatus: 'ready' }))
    // Start device voice immediately
    if (typeof window !== 'undefined' && window.speechSynthesis && practiceData?.transcript) {
      const utterance = new SpeechSynthesisUtterance(practiceData.transcript)
      utterance.onend = () => setIsPlaying(false)
      ttsRef.current = utterance
      window.speechSynthesis.speak(utterance)
      setIsPlaying(true)
    }
  }

  const handleLoopToggle = () => {
    setIsLooping(!isLooping)
  }

  const handleCheckAnswer = () => {
    if (inputMode === 'type' && !userInput.trim()) return

    // Route to review screen - support story-based, clip-based, and session-based routing
    if (storyId && storyClipId) {
      // Story-based routing - mark as done and navigate to review
      router.push(
        `/practice/review?storyId=${storyId}&clipId=${storyClipId}&userText=${encodeURIComponent(userInput)}`
      )
    } else if (clipId) {
      // Clip-based routing (single phrase session - Quick Practice)
      router.push(`/practice/review?clip=${clipId}&userText=${encodeURIComponent(userInput)}`)
    } else {
      // Session-based routing
      const phraseIdParam = phraseId ? `&phraseId=${phraseId}` : ''
      router.push(
        `/practice/review?session=${sessionId}&index=${phraseIndex}&userText=${encodeURIComponent(userInput)}${phraseIdParam}`
      )
    }
  }

  return (
    <main className="flex min-h-screen flex-col px-6 py-6">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => {
            // Navigate back to story page if from story, otherwise to practice select
            if (storyId) {
              router.push(`/practice/story/${storyId}`)
            } else {
              router.push('/practice/select')
            }
          }}
          className="text-blue-600 font-medium text-lg py-2 px-1 -ml-1 inline-flex items-center gap-1"
        >
          <ChevronLeft className="w-5 h-5" />
          Back
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 space-y-6">
        {/* Missing clipId error */}
        {!effectiveClipId && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg space-y-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-red-800 font-medium">No clip selected</p>
                <p className="text-xs text-red-700 mt-1">Please select a clip from the practice list.</p>
              </div>
            </div>
            <Link
              href={storyId ? `/practice/story/${storyId}` : '/practice/select'}
              className="block w-full py-2 px-4 bg-blue-600 text-white rounded-lg font-medium text-center active:bg-blue-700 transition-colors"
            >
              {storyId ? 'Back to Story' : 'Back to Practice'}
            </Link>
          </div>
        )}

        {/* Focus banner */}
        {focusInsightTitle && (
          <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
            <div className="flex items-center space-x-2">
              <span className="text-blue-600 font-semibold">Focus:</span>
              <span className="text-blue-900">{focusInsightTitle}</span>
            </div>
          </div>
        )}

        {/* Full-screen loader: show until audio is playable OR initial load complete */}
        {/* Keep dots visible until isPlayable becomes true */}
        <FullScreenLoader open={!isPlayable && (uiPhase === 'boot' || uiPhase === 'checking' || uiPhase === 'generating') && !!effectiveClipId} />

        {/* User-triggered play toast: show when user tries to play before ready */}
        <Snackbar
          open={userPlayToastOpen}
          variant="loading"
          title="Preparing..."
          message="Audio is being prepared"
          onClose={() => setUserPlayToastOpen(false)}
        />

        {/* Error toast only (auto-dismissing, with retry action) */}
        {/* Only show error banner for real errors, not for waiting_transcript */}
        {uiPhase === 'error' && audioStatus === 'error' && (
          <Snackbar
            open={snackbarOpen}
            variant="error"
            title="Audio problem"
            message={errorMessage || "We'll retry in the background."}
            actions={
              <button
                onClick={handleRetry}
                className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg font-medium active:bg-blue-700 transition-colors"
              >
                Retry
              </button>
            }
            onClose={() => setSnackbarOpen(false)}
          />
        )}

        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-gray-900">
            Listen first
          </h1>
          <p className="text-gray-600">
            No text shown yet
          </p>
        </div>

        {/* Audio Controls - Always accessible (single Play button, Spotify-like) */}
        <div className="relative flex flex-col items-center justify-center py-6 min-h-[140px] -mx-6 px-6">
          {/* Continuous waveform line - full width behind controls (only if using generated audio) */}
          {voiceMode === 'generated' && (
          <div className="absolute inset-x-6 top-1/2 -translate-y-1/2 h-12 z-0">
            <AudioWaveLine audioRef={audioRef} isPlaying={isPlaying} side="full" height={48} />
          </div>
          )}
          
          {/* Center controls - overlays waveform */}
          <div className="relative flex items-center justify-center space-x-6 z-10">
            <button
              onClick={handlePlayPause}
              disabled={!isPlayable}
              className={`w-20 h-20 rounded-full text-white flex items-center justify-center transition-colors shadow-lg ${
                isPlayable
                  ? 'bg-blue-600 active:bg-blue-700'
                  : 'bg-gray-400 cursor-not-allowed'
              }`}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              title={isPlayable ? 'Play audio' : 'Preparing audio...'}
            >
              {/* Play / Pause icon (always present to avoid layout shift - no spinner) */}
              {isPlaying ? (
                <svg className="w-10 h-10" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                </svg>
              ) : (
                <svg className="w-10 h-10" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>

          {focusInsightId && (
            <button
              onClick={handleLoopToggle}
              className={`p-3 rounded-full transition-colors ${
                isLooping
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-700 active:bg-gray-200'
              }`}
              aria-label="Loop"
              title="Loop enabled for focused practice"
            >
              <span className="text-2xl">🎯</span>
            </button>
          )}
          </div>
        </div>

        {/* Input mode toggle */}
        <div className="flex items-center space-x-4">
          <button
            onClick={() => setInputMode('type')}
            className={`flex-1 py-3 rounded-lg font-medium transition-colors ${
              inputMode === 'type'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600'
            }`}
          >
            Type
          </button>
          <button
            onClick={() => setInputMode('speak')}
            className={`flex-1 py-3 rounded-lg font-medium transition-colors ${
              inputMode === 'speak'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600'
            }`}
          >
            Speak
          </button>
        </div>

        {/* Input area */}
        {inputMode === 'type' ? (
          <div className="space-y-4">
            <label htmlFor="answer-input" className="block text-sm font-medium text-gray-700">
              Type what you heard
            </label>
            <textarea
              id="answer-input"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              placeholder="Type what you heard..."
              className="w-full h-40 p-4 border-2 border-gray-200 rounded-xl resize-none focus:outline-none focus:border-blue-600 text-lg"
            />
          </div>
        ) : (
          <div className="space-y-4">
            <label className="block text-sm font-medium text-gray-700">
              Speak what you heard
            </label>
            <div className="w-full h-40 p-4 border-2 border-gray-200 rounded-xl flex items-center justify-center bg-gray-50">
              <p className="text-gray-500 text-center">
                Speak functionality coming soon
                <br />
                <span className="text-sm">Switch to Type mode to continue</span>
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Sticky bottom button */}
      <div className="pt-6 pb-6">
        <button
          onClick={handleCheckAnswer}
          disabled={inputMode === 'type' && !userInput.trim()}
          className={`w-full py-4 px-6 rounded-xl font-semibold text-lg transition-colors ${
            inputMode === 'type' && userInput.trim()
              ? 'bg-blue-600 text-white active:bg-blue-700 shadow-lg'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          Check answer
        </button>
      </div>
    </main>
  )
}

export default function RespondPage() {
  return (
    <Suspense fallback={
      <main className="flex min-h-screen flex-col items-center justify-center px-6">
        <div className="text-gray-500">Loading...</div>
      </main>
    }>
      <RespondPageContent />
    </Suspense>
  )
}
