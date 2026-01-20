'use client'

interface ClipsReadyModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function ClipsReadyModal({ isOpen, onClose }: ClipsReadyModalProps) {
  if (!isOpen) return null

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-2xl shadow-xl w-full max-w-[520px] p-6 space-y-4 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close icon */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Close"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="space-y-3 pr-8">
          <h2 className="text-2xl font-bold text-gray-900">
            Your clips are ready 🎧
          </h2>
          <p className="text-gray-600 leading-relaxed">
            We picked a few short conversations to start with.
          </p>
        </div>
        
        <button
          onClick={onClose}
          className="w-full py-3 px-6 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 active:bg-blue-800 transition-colors"
        >
          Start practicing
        </button>
      </div>
    </div>
  )
}

