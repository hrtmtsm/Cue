# OAuth Debugging Guide

## Issue: Redirected back to login page after Google OAuth

If clicking "Continue with Google" redirects you back to the login page, check the following:

## Step 1: Check Browser Console

Open browser DevTools (F12) and check the Console tab. Look for:
- `🔵 [Google OAuth] Starting OAuth flow:` - Should show the redirect URL
- `🔍 [Auth Callback] URL params:` - Should show if code parameter exists
- Any error messages starting with `❌`

## Step 2: Check the URL After Google Login

After clicking "Continue with Google" and logging in with Google, check the URL you're redirected to:

**Expected URL format:**
```
http://localhost:3000/en/auth/callback?code=...&...
```

**If you see:**
- `?error=...` - There was an OAuth error
- No `code` parameter - The redirect URL doesn't match

## Step 3: Verify Supabase Redirect URL Configuration

In Supabase Dashboard > Authentication > URL Configuration:

**For local development, add:**
- `http://localhost:3000/en/auth/callback`
- `http://localhost:3000/ja/auth/callback`
- `http://localhost:3000/auth/callback` (if using non-locale routes)

**Important:** The URL must match EXACTLY what's in the code:
- Check the code: `${window.location.origin}/${locale}/auth/callback`
- For `en` locale: `http://localhost:3000/en/auth/callback`
- For `ja` locale: `http://localhost:3000/ja/auth/callback`

## Step 4: Verify Google Cloud Console Redirect URI

In Google Cloud Console > Credentials > OAuth 2.0 Client:

**Use Supabase's callback URL:**
```
https://<your-supabase-project-ref>.supabase.co/auth/v1/callback
```

**NOT your local app URL!**

## Common Issues

### Issue 1: No code parameter in callback
**Symptom:** Callback page redirects to login immediately
**Cause:** Redirect URL in Supabase doesn't match
**Fix:** Add the exact callback URL to Supabase Dashboard

### Issue 2: "Invalid redirect URL"
**Symptom:** Error message about redirect URL
**Cause:** URL not whitelisted in Supabase
**Fix:** Add URL to Supabase Dashboard > Authentication > URL Configuration

### Issue 3: Code exchange fails
**Symptom:** Code exists but exchange fails
**Cause:** Supabase client not configured correctly
**Fix:** Check `.env.local` has correct `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Debug Checklist

1. ✅ Check browser console for error messages
2. ✅ Verify the callback URL in the address bar after Google login
3. ✅ Check Supabase Dashboard > Authentication > URL Configuration
4. ✅ Verify Google Cloud Console redirect URI is Supabase's callback
5. ✅ Check `.env.local` has Supabase credentials
6. ✅ Try email/password login to verify Supabase is working

## Quick Test

1. Open browser DevTools (F12) > Console tab
2. Click "Continue with Google"
3. Complete Google login
4. Check the URL you're redirected to
5. Look for console logs starting with `🔍 [Auth Callback]`
6. Share the console output and URL to debug further


