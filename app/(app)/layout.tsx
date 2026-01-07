'use client'

import { usePathname } from 'next/navigation'
import BottomNav from '@/components/BottomNav'
import { shouldHideBottomNav } from '@/lib/navigationUtils'

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const shouldHide = shouldHideBottomNav(pathname)

  return (
    <>
      <div 
        className="w-full min-h-full"
        style={{
          // Only add bottom padding when bottom nav is visible
          paddingBottom: shouldHide 
            ? 'env(safe-area-inset-bottom)' 
            : 'calc(64px + env(safe-area-inset-bottom))',
        }}
      >
        {children}
      </div>
      <BottomNav />
    </>
  )
}

