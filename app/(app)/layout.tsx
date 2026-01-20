'use client'

import { usePathname } from 'next/navigation'
import BottomNav from '@/components/BottomNav'
import { shouldHideBottomNav } from '@/lib/navigationUtils'
import { ClipLessonProgressProvider } from '@/lib/clipLessonProgress'

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const shouldHide = shouldHideBottomNav(pathname)

  return (
    <ClipLessonProgressProvider>
      {/* AppShell: outer container */}
      <div className="min-h-dvh w-full">
        {/* Inner container: responsive, max-width 520px */}
        <div className="mx-auto w-full max-w-[520px] px-4">
          {/* Page content with bottom padding for mobile nav */}
          <div className={`w-full min-h-dvh ${shouldHide ? 'pb-4 md:pb-4' : 'pb-20 md:pb-4'}`}>
            {children}
          </div>
        </div>
      </div>
      <BottomNav />
    </ClipLessonProgressProvider>
  )
}

