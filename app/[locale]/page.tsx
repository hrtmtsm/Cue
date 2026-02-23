import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { type Metadata } from 'next'
import LandingPageContent from '@/components/landing/LandingPageContent'
import StructuredData from '@/components/landing/StructuredData'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params

  if (locale === 'ja') {
    return {
      title: 'Cue – 英語リスニング練習アプリ',
      description:
        'ネイティブの英語音声で、英語リスニングを毎日練習。即時フィードバックで効率よく上達。世界中の学習者に対応。',
      keywords: [
        '英語リスニング',
        '英語アプリ',
        '英語 listening',
        '英語聴解',
        '英語練習',
        'Cue 英語アプリ',
        'ネイティブ英語',
        '英語リスニング練習',
        'English listening',
      ],
      alternates: {
        canonical: 'https://getmycue.app/ja',
        languages: {
          'en': 'https://getmycue.app/en',
          'ja': 'https://getmycue.app/ja',
          'x-default': 'https://getmycue.app/ja',
        },
      },
      openGraph: {
        title: 'Cue – 英語リスニング練習アプリ',
        description:
          'ネイティブの英語音声で、英語リスニングを毎日練習。即時フィードバックで効率よく上達。',
        url: 'https://getmycue.app/ja',
        siteName: 'Cue',
        images: [
          {
            url: '/landing/hero.png',
            width: 1200,
            height: 630,
            alt: 'Cue – 英語リスニング練習アプリ',
          },
        ],
        locale: 'ja_JP',
        type: 'website',
        alternateLocale: ['en_US'],
      },
      twitter: {
        card: 'summary_large_image',
        title: 'Cue – 英語リスニング練習アプリ',
        description:
          'ネイティブの英語音声で、英語リスニングを毎日練習。即時フィードバックで効率よく上達。',
        images: ['/landing/hero.png'],
      },
    }
  }

  // Default: English (global)
  return {
    title: 'Cue – English Listening Practice App',
    description:
      'Train your ear with real native speaker audio. Cue gives you daily listening practice with instant feedback — for learners worldwide.',
    keywords: [
      'English listening app',
      'improve English listening',
      'English listening practice',
      'english listening skills',
      'learn English listening',
      'native English audio',
      'English comprehension app',
      'Cue app',
    ],
    alternates: {
      canonical: 'https://getmycue.app/en',
      languages: {
        'en': 'https://getmycue.app/en',
        'ja': 'https://getmycue.app/ja',
        'x-default': 'https://getmycue.app/en',
      },
    },
    openGraph: {
      title: 'Cue – English Listening Practice App',
      description:
        'Train your ear with real native speaker audio. Daily listening practice with instant feedback — for learners worldwide.',
      url: 'https://getmycue.app/en',
      siteName: 'Cue',
      images: [
        {
          url: '/landing/hero.png',
          width: 1200,
          height: 630,
          alt: 'Cue – English Listening Practice App',
        },
      ],
      locale: 'en_US',
      type: 'website',
      alternateLocale: ['ja_JP'],
    },
    twitter: {
      card: 'summary_large_image',
      title: 'Cue – English Listening Practice App',
      description:
        'Train your ear with real native speaker audio. Daily listening practice with instant feedback — for learners worldwide.',
      images: ['/landing/hero.png'],
    },
  }
}

export default async function LocalizedLanding({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  
  // Check if user is authenticated
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )

  const { data: { session } } = await supabase.auth.getSession()
  
  if (session) {
    redirect(`/${locale}/practice/select`)
  }
  
  return (
    <>
      <StructuredData locale={locale} />
      <LandingPageContent locale={locale} />
    </>
  )
}

// Generate static params for supported locales
export function generateStaticParams() {
  return [
    { locale: 'en' },
    { locale: 'ja' },
    // Future: Add more locales here
    // { locale: 'es' },
    // { locale: 'fr' },
  ];
}
