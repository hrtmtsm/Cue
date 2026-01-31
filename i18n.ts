import { getRequestConfig } from 'next-intl/server'

export const locales = ['en', 'ja'] as const
export type Locale = (typeof locales)[number]
export const defaultLocale: Locale = 'ja'

export default getRequestConfig(async ({ locale }): Promise<{ locale: string; messages: any }> => {
  // Validate and fallback to default locale if locale is undefined or invalid
  const validLocale = (locale && locales.includes(locale as any)) ? locale : defaultLocale
  
  return {
    locale: validLocale,
    messages: (await import(`./messages/${validLocale}.json`)).default
  }
})

