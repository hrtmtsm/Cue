import { redirect } from 'next/navigation';
import { headers } from 'next/headers';

const SUPPORTED_LOCALES = ['en', 'ja'] as const;
const DEFAULT_LOCALE = 'ja'; // Match i18n.ts default

export default async function RootPage() {
  console.log('🚨🚨🚨 ROOT PAGE HIT - SHOULD NOT HAPPEN AFTER OAUTH 🚨🚨🚨');
  console.log('   → This page should only be hit when user visits "/"');
  console.log('   → If seen after OAuth, there is a routing issue');
  
  const headersList = await headers();
  const acceptLanguage = headersList.get('accept-language');
  
  // Detect best matching locale from browser
  let locale = DEFAULT_LOCALE;
  if (acceptLanguage) {
    // Check for English
    if (acceptLanguage.includes('en')) {
      locale = 'en';
    }
    // Check for Japanese (ja)
    if (acceptLanguage.includes('ja')) {
      locale = 'ja';
    }
  }
  
  redirect(`/${locale}`);
}
