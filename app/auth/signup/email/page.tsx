import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getPreferredLocale } from '@/lib/utils/locale';

/**
 * Non-locale email signup entry point
 * Redirects to locale-aware signup page
 */
export default async function NonLocaleSignupEmail() {
  const headersList = await headers();
  const acceptLanguage = headersList.get('accept-language');
  const locale = getPreferredLocale(acceptLanguage);
  
  redirect(`/${locale}/auth/signup/email`);
}
