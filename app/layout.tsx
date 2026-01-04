import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Cue - English Listening Practice',
  description: 'Practice your English listening skills',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="h-full overflow-hidden">
      <body className="h-full bg-gray-50 antialiased overflow-x-hidden overflow-y-auto overscroll-contain">
        <div className="mx-auto max-w-[420px] min-h-full bg-white shadow-lg">
          {children}
        </div>
      </body>
    </html>
  )
}

