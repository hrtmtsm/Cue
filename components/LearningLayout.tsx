'use client'

import { ReactNode } from 'react'
import { ClipLessonProgressProvider } from '@/lib/clipLessonProgress'

interface LearningLayoutProps {
  children: ReactNode
}

/**
 * Focused learning layout for practice/review flows.
 * No sidebar, no global navigation - just learning content.
 */
export default function LearningLayout({ children }: LearningLayoutProps) {
  return (
    <ClipLessonProgressProvider>
      <div className="min-h-screen bg-gray-50">
        {/* Full-width content area - no sidebar margin */}
        <main className="flex-1 py-6 min-h-screen">
          {/* Inner container: centered with max-width - wider on desktop for learning screens */}
          <div className="w-full px-6 md:px-8 lg:max-w-[900px] xl:max-w-[960px] mx-auto">
            {children}
          </div>
        </main>
      </div>
    </ClipLessonProgressProvider>
  )
}
