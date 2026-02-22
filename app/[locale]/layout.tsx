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
  icons: {
    icon: '/icon.svg',
  },
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

