'use client'

import { useState, useRef, useEffect, ReactNode } from 'react'
import RecordingWaveform from './RecordingWaveform'

interface VoiceRecorderProps {
  onTranscript: (text: string) => void
  onError?: (error: string) => void
  onPermissionDenied?: () => void
  children?: (controls: {
    state: RecorderState
    startRecording: () => Promise<void>
    stopRecording: () => void
    recordingDuration: number
    stream: MediaStream | null
  }) => ReactNode
}

type RecorderState = 'idle' | 'recording' | 'transcribing' | 'error'

export default function VoiceRecorder({ onTranscript, onError, onPermissionDenied, children }: VoiceRecorderProps) {
  const [state, setState] = useState<RecorderState>('idle')
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [recordingDuration, setRecordingDuration] = useState(0)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [permissionState, setPermissionState] = useState<'unknown' | 'granted' | 'denied'>('unknown')

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null)
  const startTimeRef = useRef<number>(0)

  // Debug: log whenever internal recorder state changes
  useEffect(() => {
    console.log('🎤 [VoiceRecorder] state changed:', state)
  }, [state])

  // Cleanup: stop all tracks on unmount
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop())
      }
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current)
      }
    }
  }, [stream])

  const requestMicrophoneAccess = async () => {
    try {
      console.log('🎤 [VoiceRecorder] Requesting microphone access...')
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      })
      setStream(mediaStream)
      setPermissionState('granted')
      console.log('✅ [VoiceRecorder] Microphone access granted')
      return mediaStream
    } catch (error: any) {
      console.error('❌ [VoiceRecorder] Microphone access denied:', error)

      // Handle explicit browser permission denial separately so the parent
      // can show a dedicated modal and switch to Type mode.
      if (error?.name === 'NotAllowedError') {
        setPermissionState('denied')
        setState('idle')
        setErrorMessage('')
        if (onPermissionDenied) {
          onPermissionDenied()
        }
        // Do not surface this as a generic recording error; the UX is handled upstream.
        return null
      }

      // Fallback for other microphone errors
      setPermissionState('denied')
      setErrorMessage('We could not access your microphone. Please try again or type your answer.')
      setState('error')
      if (onError) {
        onError('We could not access your microphone. Please try again or type your answer.')
      }
      return null
    }
  }

  const startRecording = async () => {
    // Request microphone access if not already granted
    let mediaStream = stream
    if (!mediaStream || permissionState !== 'granted') {
      mediaStream = await requestMicrophoneAccess()
      if (!mediaStream) {
        return // Permission denied
      }
    }

    try {
      // Reset state
      audioChunksRef.current = []
      setRecordingDuration(0)
      setErrorMessage('')
      setState('recording')
      startTimeRef.current = Date.now()

      // Create MediaRecorder
      const mediaRecorder = new MediaRecorder(mediaStream, {
        mimeType: 'audio/webm',
      })
      mediaRecorderRef.current = mediaRecorder

      // Collect audio chunks
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      // Handle recording stop
      mediaRecorder.onstop = async () => {
        if (audioChunksRef.current.length === 0) {
          setErrorMessage('No audio detected. Try again')
          setState('error')
          if (onError) onError('No audio detected. Try again')
          return
        }

        // Create audio blob
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        console.log('🎤 [VoiceRecorder] Recording stopped, blob size:', audioBlob.size)

        // Transcribe
        await transcribeAudio(audioBlob)
      }

      // Start recording
      mediaRecorder.start()
      console.log('🎤 [VoiceRecorder] Recording started')

      // Start timer
      recordingTimerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000)
        setRecordingDuration(elapsed)
      }, 100)
    } catch (error: any) {
      console.error('❌ [VoiceRecorder] Error starting recording:', error)
      setErrorMessage('Recording error. Please try again')
      setState('error')
      if (onError) onError('Recording error. Please try again')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && state === 'recording') {
      mediaRecorderRef.current.stop()
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current)
        recordingTimerRef.current = null
      }
    }
  }

  const transcribeAudio = async (audioBlob: Blob) => {
    setState('transcribing')

    try {
      // Create form data
      const formData = new FormData()
      formData.append('audio', audioBlob, 'recording.webm')

      console.log('🎤 [VoiceRecorder] Sending to transcription API...')
      
      // Call transcription API
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || 'Transcription failed')
      }

      const data = await response.json()
      console.log('✅ [VoiceRecorder] Transcription success:', data.text)

      if (!data.text || data.text.trim().length === 0) {
        throw new Error('No speech detected. Try again')
      }

      // Return transcript to parent
      onTranscript(data.text)
      setState('idle')
      setRecordingDuration(0)
    } catch (error: any) {
      console.error('❌ [VoiceRecorder] Transcription error:', error)
      const message = error.message || 'Transcription failed. Try typing instead'
      setErrorMessage(message)
      setState('error')
      if (onError) onError(message)
      
      // Reset to idle after 3 seconds
      setTimeout(() => {
        setState('idle')
        setErrorMessage('')
      }, 3000)
    }
  }

  const handlePointerDown = async () => {
    if (state === 'idle' || state === 'error') {
      await startRecording()
    }
  }

  const handlePointerUp = () => {
    if (state === 'recording') {
      stopRecording()
    }
  }

  // Format duration as MM:SS
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Headless render mode: allow parent components to control UI while reusing
  // all recording/transcription logic.
  if (children) {
    return (
      <>
        {children({
          state,
          startRecording,
          stopRecording,
          recordingDuration,
          stream,
        })}
      </>
    )
  }

  return (
    <div className="w-full space-y-4">
      {/* Recording button */}
      {permissionState !== 'denied' && (
        <div className="flex flex-col items-center space-y-4">
          {/* Circular button */}
          <button
            type="button"
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp} // Stop if pointer leaves button
            disabled={state === 'transcribing'}
            className={`relative w-24 h-24 rounded-full flex items-center justify-center transition-all shadow-lg ${
              state === 'recording'
                ? 'bg-red-500 scale-110'
                : state === 'transcribing'
                ? 'bg-gray-400 cursor-not-allowed'
                : state === 'error'
                ? 'bg-orange-500'
                : 'bg-blue-600 active:bg-blue-700 active:scale-95'
            }`}
            aria-label={
              state === 'recording'
                ? 'Recording... Release to transcribe'
                : state === 'transcribing'
                ? 'Transcribing...'
                : 'Hold to speak'
            }
          >
            {/* Recording pulse animation */}
            {state === 'recording' && (
              <div className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-75" />
            )}

            {/* Icon */}
            <div className="relative z-10">
              {state === 'transcribing' ? (
                // Spinner
                <svg
                  className="animate-spin h-10 w-10 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
              ) : (
                // Microphone icon
                <svg
                  className="w-10 h-10 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                  />
                </svg>
              )}
            </div>
          </button>

          {/* Status text */}
          <div className="text-center space-y-1">
            <p className="text-body font-medium text-gray-900">
              {state === 'idle' && (permissionState === 'unknown' ? 'Hold to speak (will request mic access)' : 'Hold to speak')}
              {state === 'recording' && 'Release to transcribe'}
              {state === 'transcribing' && 'Transcribing...'}
              {state === 'error' && errorMessage}
            </p>
            
            {/* Recording duration */}
            {state === 'recording' && (
              <p className="text-body-small text-gray-600 font-mono">
                {formatDuration(recordingDuration)}
              </p>
            )}
          </div>

          {/* Waveform visualization */}
          {(state === 'recording' || state === 'idle') && (
            <div className="w-full h-12 bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
              <RecordingWaveform
                stream={stream}
                isRecording={state === 'recording'}
                height={48}
              />
            </div>
          )}

          {/* Error message */}
          {state === 'error' && errorMessage && (
            <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
              <p className="text-body-small text-orange-800 text-center">
                {errorMessage}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

