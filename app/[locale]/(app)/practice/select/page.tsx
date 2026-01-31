'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { 
  Briefcase, Users, Home, MapPin, Tv, ChevronLeft, Clock, Layers
} from 'lucide-react'
import { Story } from '@/lib/storyTypes'
import { mockStories } from '@/lib/mockStoryData'
import { Clip as ClipType } from '@/lib/clipTypes'
import { convertClipsToStories } from '@/lib/clipToStoryConverter'
import { loadUserStories, saveUserStories } from '@/lib/storyClient'
import { loadDiagnosticSummary, type DiagnosticSummary } from '@/lib/diagnosticSummary'
import { loadQuickStartSummary, getFeedStartDifficulty } from '@/lib/quickStartSummary'
import { getOnboardingData } from '@/lib/onboardingStore'
import { mapSituationKeyToClipSituation } from '@/lib/situationMapping'
import { getNextUncompletedStory, getCompletedStories, getStoryProgress } from '@/lib/storyRotation'
import ClipsReadyModal from '@/components/ClipsReadyModal'

// Helper to get icon for story based on situation
const getStoryIcon = (situation?: string): React.ReactNode => {
  switch (situation) {
    case 'Work':
      return <Briefcase className="w-6 h-6" />
    case 'Daily Life':
      return <Home className="w-6 h-6" />
    case 'Social':
      return <Users className="w-6 h-6" />
    case 'Travel':
      return <MapPin className="w-6 h-6" />
    case 'Media':
      return <Tv className="w-6 h-6" />
    default:
      return <Home className="w-6 h-6" />
  }
}

// Helper to format duration
const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  if (mins > 0) {
    return `${mins}m ${secs}s`
  }
  return `${secs}s`
}

// Helper to format difficulty
const formatDifficulty = (difficulty?: string): string => {
  if (!difficulty) return 'Medium'
  return difficulty.charAt(0).toUpperCase() + difficulty.slice(1)
}

