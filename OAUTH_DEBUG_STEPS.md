# OAuth Debugging Steps

## Problem
Clicking "Continue with Google" redirects back to login page instead of completing authentication.

## Enhanced Logging Added

I've added detailed console logging to help debug. Check your browser console (F12) for:

### When Clicking "Continue with Google":
- `🔵 [Google OAuth] Starting OAuth flow:` - Shows the redirect URL being used
- `✅ [Google OAuth] Redirecting to Google:` - Shows Google's OAuth URL
- `✅ [Google OAuth] Expected callback URL:` - Shows where Google should redirect back

### When Landing on Callback Page:
- `🔍 [Auth Callback] ===== CALLBACK PAGE LOADED =====`
- `🔍 [Auth Callback] Full URL:` - The complete callback URL
- `🔍 [Auth Callback] URL params:` - All parameters in the URL
- `🔍 [Auth Callback] Locale:` - The locale being used

### If Code Exchange Fails:
- `❌ [Auth Callback] ===== CODE EXCHANGE FAILED =====`
- Error details with message and status

### If No Code Parameter:
- `⚠️ [Auth Callback] ===== NO CODE PARAMETER =====`
- Lists possible causes

## Step-by-Step Debugging

### Step 1: Check Browser Console
1. Open DevTools (F12) → Console tab
2. Click "Continue with Google"
3. Complete Google login
4. Check what logs appear

**Look for:**
- Does `🔵 [Google OAuth]` appear? (OAuth started)
- Does `✅ [Google OAuth] Redirecting to Google` appear? (Redirect happening)
- What URL does it show for "Expected callback URL"?
- After Google login, does `🔍 [Auth Callback]` appear?
- Does it show a `code` parameter or is it missing?

### Step 2: Check the Callback URL
After Google login, check the URL in your address bar:

**Expected format:**
```
http://localhost:3000/en/auth/callback?code=abc123...
```

**If you see:**
- `?error=...` - OAuth error occurred
- `?error_description=...` - More details about the error
- No parameters at all - Redirect URL mismatch

### Step 3: Verify Supabase Redirect URL Configuration

**Critical:** The callback URL in Supabase must match EXACTLY.

1. Go to Supabase Dashboard
2. Authentication → URL Configuration
3. Under "Redirect URLs", check if these are listed:
   - `http://localhost:3000/en/auth/callback`
   - `http://localhost:3000/ja/auth/callback`
   - `http://localhost:3000/auth/callback` (if using non-locale routes)

4. **If not listed, add them:**
   - Click "Add URL"
   - Enter: `http://localhost:3000/en/auth/callback`
   - Click "Add URL" again
   - Enter: `http://localhost:3000/ja/auth/callback`
   - Save

**Important:** 
- URLs are case-sensitive
- Must include `http://` (not `https://` for localhost)
- Must include the full path including `/auth/callback`
- No trailing slashes

### Step 4: Verify Google Cloud Console Redirect URI

In Google Cloud Console → Credentials → OAuth 2.0 Client:

**Should have:**
```
https://<your-supabase-project-ref>.supabase.co/auth/v1/callback
```

**NOT:**
```
http://localhost:3000/...
```

Google redirects to Supabase first, then Supabase redirects to your app.

### Step 5: Check Common Issues

#### Issue 1: "No code parameter"
**Symptom:** Console shows `⚠️ [Auth Callback] ===== NO CODE PARAMETER =====`

**Causes:**
- Redirect URL in Supabase doesn't match
- OAuth was cancelled
- Error during OAuth flow

**Fix:**
- Verify redirect URLs in Supabase Dashboard (Step 3)
- Check if URL in console matches exactly

#### Issue 2: "Code exchange failed"
**Symptom:** Console shows `❌ [Auth Callback] ===== CODE EXCHANGE FAILED =====`

**Causes:**
- Code already used (expired)
- Supabase client not configured correctly
- Network error

**Fix:**
- Check `.env.local` has correct Supabase keys
- Try again (codes are single-use)

#### Issue 3: Redirect URL mismatch
**Symptom:** Redirects to login immediately

**Check:**
- Console log shows "Expected callback URL"
- Compare with Supabase Dashboard redirect URLs
- Must match EXACTLY (including locale)

## Quick Test

1. **Clear browser cache and localStorage**
2. **Open DevTools Console**
3. **Click "Continue with Google"**
4. **Watch console logs:**
   - Should see: `🔵 [Google OAuth] Starting OAuth flow`
   - Should see: `✅ [Google OAuth] Redirecting to Google`
   - After Google login, should see: `🔍 [Auth Callback] ===== CALLBACK PAGE LOADED =====`
   - Should see: `code: Present` in the logs
   - Should see: `✅ [Auth Callback] ===== CODE EXCHANGE SUCCESS =====`

5. **If any step fails, check the error message in console**

## Most Likely Issue

Based on your description (redirects back to login), the most likely issue is:

**Redirect URL mismatch in Supabase Dashboard**

The callback URL in your code (`http://localhost:3000/en/auth/callback`) must be **exactly** listed in Supabase Dashboard → Authentication → URL Configuration.

## Next Steps

1. Check browser console logs
2. Verify Supabase redirect URLs match exactly
3. Share the console output if still having issues


