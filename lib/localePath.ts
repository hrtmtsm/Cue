/**
 * Helper utilities for locale-aware routing
 */

/**
 * Get a locale-aware path by prepending the locale segment
 * @param locale - Current locale (e.g., 'en', 'ja')
 * @param path - Path without locale (e.g., '/practice/select')
 * @returns Locale-aware path (e.g., '/en/practice/select')
 */
export function getLocalePath(locale: string, path: string): string {
  // Remove leading slash if present to avoid double slashes
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  // Ensure locale path starts with /locale
  return `/${locale}${cleanPath}`
}

/**
 * Replace locale in current pathname
 * @param pathname - Current pathname (e.g., '/en/practice/select')
 * @param newLocale - New locale (e.g., 'ja')
 * @returns New pathname with replaced locale (e.g., '/ja/practice/select')
 */
export function replaceLocaleInPath(pathname: string, newLocale: string): string {
  const segments = pathname.split('/').filter(Boolean)
  
  // If first segment is a locale, replace it
  if (segments.length > 0 && ['en', 'ja'].includes(segments[0])) {
    segments[0] = newLocale
  } else {
    // No locale in path, prepend it
    segments.unshift(newLocale)
  }
  
  return `/${segments.join('/')}`
}

/**
 * Extract locale from pathname
 * @param pathname - Current pathname (e.g., '/en/practice/select')
 * @returns Locale or null if not found
 */
export function getLocaleFromPath(pathname: string): string | null {
  const segments = pathname.split('/').filter(Boolean)
  if (segments.length > 0 && ['en', 'ja'].includes(segments[0])) {
    return segments[0]
  }
  return null
}
