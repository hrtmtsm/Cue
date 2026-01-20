'use client'

import { ChevronLeft } from 'lucide-react'
import { usePathname } from 'next/navigation'
import ClipProgressBar from './ClipProgressBar'
import { useClipLessonProgress } from '@/lib/clipLessonProgress'

interface ClipTopBarProps {
  onBack: () => void
  rightSlot?: React.ReactNode
  // Optional: override for cases where we don't have lesson progress yet
  fallbackStep?: number
  fallbackTotalSteps?: number
}

// Debug flag for progress logging (can be disabled via NEXT_PUBLIC_DEBUG_PROGRESS=false)
const DEBUG_PROGRESS = process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_DEBUG_PROGRESS !== 'false'

export default function ClipTopBar({ 
  onBack,
  rightSlot,
  fallbackStep,
  fallbackTotalSteps = 5, // Default to 5 (will be 6 if detail steps exist)
}: ClipTopBarProps) {
  const pathname = usePathname()
  
  // Determine current screen based on pathname (which page user is on)
  // This is based on actual page location, not completed steps
  // Screen numbering is continuous: 1, 2, 3, 4, 5 (or 6 if there are practice steps)
  const getCurrentScreenFromPath = (): number => {
    if (pathname && pathname.includes('/practice/respond')) {
      return 1 // Respond/Listen screen (first screen)
    } else if (pathname && pathname.includes('/practice/review')) {
      return 2 // Review screen (second screen - after respond)
    } else if (pathname && /\/practice\/[^/]+\/practice/.test(pathname)) {
      // Pattern: /practice/[clipId]/practice
      // This will be adjusted to screen 6 if there are detail steps, otherwise screen 3
      return 3 // Practice screen (third screen - will be adjusted if detail steps exist)
    } else if (pathname && pathname.includes('/practice/session-summary')) {
      return 4 // Session summary/continue screen (fourth screen)
    }
    return 1 // Default to screen 1
  }
  
  // Try to use shared lesson progress, fall back to props if not available
  let progress: { percent: number; currentStep?: number; totalSteps?: number } | null = null
  
  try {
    const lessonProgress = useClipLessonProgress()
    if (lessonProgress.progress) {
      const { currentGlobalIndex, totalGlobalSteps, steps, maxPercentAchieved } = lessonProgress.progress
      
      // Calculate percent based on current position (uses all steps individually)
      let percent = 0
      if (totalGlobalSteps === 0) {
        percent = 0
      } else if (totalGlobalSteps === 1) {
        percent = 100 // Only one step, so we're at 100%
      } else {
        percent = Math.round((currentGlobalIndex / (totalGlobalSteps - 1)) * 100)
      }
      
      // CRITICAL: Never show progress lower than maxPercentAchieved
      // This prevents visual backward jumps when details are added
      const safePercent = Math.max(percent, maxPercentAchieved || 0)
      const clampedPercent = Math.max(0, Math.min(100, safePercent))
      
      // Calculate screen number for display based on current pathname
      // Screen counter: base screens (5) + 1 for all practice steps combined = 5 or 6
      const baseSteps = 5
      const hasDetailSteps = totalGlobalSteps > baseSteps
      const totalScreensForDisplay = baseSteps + (hasDetailSteps ? 1 : 0) // 5 or 6
      
      // Get current screen from pathname (base mapping: 1, 2, 3, 4)
      let currentScreen = getCurrentScreenFromPath()
      
      // Adjust screen number to be continuous based on whether there are detail practice steps
      // Without detail steps (total = 5): 1, 2, 3, 4, 5
      //   Screen 1: Respond
      //   Screen 2: Review
      //   Screen 3: Practice
      //   Screen 4: Continue/Summary
      //   Screen 5: Complete (or doesn't exist as separate page)
      // With detail steps (total = 6): 1, 2, 3, 4, 5, 6
      //   Screen 1: Respond
      //   Screen 2: Review
      //   Screen 3: (gap, or Continue)
      //   Screen 4: Continue (if detail steps exist)
      //   Screen 5: Continue/Complete (if detail steps exist)
      //   Screen 6: Practice (all detail steps count as one)
      
      // For continuous numbering with detail steps:
      // - Respond (1) and Review (2) stay the same
      // - Practice page becomes the last screen (6) when detail steps exist
      // - Continue/Summary becomes screen 5 when detail steps exist, or screen 4 when they don't
      if (hasDetailSteps && currentScreen === 3) {
        // Practice screen with detail steps → screen 6 (last screen)
        currentScreen = 6
      } else if (hasDetailSteps && currentScreen === 4) {
        // Continue/summary screen when there are detail steps → screen 5
        currentScreen = 5
      }
      // Without detail steps, screens 1-4 map directly (no adjustment needed)
      
      // Ensure screen number is within valid range
      currentScreen = Math.min(Math.max(1, currentScreen), totalScreensForDisplay)
      
      progress = {
        percent: clampedPercent,
        currentStep: currentScreen,
        totalSteps: totalScreensForDisplay, // 5 or 6 (all practice steps count as one)
      }
      
      // Debug logging with stack trace
      if (DEBUG_PROGRESS && typeof window !== 'undefined') {
        console.log('🎯 [PROGRESS DEBUG] ClipTopBar render:', {
          source: 'ClipTopBar component render',
          pathnameFromHook: pathname,
          windowPathname: window.location.pathname,
          currentGlobalIndex,
          totalGlobalSteps, // Used for progress bar (counts all steps individually)
          currentScreen, // Screen number for display (based on pathname, practice steps count as one)
          totalScreensForDisplay, // Total screens for display (5 or 6)
          calculatedPercent: percent,
          maxPercentAchieved,
          displayPercent: clampedPercent,
          timestamp: Date.now(),
          stackTrace: new Error().stack?.split('\n').slice(2, 4).join('\n'),
        })
      }
    }
  } catch (e) {
    // Context not available, use fallback
  }

  // Use fallback if no progress available - still use pathname to determine screen
  let currentScreenDisplay: number
  let totalScreensDisplay: number
  
  if (progress) {
    currentScreenDisplay = progress.currentStep ?? 1
    totalScreensDisplay = progress.totalSteps ?? fallbackTotalSteps
  } else {
    // Fallback: use pathname to determine screen, default total to 6
    currentScreenDisplay = getCurrentScreenFromPath()
    totalScreensDisplay = fallbackTotalSteps
  }
  
  const percent = progress?.percent ?? (fallbackStep 
    ? Math.round((fallbackStep / fallbackTotalSteps) * 100)
    : 0)
  
  // Calculate step display (current screen / total screens for clip)
  // Screen counter: base screens (5) + 1 for all practice steps combined = 5 or 6
  // Progress bar: counts all steps individually (uses totalGlobalSteps)
  const stepText = `${currentScreenDisplay}/${totalScreensDisplay}`
  
  return (
    <div className="flex items-center justify-between w-full py-3 px-6 mb-4">
      {/* Left: Back button */}
      <button
        onClick={onBack}
        className="flex-shrink-0 w-10 h-10 flex items-center justify-center text-gray-600 hover:text-gray-900 transition-colors"
        aria-label="Back"
      >
        <ChevronLeft className="w-6 h-6" />
      </button>
      
      {/* Center: Progress bar */}
      <ClipProgressBar percent={percent} />
      
      {/* Right: Custom slot */}
      <div className="flex-shrink-0 min-w-[32px] flex items-center justify-center">
        {rightSlot}
      </div>
    </div>
  )
}