export default function PracticeSelectPage() {
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations()
  const [showBackButton, setShowBackButton] = useState(false)
  const [stories, setStories] = useState<Story[]>(mockStories)
  const [isHydrated, setIsHydrated] = useState(false)
  const [summary, setSummary] = useState<DiagnosticSummary | null>(null)
  const [showClipsReadyModal, setShowClipsReadyModal] = useState(false)
  const [dailyStory, setDailyStory] = useState<Story | null>(null)
  const [completedToday, setCompletedToday] = useState(false)
  const [streak, setStreak] = useState(0)
  const [userName, setUserName] = useState<string | null>(null)

  // Helper: has the user completed today's free session?
  function hasCompletedToday(): boolean {
    if (typeof window === 'undefined') return false
    const lastSession = localStorage.getItem('lastSessionCompleted')
    const today = new Date().toDateString()
    return lastSession === today
  }

  // Helper: time remaining until midnight local time
  function getTimeUntilMidnight(): string {
    const now = new Date()
    const midnight = new Date()
    midnight.setHours(24, 0, 0, 0)

    const diff = midnight.getTime() - now.getTime()
    const hours = Math.max(0, Math.floor(diff / (1000 * 60 * 60)))
    const minutes = Math.max(
      0,
      Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    )

    return `${hours}h ${minutes}m`
  }

  // Load quick start summary on mount and check for popup
  useEffect(() => {
    // Keep diagnostic summary for analytics (but don't use for feed)
    const diagnosticSummary = loadDiagnosticSummary()
    console.log('[SELECT] diagnosticSummary (analytics only)', diagnosticSummary)
    setSummary(diagnosticSummary)
    
    // Show modal if showClipsReadyOnce flag is set (only right after diagnostic completion)
    if (typeof window !== 'undefined') {
      const showClipsReadyOnce = localStorage.getItem('showClipsReadyOnce')
      if (showClipsReadyOnce === '1') {
        // Remove flag immediately to prevent repeats
        localStorage.removeItem('showClipsReadyOnce')
        setShowClipsReadyModal(true)
      }
    }
  }, [])

  const handleCloseClipsReadyModal = () => {
    setShowClipsReadyModal(false)
  }

  // Select daily story and check completion status when stories are loaded
  useEffect(() => {
    if (!isHydrated || stories.length === 0) return

    // ✅ NEW: Select first uncompleted story (rotation logic)
    const daily = getNextUncompletedStory(stories)
    
    if (!daily) {
      console.warn('⚠️ [SELECT PAGE] No stories available')
      return
    }

    // Check daily completion
    const today = new Date().toISOString().split('T')[0]
    const lastPracticeDate = localStorage.getItem('lastPracticeDate')
    const completed = lastPracticeDate === today

    setDailyStory(daily)
    setCompletedToday(completed)

    // Log rotation info
    const completedStories = getCompletedStories()
    const progress = getStoryProgress(stories)
    
    console.log('📅 [SELECT PAGE] Daily session selected:', {
      storyId: daily.id,
      title: daily.title,
      completedToday: completed,
      lastPracticeDate,
      today,
      totalStories: stories.length,
      completedCount: completedStories.length,
      remainingCount: progress.remaining,
      progressPercent: progress.percentComplete + '%',
    })
  }, [isHydrated, stories])

  useEffect(() => {
    // Only run on client
    if (typeof window === 'undefined') return

    // Load userName from localStorage or onboardingData
    const storedUserName = localStorage.getItem('userName')
    if (storedUserName) {
      setUserName(storedUserName)
    } else {
      const onboardingData = getOnboardingData()
      // Note: onboardingData.name doesn't exist in the type, but check anyway per user request
      const nameFromOnboarding = (onboardingData as any).name
      if (nameFromOnboarding) {
        setUserName(nameFromOnboarding)
      }
    }

    // Load streak from localStorage (optional motivation element)
    const storedStreak = localStorage.getItem('streak')
    const parsedStreak = storedStreak ? parseInt(storedStreak, 10) : 0
    if (!Number.isNaN(parsedStreak) && parsedStreak > 0) {
      setStreak(parsedStreak)
    }

    // Check if user has completed signup/login
    const hasCompletedSignup = !!localStorage.getItem('userFirstName')
    setShowBackButton(!hasCompletedSignup)

    // Step 1: Try to load existing userStories
    let userStories = loadUserStories()
    
    // Step 2: If we have userStories, use them and skip feed logic
    if (userStories.length > 0) {
      console.log('🎯 [SELECT PAGE] client_cached_data: Loaded from userStories:', {
        storyCount: userStories.length,
        storyIds: userStories.map(s => s.id),
        storyTitles: userStories.map(s => s.title),
        source: 'localStorage_userStories',
      })
      setStories(userStories)
      setIsHydrated(true)
      return // Exit early, don't continue to feed logic
    }

    // Load quick start summary for feed seeding
    const quickStartSummary = loadQuickStartSummary()

    // Step 4: Check if quick start summary exists for initial feed seeding
    // Safety: fallback to defaults if missing
    if (quickStartSummary) {
      // Fetch adaptive feed based on quick start results
      const fetchFeed = async () => {
        try {
          // Get preferences from onboarding data
          const onboardingData = getOnboardingData()
          
          // ✅ NEW: Map ALL selected situations (not just first one)
          const situationKeys = onboardingData.situations && onboardingData.situations.length > 0
            ? onboardingData.situations
            : ['general' as const] // Fallback to general if no situations selected
          
          // Map all situation keys to clip situation format
          const mappedSituations = situationKeys.map(key => 
            mapSituationKeyToClipSituation(key)
          )
          
          console.log('🎯 [SELECT PAGE] Fetching feed for situations:', mappedSituations)

          // Calculate feed start difficulty: max(0, startingDifficulty - 20)
          const feedStartDifficulty = getFeedStartDifficulty(quickStartSummary)
          
          // Map feedStartDifficulty to CEFR for API (ensures feed starts easier)
          // 0-9 -> A1, 10-19 -> A2, 20-29 -> B1, 30-39 -> B2, 40-49 -> C1, 50+ -> C2
          let cefr: string
          if (feedStartDifficulty < 10) {
            cefr = 'A1'
          } else if (feedStartDifficulty < 20) {
            cefr = 'A2'
          } else if (feedStartDifficulty < 30) {
            cefr = 'B1'
          } else if (feedStartDifficulty < 40) {
            cefr = 'B2'
          } else if (feedStartDifficulty < 50) {
            cefr = 'C1'
          } else {
            cefr = 'C2'
          }

          // Debug log at feed selection entry point (dev-only)
          if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
            console.log('[Feed] seed difficulty', {
              source: 'quickStartSummary',
              startingDifficulty: quickStartSummary.startingDifficulty,
              feedStartDifficulty,
              cefr,
            })
          }

          console.log('🎯 [SELECT PAGE] Fetching feed from quick start summary:', {
            cefr,
            feedStartDifficulty,
            missedRate: (quickStartSummary.missedRate * 100).toFixed(1) + '%',
            attemptAccuracy: quickStartSummary.attemptAccuracy.toFixed(1) + '%',
            mappedSituations,
            situationCount: mappedSituations.length,
            userSituations: onboardingData.situations,
          })
          
          // Build query params for GET request
          const params = new URLSearchParams({
            cefr,
          })
          
          // ✅ Add all situations (comma-separated)
          params.append('situations', mappedSituations.join(','))
          
          const response = await fetch(`/api/clips/feed?${params.toString()}`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
          })
          
          if (!response.ok) {
            throw new Error(`Feed API error: ${response.status}`)
          }
          
          const result = await response.json()
          const feedClips = result.clips || []
          
          if (feedClips.length === 0) {
            console.warn('⚠️ [SELECT PAGE] Feed returned no clips, falling back to existing behavior')
            loadExistingStories()
            return
          }
          
          console.log('✅ [SELECT PAGE] Fetched feed clips:', {
            count: feedClips.length,
            clipIds: feedClips.map((c: any) => c.id).slice(0, 5),
          })
          
          // Map feed clips to Clip format expected by convertClipsToStories
          const clips: ClipType[] = feedClips.map((feedClip: any) => {
            // Map CEFR back to difficulty for Clip format
            const cefrToDifficulty: Record<string, 'easy' | 'medium' | 'hard'> = {
              'A1': 'easy',
              'A2': 'easy',
              'B1': 'medium',
              'B2': 'hard',
              'C1': 'hard', // Advanced level
              'C2': 'hard', // Native level
            }
            
            // Generate a simple title from transcript (first few words)
            const transcriptWords = feedClip.transcript.split(' ')
            const title = transcriptWords.slice(0, 4).join(' ') + (transcriptWords.length > 4 ? '...' : '')
            
            return {
              id: feedClip.id,
              text: feedClip.transcript,
              title,
              audioUrl: '', // Will be loaded when accessed
              focus: feedClip.focusAreas || [],
              targetStyle: feedClip.situation || 'Everyday conversations',
              situation: (feedClip.situation || 'Daily Life') as ClipType['situation'],
              lengthSec: feedClip.lengthSec || 10,
              difficulty: cefrToDifficulty[feedClip.difficultyCefr] || 'medium',
              createdAt: new Date().toISOString(),
            }
          })
          
          // Save clips to localStorage
          localStorage.setItem('userClips', JSON.stringify(clips))
          console.log('✅ [SELECT PAGE] Saved feed clips to localStorage')
          
          // Convert to stories
          let userStories = convertClipsToStories(clips)
          
          // Local sorting: score stories based on situations only (removed weaknessRank)
          const situations = onboardingData.situations || []
          
          // Map SituationKey to Story.situation values
          const situationKeyToStorySituation: Record<string, string> = {
            'work_meetings': 'Work',
            'daily': 'Daily Life',
            'travel': 'Travel',
            'videos_shows': 'Media',
            'interviews_presentations': 'Work', // Map to Work
            'general': 'Daily Life', // Default fallback
          }
          
          // Score and sort stories (situations only, no category-based ranking)
          const scoredStories = userStories.map((story, index) => {
            let score = 0
            
            // Score +50 if story matches selected situations (both if present)
            if (story.situation) {
              const storySituationLower = story.situation.toLowerCase()
              situations.forEach((sitKey) => {
                const mappedSituation = situationKeyToStorySituation[sitKey] || 'Daily Life'
                if (storySituationLower === mappedSituation.toLowerCase()) {
                  score += 50
                }
              })
            }
            
            return { story, score, originalIndex: index }
          })
          
          // Sort by score DESC, keep original order on tie
          scoredStories.sort((a, b) => {
            if (b.score !== a.score) {
              return b.score - a.score
            }
            return a.originalIndex - b.originalIndex
          })
          
          userStories = scoredStories.map(item => item.story)
          
          console.log('✅ [SELECT PAGE] Scored and sorted stories (situations only):', {
            storyCount: userStories.length,
            topScores: scoredStories.slice(0, 3).map(item => ({
              storyId: item.story.id,
              title: item.story.title,
              score: item.score,
            })),
          })
          
          // Save stories to localStorage
          saveUserStories(userStories)
          console.log('✅ [SELECT PAGE] Converted and saved stories:', {
            storyCount: userStories.length,
            storyIds: userStories.map(s => s.id),
          })
          
          setStories(userStories)
          setIsHydrated(true)
        } catch (error) {
          console.error('❌ [SELECT PAGE] Error fetching feed:', error)
          // Fall back to existing behavior on error
          loadExistingStories()
        }
      }
      
      fetchFeed()
    } else {
      // No quick start summary - use existing behavior (fallback)
      loadExistingStories()
    }
    
    function loadExistingStories() {
      // Load user-generated stories from localStorage
      try {
          // 1) Try userStories first (newer format, single source of truth)
          let userStories = loadUserStories()
          if (userStories.length > 0) {
            // Apply local sorting if we have situations (removed weaknessRank)
            const onboardingData = getOnboardingData()
            
            if (onboardingData.situations) {
              const situations = onboardingData.situations || []
              
              // Map SituationKey to Story.situation values
              const situationKeyToStorySituation: Record<string, string> = {
                'work_meetings': 'Work',
                'daily': 'Daily Life',
                'travel': 'Travel',
                'videos_shows': 'Media',
                'interviews_presentations': 'Work',
                'general': 'Daily Life',
              }
              
              // Score and sort stories (situations only, no category-based ranking)
              const scoredStories = userStories.map((story, index) => {
                let score = 0
                
                if (story.situation) {
                  const storySituationLower = story.situation.toLowerCase()
                  situations.forEach((sitKey) => {
                    const mappedSituation = situationKeyToStorySituation[sitKey] || 'Daily Life'
                    if (storySituationLower === mappedSituation.toLowerCase()) {
                      score += 50
                    }
                  })
                }
                
                return { story, score, originalIndex: index }
              })
              
              scoredStories.sort((a, b) => {
                if (b.score !== a.score) {
                  return b.score - a.score
                }
                return a.originalIndex - b.originalIndex
              })
              
              userStories = scoredStories.map(item => item.story)
            }
            
            console.log('🎯 [SELECT PAGE] client_cached_data: Loaded from userStories:', {
              storyCount: userStories.length,
              storyIds: userStories.map(s => s.id),
              storyTitles: userStories.map(s => s.title),
              source: 'localStorage_userStories',
            })
            setStories(userStories)
            setIsHydrated(true)
        } else {
          // 2) Fallback: derive stories from userClips (older format)
          const storedClips = localStorage.getItem('userClips')
          if (storedClips) {
            const parsed: ClipType[] = JSON.parse(storedClips)
            if (Array.isArray(parsed) && parsed.length > 0) {
              const derivedStories = convertClipsToStories(parsed)
              if (derivedStories.length > 0) {
                console.log('🎯 [SELECT PAGE] client_cached_data: Derived from userClips:', {
                  storyCount: derivedStories.length,
                  storyIds: derivedStories.map(s => s.id),
                  storyTitles: derivedStories.map(s => s.title),
                  source: 'localStorage_userClips_converted',
                })
                saveUserStories(derivedStories)
                setStories(derivedStories)
                setIsHydrated(true)
              } else {
                // No stories from clips, keep mockStories
                console.log('🎯 [SELECT PAGE] client_cached_data: Using mockStories (no stories from clips):', {
                  storyCount: mockStories.length,
                  source: 'mockStories_fallback',
                })
                setIsHydrated(true)
              }
            } else {
              // No userClips, keep mockStories
              console.log('🎯 [SELECT PAGE] client_cached_data: Using mockStories (no userClips):', {
                storyCount: mockStories.length,
                source: 'mockStories_fallback',
              })
              setIsHydrated(true)
            }
          } else {
            // No localStorage data, keep mockStories
            console.log('🎯 [SELECT PAGE] client_cached_data: Using mockStories (localStorage empty):', {
              storyCount: mockStories.length,
              source: 'mockStories_fallback',
            })
            setIsHydrated(true)
          }
        }
      } catch (error) {
        console.error('❌ [SELECT PAGE] Error loading from localStorage:', error)
        setIsHydrated(true) // Still mark as hydrated even on error
      }
    }
  }, [])

  const handleStartPractice = () => {
    // Respect daily free-tier limit
    if (!dailyStory || hasCompletedToday()) return
    // Go directly to the first clip in the story (skip intermediate list)
    router.push(`/${locale}/practice/story/${dailyStory.id}?clipIndex=0`)
  }


  // Prevent rendering until hydrated to avoid flash
  if (!isHydrated) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="text-gray-600">{t('practice.loadingStories')}</p>
        </div>
      </div>
    )
  }

  return (
    <main className="flex min-h-dvh flex-col py-8 px-6 bg-gradient-to-b from-blue-50/60 via-white to-white">
      {/* Clips Ready Modal */}
      <ClipsReadyModal 
        isOpen={showClipsReadyModal}
        onClose={handleCloseClipsReadyModal}
      />

      {/* Greeting section */}
      <div className="mb-8">
        <h1 className="text-heading-2 text-gray-900 mb-2">
          👋 {t('common.hi')} {userName || t('common.there')}
        </h1>
        
        {streak > 0 && (
          <div className="inline-flex items-center gap-2 bg-orange-100 px-4 py-2 rounded-full">
            <span className="text-xl">🔥</span>
            <span className="text-sm font-semibold text-orange-900">{streak} {t('practice.dayStreak')}</span>
          </div>
        )}
      </div>

      {/* Back button (if needed) */}
      {showBackButton && (
        <div className="mb-6">
          <Link
            href={`/${locale}/practice`}
            className="text-blue-600 font-medium text-lg py-2 px-1 -ml-1 inline-flex items-center gap-1"
          >
            <ChevronLeft className="w-5 h-5" />
            {t('common.back')}
          </Link>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 space-y-8">
        {dailyStory ? (
          <>
            {/* Main Daily Session Card - with free-tier limit */}
            <div className="mb-6">
              {hasCompletedToday() ? (
                // Locked state: session already completed today
                <div className="rounded-2xl border-2 border-gray-200 bg-gray-50 p-8 text-center space-y-4">
                  <div className="mb-4 text-4xl">✅</div>
                  <h2 className="text-heading-2 text-gray-900">
                    {t('practice.greatWorkToday')}
                  </h2>
                  <p className="text-body text-gray-600">
                    {t('practice.completedDailyPractice')}
                  </p>

                  <div className="text-sm text-gray-500">
                    {t('practice.nextSessionAvailable')} {getTimeUntilMidnight()}
                  </div>

                  <div className="rounded-xl bg-gradient-to-r from-amber-100 to-orange-100 p-4 text-left space-y-1">
                    <p className="text-base font-medium text-gray-900">
                      💎 {t('practice.wantPracticeMore')}
                    </p>
                    <p className="text-sm text-gray-700">
                      {t('practice.upgradeToPro')}
                    </p>
                  </div>

                  <button
                    onClick={() => router.push(`/${locale}/pro`)}
                    className="w-full md:w-auto md:min-w-[300px] bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold py-3 px-6 rounded-xl transition-all"
                  >
                    {t('practice.learnAboutPro')}
                  </button>
                </div>
              ) : (
                // Unlocked: user can start today's practice
                <div className="rounded-3xl border border-blue-200 bg-gradient-to-br from-blue-50 via-white to-blue-100 p-6 md:p-7 shadow-sm space-y-4">
                  <div className="flex items-start sm:items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl text-2xl flex-shrink-0">
                      <span>🎯</span>
                    </div>
                    <div className="text-left flex-1">
                      <h2 className="text-heading-2 text-gray-900">
                        {t('practice.title')}
                      </h2>
                      <p className="text-body text-gray-600">
                        {t('practice.subtitle')}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-body-small text-gray-500">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-blue-600 flex-shrink-0" />
                      <span>{t('practice.quickSession')}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-blue-600 flex-shrink-0" />
                      <span>{t('practice.shortClips')}</span>
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      onClick={handleStartPractice}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white text-body-large font-semibold py-3.5 px-6 rounded-xl transition-colors shadow-md"
                    >
                      {t('practice.startPractice')}
                    </button>
                  </div>

                  {/* Story Progress Indicator */}
                  {(() => {
                    const progress = getStoryProgress(stories)
                    const onboardingData = getOnboardingData()
                    const situationKeys = onboardingData.situations || []
                    const activeSituations = situationKeys.map(key => 
                      mapSituationKeyToClipSituation(key)
                    )
                    
                    return (
                      <div className="pt-2 text-center space-y-1">
                        {progress.total > 0 && progress.completed > 0 && (
                          <p className="text-body-small text-gray-500">
                            {progress.completed} / {progress.total} {t('practice.storiesCompleted')}
                          </p>
                        )}
                        {activeSituations.length > 0 && activeSituations[0] !== 'general' && (
                          <p className="text-body-small text-gray-500">
                            {t('practice.clipsFrom')} {activeSituations.map(s => 
                              s.charAt(0).toUpperCase() + s.slice(1)
                            ).join(', ')}
                          </p>
                        )}
                      </div>
                    )
                  })()}
                </div>
              )}
            </div>

            {/* Simple progress section (optional, lightweight) */}
            <div className="mt-6 p-6 bg-gray-50 rounded-2xl border border-gray-100 space-y-3">
              <h3 className="text-heading-3 mb-3 text-gray-900">
                {t('practice.yourProgress')}
              </h3>
              <p className="text-body-small text-gray-600 mb-4">
                {t('practice.keepShowing')}
              </p>
              <div className="space-y-3">
                <div className="flex justify-between text-body-small">
                  <span className="text-gray-600">{t('practice.thisWeek')}</span>
                  <span className="text-body font-bold">
                    {/* Placeholder progress; wire real stats later */}
                    3/7 {t('practice.days')}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                  <div
                    className="bg-blue-600 h-full rounded-full"
                    style={{ width: '43%' }}
                  />
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-gray-900">
              Pick a story to practice
            </h1>
            <p className="text-gray-600">
              Practice with complete conversations, clip by clip
            </p>
            <p className="text-sm text-gray-500 mt-4">
              No stories available. Please complete onboarding to get started.
            </p>
          </div>
        )}
      </div>
    </main>
  )
}
