export default function StructuredData({ locale }: { locale: string }) {
  const isJapanese = locale === 'ja'

  // FAQ data
  const faqItems = isJapanese
    ? [
        {
          question: 'Cueはどのように英語リスニングスキルを向上させますか？',
          answer:
            'Cueはネイティブスピーカーの実際の音声で毎日リスニング練習を提供します。聞き逃した内容とその理由について即座にフィードバックを受け取れるため、ネイティブスピーカーが自然に使う縮約形、音の連結、弱化などのパターンを理解できます。',
        },
        {
          question: 'Cueを使うのに料金はかかりますか？',
          answer:
            'Cueは無料プランで1日1回の練習セッションを提供しています。無制限の練習とリスニングのコツへのアクセスには、月額$9.99のProプランにアップグレードしてください。',
        },
        {
          question: 'Cueは他の英語学習アプリとどう違いますか？',
          answer:
            'Cueはパターンベースのフィードバックでリスニング理解に特化しています。聞き逃した内容を伝えるだけでなく、なぜ難しかったのかを説明し、ネイティブスピーカーが実際に使うリスニングパターンを教えます。',
        },
        {
          question: 'スマートフォンでCueを使えますか？',
          answer:
            'はい！Cueはブラウザがあればどのデバイスでも動作するウェブアプリです。スマートフォン、タブレット、パソコンで利用できます。アプリストアからのダウンロードは不要です。',
        },
        {
          question: '上達を実感するまでどのくらいかかりますか？',
          answer:
            '多くのユーザーが毎日の練習を数週間続けることで、リスニング理解力の向上を実感しています。自然な英語の音声パターンに慣れるには、継続的な練習が重要です。',
        },
      ]
    : [
        {
          question: 'How does Cue improve my English listening skills?',
          answer:
            'Cue provides daily listening practice with real native speaker audio. You\'ll get instant feedback on what you missed and why, helping you understand patterns like contractions, sound linking, and reductions that native speakers use naturally.',
        },
        {
          question: 'Do I need to pay to use Cue?',
          answer:
            'Cue offers a free plan with one practice session per day. For unlimited practice and access to listening tips, upgrade to Pro for $9.99/month.',
        },
        {
          question: 'What makes Cue different from other English learning apps?',
          answer:
            'Cue focuses specifically on listening comprehension with pattern-based feedback. Instead of just telling you what you missed, we explain why it was hard and teach you the listening patterns native speakers actually use.',
        },
        {
          question: 'Can I use Cue on my phone?',
          answer:
            'Yes! Cue is a web app that works on any device with a browser - phones, tablets, and computers. No app store download required.',
        },
        {
          question: 'How long does it take to see improvement?',
          answer:
            'Many users notice improvement in their listening comprehension within a few weeks of daily practice. Consistent practice is key to developing your ear for natural English speech patterns.',
        },
      ]

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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: faqItems.map((item) => ({
              '@type': 'Question',
              name: item.question,
              acceptedAnswer: {
                '@type': 'Answer',
                text: item.answer,
              },
            })),
          }),
        }}
      />
    </>
  )
}
