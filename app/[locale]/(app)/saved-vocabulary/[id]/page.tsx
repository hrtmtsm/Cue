'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'

interface SavedVocabItem {
  id: string
  chunk_display: string
  meaning_en: string | null
  example_sentence: string | null
  clip_chunk_span_id: string
  clip_id: string
  created_at: string
}

export default function SavedVocabularyDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  const [item, setItem] = useState<SavedVocabItem | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isUnsaving, setIsUnsaving] = useState(false)

  useEffect(() => {
    const loadItem = async () => {
      if (!id) return

      try {
        const response = await fetch('/api/saved')
        if (!response.ok) {
          console.error('❌ [SavedVocabDetail] Failed to fetch items:', response.statusText)
          return
        }

        const data = await response.json()
        if (data.success) {
          const foundItem = (data.items || []).find((i: SavedVocabItem) => i.id === id)
          if (foundItem) {
            setItem(foundItem)
          } else {
            console.warn('⚠️ [SavedVocabDetail] Item not found:', id)
          }
        }
      } catch (error) {
        console.error('❌ [SavedVocabDetail] Error loading item:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadItem()
  }, [id])

  const handleUnsave = async () => {
    if (!item || isUnsaving) return

    setIsUnsaving(true)
    try {
      const response = await fetch('/api/saved/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clipId: item.clip_id,
          clipChunkSpanId: item.clip_chunk_span_id,
          chunkDisplay: item.chunk_display,
          meaning: item.meaning_en || null,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        console.error('❌ [SavedVocabDetail] Failed to unsave:', error)
        alert('Failed to unsave. Please try again.')
        return
      }

      // Navigate back to list
      router.push('/saved-vocabulary')
    } catch (error) {
      console.error('❌ [SavedVocabDetail] Error unsaving:', error)
      alert('Failed to unsave. Please try again.')
    } finally {
      setIsUnsaving(false)
    }
  }

  if (isLoading) {
    return (
      <main className="flex flex-col px-6 py-6">
        <div className="text-gray-600">Loading...</div>
      </main>
    )
  }

  if (!item) {
    return (
      <main className="flex flex-col px-6 py-6">
        <div className="space-y-4">
          <button
            onClick={() => router.back()}
            className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            ← Back
          </button>
          <div className="p-8 bg-gray-50 rounded-xl border border-gray-200 text-center">
            <div className="text-sm text-gray-500">Item not found</div>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="flex flex-col px-6 py-6">
      <div className="space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <button
            onClick={() => router.back()}
            className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            ← Back
          </button>
          <h1 className="text-2xl font-bold text-gray-900">{item.chunk_display}</h1>
        </div>

        {/* Content */}
        <div className="space-y-4">
          {/* Meaning section */}
          {item.meaning_en && (
            <div className="space-y-1.5">
              <div className="text-[10px] uppercase tracking-wide text-gray-500 font-medium">
                MEANING
              </div>
              <div className="text-sm text-gray-700">
                {item.meaning_en}
              </div>
            </div>
          )}

          {/* Example section */}
          {item.example_sentence && (
            <div className="space-y-1.5">
              <div className="text-[10px] uppercase tracking-wide text-gray-500 font-medium">
                EXAMPLE
              </div>
              <div className="text-sm text-gray-600 italic">
                "{item.example_sentence}"
              </div>
            </div>
          )}

          {/* Divider */}
          <div className="border-t border-gray-200 my-4" />

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleUnsave}
              disabled={isUnsaving}
              className="flex-1 py-2.5 px-4 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium active:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isUnsaving ? 'Unsaving...' : 'Unsave'}
            </button>
            <button
              onClick={() => router.back()}
              className="flex-1 py-2.5 px-4 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium active:bg-gray-200 transition-colors"
            >
              Back
            </button>
          </div>
        </div>
      </div>
    </main>
  )
}
