'use client'

interface ClipProgressBarProps {
  percent: number // 0-100
}

export default function ClipProgressBar({ percent }: ClipProgressBarProps) {
  const clampedPercent = Math.max(0, Math.min(100, percent))
  
  return (
    <div className="w-full">
      <div className="h-3 md:h-4 w-full bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-600 transition-all duration-500 ease-out rounded-full"
          style={{ width: `${clampedPercent}%` }}
        />
      </div>
    </div>
  )
}

