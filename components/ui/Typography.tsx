'use client'

/**
 * Cue Typography System - Single Source of Truth
 * 
 * HOW TO USE:
 * - Use semantic `size` props instead of className overrides
 * - Use `tone` prop for text colors (default, sub, muted)
 * - Avoid passing `text-*` or `font-*` classes in className
 * 
 * DO NOT:
 * - Override with `className="text-xl"` or `className="font-bold"`
 * - Use custom CSS classes like `.text-heading-2` or `.text-body`
 * - Use inline Tailwind typography classes
 * 
 * MIGRATION:
 * - Replace custom classes with semantic sizes: `<Heading size="section">`
 * - Replace inline Tailwind with components: `<Body>` instead of `<p className="text-base">`
 * - Use `tone` prop for colors: `<Caption tone="muted">` instead of `className="text-gray-500"`
 */

import { ReactNode, HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

// Type definitions for semantic sizes
type HeadingSize = 'page' | 'section' | 'card'
type BodySize = 'body' | 'bodyStrong'
type CaptionSize = 'caption' | 'micro'
type NumericSize = 'kpi' | 'stat'
type LabelSize = 'nav' | 'kpiLabel' | 'action' | 'label'
type Tone = 'default' | 'sub' | 'muted'

interface BaseTypographyProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode
  className?: string
  as?: keyof JSX.IntrinsicElements
  tone?: Tone
}

interface HeadingProps extends BaseTypographyProps {
  size?: HeadingSize
  weight?: 'semibold' | 'bold'
}

interface BodyProps extends BaseTypographyProps {
  size?: BodySize
}

interface CaptionProps extends BaseTypographyProps {
  size?: CaptionSize
}

interface NumericProps extends BaseTypographyProps {
  size?: NumericSize
  weight?: 'medium' | 'semibold'
}

interface LabelProps extends BaseTypographyProps {
  size?: LabelSize
  weight?: 'medium' | 'semibold'
}

// Size variant mappings
const headingSizes: Record<HeadingSize, string> = {
  page: 'text-2xl md:text-3xl font-semibold tracking-tight leading-tight',
  section: 'text-xl md:text-2xl font-semibold tracking-tight leading-snug',
  card: 'text-lg md:text-xl font-semibold leading-snug',
}

const bodySizes: Record<BodySize, string> = {
  body: 'text-base font-normal leading-relaxed',
  bodyStrong: 'text-base font-medium leading-relaxed',
}

const captionSizes: Record<CaptionSize, string> = {
  caption: 'text-sm font-normal leading-snug',
  micro: 'text-xs font-normal leading-snug',
}

const numericSizes: Record<NumericSize, string> = {
  kpi: 'text-2xl md:text-3xl font-semibold leading-none tabular-nums',
  stat: 'text-xl font-semibold leading-none tabular-nums',
}

const labelSizes: Record<LabelSize, string> = {
  nav: 'text-sm font-medium leading-snug',
  kpiLabel: 'text-sm font-medium leading-snug',
  action: 'text-sm font-medium leading-snug',
  label: 'text-sm font-medium leading-snug',
}

// Tone/color mappings (using Tailwind grays for now, can be swapped later)
const toneColors: Record<Tone, string> = {
  default: 'text-gray-900',
  sub: 'text-gray-600',
  muted: 'text-gray-500',
}

// Dev mode warning helper
const warnAboutClassName = (componentName: string, className?: string) => {
  if (process.env.NODE_ENV === 'development' && className) {
    const hasTextClass = /text-(xs|sm|base|lg|xl|2xl|3xl|4xl)/.test(className)
    const hasFontClass = /font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)/.test(className)
    
    if (hasTextClass || hasFontClass) {
      console.warn(
        `[Typography] ${componentName}: Avoid using text-* or font-* classes in className. ` +
        `Use the \`size\` and \`weight\` props instead. Received: "${className}"`
      )
    }
  }
}

/**
 * Heading component for headlines and strong emphasis
 * Uses SF Pro Rounded Semibold (system font on macOS/iOS)
 * 
 * Sizes:
 * - "page": Page titles (h1) - 2xl/3xl responsive (prominent navigation-level titles)
 * - "section": Section titles (h2) - xl/2xl responsive
 * - "card": Card titles (h3) - lg/xl responsive
 * 
 * Default: "section" (backward compatible)
 */
