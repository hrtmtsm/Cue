'use client'

import { useEffect, useRef, useState } from 'react'

interface RecordingWaveformProps {
  stream: MediaStream | null
  isRecording: boolean
  height?: number
}

export default function RecordingWaveform({ 
  stream, 
  isRecording,
  height = 48 
}: RecordingWaveformProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const pathRef = useRef<SVGPathElement>(null)
  const animationFrameRef = useRef<number | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const mediaSourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const dataArrayRef = useRef<Uint8Array | null>(null)
  const [svgWidth, setSvgWidth] = useState(0)

  // Initialize AudioContext and AnalyserNode for live microphone input
  useEffect(() => {
    if (typeof window === 'undefined' || !stream || !isRecording) return

    let audioContext = audioContextRef.current
    let analyser = analyserRef.current
    let mediaSource = mediaSourceRef.current

    // Create new AudioContext for microphone input
    if (!audioContext) {
      try {
        audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
        audioContextRef.current = audioContext

        // Create analyser node
        analyser = audioContext.createAnalyser()
        analyser.fftSize = 1024
        analyser.smoothingTimeConstant = 0.5 // Smooth for cleaner visuals
        analyserRef.current = analyser

        // Connect microphone stream to analyser
        mediaSource = audioContext.createMediaStreamSource(stream)
        mediaSource.connect(analyser)
        mediaSourceRef.current = mediaSource

        // Create data array for time-domain data
        const bufferLength = analyser.fftSize
        dataArrayRef.current = new Uint8Array(bufferLength)

        console.log('✅ [RecordingWaveform] AudioContext initialized for microphone')
      } catch (error) {
        console.error('❌ [RecordingWaveform] Error initializing AudioContext:', error)
        return
      }
    }

    // Resume audio context if suspended
    if (audioContext && audioContext.state === 'suspended') {
      audioContext.resume().catch((error) => {
        console.error('[RecordingWaveform] Error resuming audio context:', error)
      })
    }

    return () => {
      // Cleanup on unmount or when recording stops
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
    }
  }, [stream, isRecording])

  // Update SVG width on resize
  useEffect(() => {
    if (!svgRef.current) return

    const updateWidth = () => {
      if (svgRef.current) {
        setSvgWidth(svgRef.current.clientWidth)
      }
    }

    updateWidth()
    window.addEventListener('resize', updateWidth)
    return () => window.removeEventListener('resize', updateWidth)
  }, [])

  // Render waveform animation
  useEffect(() => {
    if (!isRecording || !analyserRef.current || !dataArrayRef.current || !pathRef.current || svgWidth === 0) {
      return
    }

    const analyser = analyserRef.current
    const dataArray = dataArrayRef.current
    const path = pathRef.current

    const renderFrame = () => {
      if (!isRecording || !analyser || !dataArray || !path) return

      // Get time-domain waveform data
      analyser.getByteTimeDomainData(dataArray)

      // Sample points for smooth waveform (reduce points for performance)
      const sampleSize = 128
      const step = Math.floor(dataArray.length / sampleSize)
      const points: Array<{ x: number; y: number }> = []

      for (let i = 0; i < sampleSize; i++) {
        const index = i * step
        const value = dataArray[index]
        
        // Normalize to -1 to 1, then scale to SVG height
        const normalized = (value - 128) / 128
        const x = (i / sampleSize) * svgWidth
        const y = (height / 2) + (normalized * height * 0.4) // Scale to 40% of height

        points.push({ x, y })
      }

      // Generate smooth path using quadratic curves
      let pathData = `M ${points[0].x} ${points[0].y}`
      
      for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1]
        const curr = points[i]
        const midX = (prev.x + curr.x) / 2
        const midY = (prev.y + curr.y) / 2
        pathData += ` Q ${prev.x} ${prev.y}, ${midX} ${midY}`
      }

      // Complete the path
      const last = points[points.length - 1]
      pathData += ` L ${last.x} ${last.y}`

      path.setAttribute('d', pathData)

      animationFrameRef.current = requestAnimationFrame(renderFrame)
    }

    renderFrame()

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [isRecording, svgWidth, height])

  // Show flat line when not recording
  const flatLinePath = `M 0 ${height / 2} L ${svgWidth} ${height / 2}`

  return (
    <svg
      ref={svgRef}
      width="100%"
      height={height}
      className="overflow-visible"
      style={{ display: 'block' }}
    >
      <path
        ref={pathRef}
        d={isRecording ? undefined : flatLinePath}
        stroke="#3B82F6"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={isRecording ? 0.8 : 0.3}
      />
    </svg>
  )
}



