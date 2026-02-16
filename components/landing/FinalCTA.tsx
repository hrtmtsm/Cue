'use client'

import Link from 'next/link'
import { motion, useInView } from 'framer-motion'
import { useRef, useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { trackEvent } from '@/lib/posthog/usePostHog'

export default function FinalCTA({ locale }: { locale: string }) {
  const ref = useRef(null)
  const [mounted, setMounted] = useState(false)
  const isInView = useInView(ref, { once: true, margin: '-100px' })
  const t = useTranslations('landing.final_cta')

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <section className="bg-gradient-to-b from-blue-50 to-white py-20 md:py-32 px-8 md:px-16 lg:px-24 xl:px-32">
      <div className="max-w-4xl mx-auto text-center">
        <motion.div
          ref={ref}
          initial={mounted ? { opacity: 0, y: 20 } : { opacity: 1, y: 0 }}
          animate={mounted && isInView ? { opacity: 1, y: 0 } : { opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="space-y-6 md:space-y-8"
        >
          <h2 className="font-sf-rounded text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight">
            {t('title')}
          </h2>
          <p className="font-inter text-xl md:text-2xl text-gray-600 leading-relaxed">
            {t('subtitle')}
          </p>

          <div className="flex flex-col sm:flex-row gap-4 md:gap-6 justify-center items-center pt-4">
            <Link
              href={`/${locale}/auth`}
              onClick={() => trackEvent('cta_clicked', { location: 'footer', type: 'signup' })}
              className="w-full sm:w-auto px-10 py-5 bg-blue-600 text-white rounded-xl text-xl font-semibold hover:bg-blue-700 transition-colors shadow-lg hover:shadow-xl font-inter text-center"
            >
              {t('button')}
            </Link>
            <Link
              href={`/${locale}/auth/login`}
              onClick={() => trackEvent('cta_clicked', { location: 'footer', type: 'login' })}
              className="w-full sm:w-auto px-10 py-5 border-2 border-gray-300 text-gray-700 rounded-xl text-xl font-semibold hover:border-gray-400 hover:bg-gray-50 transition font-inter text-center"
            >
              {t('alreadyHaveAccount')}
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
