'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getOnboardingData } from '@/lib/onboardingStore'
import { 
  Coffee, Briefcase, CloudSun, Utensils, Users, Home, Plane, Tv,
  Building2, MessageSquare, Calendar, Laptop, ShoppingBag, Car,
  MapPin, Hotel, Video, Film, Headphones, Gamepad2, ChevronLeft
} from 'lucide-react'
import { Clip as ClipType } from '@/lib/clipTypes'
import { Situation } from '@/lib/clipTypes'
import { generateSituationalTitle } from '@/lib/clipTitleGenerator'

interface Clip {
  id: string
  title: string
  duration: string
  icon: React.ReactNode
  chip: string // Difficulty badge
  situation?: string // Situation badge (Work, Daily Life, Social, Travel, Media)
  text?: string // For generated clips
  audioUrl?: string // For generated clips
}

const sampleClips: Clip[] = [
  { 
    id: '1', 
    title: 'Coffee shop conversation', 
    duration: '0:45',
    icon: <Coffee className="w-5 h-5" />,
    chip: 'Small talk'
  },
  { 
    id: '2', 
    title: 'Job interview tips', 
    duration: '1:20',
    icon: <Briefcase className="w-5 h-5" />,
    chip: 'Formal'
  },
  { 
    id: '3', 
    title: 'Weather small talk', 
    duration: '0:30',
    icon: <CloudSun className="w-5 h-5" />,
    chip: 'Easy'
  },
  { 
    id: '4', 
    title: 'Restaurant ordering', 
    duration: '0:55',
    icon: <Utensils className="w-5 h-5" />,
    chip: 'Daily life'
  },
]

