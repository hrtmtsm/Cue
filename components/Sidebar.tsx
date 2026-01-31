'use client'

import { Play, TrendingUp, User } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { shouldHideBottomNav } from '@/lib/navigationUtils'

export default function Sidebar() {
  const pathname = usePathname()
  const locale = useLocale()
  const t = useTranslations()
  const shouldHide = shouldHideBottomNav(pathname)
  
  // Hide sidebar in story/clip flow (same logic as bottom nav)
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
  
  const links = [
    { href: `/${locale}/practice`, icon: Play, label: t('nav.practice') },
    { href: `/${locale}/progress`, icon: TrendingUp, label: t('nav.progress') },
    { href: `/${locale}/profile`, icon: User, label: t('nav.profile') },
  ]
  
  return (
    <aside className="hidden md:flex md:flex-col w-64 bg-white border-r border-gray-200 fixed left-0 top-0 bottom-0 overflow-y-auto">
      <div className="p-6">
        <h1 className="text-2xl font-bold text-blue-600">Cue</h1>
      </div>
      
      <nav className="flex-1 px-4 space-y-2">
        {links.map(({ href, icon: Icon, label }) => {
          const active = isActive(href)
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
                active 
                  ? 'bg-blue-100 text-blue-600 font-semibold' 
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Icon className="w-6 h-6" />
              <span>{label}</span>
            </Link>
          )
        })}
      </nav>
      
      <div className="p-4 border-t border-gray-200">
        <p className="text-xs text-gray-500 text-center">
          {t('profile.buildListeningSkills')}
        </p>
      </div>
    </aside>
  )
}

