'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { Play, TrendingUp, User } from 'lucide-react'
import { shouldHideBottomNav } from '@/lib/navigationUtils'

export default function BottomNav() {
  const pathname = usePathname()
  const locale = useLocale()
  const t = useTranslations()
  const shouldHide = shouldHideBottomNav(pathname)

  // Hide bottom nav in story/clip flow
  if (shouldHide) {
    return null
  }

  const isActive = (path: string) => {
    const localizedPath = `/${locale}${path}`
    if (path === '/practice') {
      return pathname === localizedPath || pathname?.startsWith(`/${locale}/practice/select`)
    }
    return pathname === localizedPath || pathname?.startsWith(`${localizedPath}/`)
  }

  const tabs = [
    {
      name: t('nav.practice'),
      path: `/${locale}/practice`,
      icon: Play,
    },
    {
      name: t('nav.progress'),
      path: `/${locale}/progress`,
      icon: TrendingUp,
    },
    {
      name: t('nav.profile'),
      path: `/${locale}/profile`,
      icon: User,
    },
  ]

  return (
    <nav 
      className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 md:hidden pb-[env(safe-area-inset-bottom)]"
    >
      <div className="mx-auto w-full max-w-[520px] px-4">
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

