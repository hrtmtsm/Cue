'use client'

type AudioControlsProps = {
  onPlay: () => void
  onSlow: () => void
  onReplayChunk: () => void
  isSlow?: boolean
}

export default function AudioControls({ onPlay, onSlow, onReplayChunk, isSlow }: AudioControlsProps) {
  return (
    <div className="flex items-center space-x-3">
      <button
        onClick={onPlay}
        className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium active:bg-blue-700 transition-colors"
        aria-label="Play"
      >
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M8 5v14l11-7z" />
        </svg>
        <span>Play</span>
      </button>

      <button
        onClick={onSlow}
        className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors ${
          isSlow ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700 active:bg-gray-200'
        }`}
        aria-label="Slow"
      >
        <span className="text-lg">🐢</span>
        <span>Slow</span>
      </button>

      <button
        onClick={onReplayChunk}
        className="flex items-center space-x-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium active:bg-gray-200 transition-colors"
        aria-label="Replay this part"
      >
        <span className="text-lg">🔁</span>
        <span>This part</span>
      </button>
    </div>
  )
}



