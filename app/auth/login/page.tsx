import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getPreferredLocale } from '@/lib/utils/locale';

/**
 * Non-locale login entry point
 * Redirects to locale-aware login page
 */
export default async function NonLocaleLogin() {
  const headersList = await headers();
  const acceptLanguage = headersList.get('accept-language');
  const locale = getPreferredLocale(acceptLanguage);
  
  redirect(`/${locale}/auth/login`);
}
