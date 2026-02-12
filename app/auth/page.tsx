import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getPreferredLocale } from '@/lib/utils/locale';

/**
 * Non-locale auth entry point
 * Redirects to locale-aware auth page
 */
export default async function NonLocaleAuth() {
  const headersList = await headers();
  const acceptLanguage = headersList.get('accept-language');
  const locale = getPreferredLocale(acceptLanguage);
  
  redirect(`/${locale}/auth`);
}
