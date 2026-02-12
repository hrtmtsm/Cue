import { NextRequest, NextResponse } from 'next/server'
import { getPreferredLocale } from '@/lib/utils/locale'

/**
 * Non-locale callback route - redirects to canonical locale-based callback
 * This ensures all OAuth callbacks go through the canonical locale route
 */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  
  // Detect user's preferred locale
  const acceptLanguage = request.headers.get('accept-language')
  const locale = getPreferredLocale(acceptLanguage)
  
  // Preserve all query parameters (code, error, etc.)
  const searchParams = requestUrl.searchParams.toString()
  const queryString = searchParams ? `?${searchParams}` : ''
  
  // Redirect to canonical locale-based callback route
  const redirectUrl = `${requestUrl.origin}/${locale}/auth/callback${queryString}`
  
  return NextResponse.redirect(redirectUrl)
}
