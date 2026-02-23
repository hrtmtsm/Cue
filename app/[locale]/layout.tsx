import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { locales } from '@/i18n'
import { Inter } from 'next/font/google'
import { PostHogProvider } from '@/lib/posthog/PostHogProvider'
import '../globals.css'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

export const metadata = {
  metadataBase: new URL('https://getmycue.app'),
  verification: {
    google: 'yj45nRDjp-L1HG8o1F0YtQ5suGh4lf0I5bqHKAd9qi8',
  },
  icons: {
    icon: [
      { url: '/favicon-96x96.png', sizes: '96x96', type: 'image/png' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    apple: { url: '/apple-touch-icon.png', sizes: '180x180' },
  },
  appleWebApp: {
    title: 'Cue',
  },
  manifest: '/site.webmanifest',
}

export default async function LocaleLayout({
  children,
  params
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  
  if (!locales.includes(locale as any)) {
    notFound()
  }

  const messages = await getMessages({ locale })

  return (
    <html lang={locale} className={`${inter.variable} overflow-x-hidden`}>
      <body className={`${inter.className} bg-gray-50 antialiased overflow-x-hidden`}>
        <NextIntlClientProvider messages={messages} locale={locale}>
          <PostHogProvider>
            <div className="min-h-dvh w-full">
              {children}
            </div>
          </PostHogProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}

