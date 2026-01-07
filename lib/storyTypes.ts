import { Situation } from './clipTypes'

export interface StoryClip {
  id: string
  startMs: number
  endMs: number
  transcript: string
  audioUrl?: string
  audioStatus?: 'ready' | 'needs_generation' | 'generating' | 'error' // Audio availability status
  audioTextHash?: string // Hash of transcript used to generate audio (for mismatch detection)
  audioGeneratedFrom?: string // First 30 chars of transcript used to generate audio (for debugging)
  focusSkill?: string
  done?: boolean // Client-side state for completion tracking
}

export interface Story {
  id: string
  title: string
  context: string // Short context (10-15s read) - who/where/goal
  tags: string[]
  difficulty: 'easy' | 'medium' | 'hard'
  durationSec: number // Total duration of all clips
  clips: StoryClip[]
  fullAudioUrl?: string // Optional: if story has a full audio file
  situation?: Situation
}


