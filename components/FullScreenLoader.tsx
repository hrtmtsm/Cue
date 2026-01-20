'use client'

interface FullScreenLoaderProps {
  open: boolean
}

export default function FullScreenLoader({ open }: FullScreenLoaderProps) {
  if (!open) return null

  return (
    <>
      <style>{`
        @keyframes spotify-dot {
          0%, 60%, 100% {
            transform: translateY(0);
            opacity: 0.7;
          }
          30% {
            transform: translateY(-10px);
            opacity: 1;
          }
        }
        .spotify-dot-1 {
          animation: spotify-dot 1.4s ease-in-out infinite;
          animation-delay: 0ms;
        }
        .spotify-dot-2 {
          animation: spotify-dot 1.4s ease-in-out infinite;
          animation-delay: 200ms;
        }
        .spotify-dot-3 {
          animation: spotify-dot 1.4s ease-in-out infinite;
          animation-delay: 400ms;
        }
      `}</style>
      <div
        className="fixed bg-white/90 backdrop-blur-sm z-50 flex items-center justify-center"
        style={{
          top: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: '100%',
          maxWidth: '420px',
          height: '100%',
          transition: 'opacity 200ms ease-out',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          overflow: 'hidden',
        }}
      >
        <div className="flex items-center space-x-2">
          {/* Spotify-like 3-dot animation */}
          <div className="flex space-x-1.5">
            <div className="w-2 h-2 rounded-full bg-blue-600 spotify-dot-1" />
            <div className="w-2 h-2 rounded-full bg-blue-600 spotify-dot-2" />
            <div className="w-2 h-2 rounded-full bg-blue-600 spotify-dot-3" />
          </div>
        </div>
      </div>
    </>
  )
}

