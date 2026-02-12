export type Locale = 'ja' | 'en';

/**
 * Detects user's preferred locale based on:
 * 1. Accept-Language header (server-side)
 * 2. localStorage (client-side)
 * 3. Browser language (client-side)
 * 4. Default to 'ja'
 */
export function getPreferredLocale(acceptLanguageHeader?: string | null): Locale {
  // Server-side: Check Accept-Language header
  if (acceptLanguageHeader) {
    const lower = acceptLanguageHeader.toLowerCase();
    if (lower.includes('ja')) return 'ja';
    if (lower.includes('en')) return 'en';
  }
  
  // Client-side: Check localStorage and browser
  if (typeof window !== 'undefined') {
    // Check saved preference
    const saved = localStorage.getItem('preferredLocale');
    if (saved === 'ja' || saved === 'en') return saved;
    
    // Check browser language
    const browserLang = navigator.language.toLowerCase();
    if (browserLang.startsWith('ja')) return 'ja';
    if (browserLang.startsWith('en')) return 'en';
  }
  
  // Default to Japanese
  return 'ja';
}
