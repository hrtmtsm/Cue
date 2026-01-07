# Complete Audio Playback Flow - Debugging ERR_FILE_NOT_FOUND

## 1. State Variables Related to Audio Playback

```typescript
// Lines 65-78
const audioRef = useRef<HTMLAudioElement | null>(null)
const objectUrlRef = useRef<string | null>(null) // Track object URLs for cleanup
const userInitiatedPlayRef = useRef<boolean>(false) // Track if user actually attempted playback

const [practiceData, setPracticeData] = useState<PracticeData & { audioStatus?: 'ready' | 'needs_generation' | 'error' | 'generating' }>({
  audioUrl: '',
  transcript: 'Loading...',
  audioStatus: 'needs_generation',
})

// Single source of truth for audioStatus
const audioStatus = practiceData?.audioStatus ?? 'needs_generation'

// Define playability in one place: audio is ready and has URL
const isPlayable = audioStatus === 'ready' && !!practiceData?.audioUrl
```

## 2. Streaming Audio Function (triggerGeneration)

```typescript
// Lines 270-339
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
    const objectUrl = URL.createObjectURL(audioBlob)  // LINE 298
    
    // Clean up any previous object URL
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)  // LINE 302
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
```

## 3. Audio Element Creation useEffect

```typescript
// Lines 693-966
useEffect(() => {
  // Create/refresh Audio() instance whenever audioUrl becomes available (isPlayable)
  // Ensure Audio() is created whenever audioUrl becomes available
  if (!isPlayable) {
    // Clean up audio if not playable
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
      audioRef.current = null
    }
    return
  }
  
  console.log('🎵 [AUDIO_FLOW] isPlayable=true, creating/refreshing Audio element')

  // Validate audioUrl format (must be http/https/blob URL)
  const resolvedAudioUrl = practiceData.audioUrl.trim()
  if (!resolvedAudioUrl.startsWith('http') && !resolvedAudioUrl.startsWith('blob:')) {
    console.warn('⚠️ [RespondPage] Invalid audioUrl format, skipping Audio element creation:', {
      audioUrl: resolvedAudioUrl.substring(0, 80) + '...',
    })
    return
  }

  if (typeof window !== 'undefined' && practiceData && practiceData.audioUrl) {
    // Clean up previous audio and object URL
    const prevAudio = audioRef.current
    if (prevAudio) {
      // Stop playback and clear src to stop loading
      prevAudio.pause()
      prevAudio.src = '' // Clear src to stop loading
      audioRef.current = null
    }
    
    // Clean up previous object URL if it exists
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)  // LINE 729
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
    
    // Call audio.load() to start preloading immediately
    // This ensures audio is ready when user clicks play
    console.log('📥 [AUDIO_FLOW] Calling audio.load() to start preloading, src:', audio.src.substring(0, 80) + '...')
    audio.load()
    
    // Track object URLs for cleanup
    if (resolvedAudioUrl.startsWith('blob:')) {
      objectUrlRef.current = resolvedAudioUrl  // LINE 758
    }
    
    // Store event handlers for cleanup
    const handleAudioError = async (e: Event) => {
      // ... error handling code ...
    }
    
    const handleLoadedData = () => {
      if (audioRef.current === audio) {
        setPracticeData(prev => ({ ...prev, audioStatus: 'ready' }))
        console.log('✅ [RespondPage] Audio loaded and ready to play')
      }
    }
    
    const handleCanPlay = () => {
      if (audioRef.current === audio) {
        console.log('✅ [RespondPage] Audio can play (readyState:', audio.readyState, ')')
      }
    }
    
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
      // ... ended handler ...
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
    }
  }
}, [isPlayable, practiceData?.audioUrl, practiceData?.transcript, isLooping])
```

## 4. Cleanup useEffect (Object URL Revocation)

```typescript
// Lines 968-983
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
    // Clean up object URLs
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)  // LINE 980
      objectUrlRef.current = null
    }
  }
}, [])
```

## 5. handlePlayPause Function (Play Button Click Handler)

```typescript
// Lines 990-1220
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

  // ... device voice handling ...

  // If audio is not playable, show toast and try to prepare it
  if (!isPlayable) {
    // ... prepare audio logic ...
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
      // ... show toast ...
      return
    }
  }
  
  // Call play() directly without awaiting anything before it
  // Wrap in try/catch and log resolve/reject
  try {
    const playPromise = audio.play()  // LINE 1165
    console.log('✅ [AUDIO_FLOW] play() called immediately in click handler, promise created')
    
    playPromise
      .then(() => {
        console.log('✅ [AUDIO_FLOW] play() promise RESOLVED - audio should start playing')
        // Do NOT set isPlaying here - only the 'play' event should set it
      })
      .catch((error: any) => {
        // Improved logging: log { name, message, code } from the error
        console.error('❌ [AUDIO_FLOW] CASE B: play() promise REJECTED:', {  // LINE 1175
          errorName: error.name,
          errorMessage: error.message,
          errorCode: error.code,
          errorStack: error.stack,
        })
        
        // Error handling based on error type
        if (error.name === 'NotAllowedError') {
          // ... handle NotAllowedError ...
        } else if (error.name === 'AbortError') {
          // ... handle AbortError ...
        } else if (error.name === 'NotSupportedError') {
          // ... handle NotSupportedError ...
        } else {
          // ... handle other errors ...
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
```

## 6. All URL.createObjectURL() and URL.revokeObjectURL() Calls

### URL.createObjectURL() - LINE 298
```typescript
const objectUrl = URL.createObjectURL(audioBlob)
```

### URL.revokeObjectURL() - LINE 302 (in triggerGeneration)
```typescript
if (objectUrlRef.current) {
  URL.revokeObjectURL(objectUrlRef.current)
}
```

### URL.revokeObjectURL() - LINE 729 (in Audio creation useEffect cleanup)
```typescript
if (objectUrlRef.current) {
  URL.revokeObjectURL(objectUrlRef.current)
  objectUrlRef.current = null
}
```

### URL.revokeObjectURL() - LINE 980 (in unmount cleanup)
```typescript
if (objectUrlRef.current) {
  URL.revokeObjectURL(objectUrlRef.current)
  objectUrlRef.current = null
}
```

## Complete Flow Summary

1. **User Action**: User clicks Play button → `handlePlayPause()` called
2. **Stream Audio**: If not playable, `triggerGeneration()` is called
3. **Create Blob**: Stream is converted to Blob → `URL.createObjectURL(audioBlob)` creates blob: URL
4. **Set State**: `setPracticeData({ audioUrl: objectUrl, audioStatus: 'ready' })`
5. **Audio Element Created**: useEffect detects `isPlayable=true` → creates `new Audio(resolvedAudioUrl)`
6. **Preload**: `audio.load()` is called to start preloading
7. **Play**: User clicks Play → `audio.play()` is called
8. **Cleanup**: On unmount or audioUrl change → `URL.revokeObjectURL()` is called

## Potential Issues for ERR_FILE_NOT_FOUND

1. **Blob URL revoked too early**: If `URL.revokeObjectURL()` is called before the Audio element finishes loading/playing
2. **Blob URL not set correctly**: If `audio.src` doesn't match `practiceData.audioUrl`
3. **Race condition**: Audio element created with blob: URL, but blob is revoked before playback starts
4. **Multiple revocations**: Blob URL might be revoked multiple times if useEffect runs multiple times

