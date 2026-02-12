'use client'

import { useEffect, useState } from 'react'
import { getSavedTips, unsaveTip, type SavedTip } from '@/lib/savedTips'
import { getProgress, migrateLocalStorageToDb } from '@/lib/progress'
import { Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { getPracticeEvents, type DetailedPracticeEvent } from '@/lib/userPreferences'
import { calculateListeningLevel, getCEFRLabel, type ListeningLevelData } from '@/lib/cefrMetrics'
import { getAllClipsClient } from '@/lib/clipStorage'
import type { Clip } from '@/lib/clipTypes'
import { loadUserStories } from '@/lib/storyClient'

export default function ProgressPage() {
  const [streak, setStreak] = useState(0)
  const [totalSessions, setTotalSessions] = useState(0)
  const [listeningMinutes, setListeningMinutes] = useState(0)
  const [completedStoriesCount, setCompletedStoriesCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [savedTips, setSavedTips] = useState<SavedTip[]>([])
  const [tipsLoading, setTipsLoading] = useState(true)
  const [expandedTipId, setExpandedTipId] = useState<string | null>(null)
  const [listeningLevel, setListeningLevel] = useState<ListeningLevelData | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const loadData = async () => {
      try {
        // First, migrate any old localStorage data to DB
        console.log('📊 [PROGRESS PAGE] Checking for migration')
        await migrateLocalStorageToDb()

        // Then load progress from DB
        console.log('📊 [PROGRESS PAGE] Loading progress from DB')
        const result = await getProgress()
        
        if (result.success && result.progress) {
          const progress = result.progress
          setStreak(progress.streak)
          setTotalSessions(progress.total_sessions)
          setListeningMinutes(progress.total_listening_minutes)
          setCompletedStoriesCount(progress.completed_stories.length)

          console.log('✅ [PROGRESS PAGE] Progress loaded:', {
            streak: progress.streak,
            sessions: progress.total_sessions,
            minutes: progress.total_listening_minutes,
            completedStories: progress.completed_stories.length,
          })
        } else {
          console.error('❌ [PROGRESS PAGE] Failed to load progress:', result.error)
        }
      } catch (error) {
        console.error('❌ [PROGRESS PAGE] Error loading progress:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [])

  // Fetch saved tips
  useEffect(() => {
    const fetchTips = async () => {
      setTipsLoading(true)
      const result = await getSavedTips()
      if (result.success && result.tips) {
        setSavedTips(result.tips)
      }
      setTipsLoading(false)
    }
    
    fetchTips()
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
        const uniqueEventClipIds = [...new Set(events.map(e => e.clipId))]
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

  const handleDeleteTip = async (tipId: string) => {
    if (!confirm('Are you sure you want to delete this saved tip?')) {
      return
    }

    const result = await unsaveTip(tipId)
    if (result.success) {
      setSavedTips(tips => tips.filter(t => t.id !== tipId))
      if (expandedTipId === tipId) {
        setExpandedTipId(null)
      }
    } else {
      alert('Failed to delete tip. Please try again.')
    }
  }

  if (isLoading) {
    return (
      <main className="flex flex-col px-6 py-6">
        <div className="text-gray-600">Loading progress...</div>
      </main>
    )
  }

  return (
    <main className="flex flex-col px-6 py-6">
      <div className="space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-gray-900">Progress</h1>
          <p className="text-gray-600">Track your listening improvement</p>
        </div>

        {/* Main Stats */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Your Stats</h2>
          
          <div className="grid grid-cols-3 gap-4">
            <StatCard 
              value={listeningMinutes}
              label="Minutes"
              suffix=" min"
              icon="⏱️"
            />
            <StatCard 
              value={totalSessions}
              label="Sessions"
              icon="📚"
            />
            <StatCard 
              value={streak}
              label="Day Streak"
              icon="🔥"
            />
          </div>
        </div>

        {/* Listening Level Card */}
        {listeningLevel && (
          <div className="p-5 bg-white rounded-2xl border border-gray-200">
            <div className="space-y-3">
              <h3 className="text-lg font-semibold text-gray-900">Listening Level</h3>
              
              {/* Primary Line: Around B1 · Intermediate */}
              <div className="flex items-baseline gap-2">
                <span className="text-lg font-semibold text-gray-900">
                  Around {listeningLevel.currentLevel}
                </span>
                <span className="text-gray-400">·</span>
                <span className="text-sm text-gray-600">{getCEFRLabel(listeningLevel.currentLevel)}</span>
              </div>
              
              {/* Capability Descriptor */}
              <p className="text-sm text-gray-700">
                {listeningLevel.capabilityDescriptor}
              </p>
              
              {/* Progress Bar + Stability Label */}
              <div className="space-y-2">
                <div className="relative w-full bg-gray-100 rounded-full h-2">
                  <div 
                    className="absolute top-0 left-0 h-full bg-blue-500 rounded-full transition-all duration-500"
                    style={{ width: `${Math.round(listeningLevel.stabilityScore * 100)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-500">
                    {Math.round(listeningLevel.stabilityScore * 100)}% · Stability
                  </p>
                  <span 
                    className="text-sm text-gray-500 cursor-help" 
                    title="Stability measures how consistently you understand clips at this level."
                  >
                    ⓘ
                  </span>
                </div>
              </div>
              
              {/* Confidence Indicator */}
              <div className="pt-2 border-t border-gray-100">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-500">
                    Confidence · {listeningLevel.confidence.charAt(0).toUpperCase() + listeningLevel.confidence.slice(1)}
                  </p>
                  
                  {/* Progression Context */}
                  {listeningLevel.progressionContext && (
                    <p className={`text-sm ${listeningLevel.progressionContext.direction === 'up' ? 'text-gray-700' : 'text-gray-500'}`}>
                      {listeningLevel.progressionContext.direction === 'up' ? '↑' : '↓'} From {listeningLevel.progressionContext.fromLevel}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Motivational Messages */}
        {totalSessions === 0 && (
          <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
            <div className="text-sm text-blue-900">
              🎯 Complete your first practice session to start tracking your progress!
            </div>
          </div>
        )}

        {streak >= 3 && (
          <div className="p-4 bg-orange-50 rounded-xl border border-orange-200">
            <div className="text-sm text-orange-900">
              🔥 {streak} day streak! You're on fire! Keep it up!
            </div>
          </div>
        )}

        {/* Saved Section (Placeholder for Phase 2) */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">Saved</h2>
          
          <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
            <div className="text-sm font-medium text-gray-900 mb-1">Words</div>
            <div className="text-sm text-gray-500">
              No saved words yet
            </div>
          </div>
          
          <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
            <div className="text-sm font-medium text-gray-900 mb-1">Phrases</div>
            <div className="text-sm text-gray-500">
              No saved phrases yet
            </div>
          </div>
          
          <div className="bg-gray-50 rounded-xl border border-gray-200">
            <div className="p-4">
              <div className="text-sm font-medium text-gray-900 mb-1">
                Vocabulary
              </div>
              <div className="text-sm text-gray-500">
                1 item · Saved today
              </div>
            </div>
          </div>
          
          <div className="bg-gray-50 rounded-xl border border-gray-200">
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium text-gray-900">Listening tips</div>
                {tipsLoading && <div className="text-xs text-gray-500">Loading...</div>}
              </div>
              
              {!tipsLoading && savedTips.length === 0 && (
                <div className="text-sm text-gray-500">
                  No saved tips yet
                </div>
              )}
              
              {!tipsLoading && savedTips.length > 0 && (
                <div className="text-sm text-gray-600 mb-3">
                  {savedTips.length} {savedTips.length === 1 ? 'tip' : 'tips'} saved
                </div>
              )}
            </div>
            
            {savedTips.length > 0 && (
              <div className="border-t border-gray-200 divide-y divide-gray-200">
                {savedTips.map((tip) => (
                  <div key={tip.id} className="p-4 hover:bg-gray-100 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <button
                        onClick={() => setExpandedTipId(expandedTipId === tip.id ? null : tip.id)}
                        className="flex-1 text-left"
                      >
                        <div className="font-medium text-gray-900 mb-1">{tip.phrase}</div>
                        {tip.meaning_in_context && (
                          <div className="text-sm text-gray-600 line-clamp-2">
                            {tip.meaning_in_context}
                          </div>
                        )}
                        {expandedTipId === tip.id && (
                          <div className="mt-3 space-y-3">
                            {tip.sound_rule && (
                              <div>
                                <div className="text-xs font-medium text-gray-500 mb-1">How it sounds</div>
                                <div className="text-sm text-gray-700">{tip.sound_rule}</div>
                              </div>
                            )}
                            {tip.in_sentence_original && (
                              <div>
                                <div className="text-xs font-medium text-gray-500 mb-1">In this phrase</div>
                                <div className="text-sm text-gray-700 italic">"{tip.in_sentence_original}"</div>
                                {tip.in_sentence_highlighted && tip.in_sentence_heard_as && (
                                  <div className="text-xs text-gray-600 mt-1">
                                    "{tip.in_sentence_highlighted}" → "{tip.in_sentence_heard_as}"
                                  </div>
                                )}
                              </div>
                            )}
                            {tip.extra_example_sentence && (
                              <div>
                                <div className="text-xs font-medium text-gray-500 mb-1">Example</div>
                                <div className="text-sm text-gray-700 italic">"{tip.extra_example_sentence}"</div>
                              </div>
                            )}
                            {tip.tip && (
                              <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                                <div className="text-xs font-medium text-blue-700 mb-1">💡 Listening tip</div>
                                <div className="text-sm text-blue-900">{tip.tip}</div>
                              </div>
                            )}
                          </div>
                        )}
                      </button>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setExpandedTipId(expandedTipId === tip.id ? null : tip.id)}
                          className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                          aria-label={expandedTipId === tip.id ? "Collapse" : "Expand"}
                        >
                          {expandedTipId === tip.id ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          onClick={() => handleDeleteTip(tip.id)}
                          className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                          aria-label="Delete tip"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
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
    <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
      <div className="text-2xl font-bold text-gray-900">
        {icon && <span className="mr-1">{icon}</span>}
        {value}{suffix}
      </div>
      <div className="text-sm text-gray-600 mt-1">{label}</div>
    </div>
  )
}