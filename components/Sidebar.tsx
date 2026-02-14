'use client'

import { Play, ChartLineUp, User } from '@phosphor-icons/react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { shouldHideBottomNav, isLearningRoute } from '@/lib/navigationUtils'
import { Heading, Caption, Label } from '@/components/ui/Typography'
import { Icon } from '@/components/ui/Icon'

export default function Sidebar() {
  const pathname = usePathname()
  const locale = useLocale()
  const t = useTranslations()
  const shouldHide = shouldHideBottomNav(pathname)
  const isLearning = isLearningRoute(pathname)
  
  // Hide sidebar in learning/practice flow (focused mode)
  if (shouldHide || isLearning) {
    return null
  }
  
  const links = [
    { href: `/${locale}/practice`, icon: Play, label: t('nav.practice') },
    { href: `/${locale}/progress`, icon: ChartLineUp, label: t('nav.progress') },
    { href: `/${locale}/profile`, icon: User, label: t('nav.profile') },
  ]
  
  const isActive = (href: string) => {
    if (!pathname) return false
    
    // Handle practice route specially (includes /practice/select)
    if (href === `/${locale}/practice`) {
      return pathname === href || pathname.startsWith(`/${locale}/practice/select`)
    }
    // For other routes, check exact match or sub-routes
    return pathname === href || pathname.startsWith(`${href}/`)
  }
  
  return (
    <aside className="hidden md:flex md:flex-col w-64 bg-white border-r border-gray-200 fixed left-0 top-0 bottom-0 overflow-y-auto">
      <div className="p-6">
        <Link href={`/${locale}/practice`}>
          <img 
            src="/cue-logo.svg" 
            alt="Cue" 
            className="h-8 w-auto"
          />
        </Link>
      </div>
      
      <nav className="flex-1 space-y-2">
        {links.map(({ href, icon, label }) => {
          const active = isActive(href)
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
                active 
                  ? 'bg-blue-50 text-blue-600' 
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <Icon 
                icon={icon} 
                size={24} 
                weight={active ? 'regular' : 'regular'}
                className="text-current"
              />
              <Label>{label}</Label>
            </Link>
          )
        })}
      </nav>
      
      <div className="p-4 border-t border-gray-200">
        <Caption className="text-gray-500 text-center">
          {t('profile.buildListeningSkills')}
        </Caption>
      </div>
    </aside>
  )
}

