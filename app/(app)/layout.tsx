'use client'

import { usePathname } from 'next/navigation'
import BottomNav from '@/components/BottomNav'
import Sidebar from '@/components/Sidebar'
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
      {/* Responsive layout: sidebar on desktop, bottom nav on mobile */}
      <div className="min-h-screen bg-gray-50">
        {/* Desktop sidebar - fixed position */}
        <Sidebar />
        
        {/* Main content area - with left margin on desktop to offset fixed sidebar */}
        <main className={`flex-1 ${!shouldHide ? 'md:ml-64' : ''} py-6 min-h-screen ${shouldHide ? 'pb-6' : 'pb-24 md:pb-6'}`}>
          {/* Inner container: centered with max-width */}
          <div className="max-w-[520px] md:max-w-3xl mx-auto px-4 md:px-8">
            {children}
          </div>
        </main>
      </div>
      
      {/* Mobile bottom nav */}
      <BottomNav />
    </ClipLessonProgressProvider>
  )
}

