'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { ArrowLeft, Check } from 'lucide-react'
import { getOnboardingData, setOnboardingData, type SituationKey } from '@/lib/onboardingStore'
import { SITUATION_OPTIONS, MAX_SITUATION_SELECTIONS, DEFAULT_SITUATION } from '@/lib/situations'
import { Heading, Body, Label, Caption } from '@/components/ui/Typography'

const MAX_SELECTIONS = MAX_SITUATION_SELECTIONS

export default function SituationsPage() {
  const [selectedSituations, setSelectedSituations] = useState<Set<SituationKey>>(new Set())
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations()
  const tCommon = useTranslations('common')
  const tOnboarding = useTranslations('onboarding')
  const tSituations = useTranslations('onboarding.situations')

  useEffect(() => {
    // Load existing selections if any
    const data = getOnboardingData()
    if (data.situations && data.situations.length > 0) {
      setSelectedSituations(new Set(data.situations))
    }
  }, [])

  const toggleSituation = (situationKey: SituationKey) => {
    const newSelected = new Set(selectedSituations)
    if (newSelected.has(situationKey)) {
      newSelected.delete(situationKey)
    } else {
      // Enforce max 3 selections
      if (newSelected.size < MAX_SELECTIONS) {
        newSelected.add(situationKey)
      }
    }
    setSelectedSituations(newSelected)
  }

  const handleContinue = () => {
    // Save selected situations as ordered array
    setOnboardingData({
      situations: Array.from(selectedSituations) as SituationKey[],
    })
    // Navigate to practice select (will show ready modal)
    router.push(`/${locale}/practice/select`)
  }

  const handleSkip = () => {
    // "Not now" - save with default general situation
    setOnboardingData({
      situations: [DEFAULT_SITUATION],
    })
    // Navigate to practice select
    router.push(`/${locale}/practice/select`)
  }

  const canSelectMore = selectedSituations.size < MAX_SELECTIONS
  const hasSelection = selectedSituations.size > 0

  // Map situation keys to translation keys
  const getSituationTranslation = (key: SituationKey) => {
    const mapping: Record<SituationKey, { label: string; desc: string }> = {
      'work_meetings': { label: 'work', desc: 'workDesc' },
      'daily': { label: 'daily', desc: 'dailyDesc' },
      'travel': { label: 'travel', desc: 'travelDesc' },
      'videos_shows': { label: 'media', desc: 'mediaDesc' },
      'interviews_presentations': { label: 'formal', desc: 'formalDesc' },
      'general': { label: 'general', desc: 'generalDesc' },
    }
    return mapping[key] || { label: 'general', desc: 'generalDesc' }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-12 bg-gray-50">
      <div className="max-w-md md:max-w-2xl w-full space-y-6">
        {/* Header */}
        <div>
          <Link 
            href={`/${locale}/onboarding/name`}
            className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <Label size="action" tone="sub" className="text-blue-600 hover:text-blue-700">
              {tCommon('back')}
            </Label>
          </Link>
        </div>

        {/* Title Section */}
        <div className="space-y-2">
          <Heading as="h1" size="page" className="text-gray-900">
            {tSituations('title')}
          </Heading>
          <Caption tone="muted" className="text-base">
            {tSituations('subtitle').replace('3', MAX_SELECTIONS.toString())}
          </Caption>
        </div>

        {/* Options List */}
        <div className="space-y-3">
          {SITUATION_OPTIONS.map((situation) => {
            const isSelected = selectedSituations.has(situation.key)
            const isDisabled = !isSelected && !canSelectMore
            const translation = getSituationTranslation(situation.key)
            return (
              <button
                key={situation.key}
                onClick={() => toggleSituation(situation.key)}
                disabled={isDisabled}
                className={`w-full p-5 rounded-xl border-2 transition-all text-left ${
                  isSelected
                    ? 'border-blue-600 bg-blue-50/50'
                    : isDisabled
                    ? 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed'
                    : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                }`}
              >
                <div className="flex items-start gap-4">
                  <span className="text-2xl flex-shrink-0 mt-0.5">{situation.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <Body size="bodyStrong" className="text-gray-900 mb-1">
                      {tSituations(translation.label)}
                    </Body>
                    <Caption tone="muted" className="text-sm leading-relaxed">
                      {tSituations(translation.desc)}
                    </Caption>
                  </div>
                  {isSelected && (
                    <Check className="w-5 h-5 text-blue-600 flex-shrink-0 mt-1" />
                  )}
                </div>
              </button>
            )
          })}
        </div>

        {/* Bottom Actions */}
        <div className="space-y-3 pt-2">
          <button
            onClick={handleContinue}
            disabled={!hasSelection}
            className={`w-full bg-blue-600 text-white text-center font-semibold h-12 flex items-center justify-center px-6 rounded-xl transition-all text-base ${
              hasSelection
                ? 'hover:bg-blue-700 active:bg-blue-700 shadow-md hover:shadow-lg'
                : 'opacity-50 cursor-not-allowed'
            }`}
          >
            {tCommon('continue')}
          </button>
          <button
            onClick={handleSkip}
            className="w-full text-center py-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <Label size="action" tone="sub">
              {tOnboarding('notNow')}
            </Label>
          </button>
        </div>
      </div>
    </main>
  )
}

