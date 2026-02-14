'use client'

import { useEffect, useState, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { 
  Briefcase, Users, Home, MapPin, Tv, ChevronLeft, Clock, Layers
} from 'lucide-react'
import { Story } from '@/lib/storyTypes'
import { mockStories } from '@/lib/mockStoryData'
import { Clip as ClipType } from '@/lib/clipTypes'
import { convertClipsToStories } from '@/lib/clipToStoryConverter'
import { loadUserStories, saveUserStories, enrichStoryClipsWithDbClipId } from '@/lib/storyClient'
import { loadDiagnosticSummary, type DiagnosticSummary } from '@/lib/diagnosticSummary'
import { loadQuickStartSummary, getFeedStartDifficulty, getDifficultyFilterFromDiagnosis } from '@/lib/quickStartSummary'
import { getOnboardingData } from '@/lib/onboardingStore'
import { mapSituationKeyToClipSituation } from '@/lib/situationMapping'
import { getNextUncompletedStory, getCompletedStories, getStoryProgress, clearCompletedStories, type NextStoryResult } from '@/lib/storyRotation'
import ClipsReadyModal from '@/components/ClipsReadyModal'
import { useGreetingName } from '@/lib/useGreetingName'
import { getSupabaseClient } from '@/lib/supabase/auth-helpers'
import { useSubscription } from '@/lib/useSubscription'
import { Heading, Body, Caption, Label } from '@/components/ui/Typography'
import { getSavedTips, type SavedTip } from '@/lib/savedTips'
import { getPracticeEvents, getListeningProfile, getUserPreferences } from '@/lib/userPreferences'
import { Flame } from '@phosphor-icons/react'
import { generateAdaptiveStory } from '@/lib/adaptiveStoryGenerator'
import { selectNextClipDifficulty } from '@/lib/clipProfileMapper'

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

// Helper to calculate clip progress for a story
const getStoryClipProgress = (story: Story | null): { completed: number; total: number; percent: number } => {
  if (!story) return { completed: 0, total: 0, percent: 0 }
  
  const total = story.clips.length
  const completed = story.clips.filter(clip => clip.done).length
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0
  
  return { completed, total, percent }
}

function PracticeSelectContent() {
  console.log('📍 [Practice Select] Page loaded');
  
  const router = useRouter()
  const searchParams = useSearchParams()
  const locale = useLocale()
  const t = useTranslations()
  const [showBackButton, setShowBackButton] = useState(false)
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)
  const [isHydrated, setIsHydrated] = useState(false)
  const [summary, setSummary] = useState<DiagnosticSummary | null>(null)
  const [showClipsReadyModal, setShowClipsReadyModal] = useState(false)
  const [dailyStory, setDailyStory] = useState<Story | null>(null)
  const [completedToday, setCompletedToday] = useState(false)
  const [streak, setStreak] = useState(0)
  const [vocabSavedToday, setVocabSavedToday] = useState<any[]>([])
  const [tipsSavedToday, setTipsSavedToday] = useState<SavedTip[]>([])
  const [isLoadingToday, setIsLoadingToday] = useState(true)
  const { name: userName, loading: nameLoading } = useGreetingName()
  const { isPro, refetch, refetching } = useSubscription()
  
  // Dev-only: Log to confirm this component is running
  console.log('🎯 [LOCALE PracticeSelect] Component rendered - THIS IS THE ACTUAL COMPONENT', {
    userName,
    nameLoading,
    locale
  })
  
  // Check session on mount - diagnostic logging
  useEffect(() => {
    const checkSession = async () => {
      try {
        const supabase = getSupabaseClient();
        const { data: { session } } = await supabase.auth.getSession();
        
        console.log('🔍 [Practice Select] Session check:', {
          hasSession: !!session,
          userId: session?.user?.id?.substring(0, 8)
        });
      } catch (error) {
        console.error('❌ [Practice Select] Session check failed:', error);
      }
    };
    
    checkSession();
  }, []);

  // Auto-mark practice access for new user detection
  useEffect(() => {
    const markPracticeAccess = async () => {
      try {
        const supabase = getSupabaseClient()
        const { data: { user } } = await supabase.auth.getUser()
        
        if (user && !user.user_metadata?.has_accessed_practice) {
          console.log('🎯 [Practice Select] First practice access - marking user')
          
          await supabase.auth.updateUser({
            data: {
              has_accessed_practice: true,
              first_practice_access_at: new Date().toISOString()
            }
          })
          
          console.log('✅ [Practice Select] User marked as having accessed practice')
        }
      } catch (error) {
        console.error('❌ [Practice Select] Error marking practice access:', error)
        // Non-critical - don't block user experience
      }
    }
    
    markPracticeAccess()
  }, [])

  // Check for ?upgraded=true parameter and refetch subscription status
  useEffect(() => {
    const upgraded = searchParams.get('upgraded')
    if (upgraded === 'true' && refetch) {
      console.log('[Practice Select] Detected upgrade completion, refetching subscription...')
      refetch()
      
      // Clean up the URL parameter after refetch
      const newUrl = new URL(window.location.href)
      newUrl.searchParams.delete('upgraded')
      router.replace(newUrl.pathname + newUrl.search)
    }
  }, [searchParams, refetch, router])

  // Helper: has the user completed today's free session?
  // Pro users always return false (unlimited sessions)
  function hasCompletedToday(): boolean {
    if (isPro) return false // Pro users have unlimited sessions
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

  // Helper: get weekly practice completion data
  function getWeeklyPracticeData(): { day: string; completed: boolean; isToday: boolean; isFuture: boolean }[] {
    if (typeof window === 'undefined') return []
    
    const today = new Date()
    const days = [
      t('streak.days.mon'),
      t('streak.days.tue'),
      t('streak.days.wed'),
      t('streak.days.thu'),
      t('streak.days.fri'),
      t('streak.days.sat'),
      t('streak.days.sun')
    ]
    
    // Get practice events to determine which days have practice
    const practiceEvents = getPracticeEvents()
    const practiceDates = new Set<string>()
    
    // Extract unique dates from practice events
    practiceEvents.forEach(event => {
      const eventDate = new Date(event.timestamp)
      practiceDates.add(eventDate.toDateString())
    })
    
    // Also check lastPracticeDate for backward compatibility
    const lastPracticeDate = localStorage.getItem('lastPracticeDate')
    if (lastPracticeDate) {
      const practiceDate = new Date(lastPracticeDate)
      practiceDates.add(practiceDate.toDateString())
    }
    
    // Build array of last 7 days (Mon-Sun)
    const weekData: { day: string; completed: boolean; isToday: boolean; isFuture: boolean }[] = []
    
    // Get Monday of current week (or start from today if today is Monday)
    const currentDay = today.getDay()
    const mondayOffset = currentDay === 0 ? -6 : 1 - currentDay // If Sunday, go back 6 days; otherwise go to Monday
    const monday = new Date(today)
    monday.setDate(today.getDate() + mondayOffset)
    monday.setHours(0, 0, 0, 0)
    
    for (let i = 0; i < 7; i++) {
      const date = new Date(monday)
      date.setDate(monday.getDate() + i)
      const dateString = date.toDateString()
      const dayIndex = i // Monday = 0, Sunday = 6
      const isToday = dateString === today.toDateString()
      const isFuture = date > today
      
      weekData.push({
        day: days[dayIndex],
        completed: practiceDates.has(dateString),
        isToday,
        isFuture
      })
    }
    
    return weekData
  }

  // Helper: calculate current streak (consecutive days)
  function getCurrentStreak(): number {
    if (typeof window === 'undefined') return 0
    
    const practiceEvents = getPracticeEvents()
    const practiceDates = new Set<string>()
    
    // Extract unique dates from practice events
    practiceEvents.forEach(event => {
      const eventDate = new Date(event.timestamp)
      practiceDates.add(eventDate.toDateString())
    })
    
    // Also check lastPracticeDate for backward compatibility
    const lastPracticeDate = localStorage.getItem('lastPracticeDate')
    if (lastPracticeDate) {
      const practiceDate = new Date(lastPracticeDate)
      practiceDates.add(practiceDate.toDateString())
    }
    
    // Calculate streak backwards from today
    let streak = 0
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    // Check if today is completed
    const todayCompleted = practiceDates.has(today.toDateString())
    if (!todayCompleted) {
      // If today is not completed, check yesterday
      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)
      if (practiceDates.has(yesterday.toDateString())) {
        // Count backwards from yesterday
        for (let i = 1; i <= 365; i++) {
          const checkDate = new Date(today)
          checkDate.setDate(checkDate.getDate() - i)
          if (practiceDates.has(checkDate.toDateString())) {
            streak++
          } else {
            break
          }
        }
      }
    } else {
      // Count backwards from today
      for (let i = 0; i <= 365; i++) {
        const checkDate = new Date(today)
        checkDate.setDate(checkDate.getDate() - i)
        if (practiceDates.has(checkDate.toDateString())) {
          streak++
        } else {
          break
        }
      }
    }
    
    return streak
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
      
      // Auto-cleanup: Remove old dynamically generated clips from localStorage
      const storiesStr = localStorage.getItem('userStories')
      if (storiesStr) {
        try {
          const parsed = JSON.parse(storiesStr)
          // Check if any clips have timestamp-based generated IDs (clip_TIMESTAMP_RANDOM)
          // Note: clip-practice-v2-XXX are VALID database IDs and should NOT be cleared
          const hasTimestampGeneratedClips = parsed.some((story: any) => 
            story.clips?.some((clip: any) => 
              clip.id?.match(/^clip_\d+_[a-z0-9]+$/)
            )
          )
          if (hasTimestampGeneratedClips) {
            console.warn('🧹 [SELECT] Clearing old timestamp-generated clips from localStorage')
            localStorage.removeItem('userStories')
            localStorage.removeItem('userClips')
            localStorage.removeItem('hasGeneratedClips')
            // Don't reload - let the page fetch fresh clips from DB
          }
        } catch (error) {
          console.error('⚠️ [SELECT] Failed to parse userStories for cleanup:', error)
        }
      }
    }
  }, [])

  const handleCloseClipsReadyModal = () => {
    setShowClipsReadyModal(false)
  }

  // Select daily story and check completion status when stories are loaded
  useEffect(() => {
    if (!isHydrated || stories.length === 0) return

    /**
     * Fetch new clips from database based on user's adaptive difficulty profile
     * Called when all stories are completed
     */
    const fetchAdaptiveStories = async () => {
      console.log('🎯 [SELECT] Fetching adaptive stories based on user profile...')
      
      try {
        // Get user's listening profile and preferences
        const profile = getListeningProfile()
        const preferences = getUserPreferences()
        
        // Determine recommended difficulty based on user's performance
        const recommendedDifficulty = profile 
          ? selectNextClipDifficulty(profile || undefined, preferences || undefined)
          : 'medium' // Fallback for new users
        
        console.log('📊 [SELECT] User profile analysis:', {
          hasProfile: !!profile,
          confidence: profile?.confidence,
          weaknesses: profile?.weaknesses?.map(w => w.type),
          recommendedDifficulty,
        })
        
        // Get situations from onboarding data
        const onboardingDataStr = localStorage.getItem('onboardingData')
        let situations: string[] = []
        if (onboardingDataStr) {
          try {
            const onboardingData = JSON.parse(onboardingDataStr)
            situations = onboardingData.situations || []
          } catch (error) {
            console.warn('⚠️ [SELECT] Failed to parse onboardingData:', error)
          }
        }
        
        // Build query params for database fetch
        const queryParams = new URLSearchParams()
        queryParams.append('difficulties', JSON.stringify([recommendedDifficulty]))
        if (situations.length > 0) {
          queryParams.append('situations', JSON.stringify(situations))
        }
        
        console.log('🔍 [SELECT] Fetching clips with adaptive filters:', {
          difficulty: recommendedDifficulty,
          situations,
        })
        
        // Fetch clips from database
        const response = await fetch(`/api/clips/user?${queryParams.toString()}`)
        
        if (!response.ok) {
          console.error('❌ [SELECT] Adaptive database fetch failed:', response.statusText)
          return null
        }
        
        const { clips } = await response.json()
        console.log('✅ [SELECT] Fetched adaptive clips:', {
          count: clips.length,
          difficulty: recommendedDifficulty,
        })
        
        if (!clips || clips.length === 0) {
          console.warn('⚠️ [SELECT] No clips found for adaptive difficulty')
          return null
        }
        
        // Convert clips to stories (4-5 clips per story)
        const newStories = convertClipsToStories(clips)
        
        // Enrich with dbClipId (same logic as fetchAndConvertStories)
        const enrichedStories = newStories.map(story => ({
          ...story,
          clips: story.clips
            .map(clip => {
              const isDbId = clip.id && (
                clip.id.startsWith('clip-practice-') || 
                clip.id.startsWith('clip-') && !clip.id.startsWith('clip-story-')
              )
              return {
                ...clip,
                dbClipId: clip.id,
              }
            })
            .filter(clip => {
              const hasValidId = clip.id && clip.id.trim() !== ''
              const isNotStoryId = !clip.id.startsWith('clip-story-')
              const isNotGeneratedId = !clip.id.match(/^clip_\d+_[a-z0-9]+$/)
              return hasValidId && isNotStoryId && isNotGeneratedId && clip.dbClipId
            }),
        })).filter(story => story.clips.length > 0)
        
        console.log('✅ [SELECT] Created adaptive stories:', {
          storyCount: enrichedStories.length,
          totalClips: enrichedStories.reduce((sum, s) => sum + s.clips.length, 0),
          avgClipsPerStory: enrichedStories.length > 0 
            ? (enrichedStories.reduce((sum, s) => sum + s.clips.length, 0) / enrichedStories.length).toFixed(1)
            : 0,
        })
        
        // Clear old completion tracking since we're getting new stories
        clearCompletedStories()
        console.log('🧹 [SELECT] Cleared old completion tracking')
        
        // Save new stories to localStorage
        saveUserStories(enrichedStories)
        console.log('💾 [SELECT] Saved new adaptive stories to localStorage')
        
        return enrichedStories
      } catch (error) {
        console.error('❌ [SELECT] fetchAdaptiveStories failed:', error)
        return null
      }
    }

    // Phase 1 + 2: Adaptive story selection with on-demand generation
    const selectAdaptiveStory = async () => {
      const profile = getListeningProfile()
      const preferences = getUserPreferences()
      
      // Phase 1: Try to find matching story by difficulty
      let result = getNextUncompletedStory(stories, profile || undefined, preferences || undefined)
      let daily = result.story
      
      // Phase 2: If no story found (shouldn't happen with auto-cycle), fetch new adaptive clips from database
      if (!daily) {
        console.log('🔄 [SELECT] No stories available! Fetching new adaptive clips from database...')
        try {
          const newStories = await fetchAdaptiveStories()
          
          if (newStories && newStories.length > 0) {
            // Update component state with new stories
            setStories(newStories)
            
            // Re-run Phase 1 selection with new stories
            result = getNextUncompletedStory(newStories, profile || undefined, preferences || undefined)
            daily = result.story
            console.log('✅ [SELECT] Fetched adaptive stories, selected first:', {
              storyId: daily?.id,
              totalNewStories: newStories.length,
            })
          } else {
            console.warn('⚠️ [SELECT] No adaptive clips available from database')
            // Fallback: use first existing story if available
            daily = stories[0] || null
          }
        } catch (error) {
          console.error('❌ [SELECT] Adaptive fetch failed:', error)
          daily = stories[0] || null
        }
      }
      
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
      
      console.log('📅 [SELECT PAGE] Daily session selected (adaptive):', {
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
    }
    
    selectAdaptiveStory()
  }, [isHydrated, stories])

  // Fetch vocab and tips saved today
  useEffect(() => {
    const fetchSavedToday = async () => {
      try {
        const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD
        
        // Fetch vocab
        const vocabResponse = await fetch('/api/saved')
        if (vocabResponse.ok) {
          const vocabData = await vocabResponse.json()
          if (vocabData.success && vocabData.items) {
            const todayVocab = vocabData.items.filter((item: any) => 
              item.created_at && item.created_at.startsWith(today)
            )
            setVocabSavedToday(todayVocab)
          }
        }
        
        // Fetch tips
        const tipsResult = await getSavedTips()
        if (tipsResult.success && tipsResult.tips) {
          const todayTips = tipsResult.tips.filter(tip => 
            tip.created_at && tip.created_at.startsWith(today)
          )
          setTipsSavedToday(todayTips)
        }
      } catch (error) {
        console.error('❌ [SELECT PAGE] Error fetching saved items:', error)
      } finally {
        setIsLoadingToday(false)
      }
    }
    
    fetchSavedToday()
  }, [])

  useEffect(() => {
    // Only run on client
    if (typeof window === 'undefined') return

    console.log('🔄 [LOCALE PracticeSelect] Loading started')

    // Safety timeout: if loading takes more than 10 seconds, force hydration
    const timeoutId = setTimeout(() => {
      console.warn('⚠️ [LOCALE PracticeSelect] Loading timeout - forcing hydration')
      setLoading(false)
      setIsHydrated(true)
      // Don't set mockStories - show empty state instead
      if (stories.length === 0) {
        setStories([])
      }
    }, 10000) // 10 second timeout

    // Load streak from localStorage (optional motivation element)
    const storedStreak = localStorage.getItem('streak')
    const parsedStreak = storedStreak ? parseInt(storedStreak, 10) : 0
    if (!Number.isNaN(parsedStreak) && parsedStreak > 0) {
      setStreak(parsedStreak)
    }

    // Check if user has completed signup/login using Supabase auth
    const checkAuthStatus = async () => {
      try {
        const supabase = getSupabaseClient()
        await new Promise(resolve => setTimeout(resolve, 100)) // Small delay for auth init
        
        // Use getSession() instead of getUser() to avoid AuthSessionMissingError
        // getSession() returns null if no session exists, rather than throwing
        const { data: { session }, error } = await supabase.auth.getSession()
        const user = session?.user || null
        
        console.log('🔍 [LOCALE PracticeSelect] Auth check:', {
          hasUser: !!user,
          userId: user?.id?.substring(0, 8),
          hasSession: !!session,
          error: error?.message
        })
        
        // Show back button ONLY if NO user (guests only)
        // For signed-up users, never show back button
        if (user) {
          setShowBackButton(false)
        } else {
          // Only show for guests - check if they have onboarding data
          const hasOnboardingData = localStorage.getItem('onboardingData')
          const hasFirstName = localStorage.getItem('userFirstName')
          // Don't show back button if they've started onboarding
          setShowBackButton(!hasOnboardingData && !hasFirstName)
        }
      } catch (err: any) {
        // Handle AuthSessionMissingError gracefully
        if (err?.message?.includes('Auth session missing') || err?.name === 'AuthSessionMissingError') {
          console.log('🔍 [LOCALE PracticeSelect] No auth session (expected for guests)')
          // Check if they have onboarding data to determine if they're a guest
          const hasOnboardingData = localStorage.getItem('onboardingData')
          const hasFirstName = localStorage.getItem('userFirstName')
          setShowBackButton(!hasOnboardingData && !hasFirstName)
        } else {
          console.log('🔍 [LOCALE PracticeSelect] Auth check error:', err)
          setShowBackButton(false) // Default to hidden on error
        }
      }
    }
    
    checkAuthStatus()
    
    // Subscribe to auth state changes
    const supabase = getSupabaseClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('🔍 [LOCALE PracticeSelect] Auth state changed:', event, {
        hasSession: !!session,
        hasUser: !!session?.user
      })
      // Update back button visibility when auth state changes
      if (session?.user) {
        setShowBackButton(false) // Never show for authenticated users
      } else {
        // Re-check for guests - use session state instead of calling checkAuthStatus
        // to avoid potential AuthSessionMissingError
        const hasOnboardingData = localStorage.getItem('onboardingData')
        const hasFirstName = localStorage.getItem('userFirstName')
        setShowBackButton(!hasOnboardingData && !hasFirstName)
      }
    })

    // Step 1: Try to load existing userStories
    let userStories = loadUserStories()
    
    // Step 2: If we have userStories, validate them before using
    if (userStories.length > 0) {
      // Calculate total clips to validate cached stories
      const totalClips = userStories.reduce((sum, story) => sum + (story.clips?.length || 0), 0)
      const avgClipsPerStory = totalClips / userStories.length
      
      console.log('🎯 [SELECT PAGE] client_cached_data: Loaded from userStories:', {
        storyCount: userStories.length,
        totalClips,
        avgClipsPerStory: avgClipsPerStory.toFixed(1),
        storyIds: userStories.map(s => s.id),
        storyTitles: userStories.map(s => s.title),
        source: 'localStorage_userStories',
      })
      
      // ✅ NEW: Validate that stories have clips
      const hasValidClips = userStories.some(story => 
        story.clips && story.clips.length > 0
      )
      
      if (!hasValidClips) {
        console.warn('⚠️ [SELECT] Cached stories have NO CLIPS! This is from old buggy filter logic.')
        console.warn('⚠️ [SELECT] Clearing localStorage and re-fetching from database...')
        localStorage.removeItem('userStories')
        localStorage.removeItem('userClips')
        userStories = [] // Clear the array to continue to database fetch
        // Don't return early - continue to fetchAndConvertStories below
      } else {
        // Stories have clips, now check if they have valid dbClipId
        const firstStory = userStories[0]
        const firstClip = firstStory?.clips?.[0]
        const dbClipId = firstClip?.dbClipId
        const hasInvalidDbClipId = dbClipId?.startsWith('clip-story-') || false
        const needsReEnrichment = !dbClipId || hasInvalidDbClipId
        
        // Log each check separately for clarity
        console.log('🔥 [SELECT] Cached story check - STEP 1:', {
          hasStories: userStories.length > 0,
          hasClips: totalClips > 0,
          firstStoryId: firstStory?.id,
          firstClipId: firstClip?.id,
          dbClipId: dbClipId,
          dbClipIdType: typeof dbClipId,
        })
        
        console.log('🔥 [SELECT] Cached story check - STEP 2:', {
          hasInvalidDbClipId,
          needsReEnrichment,
          check1: !dbClipId,
          check2: dbClipId?.startsWith('clip-story-'),
        })
        
        // If stories have invalid dbClipId (story IDs instead of database IDs), re-fetch
        if (needsReEnrichment) {
          console.warn('⚠️ [SELECT] Cached stories have invalid dbClipId! Will re-fetch and re-enrich.')
          console.warn('⚠️ [SELECT] Clearing localStorage and continuing to fetchAndConvertStories...')
          localStorage.removeItem('userStories')
          // Don't return early - continue to fetchAndConvertStories below
        } else {
          // Stories are valid with clips and valid dbClipId, use them
          console.log('✅ [SELECT] Cached stories are VALID with clips - using them')
          setStories(userStories)
          setLoading(false)
          setIsHydrated(true)
          console.log('✅ [LOCALE PracticeSelect] Loading completed - userStories path')
          console.log('🔥 [SELECT] EARLY RETURN - fetchAndConvertStories will NOT be called')
          clearTimeout(timeoutId) // Clear timeout before early return
          return // Exit early, don't continue to feed logic
        }
      }
      // If we get here, either hasValidClips was false or needsReEnrichment was true
      // We cleared localStorage and will continue to fetchAndConvertStories below
    }
    
    // Step 1.5: Fetch clips from database and convert to stories
    console.log('📚 [SELECT] No cached stories, fetching from database...')
    console.log('🔥 [SELECT] About to call fetchAndConvertStories()')
    const fetchAndConvertStories = async () => {
      console.log('🔥 [SELECT] fetchAndConvertStories STARTED')
      
      try {
        // Load QuickStartSummary to get difficulty filter
        const quickStartSummary = loadQuickStartSummary()
        const difficultyFilter = getDifficultyFilterFromDiagnosis(quickStartSummary)
        
        // Get situations from localStorage (from onboarding)
        const onboardingDataStr = localStorage.getItem('onboardingData')
        let situations: string[] = []
        if (onboardingDataStr) {
          try {
            const onboardingData = JSON.parse(onboardingDataStr)
            situations = onboardingData.situations || []
          } catch (error) {
            console.warn('⚠️ [SELECT] Failed to parse onboardingData:', error)
          }
        }
        
        console.log('🎯 [SELECT] Using filters from onboarding:', {
          hasSummary: !!quickStartSummary,
          startingDifficulty: quickStartSummary?.startingDifficulty,
          difficultyFilter: difficultyFilter,
          situations: situations,
          source: quickStartSummary ? 'diagnosis' : 'default (no diagnosis taken)'
        })
        
        // Build query params with all filters
        const queryParams = new URLSearchParams()
        queryParams.append('difficulties', JSON.stringify(difficultyFilter))
        if (situations.length > 0) {
          queryParams.append('situations', JSON.stringify(situations))
        }
        
        // Fetch clips from API with filters
        const response = await fetch(`/api/clips/user?${queryParams.toString()}`)
        console.log('🔥 [SELECT] API response:', response.status)
        
        if (!response.ok) {
          console.error('🔥 [SELECT] API failed:', response.statusText)
          return null
        }
        
        const { clips } = await response.json()
        console.log('🔥 [SELECT] Fetched clips count:', clips.length)
        console.log('🔥 [SELECT] First clip:', clips[0])
        
        // Log difficulty distribution for debugging
        const difficultyDistribution = {
          easy: clips.filter((c: ClipType) => c.difficulty === 'easy').length,
          medium: clips.filter((c: ClipType) => c.difficulty === 'medium').length,
          hard: clips.filter((c: ClipType) => c.difficulty === 'hard').length,
          undefined: clips.filter((c: ClipType) => !c.difficulty).length,
        }
        console.log('✅ [SELECT] Fetched clips with difficulty distribution:', {
          total: clips.length,
          distribution: difficultyDistribution,
          uniqueDifficulties: Array.from(new Set(clips.map((c: ClipType) => c.difficulty || 'undefined'))),
          filterApplied: difficultyFilter,
        })
        
        if (!clips || clips.length === 0) {
          console.log('⚠️ [SELECT] No clips found for user, will try feed')
          return null
        }
        
        // DEBUG: Log clip IDs before conversion
        console.log('🔍 [SELECT] Clips before conversion:', {
          count: clips.length,
          clipIds: clips.map((c: ClipType) => c.id).slice(0, 10),
          allIdsValid: clips.every((c: ClipType) => c.id && c.id.trim() !== ''),
          sampleClip: clips[0] ? {
            id: clips[0].id,
            text: clips[0].text?.substring(0, 30),
            allKeys: Object.keys(clips[0]),
          } : null,
        })
        
        // Convert clips to stories
        console.log('🔄 [SELECT] Converting clips to stories...')
        const generatedStories = convertClipsToStories(clips)
        console.log('🔥 [SELECT] Generated stories count:', generatedStories.length)
        console.log('🔥 [SELECT] First story clips:', generatedStories[0]?.clips.length)
        
        // DEBUG: Log story clips before enrichment
        if (generatedStories.length > 0) {
          const firstClip = generatedStories[0]?.clips[0]
          console.log('🔥 [SELECT] BEFORE enrichment - first clip:', {
            id: firstClip?.id,
            dbClipId: firstClip?.dbClipId,
            keys: Object.keys(firstClip || {}),
            idType: firstClip?.id?.startsWith('clip-story-') ? 'STORY_ID' : firstClip?.id?.startsWith('clip-practice-') ? 'DB_ID' : 'UNKNOWN',
          })
          console.log('🔍 [SELECT] Story clips before enrichment:', {
            firstStoryClips: generatedStories[0].clips.map(c => ({
              id: c.id,
              dbClipId: c.dbClipId,
              transcript: c.transcript?.substring(0, 30),
            })),
          })
        }
        
        // Enrich with dbClipId
        // CRITICAL: clip.id should be the database clip ID from curated_clips
        // If it's a story ID (clip-story-X-Y), we need to find the original database ID
        const enrichedStories = generatedStories.map(story => ({
          ...story,
          clips: story.clips
            .map(clip => {
              // Check if clip.id is already a database ID or a story ID
              const isDbId = clip.id && (
                clip.id.startsWith('clip-practice-') || 
                clip.id.startsWith('clip-') && !clip.id.startsWith('clip-story-')
              )
              
              // If clip.id looks like a database ID, use it as dbClipId
              // Otherwise, we need to find the original database ID from the clips array
              let dbClipId = clip.id
              
              if (!isDbId && clip.id.startsWith('clip-story-')) {
                // This is a story clip ID, need to find original database ID
                // The clip.id should match the original clip.id from the API
                // But if it's been transformed, we need to look it up
                console.warn('⚠️ [SELECT] Clip has story ID instead of DB ID:', clip.id)
                // Try to find matching clip from original clips array
                const originalClip = clips.find((c: ClipType) => {
                  // The story clip ID might be derived from the original clip
                  // For now, we'll use the clip.id as-is and log a warning
                  return false // Can't reliably match
                })
                if (originalClip) {
                  dbClipId = originalClip.id
                }
              }
              
              console.log('🔥 [SELECT] Enriching clip:', {
                clipId: clip.id,
                isDbId,
                dbClipId,
                transcript: clip.transcript?.substring(0, 30),
              })
              
              return {
                ...clip,
                dbClipId: dbClipId, // Use the database clip ID
              }
            })
            .filter(clip => {
              // Only keep clips with valid database IDs
              const hasValidId = clip.id && clip.id.trim() !== ''
              const isNotStoryId = !clip.id.startsWith('clip-story-')
              // Only remove dynamically generated timestamp-based IDs (clip_TIMESTAMP_RANDOM)
              // Keep database IDs like clip-practice-v2-004 from curated_clips table
              const isNotGeneratedId = !clip.id.match(/^clip_\d+_[a-z0-9]+$/)
              
              if (!hasValidId) {
                console.error('❌ [SELECT] Removing clip without valid ID:', {
                  id: clip.id,
                  reason: 'no ID',
                })
                return false
              }
              
              if (!isNotStoryId) {
                console.error('❌ [SELECT] Removing clip with story ID:', {
                  id: clip.id,
                  reason: 'story ID (clip-story-X-Y)',
                })
                return false
              }
              
              if (!isNotGeneratedId) {
                console.log('🔍 [SELECT] Removing clip with timestamp-based generated ID:', {
                  id: clip.id,
                  reason: 'dynamic ID (clip_TIMESTAMP_RANDOM) - not from database',
                })
                return false
              }
              
              if (!clip.dbClipId) {
                console.error('❌ [SELECT] Removing clip without dbClipId:', {
                  id: clip.id,
                  reason: 'missing dbClipId',
                })
                return false
              }
              
              console.log('✅ [SELECT] Keeping clip:', {
                id: clip.id,
                dbClipId: clip.dbClipId,
                idPattern: clip.id.startsWith('clip-practice-v2-') ? 'DB_ID' : 'OTHER',
              })
              
              return true
            }),
        })).filter(story => story.clips.length > 0) // Remove stories with no valid clips
        
        console.log('🔥 [SELECT] AFTER enrichment - first clip keys:', 
          Object.keys(enrichedStories[0]?.clips[0] || {})
        )
        console.log('🔥 [SELECT] First enriched clip dbClipId:', 
          enrichedStories[0]?.clips[0]?.dbClipId
        )
        console.log('✅ [SELECT] Enriched stories:', enrichedStories.length, 'stories with valid clips')
        
        // DEBUG: Log after enrichment
        if (enrichedStories.length > 0) {
          console.log('🔍 [SELECT] Story clips after enrichment:', {
            firstStoryClips: enrichedStories[0].clips.map(c => ({
              id: c.id,
              dbClipId: c.dbClipId,
              hasDbClipId: !!c.dbClipId,
            })),
          })
        }
        
        // Save to localStorage
        saveUserStories(enrichedStories)
        console.log('🔥 [SELECT] Saved to localStorage')
        
        return enrichedStories
      } catch (error) {
        console.error('❌ [SELECT] Failed to fetch and convert stories:', error)
        return null
      }
    }
    
    // Fetch stories from database asynchronously
    console.log('🔥 [SELECT] CALLING fetchAndConvertStories() now...')
    fetchAndConvertStories().then(async storiesFromDb => {
      console.log('🔥 [SELECT] fetchAndConvertStories() RESOLVED:', {
        hasStories: !!storiesFromDb,
        storyCount: storiesFromDb?.length || 0,
      })
      
      // If database returns 0 clips, show appropriate message
      if (!storiesFromDb || storiesFromDb.length === 0) {
        console.warn('⚠️ [SELECT] No clips found in database for initial fetch')
        // Show empty state - user needs to complete onboarding or database needs clips
        setStories([])
        setLoading(false)
        setIsHydrated(true)
        return
      }
      
      if (storiesFromDb && storiesFromDb.length > 0) {
        setStories(storiesFromDb)
        setLoading(false)
        setIsHydrated(true)
        console.log('✅ [SELECT] Loading completed - database path')
        // Don't continue to feed logic
      } else {
        // CRITICAL: Still clear loading even if no stories
        setLoading(false)
        setIsHydrated(true)
        console.log('⚠️ [SELECT] No stories from database, will check feed...')
        // Continue with feed logic below
      }
    }).catch(error => {
      // CRITICAL: Clear loading on error
      console.error('❌ [SELECT] Error fetching stories:', error)
      setLoading(false)
      setIsHydrated(true)
    })

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
          setLoading(false)
          setIsHydrated(true)
          console.log('✅ [LOCALE PracticeSelect] Loading completed - feed fetch path')
          clearTimeout(timeoutId)
        } catch (error) {
          console.error('❌ [SELECT PAGE] Error fetching feed:', error)
          // Fall back to existing behavior on error
          // loadExistingStories will clear loading
          loadExistingStories()
        }
      }
      
      fetchFeed().catch((error) => {
        console.error('❌ [LOCALE PracticeSelect] Unhandled error in fetchFeed:', error)
        // CRITICAL: Clear loading on error
        setLoading(false)
        setIsHydrated(true)
        loadExistingStories()
      })
    } else {
      // No quick start summary - use existing behavior (fallback)
      console.log('🔄 [LOCALE PracticeSelect] No quick start summary - using loadExistingStories')
      loadExistingStories()
    }
    
    function loadExistingStories() {
      console.log('🔄 [LOCALE PracticeSelect] loadExistingStories() called')
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
            setLoading(false)
            setIsHydrated(true)
            console.log('✅ [LOCALE PracticeSelect] Loading completed - userStories from loadExistingStories')
            clearTimeout(timeoutId)
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
                setLoading(false)
                setIsHydrated(true)
                console.log('✅ [LOCALE PracticeSelect] Loading completed - derived from userClips')
                clearTimeout(timeoutId)
              } else {
                // No stories from clips - show empty state
                console.log('🎯 [SELECT PAGE] client_cached_data: No stories from clips')
                setStories([])
                setLoading(false)
                setIsHydrated(true)
                console.log('✅ [LOCALE PracticeSelect] Loading completed - empty state (no stories from clips)')
                clearTimeout(timeoutId)
              }
            } else {
              // No userClips - show empty state
              console.log('🎯 [SELECT PAGE] client_cached_data: No userClips')
              setStories([])
              setLoading(false)
              setIsHydrated(true)
              console.log('✅ [LOCALE PracticeSelect] Loading completed - empty state (no userClips)')
              clearTimeout(timeoutId)
            }
          } else {
            // No localStorage data - show empty state
            console.log('🎯 [SELECT PAGE] client_cached_data: localStorage empty')
            setStories([])
            setLoading(false)
            setIsHydrated(true)
            console.log('✅ [LOCALE PracticeSelect] Loading completed - empty state (localStorage empty)')
            clearTimeout(timeoutId)
          }
        }
      } catch (error) {
        console.error('❌ [SELECT PAGE] Error loading from localStorage:', error)
        setStories([]) // Show empty state instead of mockStories
        setLoading(false)
        setIsHydrated(true) // Still mark as hydrated even on error
        console.log('✅ [LOCALE PracticeSelect] Loading completed - empty state (error)')
        clearTimeout(timeoutId)
      }
    }
    
    // Cleanup: unsubscribe from auth state changes and clear timeout
    return () => {
      subscription.unsubscribe()
      clearTimeout(timeoutId)
    }
  }, [])

  const handleStartPractice = () => {
    // Respect daily free-tier limit
    if (!dailyStory || hasCompletedToday()) return
    // Go directly to the first clip in the story (skip intermediate list)
    router.push(`/${locale}/practice/story/${dailyStory.id}?clipIndex=0`)
  }


  // Prevent rendering until hydrated to avoid flash
  if (loading || !isHydrated) {
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
    <main className="flex min-h-dvh flex-col py-8 px-6">
      {/* Clips Ready Modal */}
      <ClipsReadyModal 
        isOpen={showClipsReadyModal}
        onClose={handleCloseClipsReadyModal}
      />

      {/* Greeting section */}
      <div className="mb-4">
        {(() => {
          // Dev-only: Log at render time
          console.log('🎨 [LOCALE PracticeSelect] RENDERING GREETING:', {
            userName,
            nameLoading,
            willShow: userName || t('common.there')
          })
          return null
        })()}
        <Heading as="h1" size="page" className="mb-4">
          👋 {t('common.hi')} {userName || t('common.there')}
        </Heading>
        
        {/* Weekly streak indicator */}
        {(() => {
          const weekData = getWeeklyPracticeData()
          const currentStreak = getCurrentStreak()
          
          // Use fallback mock data if no real data available
          const streakDays = currentStreak > 0 ? currentStreak : 2
          const week = weekData.length > 0 ? weekData : [
            { day: t('streak.days.mon'), completed: true, isToday: false, isFuture: false },
            { day: t('streak.days.tue'), completed: true, isToday: false, isFuture: false },
            { day: t('streak.days.wed'), completed: false, isToday: true, isFuture: false },
            { day: t('streak.days.thu'), completed: false, isToday: false, isFuture: true },
            { day: t('streak.days.fri'), completed: false, isToday: false, isFuture: true },
            { day: t('streak.days.sat'), completed: false, isToday: false, isFuture: true },
            { day: t('streak.days.sun'), completed: false, isToday: false, isFuture: true },
          ]
          
          return (
            <div 
              className="w-full rounded-xl p-4 md:p-5"
              style={{ 
                backgroundColor: '#F6F8FB',
                border: '1px solid rgba(0, 0, 0, 0.04)'
              }}
            >
              <div className="space-y-4">
                {/* Row 1: Title line */}
                <div className="flex items-center gap-2">
                  <Flame weight="fill" size={20} className="text-orange-500 flex-shrink-0" />
                  <Label size="label" weight="semibold" className="text-[#1D1D20] text-[15px]">
                    {streakDays === 1 ? t('streak.dayInRow', { count: streakDays }) : t('streak.daysInRow', { count: streakDays })}
                  </Label>
                </div>
                
                {/* Supporting message */}
                <Caption tone="muted" className="text-[13px] leading-5 mt-1.5 text-gray-500">
                  {t('streak.consistencyMessage')}
                </Caption>
                
                {/* Row 2: Weekly days indicator */}
                <div className="flex items-center justify-between gap-1.5 sm:gap-3.5 mt-4">
                  {week.map(({ day, completed, isToday, isFuture }, index) => (
                    <div
                      key={index}
                      className="flex flex-col items-center gap-1.5 flex-1"
                    >
                      <Caption 
                        size="micro" 
                        tone={isToday ? 'default' : 'muted'} 
                        className={`text-[11px] sm:text-[12px] ${isToday ? 'font-semibold text-gray-800' : 'font-medium text-gray-500'}`}
                      >
                        {day}
                      </Caption>
                      <div 
                        className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center ${
                          completed 
                            ? '' 
                            : ''
                        }`}
                        style={completed ? {
                          backgroundColor: 'rgba(249, 115, 22, 0.12)'
                        } : {
                          backgroundColor: '#E6E9EE'
                        }}
                      >
                        {completed ? (
                          <Flame 
                            weight="fill" 
                            size={16} 
                            className="text-orange-500 sm:w-[18px] sm:h-[18px]" 
                          />
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )
        })()}
      </div>

      {/* Back button (if needed) */}
      {showBackButton && (
        <div className="mb-6">
          <Link
            href={`/${locale}/practice`}
            className="text-blue-600 py-2 px-1 -ml-1 inline-flex items-center gap-1"
          >
            <ChevronLeft className="w-5 h-5" />
            <Label size="action" className="text-blue-600">{t('common.back')}</Label>
          </Link>
        </div>
      )}

      {/* Empty state when no stories */}
      {stories.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 py-12">
          <div className="text-center space-y-2">
            <Heading as="h2" size="section">No practice stories yet</Heading>
            <Body tone="sub">
              Complete the onboarding to generate your personalized practice clips.
            </Body>
          </div>
          <Link
            href={`/${locale}/onboarding/diagnosis`}
            className="px-6 py-3 bg-blue-600 text-white rounded-xl active:bg-blue-700 transition-colors"
          >
            <Label size="action" weight="semibold" className="text-white">Start Onboarding</Label>
          </Link>
        </div>
      )}

      {/* Content */}
      {stories.length > 0 && (
        <div className="flex-1 space-y-8">
          {dailyStory ? (
          <>
            {/* Main Daily Session Card - with free-tier limit */}
            <div className="mt-5">
              {hasCompletedToday() ? (
                // Locked state: session already completed today
                <div className="rounded-2xl border-2 border-gray-200 bg-gray-50 p-8 text-center space-y-4">
                  <Heading as="h2" size="section">
                    {t('practice.greatWorkToday')}
                  </Heading>
                  <Body tone="sub">
                    {t('practice.completedDailyPractice')}
                  </Body>

                  <Caption tone="muted">
                    {t('practice.nextSessionAvailable')} {getTimeUntilMidnight()}
                  </Caption>

                  <div className="rounded-xl bg-gradient-to-r from-amber-100 to-orange-100 p-4 text-left space-y-1">
                    <Body size="bodyStrong">
                      {t('practice.wantPracticeMore')}
                    </Body>
                    <Caption>
                      {t('practice.upgradeToPro')}
                    </Caption>
                  </div>

                  <button
                    onClick={() => router.push(`/${locale}/pro`)}
                    className="w-full md:w-auto md:min-w-[300px] bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white py-3 px-6 rounded-xl transition-all"
                  >
                    <Label size="action" weight="semibold" className="text-white">{t('practice.learnAboutPro')}</Label>
                  </button>
                </div>
              ) : (
                // Unlocked: user can start today's practice
                <div className="rounded-3xl border border-blue-200 bg-gradient-to-br from-blue-50 via-white to-blue-100 p-8 md:p-10 shadow-sm space-y-6">
                  <div className="flex items-start sm:items-center gap-3">
                    <div className="text-left flex-1">
                      <Heading as="h2" size="section">
                        {t('practice.title')}
                      </Heading>
                      <Body tone="sub" className="mt-1">
                        {t('practice.subtitle')}
                      </Body>
                    </div>
                  </div>

                  {/* In-card progress indicator */}
                  {(() => {
                    const clipProgress = getStoryClipProgress(dailyStory)
                    if (clipProgress.total === 0) return null
                    
                    return (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Caption tone="muted">
                            {clipProgress.completed} / {clipProgress.total} clips
                          </Caption>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                          <div
                            className="bg-blue-600 h-full rounded-full transition-all duration-300"
                            style={{ width: `${clipProgress.percent}%` }}
                          />
                        </div>
                      </div>
                    )
                  })()}

                  {/* CTA Button */}
                  <div className="pt-4">
                    {(() => {
                      const clipProgress = getStoryClipProgress(dailyStory)
                      let buttonText = t('practice.startPractice')
                      
                      if (clipProgress.completed > 0 && clipProgress.completed < clipProgress.total) {
                        buttonText = 'Continue Practice'
                      } else if (clipProgress.completed === clipProgress.total && clipProgress.total > 0) {
                        buttonText = 'Done for today'
                      }
                      
                      return (
                        <button
                          onClick={handleStartPractice}
                          disabled={clipProgress.completed === clipProgress.total && clipProgress.total > 0}
                          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white py-3.5 px-6 rounded-xl transition-colors shadow-md"
                        >
                          <Label size="action" weight="semibold" className="text-white">
                            {buttonText}
                          </Label>
                        </button>
                      )
                    })()}
                  </div>
                </div>
              )}
            </div>

            {/* Saved Today Section */}
            {!isLoadingToday && (vocabSavedToday.length > 0 || tipsSavedToday.length > 0) && (
              <div className="mt-6 space-y-4">
                <Heading as="h3" size="card">
                  {t('practice.savedToday')}
                </Heading>
                
                {/* Vocab saved today */}
                {vocabSavedToday.length > 0 && (
                  <button
                    onClick={() => router.push(`/${locale}/saved-vocabulary`)}
                    className="w-full p-5 bg-white rounded-2xl border border-gray-200 hover:bg-gray-50 transition-colors text-left flex items-center justify-between"
                  >
                    <div className="flex-1">
                      <Body size="bodyStrong" className="mb-1">{t('practice.vocabulary')}</Body>
                      <Caption tone="muted">
                        {vocabSavedToday.length} {t('practice.items')}
                      </Caption>
                    </div>
                    <svg className="w-6 h-6 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                )}
                
                {/* Tips saved today */}
                {tipsSavedToday.length > 0 && (
                  <button
                    onClick={() => router.push(`/${locale}/saved-tips`)}
                    className="w-full p-5 bg-white rounded-2xl border border-gray-200 hover:bg-gray-50 transition-colors text-left flex items-center justify-between"
                  >
                    <div className="flex-1">
                      <Body size="bodyStrong" className="mb-1">{t('practice.listeningTips')}</Body>
                      <Caption tone="muted">
                        {tipsSavedToday.length} {t('practice.items')}
                      </Caption>
                    </div>
                    <svg className="w-6 h-6 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="space-y-2">
            <Heading as="h1" size="page">
              Pick a story to practice
            </Heading>
            <Body tone="sub">
              Practice with complete conversations, clip by clip
            </Body>
            <Caption tone="muted" className="mt-4">
              No stories available. Please complete onboarding to get started.
            </Caption>
          </div>
        )}
        </div>
      )}
    </main>
  )
}

export default function PracticeSelectPage() {
  return (
    <Suspense fallback={
      <main className="flex min-h-screen flex-col items-center justify-center px-6">
        <div className="text-gray-500">Loading...</div>
      </main>
    }>
      <PracticeSelectContent />
    </Suspense>
  )
}
