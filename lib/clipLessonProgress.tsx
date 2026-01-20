'use client'

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'

/**
 * Clip Lesson Progress State
 * 
 * Manages progress for a single clip lesson across multiple screens:
 * - Step 1: Listen (completed when user plays audio)
 * - Step 2: Input (completed when user types text)
 * - Step 3: Check (completed when user clicks "Check answer")
 * - Step 4: Review (completed when review page loads)
 * - Step 5: Continue (completed when user clicks "Continue")
 * - Step 6+: Details/Practice items (each item is a separate step)
 * 
 * Progress only advances on explicit user actions.
 * 
 * BACKWARD JUMP PREVENTION:
 * The maxPercentAchieved field tracks the highest percentage ever reached in this lesson.
 * This prevents visual backward jumps when details are added after initialization (e.g., on Review page).
 * 
 * How it works:
 * 1. When details count increases, we calculate current percent BEFORE updating total steps
 * 2. We update maxPercentAchieved to preserve the current visual progress
 * 3. We calculate a new index that maintains the same percentage with the new total
 * 4. ClipTopBar always shows Math.max(calculatedPercent, maxPercentAchieved)
 * 
 * This ensures progress only moves forward, even when total steps change mid-lesson.
 */

export type LessonStep = 
  | { type: 'listen'; completed: boolean }
  | { type: 'input'; completed: boolean }
  | { type: 'check'; completed: boolean }
  | { type: 'review'; completed: boolean }
  | { type: 'continue'; completed: boolean }
  | { type: 'detail'; index: number; totalDetails: number; completed: boolean }

export interface ClipLessonProgress {
  // Current global step index (0-based)
  currentGlobalIndex: number
  
  // Total global steps (including all detail items)
  totalGlobalSteps: number
  
  // Lesson step definitions
  steps: LessonStep[]
  
  // Details count (if available)
  detailsCount: number
  
  // Current detail index (0-based, -1 if not in details)
  currentDetailIndex: number
  
  // Maximum percentage achieved (prevents backward jumps)
  maxPercentAchieved: number
}

interface ClipLessonProgressContextValue {
  progress: ClipLessonProgress | null
  initialize: (detailsCount: number) => void
  completeStep: (stepType: 'listen' | 'input' | 'check' | 'review' | 'continue' | 'detail', detailIndex?: number) => void
  setDetailStep: (detailIndex: number, totalDetails: number) => void
  getCurrentStep: () => number // Returns 1-based step for display
  reset: () => void
}

const ClipLessonProgressContext = createContext<ClipLessonProgressContextValue | null>(null)

export function useClipLessonProgress() {
  const context = useContext(ClipLessonProgressContext)
  if (!context) {
    throw new Error('useClipLessonProgress must be used within ClipLessonProgressProvider')
  }
  return context
}

// Debug flag for progress logging (can be set to false to disable all logs)
const DEBUG_PROGRESS = process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_DEBUG_PROGRESS !== 'false'

