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
  ]

  // Check if pathname matches any hide route
  return hideNavRoutes.some(route => pathname.startsWith(route))
}

