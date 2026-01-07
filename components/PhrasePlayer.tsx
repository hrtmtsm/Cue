'use client'

interface PhrasePlayerProps {
  transcript: string
  highlightSpan: { start: number; end: number }
  onPlay?: () => void
  onSlow?: () => void
  onLoop?: () => void
}

export default function PhrasePlayer({
  transcript,
  highlightSpan,
  onPlay,
  onSlow,
  onLoop,
}: PhrasePlayerProps) {
  const words = transcript.split(/\s+/)
  const { start, end } = highlightSpan

  const before = words.slice(0, start).join(' ')
  const highlight = words.slice(start, end).join(' ')
  const after = words.slice(end).join(' ')

  return (
    <div className="space-y-4">
      {/* Phrase text */}
      <div className="text-lg leading-relaxed">
        {before && <>{before} </>}
        <mark className="bg-yellow-200 font-semibold px-1 rounded">{highlight}</mark>
        {after && <> {after}</>}
      </div>

      {/* Inline controls */}
      <div className="flex items-center space-x-3 pt-2 border-t border-gray-200">
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
          className="flex items-center space-x-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium active:bg-gray-200 transition-colors"
          aria-label="Slow"
        >
          <span className="text-lg">🐢</span>
          <span>Slow</span>
        </button>

        {onLoop && (
          <button
            onClick={onLoop}
            className="flex items-center space-x-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium active:bg-gray-200 transition-colors"
            aria-label="Loop highlight"
          >
            <span className="text-lg">🎯</span>
            <span>Loop</span>
          </button>
        )}
      </div>
    </div>
  )
}


