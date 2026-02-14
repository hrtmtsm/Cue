'use client'

import Link from 'next/link'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'

export default function Hero({ locale }: { locale: string }) {
  const [mounted, setMounted] = useState(false)
  const t = useTranslations('landing.hero')

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <section className="min-h-screen flex items-center pt-8 pb-16 md:pt-12 md:pb-24 px-8 md:px-16 lg:px-24 xl:px-32">
      <div className="max-w-6xl mx-auto w-full">
        <div className="flex flex-col gap-12 md:gap-16 items-center text-center">
          {/* Top: Text Content */}
          <motion.div
            initial={mounted ? { opacity: 0, y: 20 } : { opacity: 1, y: 0 }}
            animate={mounted ? { opacity: 1, y: 0 } : { opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="space-y-6 md:space-y-8 max-w-3xl"
          >
            <h1 className="font-sf-rounded text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-bold text-gray-900 leading-tight">
              {t('headline')}
            </h1>
            <p className="font-sf-rounded text-lg md:text-xl lg:text-2xl font-medium text-gray-700">
              {t('subheadline')}
            </p>
            <p className="font-inter text-base md:text-lg text-gray-600 leading-relaxed">
              {t('description')}
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-4 pt-4 justify-center">
              <Link
                href={`/${locale}/auth`}
                className="px-8 py-4 bg-blue-600 text-white rounded-xl text-lg font-semibold hover:bg-blue-700 transition-colors text-center shadow-lg hover:shadow-xl font-inter"
              >
                {t('cta_primary')}
              </Link>
              <Link
                href={`/${locale}/auth/login`}
                className="px-8 py-4 border-2 border-gray-300 text-gray-700 rounded-xl text-lg font-semibold hover:border-gray-400 hover:bg-gray-50 transition text-center font-inter"
              >
                {t('cta_secondary')}
              </Link>
            </div>
          </motion.div>

          {/* Bottom: Hero Image - Full Width */}
          <motion.div
            initial={mounted ? { opacity: 0, y: 20 } : { opacity: 1, y: 0 }}
            animate={mounted ? { opacity: 1, y: 0 } : { opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="relative w-full max-w-5xl"
          >
            <div className="relative rounded-xl overflow-hidden shadow-md border border-gray-200">
              <Image
                src="/landing/hero.png"
                alt="Cue App Screenshot - Audio Player and Feedback"
                width={1600}
                height={1000}
                className="w-full h-auto"
                priority
              />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
