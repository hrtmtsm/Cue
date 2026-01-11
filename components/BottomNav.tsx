'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Play, TrendingUp, User } from 'lucide-react'
import { shouldHideBottomNav } from '@/lib/navigationUtils'

export default function BottomNav() {
  const pathname = usePathname()
  const shouldHide = shouldHideBottomNav(pathname)

  // Hide bottom nav in story/clip flow
  if (shouldHide) {
    return null
  }

  const isActive = (path: string) => {
    if (path === '/practice') {
      return pathname === '/practice' || pathname?.startsWith('/practice/select')
    }
    return pathname === path || pathname?.startsWith(`${path}/`)
  }

  const tabs = [
    {
      name: 'Practice',
      path: '/practice',
      icon: Play,
    },
    {
      name: 'Progress',
      path: '/progress',
      icon: TrendingUp,
    },
    {
      name: 'Profile',
      path: '/profile',
      icon: User,
    },
  ]

  return (
    <nav 
      className="fixed bottom-0 z-50 bg-white border-t border-gray-200"
      style={{
        left: '50%',
        transform: 'translateX(-50%)',
        width: '100%',
        maxWidth: '420px',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div className="px-6">
        <div className="flex items-center justify-around h-16">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const active = isActive(tab.path)
            return (
              <Link
                key={tab.path}
                href={tab.path}
                className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
                  active ? 'text-blue-600' : 'text-gray-500'
                }`}
                aria-label={tab.name}
              >
                <Icon className={`w-6 h-6 mb-1 ${active ? 'text-blue-600' : 'text-gray-500'}`} />
                <span className={`text-xs font-medium ${active ? 'text-blue-600' : 'text-gray-500'}`}>
                  {tab.name}
                </span>
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}

