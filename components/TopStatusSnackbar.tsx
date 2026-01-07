'use client'

import { Loader2 } from 'lucide-react'

interface TopStatusSnackbarProps {
  open: boolean
  message: string
}

export default function TopStatusSnackbar({ open, message }: TopStatusSnackbarProps) {
  if (!open) return null

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 top-4 md:top-6 pointer-events-none z-40 flex justify-center w-full px-4"
      style={{
        transition: 'opacity 200ms ease-out',
        opacity: open ? 1 : 0,
      }}
    >
      <div
        className="pointer-events-auto max-w-[420px] w-full rounded-xl border-2 border-blue-200 bg-white/95 backdrop-blur-sm shadow-lg px-4 py-3 flex items-center gap-3"
        style={{
          transform: open ? 'translateY(0)' : 'translateY(-8px)',
          transition: 'transform 200ms ease-out',
        }}
      >
        <Loader2 className="w-4 h-4 text-blue-600 animate-spin flex-shrink-0" />
        <p className="text-sm font-medium text-gray-900 flex-1">{message}</p>
      </div>
    </div>
  )
}


