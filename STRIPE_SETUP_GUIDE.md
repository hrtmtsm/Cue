# Stripe Pro Subscription Setup Guide

This guide will walk you through setting up Stripe for the Pro subscription feature.

## Prerequisites

- Stripe account (https://stripe.com)
- Supabase project with migrations applied
- Next.js app deployed or running locally

## Step 1: Install Dependencies

Already included in the implementation. Verify with:

```bash
npm list stripe @stripe/stripe-js
```

If missing, install:

```bash
npm install stripe @stripe/stripe-js
```

## Step 2: Create Stripe Product and Price

1. Go to [Stripe Dashboard](https://dashboard.stripe.com)
2. Navigate to **Products** → **Add Product**
3. Create product:
   - **Name:** Cue Pro
   - **Description:** Unlimited sessions and full listening tips access
   - **Pricing Model:** Recurring
   - **Price:** ¥980
   - **Billing Period:** Monthly
   - **Currency:** JPY (Japanese Yen)
4. Save and copy the **Price ID** (starts with `price_`)

## Step 3: Get Stripe API Keys

1. Go to **Developers** → **API Keys** in Stripe Dashboard
2. Copy the following keys:
   - **Publishable key** (starts with `pk_test_` for test mode)
   - **Secret key** (starts with `sk_test_` for test mode)

## Step 4: Configure Environment Variables

Add these to your `.env.local` file:

```env
# Stripe Keys
STRIPE_SECRET_KEY=sk_test_your_secret_key_here
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your_publishable_key_here
NEXT_PUBLIC_STRIPE_PRICE_ID=price_your_price_id_here

# Application URL (for Stripe redirects)
NEXT_PUBLIC_URL=http://localhost:3000  # or your production URL
```

## Step 5: Set Up Stripe Webhook

### For Local Development

1. Install Stripe CLI:
   ```bash
   brew install stripe/stripe-cli/stripe
   ```

2. Login to Stripe CLI:
   ```bash
   stripe login
   ```

3. Forward webhooks to your local app:
   ```bash
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```

4. Copy the webhook signing secret (starts with `whsec_`) and add to `.env.local`:
   ```env
   STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
   ```

### For Production

1. Go to **Developers** → **Webhooks** in Stripe Dashboard
2. Click **Add Endpoint**
3. Enter your production webhook URL:
   ```
   https://yourdomain.com/api/stripe/webhook
   ```
4. Select events to listen for:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
5. Copy the **Signing secret** and add to production environment variables

## Step 6: Run Supabase Migration

Apply the subscriptions table migration:

```bash
# If using Supabase CLI
supabase migration up

# Or run the SQL directly in Supabase Studio:
# Go to SQL Editor and run the contents of:
# supabase/migrations/019_create_subscriptions.sql
```

Verify the `subscriptions` table was created in your Supabase database.

## Step 7: Test the Integration

### Test Checkout Flow

1. Start your development server:
   ```bash
   npm run dev
   ```

2. In a separate terminal, start Stripe webhook forwarding:
   ```bash
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```

3. Navigate to `/pro` in your app
4. Click "Upgrade Now"
5. Use Stripe test card:
   - **Card Number:** 4242 4242 4242 4242
   - **Expiry:** Any future date
   - **CVC:** Any 3 digits
   - **ZIP:** Any 5 digits

### Verify Subscription

1. Check Stripe Dashboard → **Payments** to see the test payment
2. Check your Supabase `subscriptions` table for the new record
3. Verify the user now has Pro access in your app

## Step 8: Switch to Production

When ready to go live:

1. **Activate Stripe Account:**
   - Complete Stripe onboarding
   - Provide business details
   - Add bank account for payouts

2. **Create Production Product:**
   - Create the same product/price in **Production Mode**
   - Get the production Price ID

3. **Update Environment Variables:**
   - Replace test keys with live keys (pk_live_, sk_live_)
   - Update STRIPE_PRICE_ID with production price ID
   - Update STRIPE_WEBHOOK_SECRET with production webhook secret

4. **Set Up Production Webhook:**
   - Add production webhook endpoint in Stripe Dashboard
   - Use the same events as development

## Troubleshooting

### Webhook Not Receiving Events

- Check Stripe CLI is running: `stripe listen ...`
- Verify webhook secret matches in `.env.local`
- Check server logs for webhook errors
- Verify endpoint is accessible (not blocked by firewall)

### Subscription Not Created

- Check Stripe Dashboard → **Events** for webhook delivery status
- Check server logs at `/api/stripe/webhook`
- Verify Supabase RLS policies allow service role to insert
- Check `subscriptions` table for errors

### User Not Showing as Pro

- Verify subscription status is `active` in database
- Check `current_period_end` is in the future
- Clear browser cache/cookies
- Check `/api/subscription/status` endpoint response

## API Endpoints

- `POST /api/stripe/create-checkout` - Create checkout session
- `POST /api/stripe/webhook` - Handle Stripe webhook events
- `GET /api/subscription/status` - Get user's subscription status

## Database Schema

The `subscriptions` table stores:
- `user_id` - Foreign key to Supabase auth.users
- `stripe_customer_id` - Stripe customer ID
- `stripe_subscription_id` - Stripe subscription ID
- `status` - Subscription status (active, canceled, etc.)
- `current_period_start` - Billing period start
- `current_period_end` - Billing period end
- `cancel_at_period_end` - Whether subscription will cancel

## Security Notes

- Never expose `STRIPE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY` in client code
- Always verify webhook signatures before processing
- Use HTTPS in production for all endpoints
- Implement rate limiting on API endpoints
- Log all payment events for audit trail

## Support

For Stripe-specific issues:
- Stripe Documentation: https://stripe.com/docs
- Stripe Support: https://support.stripe.com

For implementation issues:
- Check server logs
- Review Supabase database logs
- Test with Stripe CLI in test mode
