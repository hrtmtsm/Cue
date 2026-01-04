export interface ClipProfile {
  focus: string[] // e.g., ['connected_speech', 'speed']
  targetStyle: string // e.g., 'Everyday conversations', 'Work & meetings'
  lengthSec: number // Target length in seconds
  difficulty?: 'easy' | 'medium' | 'hard' // Optional difficulty level
}

export type Situation = 'Work' | 'Daily Life' | 'Social' | 'Travel' | 'Media'

export interface Clip {
  id: string
  text: string
  title: string // Situational title (2-4 words, contextual but non-revealing)
  audioUrl: string
  focus: string[]
  targetStyle: string
  situation: Situation // Categorical badge (Work, Daily Life, Social, Travel, Media)
  lengthSec: number
  difficulty?: 'easy' | 'medium' | 'hard'
  createdAt: string // ISO timestamp
}

