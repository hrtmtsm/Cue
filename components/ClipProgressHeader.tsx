'use client'

interface ClipProgressHeaderProps {
  step: 1 | 2 | 3 // Step 1: Listen first, Step 2: Type/Speak, Step 3: Review
}

export default function ClipProgressHeader({ step }: ClipProgressHeaderProps) {
  const totalSteps = 3
  const percent = Math.round((step / totalSteps) * 100)

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium text-gray-700">
          Step {step} / {totalSteps}
        </div>
        <div className="text-sm font-semibold text-gray-900">{percent}%</div>
      </div>
      <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-600 transition-all duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}

