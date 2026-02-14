import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import LandingPageContent from '@/components/landing/LandingPageContent';

export default async function LocalizedLanding({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  
  // Check if user is authenticated
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )

  const { data: { session } } = await supabase.auth.getSession()
  
  if (session) {
    redirect(`/${locale}/practice/select`)
  }
  
  return <LandingPageContent locale={locale} />;
}

// Generate static params for supported locales
export function generateStaticParams() {
  return [
    { locale: 'en' },
    { locale: 'ja' },
    // Future: Add more locales here
    // { locale: 'es' },
    // { locale: 'fr' },
  ];
}
