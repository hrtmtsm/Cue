/**
 * Format a date string as a relative time (e.g., "Saved today", "Saved yesterday")
 */
export function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  
  if (diffDays === 0) return 'Saved today'
  if (diffDays === 1) return 'Saved yesterday'
  if (diffDays < 7) return `Saved ${diffDays} days ago`
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7)
    return `Saved ${weeks} week${weeks > 1 ? 's' : ''} ago`
  }
  const months = Math.floor(diffDays / 30)
  return `Saved ${months} month${months > 1 ? 's' : ''} ago`
}
