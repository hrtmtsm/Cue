import createMiddleware from 'next-intl/middleware'
import { locales, defaultLocale } from './i18n'
import { NextRequest, NextResponse } from 'next/server'

const intlMiddleware = createMiddleware({
  locales,
  defaultLocale,
  localePrefix: 'always',
  localeDetection: true
})

// Public routes that don't require authentication
const publicRoutes = [
  '/',
  '/auth',
  '/onboarding',
  '/tokusho',
]

// Check if a path is public (allows locale prefix)
function isPublicRoute(pathname: string): boolean {
  // Remove locale prefix if present
  const pathWithoutLocale = pathname.replace(/^\/[a-z]{2}(-[A-Z]{2})?/, '') || '/'
  
  return publicRoutes.some(route => 
    pathWithoutLocale === route || pathWithoutLocale.startsWith(`${route}/`)
  )
}

// Check if user has a Supabase session cookie
function hasSessionCookie(request: NextRequest): boolean {
  // Supabase stores session in cookies with pattern: sb-<project-ref>-auth-token
  // Check for any Supabase auth-related cookies
  const cookies = request.cookies.getAll()
  return cookies.some(cookie => 
    cookie.name.includes('sb-') && cookie.name.includes('-auth-token')
  )
}

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  
  console.log('🔍 [Middleware] Intercepted:', pathname);
  
  // Check if this is OAuth callback
  if (pathname.includes('/auth/callback')) {
    console.log('   → OAuth callback detected, allowing through');
  }

  // Allow API routes, static files, and Next.js internals
  if (
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/_vercel') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  // Check if route is public
  if (isPublicRoute(pathname)) {
    console.log('   → Public route, using intl middleware');
    return intlMiddleware(request)
  }

  // Protected routes - check authentication
  const hasSession = hasSessionCookie(request)
  console.log('   → Protected route, hasSession:', hasSession);

  // In development, allow access even without session (fallback to dev guest)
  const isDevelopment = process.env.NODE_ENV === 'development' || 
                        process.env.VERCEL_ENV !== 'production'

  if (!hasSession && !isDevelopment) {
    // No session and not in dev - redirect to login
    console.log('   → No session in production, redirecting to login');
    const locale = pathname.split('/')[1] || defaultLocale
    const loginUrl = new URL(`/${locale}/auth/login`, request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // User is authenticated or in dev mode - proceed with locale middleware
  console.log('   → Allowing through (authenticated or dev mode)');
  return intlMiddleware(request)
}

export const config = {
  // Match all pathnames except for
  // - /api routes
  // - /_next (Next.js internals)
  // - /_vercel (Vercel internals)
  // - Static files (images, etc.)
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)']
}

