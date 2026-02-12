import { NextRequest, NextResponse } from 'next/server'
import { createPortalSession } from '@/lib/stripe/server'
import { getSupabaseAdminClient } from '@/lib/supabase/server'
import { resolveUserId } from '@/lib/supabase/resolveUserId'

export async function POST(request: NextRequest) {
  try {
    // Resolve userId (authenticated user or dev guest)
    let userIdResolved: { userId: string; source: 'auth' | 'dev_guest' }
    try {
      userIdResolved = await resolveUserId(request)
    } catch (error: any) {
      return NextResponse.json(
        { error: 'Unauthorized', message: error.message },
        { status: 401 }
      )
    }

    const userId = userIdResolved.userId

    // Get user's Stripe customer ID from database
    const supabaseAdmin = getSupabaseAdminClient()
    const { data: subscription, error: subscriptionError } = await supabaseAdmin
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .single()

    if (subscriptionError || !subscription?.stripe_customer_id) {
      return NextResponse.json(
        { error: 'No subscription found' },
        { status: 404 }
      )
    }

    // Get return URL from request body
    const body = await request.json()
    const returnUrl = body.returnUrl || `${request.nextUrl.origin}/profile`

    // Create Stripe billing portal session
    const portalSession = await createPortalSession(
      subscription.stripe_customer_id,
      returnUrl
    )

    return NextResponse.json({
      url: portalSession.url,
    })
  } catch (error) {
    console.error('Error creating portal session:', error)
    return NextResponse.json(
      { error: 'Failed to create billing portal session' },
      { status: 500 }
    )
  }
}
