'use client'

import { 
  SpeakerSimpleHigh,
  SpeakerSimpleLow,
  SpeakerSimpleNone,
  SpeakerSimpleSlash,
  Waveform as AudioWave,
} from '@phosphor-icons/react'
import { IconProps } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

interface SoundIconProps extends Omit<IconProps, 'aria-label'> {
  'aria-label'?: string
  size?: number | string
  className?: string
}

const defaultSize = 24

/**
 * Sound icon component
 */
export function SoundIcon({ 
  size = defaultSize, 
  className,
  'aria-label': ariaLabel = 'Sound',
  ...props 
}: SoundIconProps) {
  return (
    <SpeakerSimpleHigh
      size={size}
      className={cn('text-current', className)}
      aria-label={ariaLabel}
      {...props}
    />
  )
}

/**
 * Speaker icon component
 */
export function SpeakerIcon({ 
  size = defaultSize, 
  className,
  'aria-label': ariaLabel = 'Speaker',
  ...props 
}: SoundIconProps) {
  return (
    <SpeakerSimpleHigh
      size={size}
      className={cn('text-current', className)}
      aria-label={ariaLabel}
      {...props}
    />
  )
}

/**
 * SpeakerHigh icon component (high volume)
 */
export function SpeakerHighIcon({ 
  size = defaultSize, 
  className,
  'aria-label': ariaLabel = 'High volume',
  ...props 
}: SoundIconProps) {
  return (
    <SpeakerSimpleHigh
      size={size}
      className={cn('text-current', className)}
      aria-label={ariaLabel}
      {...props}
    />
  )
}

/**
 * SpeakerNone icon component (muted)
 */
export function SpeakerNoneIcon({ 
  size = defaultSize, 
  className,
  'aria-label': ariaLabel = 'Muted',
  ...props 
}: SoundIconProps) {
  return (
    <SpeakerSimpleNone
      size={size}
      className={cn('text-current', className)}
      aria-label={ariaLabel}
      {...props}
    />
  )
}

/**
 * SpeakerSlash icon component (sound off)
 */
export function SpeakerSlashIcon({ 
  size = defaultSize, 
  className,
  'aria-label': ariaLabel = 'Sound off',
  ...props 
}: SoundIconProps) {
  return (
    <SpeakerSimpleSlash
      size={size}
      className={cn('text-current', className)}
      aria-label={ariaLabel}
      {...props}
    />
  )
}

/**
 * AudioWave icon component (waveform)
 */
export function AudioWaveIcon({ 
  size = defaultSize, 
  className,
  'aria-label': ariaLabel = 'Audio waveform',
  ...props 
}: SoundIconProps) {
  return (
    <AudioWave
      size={size}
      className={cn('text-current', className)}
      aria-label={ariaLabel}
      {...props}
    />
  )
}
