'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatRelativeDate } from '@/lib/dateUtils'
import { Heading, Body, Label, Caption } from '@/components/ui/Typography'
import { ArrowLeft, BookmarkSimple } from '@phosphor-icons/react'
import { Icon } from '@/components/ui/Icon'

interface SavedVocabItem {
  id: string
  chunk_display: string
  meaning_en: string | null
  example_sentence: string | null
  clip_id: string
  clip_chunk_span_id: string
  created_at: string
}

export default function SavedVocabularyPage() {
  const router = useRouter()
  const [items, setItems] = useState<SavedVocabItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [unsavingIds, setUnsavingIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    const loadItems = async () => {
      try {
        const response = await fetch('/api/saved')
        if (!response.ok) {
          console.error('❌ [SavedVocab] Failed to fetch items:', response.statusText)
          return
        }

        const data = await response.json()
        if (data.success) {
          // Sort by created_at descending (most recent first)
          const sorted = (data.items || []).sort((a: SavedVocabItem, b: SavedVocabItem) => {
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          })
          setItems(sorted)
        }
      } catch (error) {
        console.error('❌ [SavedVocab] Error loading items:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadItems()
  }, [])

  const handleRowClick = (id: string, e: React.MouseEvent) => {
    // Don't expand if clicking the bookmark button
    if ((e.target as HTMLElement).closest('button[data-bookmark]')) {
      return
    }
    setExpandedId(expandedId === id ? null : id)
  }

  const handleUnsave = async (item: SavedVocabItem, e: React.MouseEvent) => {
    e.stopPropagation()
    if (unsavingIds.has(item.id)) return

    setUnsavingIds(prev => new Set(prev).add(item.id))
    
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
        console.error('❌ [SavedVocab] Failed to unsave:', error)
        alert('Failed to unsave. Please try again.')
        return
      }

      // Remove item from list
      setItems(prev => prev.filter(i => i.id !== item.id))
      if (expandedId === item.id) {
        setExpandedId(null)
      }
    } catch (error) {
      console.error('❌ [SavedVocab] Error unsaving:', error)
      alert('Failed to unsave. Please try again.')
    } finally {
      setUnsavingIds(prev => {
        const next = new Set(prev)
        next.delete(item.id)
        return next
      })
    }
  }

  return (
    <main className="flex flex-col px-6 py-6 pb-24 md:pb-6">
      <div className="space-y-6">
        {/* Header */}
        <div className="space-y-4">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors -ml-1 px-1 py-1"
          >
            <Icon icon={ArrowLeft} size={20} className="text-current" />
            <Body>Back</Body>
          </button>
          <Heading as="h1" size="page">Saved Vocabulary</Heading>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="p-6 bg-gray-50 rounded-2xl border border-gray-200">
            <Caption tone="muted">Loading...</Caption>
          </div>
        ) : items.length === 0 ? (
          <div className="p-8 bg-blue-50 rounded-2xl border border-blue-200 text-center space-y-2">
            <Body className="text-blue-900">No saved vocabulary yet</Body>
            <Caption tone="muted">Save words and phrases during practice to see them here</Caption>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => {
              const isExpanded = expandedId === item.id
              const isUnsaving = unsavingIds.has(item.id)
              
              return (
                <div
                  key={item.id}
                  className={`relative w-full bg-white rounded-2xl border transition-colors ${
                    isExpanded 
                      ? 'border-blue-200 shadow-sm' 
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <button
                    onClick={(e) => handleRowClick(item.id, e)}
                    className="w-full p-5 text-left"
                  >
                    <div className="flex flex-col gap-3 pr-10">
                      <Body size="bodyStrong">{item.chunk_display}</Body>
                      
                      {!isExpanded && item.meaning_en && (
                        <Caption tone="muted" className="line-clamp-2">
                          MEANING: {item.meaning_en.replace(/^MEANING:\s*/i, '').split(/EXAMPLE:/i)[0].trim()}
                        </Caption>
                      )}
                      
                      {isExpanded && (
                        <div className="flex flex-col gap-4 pt-1">
                          {item.meaning_en && (
                            <div className="flex flex-col gap-1.5">
                              <Label size="label" className="text-gray-500 text-xs uppercase tracking-wide">Meaning</Label>
                              <Body tone="sub">
                                {item.meaning_en.replace(/^MEANING:\s*/i, '').split(/EXAMPLE:/i)[0].trim()}
                              </Body>
                            </div>
                          )}
                          {item.example_sentence && (
                            <div className="flex flex-col gap-1.5">
                              <Label size="label" className="text-gray-500 text-xs uppercase tracking-wide">Example</Label>
                              <Body tone="sub" className="italic">
                                "{item.example_sentence.replace(/^EXAMPLE:\s*/i, '')}"
                              </Body>
                            </div>
                          )}
                        </div>
                      )}
                      
                      {!isExpanded && (
                        <Caption tone="muted" className="text-xs">{formatRelativeDate(item.created_at)}</Caption>
                      )}
                    </div>
                  </button>
                  
                  {/* Bookmark icon */}
                  <button
                    data-bookmark
                    onClick={(e) => handleUnsave(item, e)}
                    disabled={isUnsaving}
                    className="absolute top-5 right-5 p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-200"
                    aria-label="Unsave"
                  >
                    <Icon 
                      icon={BookmarkSimple} 
                      size={20} 
                      weight="fill"
                      className="text-current"
                    />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
