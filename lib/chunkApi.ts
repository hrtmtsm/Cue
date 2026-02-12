/**
 * Client helper for fetching chunk hits from /api/chunk
 */

export interface ChunkHit {
  clip_id: string
  pattern_key: string | null
  chunk_display: string
  pattern_kind: string | null
  gloss: string | null
  translation_ja: string | null
  ref_start: number
  ref_end: number
  chunk_id?: string | null // UUID from clip_chunk_spans.id
  meaning_en?: string | null // Meaning from chunk_meanings table
}

/**
 * Fetch chunk hit for a given clip and character index
 * @param clipId - The clip ID
 * @param charIdx - Character index in the transcript string
 * @returns The chunk hit or null if not found
 */
export async function fetchChunkHit(
  clipId: string,
  charIdx: number
): Promise<ChunkHit | null> {
  try {
    const response = await fetch('/api/chunk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clipId, charIdx }),
    })

    if (!response.ok) {
      if (process.env.NODE_ENV === 'development') {
        console.error('❌ [chunkApi] API error:', response.status, response.statusText)
      }
      return null
    }

    const data = await response.json()
    
    if (process.env.NODE_ENV === 'development' && !data.hit) {
      console.log('⚠️ [chunkApi] API returned hit=null for:', { clipId, charIdx })
    }
    
    return data.hit || null
  } catch (error: any) {
    if (process.env.NODE_ENV === 'development') {
      console.error('❌ [chunkApi] Fetch error:', error)
    }
    return null
  }
}

/**
 * Fetch chunk meaning for a given chunk ID
 * @param chunkId - The chunk ID (UUID from clip_chunk_spans.id)
 * @returns The meaning or null if not found/generated
 */
export async function fetchChunkMeaning(
  chunkId: string
): Promise<string | null> {
  try {
    const response = await fetch('/api/chunk/meaning', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chunkId }),
    })

    if (!response.ok) {
      if (process.env.NODE_ENV === 'development') {
        console.error('❌ [chunkApi] Meaning API error:', response.status, response.statusText)
      }
      return null
    }

    const data = await response.json()
    return data.meaning || null
  } catch (error: any) {
    if (process.env.NODE_ENV === 'development') {
      console.error('❌ [chunkApi] Fetch meaning error:', error)
    }
    return null
  }
}
