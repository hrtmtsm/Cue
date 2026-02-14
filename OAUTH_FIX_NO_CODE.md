# Fix: OAuth Redirects to Login with "no_code" Error

## Problem
After clicking "Continue with Google" and completing Google login, you're redirected to:
```
http://localhost:3000/en/auth/login?error=no_code
```

This means the callback page is not receiving the `code` parameter from Supabase.

## Root Cause
**The redirect URL is not configured in Supabase Dashboard.**

When OAuth completes:
1. Google → Supabase (with code)
2. Supabase → Your app (should include code)
3. **If your app's URL isn't in Supabase's allowed list, Supabase won't redirect there**

## Solution: Configure Redirect URLs in Supabase

### Step 1: Go to Supabase Dashboard
1. Open [Supabase Dashboard](https://app.supabase.com/)
2. Select your project
3. Go to **Authentication** → **URL Configuration**

### Step 2: Add Redirect URLs
Under **"Redirect URLs"** section, click **"Add URL"** and add these **exactly**:

```
http://localhost:3000/en/auth/callback
http://localhost:3000/ja/auth/callback
http://localhost:3000/auth/callback
```

**Important:**
- Use `http://` (not `https://`) for localhost
- Include the full path: `/en/auth/callback`
- No trailing slashes
- Case-sensitive

### Step 3: Save
Click **"Save"** at the bottom of the page.

### Step 4: Test Again
1. Clear browser cache/localStorage
2. Click "Continue with Google"
3. Complete Google login
4. Should now redirect to callback with code

## Why This Happens

The OAuth flow works like this:

```
User clicks "Continue with Google"
  ↓
App redirects to Google OAuth
  ↓
User logs in with Google
  ↓
Google redirects to: https://<supabase-project>.supabase.co/auth/v1/callback?code=...
  ↓
Supabase processes the code
  ↓
Supabase redirects to: http://localhost:3000/en/auth/callback?code=...
  ↑
  └── This step fails if URL not in Supabase's allowed list
```

If the URL `http://localhost:3000/en/auth/callback` is not in Supabase's allowed list, Supabase will either:
- Not redirect at all
- Redirect to a default URL (which might be your login page)
- Show an error

## Verification

After adding the URLs, you can verify:

1. **Check the console log** when clicking "Continue with Google":
   - Should see: `✅ [Google OAuth] Expected callback URL: http://localhost:3000/en/auth/callback`
   - This should match what's in Supabase Dashboard

2. **After Google login, check the URL**:
   - Should be: `http://localhost:3000/en/auth/callback?code=abc123...`
   - If you see `?error=no_code`, the URL still doesn't match

## Common Mistakes

❌ **Wrong:** `http://localhost:3000/en/auth/callback/` (trailing slash)
✅ **Correct:** `http://localhost:3000/en/auth/callback`

❌ **Wrong:** `localhost:3000/en/auth/callback` (missing http://)
✅ **Correct:** `http://localhost:3000/en/auth/callback`

❌ **Wrong:** `http://localhost:3000/auth/callback` (missing locale)
✅ **Correct:** `http://localhost:3000/en/auth/callback` (if using locale routes)

## Still Not Working?

If you've added the URLs correctly but still getting `no_code`:

1. **Check browser console** for the exact redirect URL being used
2. **Verify in Supabase Dashboard** that the URL matches exactly (copy-paste to be sure)
3. **Try clearing browser cache** and localStorage
4. **Check if there are multiple Supabase projects** - make sure you're configuring the right one


