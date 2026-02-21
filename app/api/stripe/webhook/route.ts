import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe/server'
import { getSupabaseAdminClient } from '@/lib/supabase/server'
import Stripe from 'stripe'

/**
 * POST /api/stripe/webhook
 * Handles Stripe webhook events
 */
export async function POST(request: NextRequest) {
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    console.error('[Stripe Webhook] Missing signature')
    return NextResponse.json(
      { error: 'Missing stripe-signature header' },
      { status: 400 }
    )
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err: any) {
    console.error('[Stripe Webhook] Signature verification failed:', err.message)
    return NextResponse.json(
      { error: `Webhook Error: ${err.message}` },
      { status: 400 }
    )
  }

  console.log('[Stripe Webhook] Received event:', {
    type: event.type,
    id: event.id,
  })

  const supabase = getSupabaseAdminClient()

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const userId = session.metadata?.userId
        const customerId = session.customer as string
        const subscriptionId = session.subscription as string

        if (!userId) {
          console.error('[Stripe Webhook] Missing userId in metadata')
          break
        }

        console.log('[Stripe Webhook] Checkout completed:', {
          userId: userId.substring(0, 8) + '...',
          customerId,
          subscriptionId,
        })

        // Retrieve the subscription details
        const subscription = await stripe.subscriptions.retrieve(subscriptionId)

        const subscriptionData = {
          user_id: userId,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscription.id,
          stripe_price_id: subscription.items.data[0].price.id,
          status: subscription.status,
          current_period_start: new Date(
            subscription.current_period_start * 1000
          ).toISOString(),
          current_period_end: new Date(
            subscription.current_period_end * 1000
          ).toISOString(),
          cancel_at_period_end: subscription.cancel_at_period_end,
        }

        console.log('[Stripe Webhook] Checkout subscription data:', {
          userId: userId.substring(0, 8) + '...',
          subscriptionId: subscription.id,
          status: subscription.status,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
        })

        // First: check if user already has a subscription record (any subscription ID)
        const { data: existingByUser } = await supabase
          .from('subscriptions')
          .select('id, stripe_subscription_id')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        let result
        if (existingByUser) {
          // User has an existing record — update it with the new subscription data
          // This handles re-subscriptions correctly
          console.log('[Stripe Webhook] Updating existing record for user:', {
            oldSubId: existingByUser.stripe_subscription_id,
            newSubId: subscription.id,
          })
          result = await supabase
            .from('subscriptions')
            .update(subscriptionData)
            .eq('id', existingByUser.id)
            .select()
        } else {
          // No existing record — insert a new one
          console.log('[Stripe Webhook] Inserting new subscription record')
          result = await supabase
            .from('subscriptions')
            .insert(subscriptionData)
            .select()
        }

        if (result.error) {
          console.error('[Stripe Webhook] Failed to upsert subscription:', {
            error: result.error.message,
            code: result.error.code,
            userId: userId.substring(0, 8) + '...',
            subscriptionId: subscription.id,
          })
        } else {
          console.log('[Stripe Webhook] Subscription created/updated:', {
            userId: userId.substring(0, 8) + '...',
            subscriptionId: subscription.id,
            status: subscription.status,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
            periodEnd: new Date(subscription.current_period_end * 1000).toISOString(),
          })
        }
        break
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId = subscription.customer as string

        console.log('[Stripe Webhook] Subscription updated:', {
          subscriptionId: subscription.id,
          status: subscription.status,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          customerId: customerId,
          currentPeriodStart: subscription.current_period_start,
          currentPeriodEnd: subscription.current_period_end,
        })

        // Validate and prepare update data
        const updateData: any = {
          status: subscription.status,
          cancel_at_period_end: subscription.cancel_at_period_end,
        }

        // Only update period dates if they are valid
        if (subscription.current_period_start && !isNaN(subscription.current_period_start)) {
          updateData.current_period_start = new Date(
            subscription.current_period_start * 1000
          ).toISOString()
        }

        if (subscription.current_period_end && !isNaN(subscription.current_period_end)) {
          updateData.current_period_end = new Date(
            subscription.current_period_end * 1000
          ).toISOString()
        }

        console.log('[Stripe Webhook] Update data prepared:', updateData)

        // Update subscription record
        const { data, error } = await supabase
          .from('subscriptions')
          .update(updateData)
          .eq('stripe_subscription_id', subscription.id)
          .select()

        if (error) {
          console.error('[Stripe Webhook] Failed to update subscription:', {
            error: error.message,
            code: error.code,
            details: error.details,
            subscriptionId: subscription.id,
          })
        } else {
        console.log('[Stripe Webhook] Subscription updated in DB:', {
          rowsAffected: data?.length || 0,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          subscriptionId: subscription.id,
          userId: data?.[0]?.user_id?.substring(0, 8) + '...' || 'unknown',
        })
        
        // If no rows were updated, try to find by customer ID and update
        if (!data || data.length === 0) {
          console.warn('[Stripe Webhook] No subscription found by subscription_id, trying customer_id...')
          const { data: customerSubs } = await supabase
            .from('subscriptions')
            .select('id, user_id')
            .eq('stripe_customer_id', customerId)
            .limit(1)
          
          if (customerSubs && customerSubs.length > 0) {
            const { error: updateByCustomerError } = await supabase
              .from('subscriptions')
              .update(updateData)
              .eq('stripe_customer_id', customerId)
            
            if (updateByCustomerError) {
              console.error('[Stripe Webhook] Failed to update by customer_id:', updateByCustomerError)
            } else {
              console.log('[Stripe Webhook] Updated subscription by customer_id')
            }
          }
        }
        }
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription

        console.log('[Stripe Webhook] Subscription deleted:', {
          subscriptionId: subscription.id,
        })

        // Update subscription status to canceled
        const { error } = await supabase
          .from('subscriptions')
          .update({
            status: 'canceled',
            cancel_at_period_end: false,
          })
          .eq('stripe_subscription_id', subscription.id)

        if (error) {
          console.error('[Stripe Webhook] Failed to update subscription:', error)
        } else {
          console.log('[Stripe Webhook] Subscription marked as canceled')
        }
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const subscriptionId = invoice.subscription as string

        console.log('[Stripe Webhook] Payment failed:', {
          subscriptionId,
          invoiceId: invoice.id,
        })

        // Update subscription status
        const { error } = await supabase
          .from('subscriptions')
          .update({
            status: 'past_due',
          })
          .eq('stripe_subscription_id', subscriptionId)

        if (error) {
          console.error('[Stripe Webhook] Failed to update subscription:', error)
        }
        break
      }

      default:
        console.log('[Stripe Webhook] Unhandled event type:', event.type)
    }

    return NextResponse.json({ received: true })
  } catch (error: any) {
    console.error('[Stripe Webhook] Error processing event:', error)
    return NextResponse.json(
      {
        error: 'Webhook handler failed',
        message: error.message,
      },
      { status: 500 }
    )
  }
}