export function Heading({ 
  children, 
  className,
  size = 'section', // Default for backward compatibility
  weight = 'semibold',
  tone = 'default',
  as: Component = 'h1',
  ...props 
}: HeadingProps) {
  // Warn in dev mode about className overrides
  warnAboutClassName('Heading', className)
  
  // Map weight to Tailwind classes
  const weightClass = weight === 'bold' ? 'font-bold' : 'font-semibold'
  
  // Get size classes (replace font-semibold with weightClass)
  const sizeClasses = headingSizes[size].replace('font-semibold', weightClass)
  
  return (
    <Component
      className={cn(
        'font-headline',
        sizeClasses,
        toneColors[tone],
        // Avoid passing text-* / font-* here; use `size` instead.
        className
      )}
      style={{ 
        fontFamily: '"SF Pro Rounded", "SF Pro Rounded Semibold", ui-rounded, system-ui, sans-serif',
        ...props.style,
      }}
      {...props}
    >
      {children}
    </Component>
  )
}

/**
 * Body component for main copy
 * Uses Inter Regular (loaded via Next.js font optimization)
 * 
 * Sizes:
 * - "body": Regular body text (default) - base, normal weight
 * - "bodyStrong": Emphasized body text - base, medium weight
 * 
 * Default: "body" (backward compatible)
 */
export function Body({ 
  children, 
  className,
  size = 'body', // Default for backward compatibility
  tone = 'default',
  as: Component = 'p',
  ...props 
}: BodyProps) {
  // Warn in dev mode about className overrides
  warnAboutClassName('Body', className)
  
  return (
    <Component
      className={cn(
        'font-body',
        bodySizes[size],
        toneColors[tone],
        // Avoid passing text-* / font-* here; use `size` instead.
        className
      )}
      style={{ 
        fontFamily: 'var(--font-inter), Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        ...props.style,
      }}
      {...props}
    >
      {children}
    </Component>
  )
}

/**
 * Label component for UI labels and sub-emphasis
 * Uses Inter Medium
 * 
 * Sizes:
 * - "nav": Navigation items - sm, medium weight
 * - "kpiLabel": KPI/stat labels - sm, medium weight
 * - "action": Inline action links - sm, medium weight
 * - "label": Generic labels - sm, medium weight
 * 
 * Default: "label" (backward compatible)
 */
export function Label({ 
  children, 
  className,
  size = 'label', // Default for backward compatibility
  weight = 'medium',
  tone = 'default',
  as: Component = 'span',
  ...props 
}: LabelProps) {
  // Warn in dev mode about className overrides
  warnAboutClassName('Label', className)
  
  // Map weight to Tailwind classes
  const weightClass = weight === 'semibold' ? 'font-semibold' : 'font-medium'
  
  // Get size classes (replace font-medium with weightClass)
  const sizeClasses = labelSizes[size].replace('font-medium', weightClass)
  
  return (
    <Component
      className={cn(
        'font-ui',
        sizeClasses,
        toneColors[tone],
        // Avoid passing text-* / font-* here; use `size` instead.
        className
      )}
      style={{ fontFamily: 'var(--font-inter), Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}
      {...props}
    >
      {children}
    </Component>
  )
}

/**
 * Caption component for microcopy and captions
 * Uses Inter Regular
 * 
 * Sizes:
 * - "caption": Standard captions - sm, normal weight
 * - "micro": Very small text - xs, normal weight
 * 
 * Default: "caption" (backward compatible)
 */
export function Caption({ 
  children, 
  className,
  size = 'caption', // Default for backward compatibility
  tone = 'muted', // Default to muted for captions
  as: Component = 'span',
  ...props 
}: CaptionProps) {
  // Warn in dev mode about className overrides
  warnAboutClassName('Caption', className)
  
  return (
    <Component
      className={cn(
        'font-body',
        captionSizes[size],
        toneColors[tone],
        // Avoid passing text-* / font-* here; use `size` instead.
        className
      )}
      style={{ fontFamily: 'var(--font-inter), Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}
      {...props}
    >
      {children}
    </Component>
  )
}

/**
 * Numeric component for numeric data
 * Uses Inter with tabular-nums for consistent width
 * 
 * Sizes:
 * - "kpi": Large KPI values - 2xl/3xl responsive, semibold
 * - "stat": Standard stat values - xl, semibold
 * 
 * Default: "stat" (backward compatible)
 */
export function Numeric({ 
  children, 
  className,
  size = 'stat', // Default for backward compatibility
  weight = 'semibold',
  tone = 'default',
  as: Component = 'span',
  ...props 
}: NumericProps) {
  // Warn in dev mode about className overrides
  warnAboutClassName('Numeric', className)
  
  // Map weight to Tailwind classes
  const weightClass = weight === 'medium' ? 'font-medium' : 'font-semibold'
  
  // Get size classes (replace font-semibold with weightClass)
  const sizeClasses = numericSizes[size].replace('font-semibold', weightClass)
  
  return (
    <Component
      className={cn(
        'font-ui',
        sizeClasses,
        toneColors[tone],
        // Avoid passing text-* / font-* here; use `size` instead.
        className
      )}
      style={{ fontFamily: 'var(--font-inter), Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}
      {...props}
    >
      {children}
    </Component>
  )
}
