'use client'

interface StepDiffProps {
  expected: string
  actual?: string
  type: 'missing' | 'substitution' | 'extra'
}

export default function StepDiff({ expected, actual, type }: StepDiffProps) {
  return (
    <div className="p-5 bg-white border border-gray-200 rounded-xl space-y-3">
      <h3 className="text-base font-semibold text-gray-900">Compared to what you heard</h3>
      
      <div className="space-y-2">
        {/* What was said */}
        <div>
          <div className="text-xs font-medium text-gray-500 mb-1">What was said</div>
          <div className="text-base text-gray-900 font-medium">{expected}</div>
        </div>
        
        {/* What you typed */}
        {actual && type === 'substitution' && (
          <div>
            <div className="text-xs font-medium text-gray-500 mb-1">What you typed</div>
            <div className="text-base text-red-600 font-medium line-through">{actual}</div>
          </div>
        )}
        
        {type === 'missing' && (
          <div>
            <div className="text-xs font-medium text-gray-500 mb-1">What you typed</div>
            <div className="text-base text-gray-400 italic">(missed)</div>
          </div>
        )}
        
        {type === 'extra' && actual && (
          <div>
            <div className="text-xs font-medium text-gray-500 mb-1">What you typed</div>
            <div className="text-base text-gray-500 italic">{actual} (extra)</div>
          </div>
        )}
      </div>
    </div>
  )
}


