// Simple store for onboarding state
// Can be replaced with Zustand or Context later if needed

export interface OnboardingData {
  listeningDifficulties: string[]
  preferredGenre?: string
}

let onboardingData: OnboardingData = {
  listeningDifficulties: [],
}

export const getOnboardingData = (): OnboardingData => {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('onboardingData')
    if (stored) {
      onboardingData = JSON.parse(stored)
    }
  }
  return onboardingData
}

export const setOnboardingData = (data: Partial<OnboardingData>) => {
  onboardingData = { ...onboardingData, ...data }
  if (typeof window !== 'undefined') {
    localStorage.setItem('onboardingData', JSON.stringify(onboardingData))
  }
}

export const clearOnboardingData = () => {
  onboardingData = { listeningDifficulties: [] }
  if (typeof window !== 'undefined') {
    localStorage.removeItem('onboardingData')
  }
}

