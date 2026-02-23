'use client'

import { Clip } from './clipTypes'

// Client-side storage functions only
export function getAllClipsClient(): Clip[] {
  if (typeof window === 'undefined') {
    return []
  }
  const stored = localStorage.getItem('userClips')
  return stored ? JSON.parse(stored) : []
}

export function saveClipClient(clip: Clip): void {
  if (typeof window === 'undefined') {
    return
  }
  const clips = getAllClipsClient()
  clips.push(clip)
  localStorage.setItem('userClips', JSON.stringify(clips))
}
