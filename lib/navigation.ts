import { useLocale } from 'next-intl'
import { useRouter as useNextRouter } from 'next/navigation'

export const useLocalizedRouter = () => {
  const locale = useLocale()
  const router = useNextRouter()

  return {
    push: (path: string) => router.push(`/${locale}${path}`),
    replace: (path: string) => router.replace(`/${locale}${path}`),
    back: () => router.back(),
    forward: () => router.forward(),
    refresh: () => router.refresh(),
  }
}


