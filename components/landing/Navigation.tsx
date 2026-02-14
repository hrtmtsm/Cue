'use client'

import Link from 'next/link'
import { useState, useRef, useEffect } from 'react'
import { useLocale } from 'next-intl'
import { useTranslations } from 'next-intl'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { replaceLocaleInPath } from '@/lib/localePath'

const LANGUAGES = [
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'ja', label: '日本語', flag: '🇯🇵' },
  // Future languages:
  // { code: 'es', label: 'Español', flag: '🇪🇸' },
  // { code: 'fr', label: 'Français', flag: '🇫🇷' },
  // { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
]

export default function Navigation({ locale: localeProp }: { locale?: string }) {
  const localeFromHook = useLocale()
  const locale = localeProp || localeFromHook
  const t = useTranslations('landing.nav')
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const currentLanguage = LANGUAGES.find(lang => lang.code === locale) || LANGUAGES[0]

  const switchLanguage = (newLocale: string) => {
    const newPath = replaceLocaleInPath(pathname || '', newLocale)
    const queryString = searchParams.toString()
    const fullPath = queryString ? `${newPath}?${queryString}` : newPath
    router.replace(fullPath)
    
    if (typeof window !== 'undefined') {
      localStorage.setItem('NEXT_LOCALE', newLocale)
    }
    setIsOpen(false)
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <nav className="sticky top-0 z-50 bg-white border-b border-gray-200">
      <div className="w-full px-8 md:px-16 lg:px-24 xl:px-32 py-5 md:py-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          {/* Logo */}
          <Link href={`/${locale}`} className="flex items-center">
            <img 
              src="/cue-logo.svg" 
              alt="Cue" 
              className="h-8 md:h-10 w-auto"
            />
          </Link>

          {/* Right side: Language dropdown + Get started */}
          <div className="flex items-center gap-6">
            {/* Language Dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition text-sm font-medium text-gray-700 font-inter"
              >
                <span className="text-lg">{currentLanguage.flag}</span>
                <span className="hidden sm:inline">{currentLanguage.label}</span>
                <svg 
                  className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              {/* Dropdown Menu */}
              {isOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                  {LANGUAGES.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => switchLanguage(lang.code)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition text-left ${
                        lang.code === locale ? 'bg-blue-50 text-blue-600' : 'text-gray-700'
                      }`}
                    >
                      <span className="text-lg">{lang.flag}</span>
                      <span className="font-medium font-inter">{lang.label}</span>
                      {lang.code === locale && (
                        <svg className="w-4 h-4 ml-auto" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Get started button */}
            <Link
              href={`/${locale}/auth`}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors text-sm font-inter"
            >
              {t('get_started')}
            </Link>
          </div>
        </div>
      </div>
    </nav>
  )
}
