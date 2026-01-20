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
    <html lang="en" className="overflow-x-hidden">
      <body className="bg-gray-50 antialiased overflow-x-hidden">
        <div className="min-h-dvh w-full">
          {children}
        </div>
      </body>
    </html>
  )
}

