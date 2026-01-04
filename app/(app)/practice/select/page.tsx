'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getOnboardingData } from '@/lib/onboardingStore'
import { Coffee, Briefcase, CloudSun, Utensils } from 'lucide-react'

interface Clip {
  id: string
  title: string
  duration: string
  icon: React.ReactNode
  chip: string
}

const sampleClips: Clip[] = [
  { 
    id: '1', 
    title: 'Coffee shop conversation', 
    duration: '0:45',
    icon: <Coffee className="w-4 h-4" />,
    chip: 'Small talk'
  },
  { 
    id: '2', 
    title: 'Job interview tips', 
    duration: '1:20',
    icon: <Briefcase className="w-4 h-4" />,
    chip: 'Formal'
  },
  { 
    id: '3', 
    title: 'Weather small talk', 
    duration: '0:30',
    icon: <CloudSun className="w-4 h-4" />,
    chip: 'Easy'
  },
  { 
    id: '4', 
    title: 'Restaurant ordering', 
    duration: '0:55',
    icon: <Utensils className="w-4 h-4" />,
    chip: 'Daily life'
  },
]

export default function PracticeSelectPage() {
  const router = useRouter()
  const [showBackButton, setShowBackButton] = useState(false)

  useEffect(() => {
    // Check if user has completed signup/login (has firstName in localStorage)
    // If they have, don't show the back button
    if (typeof window !== 'undefined') {
      const hasCompletedSignup = !!localStorage.getItem('userFirstName')
      setShowBackButton(!hasCompletedSignup)
    }

    // Load onboarding data to inform clip selection
    // TODO: Use listeningDifficulties to prioritize/select appropriate clips
    // listeningDifficulties should be PRIMARY input for clip generation/selection
    // preferredGenre should only bias content style, not difficulty
    const onboardingData = getOnboardingData()
    if (onboardingData.listeningDifficulties.length > 0) {
      // Example: If user selected "Speech feels too fast to keep up",
      // prioritize clips with slower natural speech or shorter phrases
      // If user selected "Sentences feel long or confusing",
      // prioritize clips with shorter, simpler sentence structures
      console.log('Onboarding data:', onboardingData)
    }
  }, [])

  const handleClipSelect = (clipId: string) => {
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
            className="text-blue-600 font-medium text-lg py-2 px-1 -ml-1 inline-block"
          >
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
          {sampleClips.map((clip) => (
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
                  
                  {/* Title and chip */}
                  <div className="flex-1 min-w-0 flex flex-col gap-1">
                    <span className="font-medium text-gray-900">{clip.title}</span>
                    <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full w-fit">
                      {clip.chip}
                    </span>
                  </div>
                </div>
                
                {/* Duration */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <svg className="w-5 h-5 text-blue-600 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  <span className="text-sm text-gray-500 font-medium">{clip.duration}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </main>
  )
}

