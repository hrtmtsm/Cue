import { type MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/en', '/ja', '/en/tokusho', '/ja/tokusho'],
        disallow: [
          '/en/practice/',
          '/ja/practice/',
          '/en/profile',
          '/ja/profile',
          '/en/progress',
          '/ja/progress',
          '/en/saved-tips',
          '/ja/saved-tips',
          '/en/saved-vocabulary',
          '/ja/saved-vocabulary',
          '/en/auth/',
          '/ja/auth/',
          '/en/onboarding/',
          '/ja/onboarding/',
          '/en/pro/success',
          '/ja/pro/success',
          '/api/',
        ],
      },
    ],
    sitemap: 'https://getmycue.app/sitemap.xml',
  }
}
