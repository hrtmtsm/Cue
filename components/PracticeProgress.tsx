type PracticeProgressProps = {
  currentStep: number // 0-based
  totalSteps: number
}

export default function PracticeProgress({ currentStep, totalSteps }: PracticeProgressProps) {
  const safeTotal = Math.max(1, totalSteps)
  const safeCurrent = Math.min(Math.max(0, currentStep), safeTotal - 1)
  const percent = Math.round(((safeCurrent + 1) / safeTotal) * 100)

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium text-gray-700">
          Step {safeCurrent + 1} / {safeTotal}
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



