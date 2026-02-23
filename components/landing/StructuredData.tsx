export default function StructuredData({ locale }: { locale: string }) {
  const isJapanese = locale === 'ja'

  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Cue',
    url: 'https://getmycue.app',
    logo: 'https://getmycue.app/favicon-96x96.png',
    sameAs: [],
    contactPoint: {
      '@type': 'ContactPoint',
      email: 'hrtmtsh@gmail.com',
      contactType: 'Customer Service',
    },
  }

  const webApplicationSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: isJapanese ? 'Cue – 英語リスニング練習アプリ' : 'Cue – English Listening Practice App',
    description: isJapanese
      ? 'ネイティブの英語音声で、英語リスニングを毎日練習。即時フィードバックで効率よく上達。'
      : 'Train your ear with real native speaker audio. Daily listening practice with instant feedback — for learners worldwide.',
    url: `https://getmycue.app/${locale}`,
    applicationCategory: 'EducationalApplication',
    operatingSystem: 'Web Browser',
    offers: {
      '@type': 'Offer',
      price: '9.99',
      priceCurrency: 'USD',
      priceValidUntil: '2026-12-31',
    },
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.8',
      ratingCount: '150',
    },
    featureList: isJapanese
      ? [
          'ネイティブ英語音声',
          '毎日練習',
          '即時フィードバック',
          'パーソナライズされたコンテンツ',
          'リスニングスキル向上',
        ]
      : [
          'Native English Audio',
          'Daily Practice',
          'Instant Feedback',
          'Personalized Content',
          'Listening Skills Improvement',
        ],
  }

  const softwareApplicationSchema = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: isJapanese ? 'Cue – 英語リスニング練習アプリ' : 'Cue – English Listening Practice App',
    applicationCategory: 'EducationalApplication',
    operatingSystem: 'Web Browser',
    offers: {
      '@type': 'Offer',
      price: '9.99',
      priceCurrency: 'USD',
    },
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.8',
    },
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webApplicationSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplicationSchema) }}
      />
    </>
  )
}
