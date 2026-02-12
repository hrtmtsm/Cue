'use client'

import { useTranslations, useLocale } from 'next-intl';
import Navigation from './Navigation'
import Hero from './Hero'
import SellingPoint from './SellingPoint'
import FinalCTA from './FinalCTA'

export default function LandingPageContent({ locale: localeProp }: { locale?: string }) {
  const localeFromHook = useLocale()
  const locale = localeProp || localeFromHook
  const t = useTranslations('landing');
  
  return (
    <div className="min-h-screen bg-white">
      <Navigation locale={locale} />
      <Hero locale={locale} />
      
      {/* Selling Point 1: Personalized */}
      <SellingPoint
        imageSide="left"
        bgColor="bg-blue-50"
        icon="🎯"
        title={t('selling_points.personalized.title')}
        description={t('selling_points.personalized.description')}
        bullets={[
          t('selling_points.personalized.bullets.0'),
          t('selling_points.personalized.bullets.1'),
          t('selling_points.personalized.bullets.2'),
          t('selling_points.personalized.bullets.3'),
        ]}
        imageLabel="Progress Dashboard Screenshot"
        imageGradient="from-blue-100 to-green-100"
        imageSrc="/landing/section_1.png"
      />
      
      {/* Selling Point 2: Pattern-Based */}
      <SellingPoint
        imageSide="right"
        bgColor="bg-white"
        icon="🧩"
        title={t('selling_points.pattern_based.title')}
        description={t('selling_points.pattern_based.description')}
        bullets={[
          t('selling_points.pattern_based.bullets.0'),
          t('selling_points.pattern_based.bullets.1'),
          t('selling_points.pattern_based.bullets.2'),
          t('selling_points.pattern_based.bullets.3'),
        ]}
        imageLabel="Feedback Modal Screenshot"
        imageGradient="from-red-50 to-green-50"
        imageSrc="/landing/section_2.png"
      />
      
      {/* Selling Point 3: Real-Time */}
      <SellingPoint
        imageSide="left"
        bgColor="bg-gray-50"
        icon="⚡"
        title={t('selling_points.real_time.title')}
        description={t('selling_points.real_time.description')}
        bullets={[
          t('selling_points.real_time.bullets.0'),
          t('selling_points.real_time.bullets.1'),
          t('selling_points.real_time.bullets.2'),
          t('selling_points.real_time.bullets.3'),
        ]}
        imageLabel="Audio Player Screenshot"
        imageGradient="from-blue-50 to-purple-50"
        imageSrc="/landing/section_3.png"
      />
      
      <FinalCTA locale={locale} />
    </div>
  )
}
