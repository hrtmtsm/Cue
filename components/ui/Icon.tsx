/**
 * Icon wrapper component for consistent Phosphor icon usage
 * 
 * Provides default sizing and styling for Phosphor icons across the app.
 * Icons inherit text color via currentColor for easy theming.
 */

import { ComponentProps, ElementType } from 'react'
import { IconWeight } from '@phosphor-icons/react'

interface IconProps {
  icon: ElementType<{
    size?: number | string
    weight?: IconWeight
    className?: string
    [key: string]: any
  }>
  size?: number | string
  weight?: IconWeight
  className?: string
  [key: string]: any
}

/**
 * Icon component wrapper for Phosphor icons
 * 
 * @param icon - The Phosphor icon component to render
 * @param size - Icon size in pixels (default: 20)
 * @param weight - Icon weight: "thin" | "light" | "regular" | "bold" | "fill" | "duotone" (default: "regular")
 * @param className - Additional CSS classes
 */
export function Icon({ 
  icon: IconComponent, 
  size = 20, 
  weight = 'regular',
  className = '',
  ...props 
}: IconProps) {
  return (
    <IconComponent
      size={size}
      weight={weight}
      className={className}
      {...props}
    />
  )
}
