'use client'

import { useState } from 'react'
import { Heading, Label, Caption } from './ui/Typography'
import { 
  SpeakerHighIcon, 
  SpeakerNoneIcon, 
  SpeakerSlashIcon,
  AudioWaveIcon 
} from './ui/Icons'

interface PlayerControlsProps {
  isPlaying?: boolean
  volume?: number
  onPlayPause?: () => void
  onVolumeChange?: (volume: number) => void
  onMute?: () => void
}

/**
 * Example PlayerControls component demonstrating Typography and Icons usage
 */
export default function PlayerControls({
  isPlaying = false,
  volume = 1.0,
  onPlayPause,
  onVolumeChange,
  onMute,
}: PlayerControlsProps) {
  const [isMuted, setIsMuted] = useState(false)

  const handleMute = () => {
    setIsMuted(!isMuted)
    onMute?.()
  }

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value)
    onVolumeChange?.(newVolume)
    if (newVolume > 0) {
      setIsMuted(false)
    }
  }

  const displayVolume = isMuted ? 0 : volume

  return (
    <div className="space-y-4 p-6 bg-white rounded-xl border border-gray-200">
      {/* Section title using Heading */}
      <Heading as="h2" className="text-xl">
        Audio Controls
      </Heading>

      {/* Play/Pause button */}
      <div className="flex items-center gap-4">
        <button
          onClick={onPlayPause}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg active:bg-blue-700 transition-colors"
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          <AudioWaveIcon 
            size={20} 
            aria-label={isPlaying ? 'Pause audio' : 'Play audio'}
            className={isPlaying ? 'animate-pulse' : ''}
          />
          <Label className="text-white">
            {isPlaying ? 'Pause' : 'Play'}
          </Label>
        </button>
      </div>

      {/* Volume control */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Volume</Label>
          <Caption className="text-gray-500">
            {Math.round(displayVolume * 100)}%
          </Caption>
        </div>

        <div className="flex items-center gap-3">
          {/* Mute button with icon */}
          <button
            onClick={handleMute}
            className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 active:bg-gray-300 transition-colors"
            aria-label={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? (
              <SpeakerSlashIcon 
                size={20} 
                aria-label="Muted"
                className="text-gray-600"
              />
            ) : displayVolume === 0 ? (
              <SpeakerNoneIcon 
                size={20} 
                aria-label="No volume"
                className="text-gray-400"
              />
            ) : displayVolume < 0.5 ? (
              <SpeakerHighIcon 
                size={20} 
                aria-label="Low volume"
                className="text-gray-600"
              />
            ) : (
              <SpeakerHighIcon 
                size={20} 
                aria-label="High volume"
                className="text-blue-600"
              />
            )}
          </button>

          {/* Volume slider */}
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={displayVolume}
            onChange={handleVolumeChange}
            className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            aria-label="Volume control"
          />
        </div>
      </div>

      {/* Status caption */}
      <Caption className="text-gray-500 block">
        {isPlaying 
          ? 'Audio is playing' 
          : isMuted 
          ? 'Audio is muted' 
          : 'Ready to play'}
      </Caption>
    </div>
  )
}
