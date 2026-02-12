'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { Play, TrendingUp, User } from 'lucide-react'
import { shouldHideBottomNav } from '@/lib/navigationUtils'
import { Caption } from '@/components/ui/Typography'

export default function BottomNav() {
  const pathname = usePathname()
  const locale = useLocale()
  const t = useTranslations()
  const shouldHide = shouldHideBottomNav(pathname)

  // Debug log (can be removed later)
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    console.log('🧭 [BottomNav] pathname:', pathname, 'locale:', locale)
  }

  // Hide bottom nav in story/clip flow
  if (shouldHide) {
    return null
  }

  const tabs = [
    {
      name: t('nav.practice'),
      path: `/${locale}/practice`,
      icon: Play,
      matchPaths: [`/${locale}/practice`, `/${locale}/practice/select`],
    },
    {
      name: t('nav.progress'),
      path: `/${locale}/progress`,
      icon: TrendingUp,
      matchPaths: [`/${locale}/progress`],
    },
    {
      name: t('nav.profile'),
      path: `/${locale}/profile`,
      icon: User,
      matchPaths: [`/${locale}/profile`],
    },
  ]

  const isActive = (tab: typeof tabs[0]) => {
    // Check if current pathname matches any of the tab's match paths
    return tab.matchPaths.some(matchPath => {
      return pathname === matchPath || pathname?.startsWith(`${matchPath}/`)
    })
  }

  return (
    <nav 
      className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 md:hidden pb-[env(safe-area-inset-bottom)]"
    >
      <div className="mx-auto w-full max-w-[520px] px-4">
        <div className="flex items-center justify-around h-16">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const active = isActive(tab)
            
            // Debug logging
            if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
              console.log(`🧭 [BottomNav] ${tab.name} - active:`, active, 'pathname:', pathname, 'matchPaths:', tab.matchPaths)
            }
            
            return (
              <Link
                key={tab.path}
                href={tab.path}
                className="flex flex-col items-center justify-center flex-1 h-full transition-colors"
                aria-label={tab.name}
              >
                <Icon className={`w-6 h-6 mb-1 transition-colors ${active ? 'text-blue-600' : 'text-gray-500'}`} />
                <Caption 
                  weight="medium"
                  className={`transition-colors ${active ? 'text-blue-600' : 'text-gray-500'}`}
                >
                  {tab.name}
                </Caption>
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}

