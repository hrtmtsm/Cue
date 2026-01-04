'use client'

import { useEffect, useRef, useState } from 'react'

interface AudioWaveformProps {
  audioRef: React.RefObject<HTMLAudioElement>
  isPlaying: boolean
  barCount?: number // Number of bars for this side
  side?: 'left' | 'right' // Which side to render
}

export default function AudioWaveform({ audioRef, isPlaying, barCount = 24, side = 'left' }: AudioWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationFrameRef = useRef<number | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const mediaSourceRef = useRef<MediaElementAudioSourceNode | null>(null)
  const dataArrayRef = useRef<Uint8Array | null>(null)
  const smoothedDataRef = useRef<number[]>([])
  
  // Initialize AudioContext and AnalyserNode on first play
  useEffect(() => {
    if (typeof window === 'undefined' || !audioRef.current) return
    if (!isPlaying) return // Only initialize when user starts playing

    const audio = audioRef.current

    // Use shared audio context (stored in audio element for reuse)
    let audioContext = (audio as any).__audioContext as AudioContext | null
    let analyser = (audio as any).__analyser as AnalyserNode | null

    if (!audioContext) {
      try {
        // Create AudioContext on first user interaction
        audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
        ;(audio as any).__audioContext = audioContext

        // Create analyser node
        analyser = audioContext.createAnalyser()
        analyser.fftSize = 512 // Higher resolution
        analyser.smoothingTimeConstant = 0.8 // Smooth the data
        ;(audio as any).__analyser = analyser

        // Connect audio element to analyser
        const source = audioContext.createMediaElementSource(audio)
        source.connect(analyser)
        analyser.connect(audioContext.destination)
        ;(audio as any).__mediaSource = source

        console.log('✅ AudioContext and AnalyserNode initialized')
      } catch (error) {
        console.error('❌ Error initializing AudioContext:', error)
        return
      }
    }

    // Store references for this component
    audioContextRef.current = audioContext
    analyserRef.current = analyser

        if (analyser) {
      // Create data array for frequency data
      const bufferLength = analyser.frequencyBinCount
      dataArrayRef.current = new Uint8Array(new ArrayBuffer(bufferLength))
      
      // Initialize smoothed data array (one per side)
      smoothedDataRef.current = new Array(barCount).fill(0)
    }

    // Resume audio context if suspended (required after user interaction)
    if (audioContext && audioContext.state === 'suspended') {
      audioContext.resume().catch((error) => {
        console.error('Error resuming audio context:', error)
      })
    }
  }, [audioRef, barCount, isPlaying])

  // Animation loop
  useEffect(() => {
    if (!canvasRef.current || !analyserRef.current || !dataArrayRef.current) return
    if (!isPlaying) {
      // Stop animation when not playing
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
      return
    }

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const analyser = analyserRef.current
    const dataArray = dataArrayRef.current

    // Set canvas size
    const updateCanvasSize = () => {
      const rect = canvas.getBoundingClientRect()
      if (canvas.width !== rect.width || canvas.height !== rect.height) {
        canvas.width = rect.width
        canvas.height = rect.height
      }
    }

    const draw = () => {
      if (!isPlaying || !analyser || !dataArray) return

      updateCanvasSize()

      // Get frequency data
      // @ts-expect-error - TypeScript strictness issue with Uint8Array buffer types
      analyser.getByteFrequencyData(dataArray)

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const barWidth = Math.max(2, canvas.width / barCount - 1)
      const maxBarHeight = canvas.height * 0.8 // Leave some space at top/bottom
      const smoothingFactor = 0.3 // EMA smoothing factor

      // Process and draw bars
      for (let i = 0; i < barCount; i++) {
        // Sample frequency data - use lower frequencies for better visualization
        // Map i to frequency index (use first half of spectrum for cleaner look)
        const frequencyIndex = Math.floor((i / barCount) * (dataArray.length / 2))
        const frequencyValue = dataArray[frequencyIndex] / 255 // Normalize to 0-1

        // Apply EMA smoothing
        const previous = smoothedDataRef.current[i] || 0
        const smoothed = previous + (frequencyValue - previous) * smoothingFactor
        smoothedDataRef.current[i] = smoothed

        // Calculate bar height with minimum height
        const barHeight = Math.max(4, smoothed * maxBarHeight) // Minimum 4px height
        const y = (canvas.height - barHeight) / 2 // Center vertically

        // Draw bar based on side
        ctx.fillStyle = '#2563eb' // blue-600
        
        if (side === 'left') {
          // Left side: bars grow from center to left (rightmost bar is closest to center)
          const x = canvas.width - (i + 1) * (barWidth + 1)
          ctx.fillRect(x, y, barWidth, barHeight)
        } else {
          // Right side: bars grow from center to right (leftmost bar is closest to center)
          const x = i * (barWidth + 1)
          ctx.fillRect(x, y, barWidth, barHeight)
        }
      }

      animationFrameRef.current = requestAnimationFrame(draw)
    }

    // Start animation loop
    draw()

    // Cleanup
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
    }
  }, [isPlaying, barCount])

  // Handle audio context resume (required after user interaction)
  useEffect(() => {
    if (isPlaying && audioContextRef.current && audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume().catch((error) => {
        console.error('Error resuming audio context:', error)
      })
    }
  }, [isPlaying])

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full pointer-events-none"
      style={{ opacity: isPlaying ? 0.5 : 0.1 }}
    />
  )
}

