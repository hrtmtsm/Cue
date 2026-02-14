'use client'

interface ExitPracticeModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirmExit: () => void
}

export default function ExitPracticeModal({ 
  isOpen, 
  onClose, 
  onConfirmExit 
}: ExitPracticeModalProps) {
  if (!isOpen) return null

  return (
    <div 
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-gray-900">
              Exit practice?
            </h2>
            <p className="text-gray-600">
              Your progress in this session will be lost.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2 pt-2">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onClose()
            }}
            className="w-full py-3 px-4 bg-blue-600 text-white rounded-xl font-semibold active:bg-blue-700 transition-colors"
          >
            Keep practicing
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              console.log('Exit button clicked')
              onConfirmExit()
            }}
            className="w-full py-3 px-4 border-2 border-gray-200 text-gray-700 rounded-xl font-medium active:bg-gray-50 transition-colors"
          >
            Exit
          </button>
        </div>
      </div>
    </div>
  )
}

