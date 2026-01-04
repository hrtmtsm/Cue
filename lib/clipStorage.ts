import { Clip } from './clipTypes'

// Client-side storage functions
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

// Server-side storage functions (used by API routes)
export async function getAllClips(): Promise<Clip[]> {
  if (typeof window !== 'undefined') {
    // This shouldn't be called on client, but return empty array if it is
    return []
  }

  // Dynamic import for server-side only modules
  const fs = await import('fs')
  const path = await import('path')
  
  const DATA_DIR = path.join(process.cwd(), 'data')
  const CLIPS_FILE = path.join(DATA_DIR, 'clips.json')

  // Ensure data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }

  if (!fs.existsSync(CLIPS_FILE)) {
    return []
  }
  
  try {
    const data = fs.readFileSync(CLIPS_FILE, 'utf-8')
    return JSON.parse(data)
  } catch (error) {
    console.error('Error reading clips file:', error)
    return []
  }
}

export async function saveClip(clip: Clip): Promise<void> {
  if (typeof window !== 'undefined') {
    // This shouldn't be called on client
    return
  }

  // Dynamic import for server-side only modules
  const fs = await import('fs')
  const path = await import('path')
  
  const DATA_DIR = path.join(process.cwd(), 'data')
  const CLIPS_FILE = path.join(DATA_DIR, 'clips.json')

  // Ensure data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }

  const clips = await getAllClips()
  clips.push(clip)
  
  try {
    fs.writeFileSync(CLIPS_FILE, JSON.stringify(clips, null, 2), 'utf-8')
  } catch (error) {
    console.error('Error writing clips file:', error)
    throw error
  }
}

export async function getClipById(id: string): Promise<Clip | null> {
  const clips = await getAllClips()
  return clips.find(c => c.id === id) || null
}

export async function getClipsByFocus(focus: string[]): Promise<Clip[]> {
  const clips = await getAllClips()
  return clips.filter(clip => 
    focus.some(f => clip.focus.includes(f))
  )
}

