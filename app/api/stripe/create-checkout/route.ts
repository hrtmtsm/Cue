import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { getSupabaseAdminClient } from '@/lib/supabase/server'
import {
  stripe,
  createCustomer,
  createCheckoutSession,
} from '@/lib/stripe/server'

/**
 * POST /api/stripe/create-checkout
 * Creates a Stripe Checkout session for subscription
 */
export async function POST(request: NextRequest) {
  try {
    // Get authenticated user from cookies
    const cookieStore = await cookies()
    
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
        },
      }
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const userId = user.id

    const body = await request.json()
    const { priceId, returnTo } = body

    if (!priceId) {
      return NextResponse.json(
        { error: 'priceId is required' },
        { status: 400 }
      )
    }

    const supabaseAdmin = getSupabaseAdminClient()

    // Get user data
    const { data: userData, error: userError } =
      await supabaseAdmin.auth.admin.getUserById(userId)

    if (userError || !userData.user) {
      console.error('[Create Checkout] Failed to get user:', userError)
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    const userData_user = userData.user
    const userEmail = userData_user.email!
    const userName =
      userData_user.user_metadata?.preferred_name ||
      userData_user.user_metadata?.first_name ||
      userData_user.user_metadata?.full_name ||
      undefined

    // Check if customer already exists
    let customerId: string

    const { data: existingSubscription } = await supabaseAdmin
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .single()

    if (existingSubscription?.stripe_customer_id) {
      // Use existing customer
      customerId = existingSubscription.stripe_customer_id
      console.log('[Create Checkout] Using existing customer:', {
        userId: userId.substring(0, 8) + '...',
        customerId,
      })
    } else {
      // Create new customer
      const customer = await createCustomer(userEmail, userId, userName)
      customerId = customer.id
      console.log('[Create Checkout] Created new customer:', {
        userId: userId.substring(0, 8) + '...',
        customerId,
      })
    }

    // Create checkout session
    const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_URL
    
    // Build success URL with optional returnTo parameter
    let successUrl = `${origin}/pro/success?session_id={CHECKOUT_SESSION_ID}`
    if (returnTo) {
      successUrl += `&returnTo=${encodeURIComponent(returnTo)}`
    }
    
    const session = await createCheckoutSession(
      customerId,
      priceId,
      userId,
      successUrl,
      `${origin}/pro`
    )

    console.log('[Create Checkout] Session created:', {
      sessionId: session.id,
      userId: userId.substring(0, 8) + '...',
    })

    return NextResponse.json({
      sessionId: session.id,
      url: session.url,
    })
  } catch (error: any) {
    console.error('[Create Checkout] Error:', error)
    return NextResponse.json(
      {
        error: 'Failed to create checkout session',
        message: error.message,
      },
      { status: 500 }
    )
  }
}
