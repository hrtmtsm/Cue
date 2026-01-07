'use client'

import { useEffect, useState } from 'react'
import { X, Loader2, AlertCircle, Info } from 'lucide-react'

interface SnackbarProps {
  open: boolean
  variant: 'info' | 'loading' | 'error'
  title: string
  message?: string
  actions?: React.ReactNode
  onClose?: () => void
}

export default function Snackbar({
  open,
  variant,
  title,
  message,
  actions,
  onClose,
}: SnackbarProps) {
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (open) {
      setMounted(true)
      // Trigger animation on next frame
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setVisible(true)
        })
      })
    } else {
      setVisible(false)
      // Wait for exit animation before unmounting
      const timer = setTimeout(() => {
        setMounted(false)
      }, 200)
      return () => clearTimeout(timer)
    }
  }, [open])

  if (!mounted) return null

  const variantStyles = {
    info: {
      icon: <Info className="w-5 h-5 text-blue-600" />,
      border: 'border-blue-200',
      bg: 'bg-white',
    },
    loading: {
      icon: <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />,
      border: 'border-blue-200',
      bg: 'bg-white',
    },
    error: {
      icon: <AlertCircle className="w-5 h-5 text-red-600" />,
      border: 'border-red-200',
      bg: 'bg-white',
    },
  }

  const style = variantStyles[variant]

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 top-4 md:top-6 pointer-events-none z-50 flex justify-center w-full max-w-[420px] px-4"
      style={{
        transition: 'opacity 200ms ease-out',
        opacity: visible ? 1 : 0,
      }}
    >
      <div
        className={`pointer-events-auto w-full rounded-xl border-2 shadow-lg backdrop-blur-sm bg-white/95 transition-transform duration-200 ease-out ${style.border}`}
        style={{
          transform: visible ? 'translateY(0)' : 'translateY(-8px)',
        }}
      >
        <div className="p-4 space-y-3">
          {/* Header */}
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 mt-0.5">{style.icon}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900">{title}</p>
              {message && (
                <p className="text-xs text-gray-600 mt-1">{message}</p>
              )}
            </div>
            {onClose && (
              <button
                onClick={onClose}
                className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors p-1 -mr-1 -mt-1"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Actions */}
          {actions && <div className="flex flex-col gap-2">{actions}</div>}
        </div>
      </div>
    </div>
  )
}

