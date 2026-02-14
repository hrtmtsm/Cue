'use client'

import { motion, useInView } from 'framer-motion'
import { useRef, useState, useEffect } from 'react'
import Image from 'next/image'

interface SellingPointProps {
  icon: string
  title: string
  description: string
  bullets: string[]
  imageSide: 'left' | 'right'
  bgColor: string
  imageLabel: string
  imageGradient: string
  imageSrc?: string
}

export default function SellingPoint({
  icon,
  title,
  description,
  bullets,
  imageSide,
  bgColor,
  imageLabel,
  imageGradient,
  imageSrc,
}: SellingPointProps) {
  const ref = useRef(null)
  const [mounted, setMounted] = useState(false)
  const isInView = useInView(ref, { once: true, margin: '-100px' })

  useEffect(() => {
    setMounted(true)
  }, [])

  const textContent = (
    <div className="space-y-4 md:space-y-6">
      <div className="text-4xl mb-2">{icon}</div>
      <h2 className="font-sf-rounded text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 leading-tight">
        {title}
      </h2>
      <p className="font-inter text-base md:text-lg text-gray-700 leading-relaxed">{description}</p>
      <ul className="font-inter space-y-3 md:space-y-4 text-base md:text-lg text-gray-700">
        {bullets.map((bullet, index) => (
          <li key={index} className="flex items-start">
            <span className="text-blue-600 mr-2">•</span>
            <span>{bullet}</span>
          </li>
        ))}
      </ul>
    </div>
  )

  const imageContent = (
    <div className="relative">
      {imageSrc ? (
        <div className="relative rounded-xl overflow-hidden shadow-md border border-gray-200">
          <Image
            src={imageSrc}
            alt={imageLabel}
            width={1600}
            height={1000}
            className="w-full h-auto"
            priority
          />
        </div>
      ) : (
        <div
          className={`bg-gradient-to-br ${imageGradient} rounded-2xl p-16 md:p-20 aspect-video flex flex-col items-center justify-center border-2 border-dashed border-gray-300`}
        >
          <span className="text-6xl mb-4">{icon}</span>
          <span className="text-gray-500 font-medium text-center">
            {imageLabel}
          </span>
        </div>
      )}
    </div>
  )

  return (
    <section className={`${bgColor} py-20 md:py-32 px-8 md:px-16 lg:px-24 xl:px-32`}>
      <div className="max-w-6xl mx-auto">
        <motion.div
          ref={ref}
          initial={mounted ? { opacity: 0, x: imageSide === 'left' ? -50 : 50 } : { opacity: 1, x: 0 }}
          animate={mounted && isInView ? { opacity: 1, x: 0 } : { opacity: 1, x: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="grid grid-cols-1 lg:grid-cols-2 gap-12 md:gap-16 lg:gap-20 items-center"
        >
          {imageSide === 'left' ? (
            <>
              <div className="order-2 lg:order-1">{imageContent}</div>
              <div className="order-1 lg:order-2">{textContent}</div>
            </>
          ) : (
            <>
              <div className="order-1">{textContent}</div>
              <div className="order-2">{imageContent}</div>
            </>
          )}
        </motion.div>
      </div>
    </section>
  )
}
