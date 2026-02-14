/**
 * Check if current route is in story/clip flow (should hide bottom nav)
 * 
 * Bottom nav should be visible only on top-level tabs:
 * - Practice (story list)
 * - Progress
 * - Profile
 * 
 * Bottom nav should be hidden in story/clip flow:
 * - Story detail pages
 * - Respond page
 * - Review page
 * - Feedback page
 * - Session summary
 */
export function shouldHideBottomNav(pathname: string | null): boolean {
  if (!pathname) return false

  // Top-level routes that should show bottom nav
  const topLevelRoutes = [
    '/practice',
    '/practice/select', // Story list
    '/progress',
    '/profile',
  ]

  // If it's a top-level route, show nav
  if (topLevelRoutes.includes(pathname)) {
    return false
  }

  // Story/clip flow routes that should hide nav
  const hideNavRoutes = [
    '/practice/story/', // Story detail pages
    '/practice/respond', // Respond page
    '/practice/review', // Review page
    '/practice/feedback', // Feedback page
    '/practice/session-summary', // Session summary
    '/practice/', // Practice flow pages (including /practice/[clipId]/practice)
  ]

  // Check if pathname matches any hide route
  return hideNavRoutes.some(route => pathname.startsWith(route))
}

/**
 * Check if current route is in learning/practice flow (should use LearningLayout)
 * 
 * Learning routes that should hide sidebar and use focused layout:
 * - All practice routes except /practice/select (story list)
 * - Review page
 * - Respond page
 * - Feedback page
 * - Session summary
 * - Any /practice/* routes
 */
export function isLearningRoute(pathname: string | null): boolean {
  if (!pathname) return false

  // Remove locale prefix if present (e.g., /en/practice -> /practice)
  // Handle patterns like /en/practice/review or /practice/review
  const pathWithoutLocale = pathname.replace(/^\/[a-z]{2}\//, '/')

  // Story list should use normal layout (has sidebar)
  // Match /practice or /practice/select (with or without locale)
  if (pathWithoutLocale === '/practice' || pathWithoutLocale === '/practice/select') {
    return false
  }

  // All other practice routes use learning layout
  if (pathWithoutLocale.startsWith('/practice/')) {
    return true
  }

  return false
}