export function ClipLessonProgressProvider({ children }: { children: React.ReactNode }) {
  const [progress, setProgress] = useState<ClipLessonProgress | null>(null)
  const initializedRef = useRef<string | null>(null) // Track which clip is initialized

  // Get clip ID from current URL or props
  const getClipId = useCallback(() => {
    if (typeof window === 'undefined') return null
    const params = new URLSearchParams(window.location.search)
    const clipId = params.get('clip') || params.get('clipId') || params.get('storyClipId')
    const storyId = params.get('storyId')
    // Create unique identifier for this lesson
    return storyId && clipId ? `${storyId}_${clipId}` : clipId || 'default'
  }, [])

  // Initialize progress for a new clip lesson
  const initialize = useCallback((detailsCount: number = 0) => {
    const clipId = getClipId()
    if (!clipId) {
      if (DEBUG_PROGRESS && typeof window !== 'undefined') {
        console.log('🎯 [PROGRESS DEBUG] initialize called but no clipId', {
          source: new Error().stack?.split('\n')[2]?.trim(),
          timestamp: Date.now(),
        })
      }
      return
    }

    setProgress(prev => {
      // If already initialized for this clip, only update details count if needed
      if (initializedRef.current === clipId && prev) {
        // Update details count without resetting progress
        if (detailsCount > prev.detailsCount) {
          const baseSteps = 5 // listen, input, check, review, continue
          const newTotalGlobalSteps = baseSteps + detailsCount
          
          // Calculate CURRENT percentage before updating (this is what user sees)
          const currentPercent = prev.totalGlobalSteps > 1
            ? Math.round((prev.currentGlobalIndex / (prev.totalGlobalSteps - 1)) * 100)
            : prev.totalGlobalSteps === 1 ? 100 : 0
          
          // CRITICAL: Update maxPercentAchieved to current percent BEFORE calculating new percent
          // This ensures we never go backward when details are added
          const updatedMaxPercent = Math.max(currentPercent, prev.maxPercentAchieved || 0)
          
          // Calculate what index would maintain the current percent with new total
          const preservedIndex = newTotalGlobalSteps > 1
            ? Math.round((updatedMaxPercent / 100) * (newTotalGlobalSteps - 1))
            : 0
          
          // Add missing detail steps
          const newSteps = [...prev.steps]
          for (let i = prev.detailsCount; i < detailsCount; i++) {
            newSteps.push({ type: 'detail', index: i, totalDetails: detailsCount, completed: false })
          }

          // Calculate new percentage with preserved index
          const newPercent = newTotalGlobalSteps > 1
            ? Math.round((preservedIndex / (newTotalGlobalSteps - 1)) * 100)
            : newTotalGlobalSteps === 1 ? 100 : 0
          
          // Final safeguard: ensure we never go below max
          const safePercent = Math.max(newPercent, updatedMaxPercent)
          const safeIndex = safePercent > newPercent && newTotalGlobalSteps > 1
            ? Math.round((safePercent / 100) * (newTotalGlobalSteps - 1))
            : preservedIndex

          if (DEBUG_PROGRESS && typeof window !== 'undefined') {
            console.log('🎯 [PROGRESS DEBUG] Updated details count (with backward-jump prevention):', {
              source: new Error().stack?.split('\n')[2]?.trim(),
              clipId,
              pathname: window.location.pathname,
              from: {
                currentIndex: prev.currentGlobalIndex,
                totalSteps: prev.totalGlobalSteps,
                detailsCount: prev.detailsCount,
                percent: currentPercent,
                maxPercent: prev.maxPercentAchieved,
              },
              calculated: {
                currentIndex: preservedIndex,
                totalSteps: newTotalGlobalSteps,
                detailsCount,
                percent: newPercent,
              },
              final: {
                currentIndex: safeIndex,
                percent: safePercent,
              },
              preventedBackwardJump: safePercent > newPercent || preservedIndex !== prev.currentGlobalIndex,
              timestamp: Date.now(),
            })
          }

          return {
            ...prev,
            currentGlobalIndex: safeIndex,
            totalGlobalSteps: newTotalGlobalSteps,
            steps: newSteps,
            detailsCount,
            maxPercentAchieved: safePercent, // Update max percent (never decreases)
          }
        }
        
        // No change needed
        if (DEBUG_PROGRESS && typeof window !== 'undefined') {
          console.log('🎯 [PROGRESS DEBUG] initialize called but no update needed:', {
            source: new Error().stack?.split('\n')[2]?.trim(),
            clipId,
            pathname: window.location.pathname,
            currentDetailsCount: prev.detailsCount,
            requestedDetailsCount: detailsCount,
            timestamp: Date.now(),
          })
        }
        return prev
      }

      // New initialization - only reset if it's a different clip or no progress exists
      // Progress steps represent screen/page entries, not button clicks or typing:
      // 1. Respond page entry - ~20%
      // 2. Review page entry - ~40%
      // 3. Practice page entry - ~60%
      // 4. Continue/Complete - ~80%
      // 5+. Practice detail steps (if any) - 100%
      const baseSteps: LessonStep[] = [
        { type: 'listen', completed: false }, // Respond page entry
        { type: 'input', completed: false },  // Navigating to review (check answer clicked)
        { type: 'check', completed: false },  // Review page entry
        { type: 'review', completed: false }, // Practice page entry
        { type: 'continue', completed: false }, // Continue/Complete
      ]

      // Add detail steps if we know the count
      const detailSteps: LessonStep[] = []
      if (detailsCount > 0) {
        for (let i = 0; i < detailsCount; i++) {
          detailSteps.push({ type: 'detail', index: i, totalDetails: detailsCount, completed: false })
        }
      }

      const allSteps = [...baseSteps, ...detailSteps]
      const totalGlobalSteps = baseSteps.length + detailsCount

      initializedRef.current = clipId

      if (DEBUG_PROGRESS && typeof window !== 'undefined') {
        console.log('🎯 [PROGRESS DEBUG] New initialization:', {
          source: new Error().stack?.split('\n')[2]?.trim(),
          clipId,
          pathname: window.location.pathname,
          totalGlobalSteps,
          detailsCount,
          currentIndex: 0,
          percent: 0,
          timestamp: Date.now(),
        })
      }

      return {
        currentGlobalIndex: 0,
        totalGlobalSteps,
        steps: allSteps,
        detailsCount,
        currentDetailIndex: -1, // Not in details yet
        maxPercentAchieved: 0, // Start at 0%
      }
    })
  }, [getClipId])

  // Complete a specific step
  const completeStep = useCallback((stepType: 'listen' | 'input' | 'check' | 'review' | 'continue' | 'detail', detailIndex?: number) => {
    setProgress(prev => {
      if (!prev) {
        if (DEBUG_PROGRESS && typeof window !== 'undefined') {
          console.log('🎯 [PROGRESS DEBUG] completeStep called but no progress exists:', {
            source: new Error().stack?.split('\n')[2]?.trim(),
            stepType,
            detailIndex,
            timestamp: Date.now(),
          })
        }
        return prev
      }

      const oldPercent = prev.totalGlobalSteps > 1
        ? Math.round((prev.currentGlobalIndex / (prev.totalGlobalSteps - 1)) * 100)
        : prev.totalGlobalSteps === 1 ? 100 : 0

      const newSteps = [...prev.steps]
      let newGlobalIndex = prev.currentGlobalIndex

      if (stepType === 'listen') {
        // Mark listen as completed, advance to input
        const listenIndex = newSteps.findIndex(s => s.type === 'listen')
        if (listenIndex >= 0 && !newSteps[listenIndex].completed) {
          newSteps[listenIndex] = { ...newSteps[listenIndex], completed: true }
          newGlobalIndex = Math.min(prev.totalGlobalSteps - 1, newGlobalIndex + 1)
        }
      } else if (stepType === 'input') {
        // Mark input as completed, advance to check
        const inputIndex = newSteps.findIndex(s => s.type === 'input')
        if (inputIndex >= 0 && !newSteps[inputIndex].completed) {
          newSteps[inputIndex] = { ...newSteps[inputIndex], completed: true }
          newGlobalIndex = Math.min(prev.totalGlobalSteps - 1, newGlobalIndex + 1)
        }
      } else if (stepType === 'check') {
        // Mark check as completed, advance to review
        const checkIndex = newSteps.findIndex(s => s.type === 'check')
        if (checkIndex >= 0 && !newSteps[checkIndex].completed) {
          newSteps[checkIndex] = { ...newSteps[checkIndex], completed: true }
          newGlobalIndex = Math.min(prev.totalGlobalSteps - 1, newGlobalIndex + 1)
        }
      } else if (stepType === 'review') {
        // Mark review as completed, advance to continue step
        const reviewIndex = newSteps.findIndex(s => s.type === 'review')
        if (reviewIndex >= 0 && !newSteps[reviewIndex].completed) {
          newSteps[reviewIndex] = { ...newSteps[reviewIndex], completed: true }
          newGlobalIndex = Math.min(prev.totalGlobalSteps - 1, newGlobalIndex + 1)
        }
      } else if (stepType === 'continue') {
        // Mark continue as completed, advance to first detail (if exists) or end
        const continueIndex = newSteps.findIndex(s => s.type === 'continue')
        if (continueIndex >= 0 && !newSteps[continueIndex].completed) {
          newSteps[continueIndex] = { ...newSteps[continueIndex], completed: true }
          if (prev.detailsCount > 0) {
            newGlobalIndex = Math.min(prev.totalGlobalSteps - 1, newGlobalIndex + 1)
            // Mark first detail as active
            const firstDetailIndex = newSteps.findIndex(s => s.type === 'detail' && s.index === 0)
            if (firstDetailIndex >= 0) {
              newSteps[firstDetailIndex] = { ...newSteps[firstDetailIndex], currentDetailIndex: 0 } as any
            }
          } else {
            newGlobalIndex = prev.totalGlobalSteps - 1 // Lesson complete
          }
        }
      } else if (stepType === 'detail' && detailIndex !== undefined) {
        // Mark current detail as completed, advance to next detail (if exists)
        const detailStepIndex = newSteps.findIndex(s => s.type === 'detail' && s.index === detailIndex)
        if (detailStepIndex >= 0 && !newSteps[detailStepIndex].completed) {
          newSteps[detailStepIndex] = { ...newSteps[detailStepIndex], completed: true }
          newGlobalIndex = Math.min(prev.totalGlobalSteps - 1, newGlobalIndex + 1)
          
          // Move to next detail if exists
          const nextDetailIndex = detailIndex + 1
          if (nextDetailIndex < prev.detailsCount) {
            // Next detail becomes active
            const nextDetailStepIndex = newSteps.findIndex(s => s.type === 'detail' && s.index === nextDetailIndex)
            if (nextDetailStepIndex >= 0) {
              // Update will happen via setDetailStep
            }
          } else {
            // All details complete, lesson is done
            newGlobalIndex = prev.totalGlobalSteps - 1
          }
        }
      }

      const newPercent = prev.totalGlobalSteps > 1
        ? Math.round((newGlobalIndex / (prev.totalGlobalSteps - 1)) * 100)
        : prev.totalGlobalSteps === 1 ? 100 : 0
      
      // Update max percent achieved (never decreases)
      const newMaxPercent = Math.max(newPercent, prev.maxPercentAchieved || 0)

      if (DEBUG_PROGRESS && typeof window !== 'undefined') {
        const stepPercent = prev.totalGlobalSteps > 1
          ? Math.round((newGlobalIndex / (prev.totalGlobalSteps - 1)) * 100)
          : prev.totalGlobalSteps === 1 ? 100 : 0
        
        console.log('🎯 [PROGRESS DEBUG] Step completed:', {
          source: new Error().stack?.split('\n')[2]?.trim(),
          pathname: window.location.pathname,
          stepType,
          detailIndex,
          from: {
            index: prev.currentGlobalIndex,
            total: prev.totalGlobalSteps,
            percent: oldPercent,
            maxPercent: prev.maxPercentAchieved,
          },
          to: {
            index: newGlobalIndex,
            total: prev.totalGlobalSteps,
            percent: stepPercent,
            maxPercent: newMaxPercent,
          },
          calculation: {
            formula: `${newGlobalIndex} / (${prev.totalGlobalSteps} - 1) * 100`,
            rawPercent: (newGlobalIndex / (prev.totalGlobalSteps - 1)) * 100,
            roundedPercent: stepPercent,
          },
          timestamp: Date.now(),
        })
      }

      return {
        ...prev,
        currentGlobalIndex: newGlobalIndex,
        steps: newSteps,
        currentDetailIndex: stepType === 'detail' ? (detailIndex ?? prev.currentDetailIndex) : prev.currentDetailIndex,
        maxPercentAchieved: newMaxPercent,
      }
    })
  }, [])

  // Set current detail step (called when navigating to/within details)
  const setDetailStep = useCallback((detailIndex: number, totalDetails: number) => {
    setProgress(prev => {
      if (!prev) return prev

      // Update details count if needed
      const updatedDetailsCount = Math.max(prev.detailsCount, totalDetails)
      
      // Calculate global index: base steps (5) + detail index
      const baseSteps = 5 // listen, input, check, review, continue
      const newGlobalIndex = Math.min(prev.totalGlobalSteps - 1, baseSteps + detailIndex)

      // Update step definitions if details count changed
      let newSteps = [...prev.steps]
      if (updatedDetailsCount > prev.detailsCount) {
        // Add missing detail steps
        for (let i = prev.detailsCount; i < updatedDetailsCount; i++) {
          newSteps.push({ type: 'detail', index: i, totalDetails: updatedDetailsCount, completed: false })
        }
        
        // Recalculate total
        const newTotal = baseSteps + updatedDetailsCount
        return {
          ...prev,
          currentGlobalIndex: newGlobalIndex,
          totalGlobalSteps: newTotal,
          steps: newSteps,
          detailsCount: updatedDetailsCount,
          currentDetailIndex: detailIndex,
        }
      }

      return {
        ...prev,
        currentGlobalIndex: newGlobalIndex,
        currentDetailIndex: detailIndex,
        detailsCount: updatedDetailsCount,
        // Preserve maxPercentAchieved when just navigating details
      }
    })
  }, [])

  // Get current 1-based step for display
  const getCurrentStep = useCallback(() => {
    if (!progress) return 1
    // Map global index to step number
    // Steps: 1=Listen, 2=Input, 3=Check, 4=Review, 5=Continue, 6+=Details
    if (progress.currentGlobalIndex < 1) return 1 // Listen
    if (progress.currentGlobalIndex < 2) return 2 // Input
    if (progress.currentGlobalIndex < 3) return 3 // Check
    if (progress.currentGlobalIndex < 4) return 4 // Review
    if (progress.currentGlobalIndex < 5) return 5 // Continue
    // Details: step 6+
    return Math.min(6, 5 + (progress.currentGlobalIndex - 4)) // Cap at 6 for display
  }, [progress])

  // Reset progress (for new lesson)
  const reset = useCallback(() => {
    setProgress(null)
    initializedRef.current = null
  }, [])

  // Auto-initialize on mount if clipId is available
  useEffect(() => {
    const clipId = getClipId()
    if (clipId && !progress) {
      // Initialize with default details count (will be updated when details are known)
      initialize(0)
    }
  }, [getClipId, initialize, progress])
  
  // Debug logging for progress changes
  useEffect(() => {
    if (DEBUG_PROGRESS && progress && typeof window !== 'undefined') {
      const percent = progress.totalGlobalSteps > 1
        ? Math.round((progress.currentGlobalIndex / (progress.totalGlobalSteps - 1)) * 100)
        : progress.totalGlobalSteps === 1 ? 100 : 0
      const safePercent = Math.max(percent, progress.maxPercentAchieved || 0)
      
      console.log('🔵 [ClipLessonProgress] State changed:', {
        pathname: window.location.pathname,
        clipId: initializedRef.current,
        currentGlobalIndex: progress.currentGlobalIndex,
        totalGlobalSteps: progress.totalGlobalSteps,
        detailsCount: progress.detailsCount,
        currentDetailIndex: progress.currentDetailIndex,
        calculatedPercent: percent,
        maxPercentAchieved: progress.maxPercentAchieved,
        displayPercent: safePercent,
        timestamp: new Date().toISOString(),
      })
    }
  }, [progress])

  return (
    <ClipLessonProgressContext.Provider
      value={{
        progress,
        initialize,
        completeStep,
        setDetailStep,
        getCurrentStep,
        reset,
      }}
    >
      {children}
    </ClipLessonProgressContext.Provider>
  )
}

