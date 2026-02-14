/**
 * Saved Tips Management
 * Client-side utilities for managing saved listening tips
 */

export interface SavedTip {
  id: string
  user_id: string
  phrase: string
  meaning_in_context?: string | null
  sound_rule?: string | null
  in_sentence_original?: string | null
  in_sentence_highlighted?: string | null
  in_sentence_heard_as?: string | null
  chunk_display?: string | null
  extra_example_sentence?: string | null
  extra_example_heard_as?: string | null
  category?: string | null
  tip?: string | null
  created_at: string
}

export interface SaveTipData {
  phrase: string
  meaning_in_context?: string | null
  sound_rule?: string | null
  in_sentence_original?: string | null
  in_sentence_highlighted?: string | null
  in_sentence_heard_as?: string | null
  chunk_display?: string | null
  extra_example_sentence?: string | null
  extra_example_heard_as?: string | null
  category?: string | null
  tip?: string | null
}

/**
 * Save a listening tip for the current user
 */
export async function saveTip(tipData: SaveTipData): Promise<{ success: boolean; error?: string; tip?: SavedTip }> {
  try {
    const response = await fetch('/api/saved-tips', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(tipData),
    })

    const data = await response.json()

    if (!response.ok) {
      return { success: false, error: data.error || 'Failed to save tip' }
    }

    return { success: true, tip: data.tip }
  } catch (error) {
    console.error('[savedTips] Error saving tip:', error)
    return { success: false, error: 'Network error' }
  }
}

/**
 * Remove a saved tip by ID
 */
export async function unsaveTip(tipId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`/api/saved-tips?id=${tipId}`, {
      method: 'DELETE',
    })

    const data = await response.json()

    if (!response.ok) {
      return { success: false, error: data.error || 'Failed to delete tip' }
    }

    return { success: true }
  } catch (error) {
    console.error('[savedTips] Error deleting tip:', error)
    return { success: false, error: 'Network error' }
  }
}

/**
 * Get all saved tips for the current user
 */
export async function getSavedTips(): Promise<{ success: boolean; tips?: SavedTip[]; error?: string }> {
  try {
    const response = await fetch('/api/saved-tips')

    const data = await response.json()

    if (!response.ok) {
      return { success: false, error: data.error || 'Failed to fetch tips' }
    }

    return { success: true, tips: data.tips }
  } catch (error) {
    console.error('[savedTips] Error fetching tips:', error)
    return { success: false, error: 'Network error' }
  }
}

/**
 * Check if a specific phrase is already saved
 */
export async function isTipSaved(phrase: string): Promise<boolean> {
  try {
    const result = await getSavedTips()
    if (!result.success || !result.tips) return false
    
    return result.tips.some(tip => tip.phrase === phrase)
  } catch (error) {
    console.error('[savedTips] Error checking if tip is saved:', error)
    return false
  }
}
