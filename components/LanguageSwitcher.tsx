'use client'

import { useLocale } from 'next-intl'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { replaceLocaleInPath } from '@/lib/localePath'

export function LanguageSwitcher() {
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const switchLanguage = (newLocale: string) => {
    // Replace locale in pathname
    const newPath = replaceLocaleInPath(pathname || '', newLocale)
    
    // Preserve query parameters
    const queryString = searchParams.toString()
    const fullPath = queryString ? `${newPath}?${queryString}` : newPath
    
    // Use replace instead of push to avoid adding to history
    router.replace(fullPath)
    
    // Optional: Persist to localStorage for future sessions
    if (typeof window !== 'undefined') {
      localStorage.setItem('NEXT_LOCALE', newLocale)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => switchLanguage('en')}
        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
          locale === 'en'
            ? 'bg-blue-600 text-white'
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
        }`}
      >
        EN
      </button>
      <button
        onClick={() => switchLanguage('ja')}
        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
          locale === 'ja'
            ? 'bg-blue-600 text-white'
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
        }`}
      >
        日本語
      </button>
    </div>
  )
}