export default function PracticeSelectPage() {
  const router = useRouter()
  const [showBackButton, setShowBackButton] = useState(false)
  const [clips, setClips] = useState<Clip[]>(sampleClips)
  const [isLoading, setIsLoading] = useState(true)
  const [hasGeneratedClips, setHasGeneratedClips] = useState(false)

  // Helper function to get icon for clip based on situation and title keywords
  const getIconForClip = (clip: ClipType, index: number): React.ReactNode => {
    const situation = clip.situation || 'Daily Life'
    const title = (clip.title || '').toLowerCase()
    
    // More specific mapping based on title keywords within each situation
    if (situation === 'Work') {
      if (title.includes('meeting') || title.includes('presentation') || title.includes('standup')) {
        return <Calendar key="calendar" className="w-5 h-5" />
      }
      if (title.includes('office') || title.includes('hallway') || title.includes('water cooler')) {
        return <Building2 key="building" className="w-5 h-5" />
      }
      if (title.includes('call') || title.includes('client')) {
        return <MessageSquare key="message" className="w-5 h-5" />
      }
      if (title.includes('laptop') || title.includes('computer')) {
        return <Laptop key="laptop" className="w-5 h-5" />
      }
      // Default work icon
      return <Briefcase key="briefcase" className="w-5 h-5" />
    }
    
    if (situation === 'Daily Life') {
      if (title.includes('store') || title.includes('shopping') || title.includes('errands')) {
        return <ShoppingBag key="shopping" className="w-5 h-5" />
      }
      if (title.includes('car') || title.includes('driving') || title.includes('road')) {
        return <Car key="car" className="w-5 h-5" />
      }
      if (title.includes('house') || title.includes('home') || title.includes('routine')) {
        return <Home key="home" className="w-5 h-5" />
      }
      // Default daily life icon
      return <Home key="home" className="w-5 h-5" />
    }
    
    if (situation === 'Social') {
      if (title.includes('gathering') || title.includes('together') || title.includes('hangout')) {
        return <Users key="users" className="w-5 h-5" />
      }
      if (title.includes('chat') || title.includes('conversation') || title.includes('catch')) {
        return <MessageSquare key="message" className="w-5 h-5" />
      }
      // Default social icon
      return <Users key="users" className="w-5 h-5" />
    }
    
    if (situation === 'Travel') {
      if (title.includes('airport') || title.includes('plane') || title.includes('flight')) {
        return <Plane key="plane" className="w-5 h-5" />
      }
      if (title.includes('hotel')) {
        return <Hotel key="hotel" className="w-5 h-5" />
      }
      if (title.includes('cafe') || title.includes('restaurant')) {
        return <Coffee key="cafe" className="w-5 h-5" />
      }
      if (title.includes('city') || title.includes('exploring') || title.includes('navigating') || title.includes('place')) {
        return <MapPin key="mappin" className="w-5 h-5" />
      }
      // Default travel icon
      return <Plane key="plane" className="w-5 h-5" />
    }
    
    if (situation === 'Media') {
      if (title.includes('video') || title.includes('watching')) {
        return <Video key="video" className="w-5 h-5" />
      }
      if (title.includes('show') || title.includes('film') || title.includes('movie')) {
        return <Film key="film" className="w-5 h-5" />
      }
      if (title.includes('stream') || title.includes('game')) {
        return <Gamepad2 key="gamepad" className="w-5 h-5" />
      }
      if (title.includes('commentary') || title.includes('discussion')) {
        return <Headphones key="headphones" className="w-5 h-5" />
      }
      // Default media icon
      return <Tv key="tv" className="w-5 h-5" />
    }
    
    // Fallback to index-based rotation if situation is missing (backward compatibility)
    if (!clip.situation) {
      const fallbackIcons = [<Coffee key="coffee" className="w-5 h-5" />, <Briefcase key="briefcase" className="w-5 h-5" />, <CloudSun key="cloud" className="w-5 h-5" />, <Utensils key="utensils" className="w-5 h-5" />]
      return fallbackIcons[index % fallbackIcons.length]
    }
    
    // Ultimate fallback
    return <Home key="home" className="w-5 h-5" />
  }

  // Curated label pools per difficulty - experience-based, not content-based
  const difficultyLabels: Record<string, string[]> = {
    easy: [
      'Finding the rhythm',
      'Easing in',
      'Getting comfortable',
      'Warming up',
      'Settling in',
      'Taking it slow',
      'Steady pace',
      'Building confidence',
    ],
    medium: [
      'Keeping up',
      'In the flow',
      'Catching every word',
      'Staying focused',
      'Picking up speed',
      'Hitting your stride',
      'In the zone',
      'Finding your groove',
    ],
    hard: [
      'Blink and you miss it',
      'Full throttle',
      'No room for error',
      'Rapid fire',
      'At full speed',
      'Dialed in',
      'High gear',
      'Peak performance',
    ],
  }

  // Helper function to get clip title (use clip.title if available, fallback to generated title)
  const getClipTitle = (clip: ClipType, index: number): string => {
    // Prefer clip.title if it exists (from API generation)
    if (clip.title) {
      return clip.title
    }
    
    // Fallback: generate title using deterministic function (for backward compatibility)
    // This should rarely be needed if API generates titles properly
    return generateSituationalTitle({
      difficulty: clip.difficulty || 'medium',
      focus: clip.focus || [],
      targetStyle: clip.targetStyle,
      seed: clip.id || `clip-${index}`,
      usedTitles: new Set(), // Empty set for fallback (not ideal but better than error)
    })
  }

  // Helper function to format difficulty
  const formatDifficulty = (difficulty?: string): string => {
    if (!difficulty) return 'Medium'
    return difficulty.charAt(0).toUpperCase() + difficulty.slice(1)
  }

  useEffect(() => {
    // Check if user has completed signup/login (has firstName in localStorage)
    // If they have, don't show the back button
    if (typeof window !== 'undefined') {
      const hasCompletedSignup = !!localStorage.getItem('userFirstName')
      setShowBackButton(!hasCompletedSignup)
    }

    // Load clips from localStorage only
    const loadClips = () => {
      console.log('PRACTICE SELECT: loadClips called')
      
      try {
        const storedClips = localStorage.getItem('userClips')
        const hasGenerated = localStorage.getItem('hasGeneratedClips')
        
        // Debug info
        console.log('DEBUG: hasGeneratedClips:', hasGenerated)
        console.log('DEBUG: userClips in localStorage:', storedClips ? 'present' : 'missing')
        if (storedClips) {
          try {
            const parsed = JSON.parse(storedClips)
            console.log('DEBUG: Parsed clips count:', Array.isArray(parsed) ? parsed.length : 'not an array')
          } catch (e) {
            console.log('DEBUG: Failed to parse stored clips:', e)
          }
        }
        
        if (storedClips) {
          try {
            const parsed: ClipType[] = JSON.parse(storedClips)
            if (Array.isArray(parsed) && parsed.length > 0) {
              console.log(`Loaded ${parsed.length} clips from localStorage`)
              const generatedClips: Clip[] = parsed.map((clip, index) => ({
                id: clip.id,
                title: getClipTitle(clip, index),
                duration: `${Math.ceil(clip.lengthSec)}s`,
                icon: getIconForClip(clip, index),
                chip: formatDifficulty(clip.difficulty),
                situation: clip.situation, // Situation badge (Work, Daily Life, Social, Travel, Media)
                text: clip.text, // Keep for internal use, but don't display
                audioUrl: clip.audioUrl,
              }))
              setClips(generatedClips)
              setHasGeneratedClips(true)
              setIsLoading(false)
              return
            }
          } catch (error) {
            console.error('Error parsing stored clips:', error)
          }
        }
        
        // Update state to reflect no generated clips
        setHasGeneratedClips(!!hasGenerated)
      } catch (error) {
        console.error('Error loading clips:', error)
      }
      
      // No generated clips found - use sample clips
      console.log('No generated clips found, using sample clips')
      setIsLoading(false)
    }

    loadClips()
  }, [])

  // Also check localStorage when component mounts or when it becomes visible
  useEffect(() => {
    // Small delay to ensure localStorage is available after navigation
    const timer = setTimeout(() => {
      console.log('🟣 Re-checking localStorage after mount')
      const stored = localStorage.getItem('userClips')
      const hasGenerated = localStorage.getItem('hasGeneratedClips')
      console.log('🟣 userClips:', stored ? 'found' : 'not found')
      console.log('🟣 hasGeneratedClips:', hasGenerated)
      
      if (stored && !hasGeneratedClips) {
        try {
          const parsed: ClipType[] = JSON.parse(stored)
          if (Array.isArray(parsed) && parsed.length > 0) {
            console.log('🟣 Found clips on re-check, loading them')
            const generatedClips: Clip[] = parsed.map((clip, index) => ({
              id: clip.id,
              title: getClipTitle(clip, index),
              duration: `${Math.ceil(clip.lengthSec)}s`,
              icon: getIconForClip(clip, index),
              chip: formatDifficulty(clip.difficulty),
              situation: clip.situation, // Situation badge (Work, Daily Life, Social, Travel, Media)
              text: clip.text, // Keep for internal use, but don't display
              audioUrl: clip.audioUrl,
            }))
            setClips(generatedClips)
            setHasGeneratedClips(true)
          }
        } catch (error) {
          console.error('🟣 Error parsing on re-check:', error)
        }
      }
    }, 100)
    
    return () => clearTimeout(timer)
  }, [hasGeneratedClips])

  const handleClipPlay = (e: React.MouseEvent, clipId: string) => {
    e.stopPropagation() // Prevent navigation when clicking play icon
    
    const clip = clips.find(c => c.id === clipId)
    if (!clip) {
      console.error('❌ Clip not found:', clipId)
      return
    }
    
    if (!clip.audioUrl) {
      console.warn('⚠️ Clip has no audioUrl:', clipId)
      alert('Audio not ready. Please generate clips from onboarding.')
      return
    }
    
    console.log('🎵 Playing clip audio:', clip.audioUrl, 'for clip:', clipId)
    
    // Create and play audio
    const audio = new Audio(clip.audioUrl)
    
    audio.addEventListener('error', (e) => {
      console.error('🔴 Audio playback error:', e)
      console.error('🔴 Failed to play audio from:', clip.audioUrl)
      alert('Failed to play audio. Please check if the file exists.')
    })
    
    audio.addEventListener('loadeddata', () => {
      console.log('✅ Audio loaded and ready to play:', clip.audioUrl)
    })
    
    audio.play().catch((error) => {
      console.error('🔴 Audio play() failed:', error)
      alert('Failed to play audio. Please check your browser permissions.')
    })
  }

  const handleClipSelect = (clipId: string) => {
    // Find the clip to pass its data
    const clip = clips.find(c => c.id === clipId)
    if (clip?.text && clip?.audioUrl) {
      // Store clip data in sessionStorage for the respond page
      sessionStorage.setItem(`clip_${clipId}`, JSON.stringify({
        text: clip.text,
        audioUrl: clip.audioUrl,
      }))
    }
    // Route to respond screen with clip ID
    router.push(`/practice/respond?clip=${clipId}`)
  }


  return (
    <main className="flex min-h-screen flex-col px-6 py-6">
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
            Pick a clip to practice
          </h1>
          <p className="text-gray-600">
            Choose a clip to start your listening practice
          </p>
        </div>

        <div className="space-y-3 pb-8">
          {isLoading ? (
            <div className="text-center py-8 text-gray-500">Loading clips...</div>
          ) : (
            <>
            {clips.map((clip) => (
            <button
              key={clip.id}
              onClick={() => handleClipSelect(clip.id)}
              className="w-full text-left p-4 rounded-xl border-2 border-gray-200 bg-white hover:border-blue-200 hover:border-2 active:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  {/* Scenario icon */}
                  <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center text-gray-600">
                    {clip.icon}
                  </div>
                  
                  {/* Title and badges */}
                  <div className="flex-1 min-w-0 flex flex-col gap-1">
                    <span className="font-medium text-gray-900">{clip.title}</span>
                    <div className="flex items-center gap-2 flex-wrap">
                      {clip.situation && (
                        <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full w-fit">
                          {clip.situation}
                        </span>
                      )}
                      <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full w-fit">
                        {clip.chip}
                      </span>
                    </div>
                  </div>
                </div>
                
                {/* Duration and Play button */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={(e) => handleClipPlay(e, clip.id)}
                    disabled={!clip.audioUrl}
                    className="p-1 rounded-full hover:bg-blue-50 active:bg-blue-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title={clip.audioUrl ? 'Play audio preview' : 'Audio not ready'}
                    aria-label={clip.audioUrl ? 'Play audio preview' : 'Audio not ready'}
                  >
                    <svg className="w-5 h-5 text-blue-600 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </button>
                  <span className="text-sm text-gray-500 font-medium">{clip.duration}</span>
                </div>
              </div>
            </button>
            ))}
            
            {/* Show "Generate my clips" button if no generated clips exist */}
            {!hasGeneratedClips && (
              <div className="pt-4">
                <Link
                  href="/onboarding/ready"
                  className="block w-full py-3 px-6 rounded-xl font-medium text-lg border-2 border-blue-600 text-blue-600 hover:bg-blue-50 active:bg-blue-100 transition-colors text-center"
                >
                  Generate my clips
                </Link>
              </div>
            )}
            </>
          )}
        </div>
      </div>
    </main>
  )
}

