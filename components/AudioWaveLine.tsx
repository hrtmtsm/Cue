'use client'

import { useEffect, useRef, useState } from 'react'

interface AudioWaveLineProps {
  audioRef: React.RefObject<HTMLAudioElement>
  isPlaying: boolean
  side?: 'left' | 'right' | 'full' // 'full' for single line, 'left'/'right' for mirrored halves
  height?: number
}

export default function AudioWaveLine({ 
  audioRef, 
  isPlaying, 
  side = 'full',
  height = 48 
}: AudioWaveLineProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const pathRef = useRef<SVGPathElement>(null)
  const animationFrameRef = useRef<number | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const mediaSourceRef = useRef<MediaElementAudioSourceNode | null>(null)
  const dataArrayRef = useRef<Uint8Array | null>(null)
  const [svgWidth, setSvgWidth] = useState(0)

  // Check if audio is cross-origin (CORS)
  const isCrossOrigin = (audioUrl: string | null | undefined): boolean => {
    if (!audioUrl || typeof window === 'undefined') return false
    try {
      const audioUrlObj = new URL(audioUrl, window.location.href)
      const currentOrigin = window.location.origin
      return audioUrlObj.origin !== currentOrigin
    } catch {
      return false
    }
  }

  // Initialize AudioContext and AnalyserNode on first play (only for same-origin audio)
  useEffect(() => {
    if (typeof window === 'undefined' || !audioRef.current) return
    if (!isPlaying) return // Only initialize when user starts playing

    const audio = audioRef.current
    const audioUrl = audio.src || audio.currentSrc

    // Skip Web Audio API for cross-origin audio (CORS restriction)
    if (isCrossOrigin(audioUrl)) {
      console.log('⚠️ [AudioWaveLine] Skipping Web Audio API for cross-origin audio:', audioUrl.substring(0, 50) + '...')
      return
    }

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
        analyser.fftSize = 1024 // Higher resolution for smoother waveform
        analyser.smoothingTimeConstant = 0.3 // Less smoothing for more responsive waveform
        ;(audio as any).__analyser = analyser

        // Connect audio element to analyser
        const source = audioContext.createMediaElementSource(audio)
        source.connect(analyser)
        analyser.connect(audioContext.destination)
        ;(audio as any).__mediaSource = source

        console.log('✅ AudioContext and AnalyserNode initialized for waveform')
      } catch (error) {
        console.error('❌ Error initializing AudioContext:', error)
        return
      }
    }

    // Store references for this component
    audioContextRef.current = audioContext
    analyserRef.current = analyser

    if (analyser) {
      // Create data array for time-domain data
      const bufferLength = analyser.fftSize
      dataArrayRef.current = new Uint8Array(bufferLength)
    }

    // Resume audio context if suspended (required after user interaction)
    if (audioContext && audioContext.state === 'suspended') {
      audioContext.resume().catch((error) => {
        console.error('Error resuming audio context:', error)
      })
    }
  }, [audioRef, isPlaying])

  // Update SVG width on resize
  useEffect(() => {
    const updateWidth = () => {
      if (svgRef.current) {
        const rect = svgRef.current.getBoundingClientRect()
        setSvgWidth(rect.width)
      }
    }

    updateWidth()
    window.addEventListener('resize', updateWidth)
    return () => window.removeEventListener('resize', updateWidth)
  }, [])

  // Animation loop (only if Web Audio API is available)
  useEffect(() => {
    if (!audioRef.current) return
    const audioUrl = audioRef.current.src || audioRef.current.currentSrc
    
    // Skip animation for cross-origin audio
    if (isCrossOrigin(audioUrl)) {
      // Show flat line for cross-origin audio
      if (pathRef.current && svgWidth > 0) {
        const midY = height / 2
        pathRef.current.setAttribute('d', `M 0 ${midY} L ${svgWidth} ${midY}`)
      }
      return
    }

    if (!svgRef.current || !pathRef.current || !analyserRef.current || !dataArrayRef.current) return
    if (!isPlaying) {
      // Stop animation when not playing - show flat line
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
      
      // Draw flat line when paused
      if (svgWidth > 0 && pathRef.current) {
        const midY = height / 2
        pathRef.current.setAttribute('d', `M 0 ${midY} L ${svgWidth} ${midY}`)
      }
      return
    }

    const svg = svgRef.current
    const path = pathRef.current
    const analyser = analyserRef.current
    const dataArray = dataArrayRef.current

    const draw = () => {
      if (!isPlaying || !analyser || !dataArray || svgWidth === 0) return

      // Get time-domain data
      // @ts-expect-error - TypeScript strictness issue with Uint8Array buffer types
      analyser.getByteTimeDomainData(dataArray)

      // Build SVG path from time-domain data
      const samples = dataArray.length
      const centerY = height / 2
      const amplitude = height * 0.35 // Waveform amplitude (35% of height)
      
      // Downsample for performance and smoother line (take every 2nd sample)
      const downsampleFactor = 2
      const effectiveSamples = Math.floor(samples / downsampleFactor)
      
      let pathData = ''
      const stepX = svgWidth / (effectiveSamples - 1)
      
      // Smooth the data slightly by averaging adjacent samples
      const smoothingWindow = 1
      
      for (let i = 0; i < effectiveSamples; i++) {
        const originalIndex = i * downsampleFactor
        
        // Average nearby samples for smoothing
        let sum = 0
        let count = 0
        for (let j = Math.max(0, originalIndex - smoothingWindow); j <= Math.min(samples - 1, originalIndex + smoothingWindow); j++) {
          sum += dataArray[j]
          count++
        }
        const avgValue = sum / count
        
        // Convert byte (0-255) to normalized value (-1 to 1)
        const normalizedValue = (avgValue - 128) / 128
        
        // Calculate y position (center + displacement)
        const x = i * stepX
        const y = centerY + (normalizedValue * amplitude)
        
        if (i === 0) {
          pathData += `M ${x} ${y}`
        } else {
          pathData += ` L ${x} ${y}`
        }
      }

      path.setAttribute('d', pathData)

      animationFrameRef.current = requestAnimationFrame(draw)
    }

    // Start animation loop
    if (svgWidth > 0) {
      draw()
    }

    // Cleanup
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
    }
  }, [isPlaying, svgWidth, height, side])

  // Handle audio context resume
  useEffect(() => {
    if (isPlaying && audioContextRef.current && audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume().catch((error) => {
        console.error('Error resuming audio context:', error)
      })
    }
  }, [isPlaying])

  return (
    <svg
      ref={svgRef}
      className="w-full pointer-events-none"
      height={height}
      style={{ 
        opacity: isPlaying ? 0.7 : 0.3,
        transition: 'opacity 0.3s ease'
      }}
    >
      <path
        ref={pathRef}
        d={`M 0 ${height / 2} L ${svgWidth || 100} ${height / 2}`}
        fill="none"
        stroke="#2563eb"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

