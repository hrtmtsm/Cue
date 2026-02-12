'use client'

interface MicPermissionModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function MicPermissionModal({ isOpen, onClose }: MicPermissionModalProps) {
  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-[360px] p-6 space-y-4 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-3">
          <h2 className="text-2xl font-bold text-gray-900">
            Please allow microphone access
          </h2>
          <p className="text-gray-600 leading-relaxed">
            Microphone access is blocked for this site. Please enable microphone access in your
            browser settings, then come back to Speak.
          </p>
        </div>

        <button
          onClick={onClose}
          className="w-full py-3 px-6 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 active:bg-blue-800 transition-colors"
        >
          Got it
        </button>
      </div>
    </div>
  )
}





