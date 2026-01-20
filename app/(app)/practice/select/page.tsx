'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { 
  Briefcase, Users, Home, MapPin, Tv, ChevronLeft, Clock, Layers
} from 'lucide-react'
import { Story } from '@/lib/storyTypes'
import { mockStories } from '@/lib/mockStoryData'
import { Clip as ClipType } from '@/lib/clipTypes'
import { convertClipsToStories } from '@/lib/clipToStoryConverter'
import { loadUserStories, saveUserStories } from '@/lib/storyClient'
import { loadDiagnosticSummary, type DiagnosticSummary } from '@/lib/diagnosticSummary'
import { getOnboardingData } from '@/lib/onboardingStore'
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
  const [showBackButton, setShowBackButton] = useState(false)
  const [stories, setStories] = useState<Story[]>(mockStories)
  const [isHydrated, setIsHydrated] = useState(false)
  const [summary, setSummary] = useState<DiagnosticSummary | null>(null)
  const [showClipsReadyModal, setShowClipsReadyModal] = useState(false)

  // Load diagnostic summary on mount and check for popup
  useEffect(() => {
    const s = loadDiagnosticSummary()
    console.log('[SELECT] diagnosticSummary', s)
    setSummary(s)
    
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

  useEffect(() => {
    // Only run on client
    if (typeof window === 'undefined') return

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

    // Load diagnostic summary (already loaded in separate useEffect above)
    const diagnosticSummary = summary

    // Step 4: Check if diagnostic summary exists for adaptive feed (after diagnostic is complete)
    if (diagnosticSummary) {
      // Fetch adaptive feed based on diagnostic results
      const fetchFeed = async () => {
        try {
          // Get topic preferences from onboarding data for preferredGenre
          const onboardingData = getOnboardingData()
          const preferredGenre = onboardingData.topics && onboardingData.topics.length > 0
            ? onboardingData.topics[0] // Use first topic as preferred genre
            : undefined

          console.log('🎯 [SELECT PAGE] Fetching adaptive feed from diagnostic summary:', {
            cefr: diagnosticSummary.cefr,
            weakness: diagnosticSummary.weaknessRank.slice(0, 3),
            situation: preferredGenre,
          })
          
          // Build query params for GET request
          const params = new URLSearchParams({
            cefr: diagnosticSummary.cefr,
          })
          
          // Add weakness as comma-separated string if exists
          if (diagnosticSummary.weaknessRank.length > 0) {
            params.append('weakness', diagnosticSummary.weaknessRank.join(','))
          }
          
          // Add situation if available
          if (preferredGenre) {
            params.append('situation', preferredGenre)
          }
          
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
          const userStories = convertClipsToStories(clips)
          
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
      // No diagnostic summary - use existing behavior
      loadExistingStories()
    }
    
    function loadExistingStories() {
      // Load user-generated stories from localStorage
      try {
        // 1) Try userStories first (newer format, single source of truth)
        const userStories = loadUserStories()
        if (userStories.length > 0) {
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


  // Prevent rendering until hydrated to avoid flash
  if (!isHydrated) {
    return (
      <div 
        className="fixed z-[100] flex items-center justify-center bg-white"
        style={{
          top: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: '100%',
          maxWidth: '420px',
          height: '100vh',
          overflow: 'hidden',
        }}
      >
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="text-gray-600">Loading stories...</p>
        </div>
      </div>
    )
  }

  return (
    <main className="flex min-h-dvh flex-col py-6">
      {/* Clips Ready Modal */}
      <ClipsReadyModal 
        isOpen={showClipsReadyModal}
        onClose={handleCloseClipsReadyModal}
      />

      {/* Header */}
      {showBackButton && (
        <div className="mb-8">
          <Link 
            href="/practice"
            className="text-blue-600 font-medium text-lg py-2 px-1 -ml-1 inline-flex items-center gap-1"
          >
            <ChevronLeft className="w-5 h-5" />
            Back
          </Link>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 space-y-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-gray-900">
            Pick a story to practice
          </h1>
          <p className="text-gray-600">
            Practice with complete conversations, clip by clip
          </p>
        </div>

        {/* Story Cards */}
        <div className="space-y-3">
          {stories.map((story) => (
            <Link
              key={story.id}
              href={`/practice/story/${story.id}`}
              className="w-full text-left p-4 rounded-xl border-2 border-gray-200 bg-white hover:border-blue-200 hover:border-2 active:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all block"
            >
              <div className="flex items-start gap-3">
                {/* Story Icon */}
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-600">
                  {getStoryIcon(story.situation)}
                </div>

                {/* Story Info */}
                <div className="flex-1 min-w-0 space-y-2">
                  <div>
                    <h3 className="font-semibold text-gray-900 text-lg">{story.title}</h3>
                    <p className="text-sm text-gray-600 mt-1 line-clamp-2">{story.context}</p>
                  </div>

                  {/* Metadata */}
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <Layers className="w-4 h-4" />
                      <span>{story.clips.length} clips</span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <Clock className="w-4 h-4" />
                      <span>{formatDuration(story.durationSec)}</span>
                    </div>
                    {story.situation && (
                      <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                        {story.situation}
                      </span>
                    )}
                    <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                      {formatDifficulty(story.difficulty)}
                    </span>
                  </div>
                </div>

                {/* CTA Arrow */}
                <div className="flex-shrink-0 pt-1">
                  <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  )
}
