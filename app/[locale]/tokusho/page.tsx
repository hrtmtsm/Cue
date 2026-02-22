import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { Metadata } from 'next'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'tokusho' })
  return {
    title: t('title'),
  }
}

const ITEM_KEYS = [
  'seller',
  'manager',
  'address',
  'phone',
  'email',
  'url',
  'service_name',
  'service_desc',
  'price',
  'payment',
  'billing_timing',
  'delivery',
  'cancellation',
  'refund',
  'environment',
] as const

export default async function TokushoPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'tokusho' })

  return (
    <main className="min-h-screen bg-white">
      {/* Simple header */}
      <div className="border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-6 py-4">
          <Link
            href={`/${locale}`}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            ← Cue
          </Link>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-2xl font-bold text-gray-900 mb-8 font-inter">
          {t('title')}
        </h1>

        <div className="divide-y divide-gray-100">
          {ITEM_KEYS.map((key) => (
            <div key={key} className="py-4 grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-4">
              <dt className="text-sm font-medium text-gray-500 font-inter">
                {t(`items.${key}.label`)}
              </dt>
              <dd className="text-sm text-gray-900 sm:col-span-2 font-inter">
                {key === 'url' ? (
                  <a
                    href={t(`items.${key}.value`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    {t(`items.${key}.value`)}
                  </a>
                ) : (
                  t(`items.${key}.value`)
                )}
              </dd>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-100 mt-12 py-6 px-6">
        <div className="max-w-3xl mx-auto text-center text-sm text-gray-400 font-inter">
          © 2026, Cue
        </div>
      </footer>
    </main>
  )
}
