'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { CaretRight } from '@phosphor-icons/react'
import { formatRelativeDate } from '@/lib/dateUtils'
import { Heading, Body, Label, Caption, Numeric } from '@/components/ui/Typography'
import { Icon } from '@/components/ui/Icon'
import { getSavedTips, type SavedTip } from '@/lib/savedTips'
import { getProgress, migrateLocalStorageToDb } from '@/lib/progress'
import { getPracticeEvents, type DetailedPracticeEvent } from '@/lib/userPreferences'
import { calculateListeningLevel, getCEFRLabel, type ListeningLevelData } from '@/lib/cefrMetrics'
import { getAllClipsClient } from '@/lib/clipStorage.client'
import type { Clip } from '@/lib/clipTypes'
import { loadUserStories } from '@/lib/storyClient'

interface SavedChunk {
  id: string
  chunk_text: string
  chunk_display?: string
  meaning_en: string | null
  example_sentence?: string | null
  clip_id: string
  created_at: string
}

interface SavedItems {
  words: SavedChunk[]
  phrases: SavedChunk[]
  tips: SavedChunk[]
}

export default function ProgressPage() {
  const t = useTranslations()
  const router = useRouter()
  const [streak, setStreak] = useState(0)
  const [totalSessions, setTotalSessions] = useState(0)
  const [listeningMinutes, setListeningMinutes] = useState(0)
  const [completedStoriesCount, setCompletedStoriesCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [savedItems, setSavedItems] = useState<SavedItems>({ words: [], phrases: [], tips: [] })
  const [vocabItems, setVocabItems] = useState<SavedChunk[]>([])
  const [isLoadingSaved, setIsLoadingSaved] = useState(true)
  const [isLoadingVocab, setIsLoadingVocab] = useState(true)
  const [savedTips, setSavedTips] = useState<SavedTip[]>([])
  const [isLoadingTips, setIsLoadingTips] = useState(true)
  const [listeningLevel, setListeningLevel] = useState<ListeningLevelData | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const loadProgress = async () => {
      try {
        // First, migrate any old localStorage data to DB
        console.log('📊 [PROGRESS PAGE] Checking for migration')
        await migrateLocalStorageToDb()

        // Clear cache to force fresh fetch from DB
        console.log('📊 [PROGRESS PAGE] Loading progress from DB (force refresh)')
        const result = await getProgress(true) // Force refresh
        
        if (result.success && result.progress) {
          const progress = result.progress
          setStreak(progress.streak || 0)
          setTotalSessions(progress.total_sessions || 0)
          setListeningMinutes(progress.total_listening_minutes || 0)
          setCompletedStoriesCount(progress.completed_stories?.length || 0)

          console.log('✅ [PROGRESS PAGE] Progress loaded:', {
            streak: progress.streak,
            sessions: progress.total_sessions,
            minutes: progress.total_listening_minutes,
            completedStories: progress.completed_stories?.length || 0,
            lastPracticeDate: progress.last_practice_date,
          })
        } else {
          console.error('❌ [PROGRESS PAGE] Failed to load progress:', {
            success: result.success,
            error: result.error,
            progress: result.progress,
          })
        }
      } catch (error) {
        console.error('❌ [PROGRESS PAGE] Error loading progress:', {
          error: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
        })
      } finally {
        setIsLoading(false)
      }
    }

    const loadSavedItems = async () => {
      try {
        const response = await fetch('/api/saved-chunks')
        if (!response.ok) {
          console.error('❌ [PROGRESS PAGE] Failed to fetch saved items:', response.statusText)
          return
        }

        const data = await response.json()
        if (data.success) {
          setSavedItems({
            words: data.words || [],
            phrases: data.phrases || [],
            tips: data.tips || [],
          })
        }
      } catch (error) {
        console.error('❌ [PROGRESS PAGE] Error loading saved items:', error)
      } finally {
        setIsLoadingSaved(false)
      }
    }

    const loadVocab = async () => {
      try {
        console.log('📚 [PROGRESS PAGE] Loading vocab items')
        const response = await fetch('/api/saved')
        if (!response.ok) {
          console.error('❌ [PROGRESS PAGE] Failed to fetch vocab:', response.statusText)
          return
        }

        const data = await response.json()
        if (data.success) {
          console.log('✅ [PROGRESS PAGE] Loaded vocab items:', data.items?.length || 0)
          setVocabItems(data.items || [])
        }
      } catch (error) {
        console.error('❌ [PROGRESS PAGE] Error loading vocab:', error)
      } finally {
        setIsLoadingVocab(false)
      }
    }

    const loadTips = async () => {
      try {
        console.log('💡 [PROGRESS PAGE] Loading saved tips')
        const result = await getSavedTips()
        if (result.success && result.tips) {
          console.log('✅ [PROGRESS PAGE] Loaded tips:', result.tips.length)
          setSavedTips(result.tips)
        }
      } catch (error) {
        console.error('❌ [PROGRESS PAGE] Error loading tips:', error)
      } finally {
        setIsLoadingTips(false)
      }
    }

    loadProgress()
    loadSavedItems()
    loadVocab()
    loadTips()
  }, [])

  // Refresh progress when page becomes visible (user returns from complete page)
  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('📊 [PROGRESS PAGE] Page visible - refreshing progress')
        const loadProgress = async () => {
          try {
            const result = await getProgress(true) // Force refresh
            if (result.success && result.progress) {
              const progress = result.progress
              setStreak(progress.streak || 0)
              setTotalSessions(progress.total_sessions || 0)
              setListeningMinutes(progress.total_listening_minutes || 0)
              setCompletedStoriesCount(progress.completed_stories?.length || 0)
              console.log('✅ [PROGRESS PAGE] Progress refreshed on visibility change')
            }
          } catch (error) {
            console.error('❌ [PROGRESS PAGE] Error refreshing progress:', error)
          }
        }
        loadProgress()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  // Load practice events and calculate metrics
  useEffect(() => {
    if (typeof window === 'undefined') return

    try {
      const events = getPracticeEvents() as DetailedPracticeEvent[]
      
      console.log('📊 [PROGRESS PAGE] Starting metrics calculation')
      console.log('📊 [PROGRESS PAGE] events:', events.length, 'events loaded')
      
      if (events.length > 0) {
        // Calculate Listening Level
        console.log('📊 [PROGRESS PAGE] Loading clips for Listening Level...')
        
        // Load clips from both sources: standalone clips + story clips
        const standaloneClips = getAllClipsClient()
        const stories = loadUserStories()
        
        // Extract clips from stories and convert to Clip format
        const storyClips: Clip[] = []
        stories.forEach(story => {
          story.clips.forEach(storyClip => {
            storyClips.push({
              id: storyClip.id,
              text: storyClip.transcript,
              title: `${story.title} - Clip`,
              audioUrl: storyClip.audioUrl || '',
              focus: [storyClip.focusSkill || 'connected_speech'],
              targetStyle: story.situation || 'Daily Life',
              situation: story.situation as any || 'Daily Life',
              lengthSec: (storyClip.endMs - storyClip.startMs) / 1000,
              difficulty: story.difficulty,
              createdAt: new Date().toISOString(),
            })
          })
        })
        
        // Combine both sources
        const allClips = [...standaloneClips, ...storyClips]
        console.log('📊 [PROGRESS PAGE] clips loaded:', {
          standalone: standaloneClips.length,
          fromStories: storyClips.length,
          total: allClips.length
        })
        
        // Debug: Show clip IDs
        console.log('📊 [PROGRESS PAGE] clip IDs:', allClips.map(c => c.id).slice(0, 5), '...')
        
        const clipsMap = new Map<string, Clip>()
        allClips.forEach(clip => clipsMap.set(clip.id, clip))

        // Debug: Show event clip IDs
        const uniqueEventClipIds = Array.from(new Set(events.map(e => e.clipId)))
        console.log('📊 [PROGRESS PAGE] unique event clipIds:', uniqueEventClipIds.slice(0, 5), '...')
        
        // Debug: Check how many events match clips
        const matchedEvents = events.filter(e => clipsMap.has(e.clipId))
        console.log('📊 [PROGRESS PAGE] matched events:', matchedEvents.length, '/', events.length)

        console.log('📊 [PROGRESS PAGE] Calling calculateListeningLevel...')
        const levelData = calculateListeningLevel(events, clipsMap)
        console.log('📊 [PROGRESS PAGE] levelData result:', levelData)
        
        setListeningLevel(levelData)

        if (levelData) {
          console.log('📊 [PROGRESS PAGE] Listening Level calculated:', {
            level: levelData.currentLevel,
            confidence: levelData.confidence,
            stabilityScore: Math.round(levelData.stabilityScore * 100) + '%',
            descriptor: levelData.capabilityDescriptor,
            progression: levelData.progressionContext,
          })
        } else {
          console.log('⚠️ [PROGRESS PAGE] Listening Level returned null')
        }
      } else {
        console.log('⚠️ [PROGRESS PAGE] No practice events found - skipping metrics calculation')
      }
    } catch (error) {
      console.error('❌ [PROGRESS PAGE] Error calculating metrics:', error)
    }
  }, [])

  if (isLoading) {
    return (
      <main className="flex flex-col px-6 py-6">
        <div className="text-gray-600">{t('common.loading')}</div>
      </main>
    )
  }

  return (
    <main className="flex flex-col px-6 py-6">
      <div className="space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <Heading as="h1" size="page">{t('progress.title')}</Heading>
          <Body tone="sub">{t('progress.subtitle')}</Body>
        </div>

        {/* Main Stats */}
        <div className="space-y-4">
          <Heading as="h2" size="section">{t('progress.yourStats')}</Heading>
          
          <div className="grid grid-cols-3 gap-4">
            <StatCard 
              value={listeningMinutes}
              label={t('progress.minutes')}
              suffix=" min"
              icon="⏱️"
            />
            <StatCard 
              value={totalSessions}
              label={t('progress.sessions')}
              icon="📚"
            />
            <StatCard 
              value={streak}
              label={t('progress.streak')}
              icon="🔥"
            />
          </div>
        </div>

        {/* Listening Level Card */}
        {listeningLevel && (
          <div className="p-5 bg-white rounded-2xl border border-gray-200">
            <div className="space-y-3">
              <Heading as="h3" size="card">{t('progress.listeningLevel.title')}</Heading>
              
              {/* Primary Line: Around B1 · Intermediate */}
              <div className="flex items-baseline gap-2">
                <Body size="bodyStrong" className="text-gray-900">
                  {t('progress.listeningLevel.around')} {listeningLevel.currentLevel}
                </Body>
                <span className="text-gray-400">·</span>
                <Body tone="sub">{t(`progress.listeningLevel.cefrLabels.${listeningLevel.currentLevel}`)}</Body>
              </div>
              
              {/* Capability Descriptor */}
              <Caption tone="default" className="text-gray-700">
                {t(`progress.listeningLevel.descriptors.${listeningLevel.currentLevel}`)}
              </Caption>
              
              {/* Progress Bar + Stability Label */}
              <div className="space-y-2">
                <div className="relative w-full bg-gray-100 rounded-full h-2">
                  <div 
                    className="absolute top-0 left-0 h-full bg-blue-500 rounded-full transition-all duration-500"
                    style={{ width: `${Math.round(listeningLevel.stabilityScore * 100)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Caption tone="muted">
                    {Math.round(listeningLevel.stabilityScore * 100)}% · {t('progress.listeningLevel.stability')}
                  </Caption>
                  <Caption tone="muted" className="cursor-help" title={t('progress.listeningLevel.stabilityTooltip')}>
                    ⓘ
                  </Caption>
                </div>
              </div>
              
              {/* Confidence Indicator */}
              <div className="pt-2 border-t border-gray-100">
                <div className="flex items-center justify-between">
                  <Caption tone="muted">
                    {t('progress.listeningLevel.confidence')} · {t(`progress.listeningLevel.confidenceLevels.${listeningLevel.confidence}`)}
                  </Caption>
                  
                  {/* Progression Context */}
                  {listeningLevel.progressionContext && listeningLevel.progressionContext.fromLevel && (
                    <Caption tone={listeningLevel.progressionContext.direction === 'up' ? 'default' : 'muted'}>
                      {listeningLevel.progressionContext.direction === 'up' ? '↑' : '↓'} {t('progress.listeningLevel.progression.from')} {listeningLevel.progressionContext.fromLevel}
                    </Caption>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Motivational Messages */}
        {totalSessions === 0 && (
          <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
            <Body className="text-blue-900 text-sm">
              🎯 Complete your first practice session to start tracking your progress!
            </Body>
          </div>
        )}

        {streak >= 3 && (
          <div className="p-4 bg-orange-50 rounded-xl border border-orange-200">
            <Body className="text-orange-900 text-sm">
              🔥 <Numeric>{streak}</Numeric> day streak! You're on fire! Keep it up!
            </Body>
          </div>
        )}

        {/* Saved Section */}
        <div className="space-y-3">
          <Heading as="h2" size="section">{t('progress.saved')}</Heading>
          
          {/* Vocabulary */}
          {isLoadingVocab ? (
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
              <Caption tone="muted">Loading...</Caption>
            </div>
          ) : (
            <button
              onClick={() => router.push('/saved-vocabulary')}
              className="w-full p-4 bg-white rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer text-left flex items-center justify-between gap-3"
            >
              <div className="flex-1 flex flex-col gap-1">
                <Body size="bodyStrong">{t('progress.vocabulary')}</Body>
                {vocabItems.length === 0 ? (
                  <Caption tone="muted">No saved vocab yet</Caption>
                ) : (
                  <div className="flex items-baseline gap-1.5 flex-wrap">
                    <Numeric size="stat">{vocabItems.length}</Numeric>
                    <Label tone="sub">{vocabItems.length === 1 ? 'item' : 'items'}</Label>
                    {vocabItems.length > 0 && vocabItems[0]?.created_at && (
                      <>
                        <Caption tone="muted">·</Caption>
                        <Caption tone="muted">{formatRelativeDate(vocabItems[0].created_at)}</Caption>
                      </>
                    )}
                  </div>
                )}
              </div>
              <Icon icon={CaretRight} size={20} className="text-gray-400 flex-shrink-0" />
            </button>
          )}
          
          {/* Tips */}
          {isLoadingTips ? (
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
              <Caption tone="muted">Loading...</Caption>
            </div>
          ) : (
            <button
              onClick={() => router.push('/saved-tips')}
              className="w-full p-4 bg-white rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer text-left flex items-center justify-between gap-3"
            >
              <div className="flex-1 flex flex-col gap-1">
                <Body size="bodyStrong">{t('progress.listeningTips')}</Body>
                {savedTips.length === 0 ? (
                  <Caption tone="muted">No saved tips yet</Caption>
                ) : (
                  <div className="flex items-baseline gap-1.5 flex-wrap">
                    <Numeric size="stat">{savedTips.length}</Numeric>
                    <Label tone="sub">{savedTips.length === 1 ? 'tip' : 'tips'}</Label>
                    {savedTips.length > 0 && savedTips[0]?.created_at && (
                      <>
                        <Caption tone="muted">·</Caption>
                        <Caption tone="muted">{formatRelativeDate(savedTips[0].created_at)}</Caption>
                      </>
                    )}
                  </div>
                )}
              </div>
              <Icon icon={CaretRight} size={20} className="text-gray-400 flex-shrink-0" />
            </button>
          )}
        </div>
      </div>
    </main>
  )
}

function StatCard({ 
  value, 
  label, 
  suffix = '', 
  icon = '' 
}: { 
  value: number
  label: string
  suffix?: string
  icon?: string
}) {
  return (
    <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 flex flex-col gap-1">
      {/* Line 1: icon + Value + unit */}
      <div className="flex items-baseline gap-1">
        {icon && <span className="text-lg leading-none">{icon}</span>}
        <Numeric size="kpi">{value}</Numeric>
        {suffix && <Caption tone="muted">{suffix}</Caption>}
      </div>
      {/* Line 2: label */}
      <Label size="kpiLabel" tone="sub">{label}</Label>
    </div>
  )
}
