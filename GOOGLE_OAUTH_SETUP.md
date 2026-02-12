# Google OAuth Setup Guide

## Error: "Unsupported provider: missing OAuth secret"

This error means Google OAuth is not configured in your Supabase project. Follow these steps to enable it:

## Step 1: Get Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the **Google+ API**:
   - Go to "APIs & Services" > "Library"
   - Search for "Google+ API"
   - Click "Enable"
4. Create OAuth 2.0 credentials:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth client ID"
   - Choose "Web application"
   - **Add authorized redirect URIs** (IMPORTANT: Use Supabase's callback URL, not your local URL):
     ```
     https://<your-supabase-project-ref>.supabase.co/auth/v1/callback
     ```
     - Replace `<your-supabase-project-ref>` with your actual Supabase project reference
     - You can find this in your Supabase URL: `https://<project-ref>.supabase.co`
     - Example: If your Supabase URL is `https://abcdefghijklmnop.supabase.co`, use:
       ```
       https://abcdefghijklmnop.supabase.co/auth/v1/callback
       ```
   - Copy the **Client ID** and **Client Secret**

## Step 2: Configure in Supabase

1. Go to your [Supabase Dashboard](https://app.supabase.com/)
2. Select your project
3. Go to **Authentication** > **Providers**
4. Find **Google** in the list
5. Click to enable it
6. Enter:
   - **Client ID** (from Google Cloud Console)
   - **Client Secret** (from Google Cloud Console)
7. Save the configuration

## Step 3: Update Redirect URLs in Supabase

In Supabase Dashboard > Authentication > URL Configuration, add your app's callback URLs:
- **For local development:**
  - `http://localhost:3000/en/auth/callback`
  - `http://localhost:3000/ja/auth/callback`
  - `http://localhost:3000/auth/callback` (if using non-locale routes)
- **For production:**
  - `https://yourdomain.com/en/auth/callback`
  - `https://yourdomain.com/ja/auth/callback`
  - `https://yourdomain.com/auth/callback` (if using non-locale routes)

**Note:** These are different from the Google Cloud Console redirect URI. 
- **Google Cloud Console** → Use Supabase's callback URL
- **Supabase Dashboard** → Use your app's callback URLs

## Step 4: Test

1. Restart your dev server
2. Try clicking "Continue with Google" on the login/signup page
3. You should be redirected to Google's login page

## Alternative: Disable Google OAuth for Now

If you don't want to set up Google OAuth right now:
- Users can still sign up/login using email/password
- The Google button will show a friendly error message
- You can configure it later when ready

## Troubleshooting: "no_code" Error

If you're redirected to the login page with `error=no_code` after completing Google OAuth, this means the callback URL is not receiving the `code` parameter from Supabase.

### Common Causes

1. **Redirect URL mismatch** - The URL in Supabase Dashboard doesn't match exactly what your app is sending
2. **Missing redirect URL** - The callback URL is not added to Supabase Dashboard
3. **Trailing slash mismatch** - URLs with/without trailing slashes are treated as different
4. **HTTP vs HTTPS** - Using `https://` for localhost or `http://` for production

### How to Fix

#### Step 1: Check Console Logs

When you click "Continue with Google", check your browser console. You should see:
```
🔵 [Google OAuth] Redirect URL: http://localhost:3000/en/auth/callback
🔍 [Google OAuth] IMPORTANT: Verify this redirect URL is in Supabase Dashboard
```

**Copy the exact URL shown in the console.**

#### Step 2: Verify Supabase Dashboard Configuration

1. Go to [Supabase Dashboard](https://app.supabase.com/)
2. Select your project
3. Go to **Authentication** > **URL Configuration**
4. Under **"Redirect URLs"**, check if your callback URL is listed
5. The URL must match **exactly** (case-sensitive, no trailing slashes)

#### Step 3: Add Missing URLs

If the URL is missing, click **"Add URL"** and add:

**For local development:**
- `http://localhost:3000/en/auth/callback`
- `http://localhost:3000/ja/auth/callback`
- `http://localhost:3000/auth/callback` (if using non-locale routes)

**For production:**
- `https://yourdomain.com/en/auth/callback`
- `https://yourdomain.com/ja/auth/callback`
- `https://yourdomain.com/auth/callback` (if using non-locale routes)

#### Step 4: Common Mistakes to Avoid

❌ **Wrong:** `http://localhost:3000/en/auth/callback/` (trailing slash)
✅ **Correct:** `http://localhost:3000/en/auth/callback`

❌ **Wrong:** `localhost:3000/en/auth/callback` (missing http://)
✅ **Correct:** `http://localhost:3000/en/auth/callback`

❌ **Wrong:** `http://localhost:3000/auth/callback` (missing locale, if using locale routes)
✅ **Correct:** `http://localhost:3000/en/auth/callback` (if using locale routes)

❌ **Wrong:** `https://localhost:3000/en/auth/callback` (using https for localhost)
✅ **Correct:** `http://localhost:3000/en/auth/callback` (use http for localhost)

#### Step 5: Verify After Changes

1. **Save** the changes in Supabase Dashboard
2. **Clear browser cache** and localStorage
3. **Try OAuth again** - click "Continue with Google"
4. Check the console logs to see if the code is received

### Server-Side vs Client-Side Callbacks

The app now uses **server-side route handlers** for OAuth callbacks, which are more reliable than client-side callbacks. The route handlers are located at:
- `app/[locale]/auth/callback/route.ts` (for locale routes)
- `app/auth/callback/route.ts` (for non-locale routes)

If you see client-side callback logs, it means the server-side handler didn't catch the request. Check:
1. The route handler files exist
2. Next.js server is running
3. No routing conflicts

### Still Not Working?

If you've verified all the above and still get `no_code`:

1. **Check Supabase Logs:**
   - Go to Supabase Dashboard > Logs
   - Look for authentication errors
   - Check if redirects are being attempted

2. **Verify Google Cloud Console:**
   - Ensure the redirect URI in Google Cloud Console is: `https://<your-project-ref>.supabase.co/auth/v1/callback`
   - This is different from the Supabase Dashboard URLs

3. **Check Network Tab:**
   - Open browser DevTools > Network tab
   - Look for the callback request
   - Check the URL parameters in the request

4. **Test with Different Browser:**
   - Sometimes browser extensions or cached data can interfere
   - Try in incognito/private mode

## Notes

- The error message has been updated to be user-friendly
- Email/password authentication works without OAuth configuration
- OAuth is optional - the app works fine with just email/password
- Server-side route handlers provide more reliable OAuth callback handling
- All OAuth handlers now log detailed debugging information to help diagnose issues

