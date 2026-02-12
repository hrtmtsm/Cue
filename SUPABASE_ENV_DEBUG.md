# Supabase Environment Variable Debugging

## Problem
OAuth callback fails with `AuthApiError: Invalid API key (401)` even though:
- Cookie project ref: `imlrsvugipgkqwjcffdq` ✅
- URL project ref: `imlrsvugipgkqwjcffdq` ✅
- PKCE cookie exists: `sb-imlrsvugipgkqwjcffdq-auth-token-code-verifier` ✅

## All Supabase Client Initializations

### 1. Client-Side: `lib/supabase/client.ts`
**Line 54**: `createBrowserClient(url, anonKey)`
- Uses: `process.env.NEXT_PUBLIC_SUPABASE_URL`
- Uses: `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY`
- ✅ Has validation and project ref extraction
- ✅ Throws error if env vars missing

### 2. Server-Side Callback: `app/[locale]/auth/callback/route.ts`
**Line 128**: `createServerClient(supabaseUrl, supabaseAnonKey, ...)`
- Uses: `process.env.NEXT_PUBLIC_SUPABASE_URL`
- Uses: `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY`
- ✅ Now has runtime assertions
- ✅ Validates project ref matches cookies

### 3. Server Admin: `lib/supabase/server.ts`
**Line 36**: `createClient(url, serviceKey, ...)`
- Uses: `process.env.NEXT_PUBLIC_SUPABASE_URL`
- Uses: `process.env.SUPABASE_SERVICE_ROLE_KEY` (different key!)
- ⚠️ This is for admin operations, not auth

## Environment Variable Names

| Variable | Used In | Purpose |
|----------|---------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | All clients | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client + Callback | Public anon key for auth |
| `SUPABASE_SERVICE_ROLE_KEY` | Server admin only | Admin operations (not auth) |

## Project Ref Verification

**Cookie**: `sb-imlrsvugipgkqwjcffdq-auth-token-code-verifier`
- Project ref: `imlrsvugipgkqwjcffdq` ✅

**Environment**: `NEXT_PUBLIC_SUPABASE_URL=https://imlrsvugipgkqwjcffdq.supabase.co`
- Project ref: `imlrsvugipgkqwjcffdq` ✅

**Match**: ✅ Project refs match

## Runtime Assertions Added

### `app/[locale]/auth/callback/route.ts`

1. **Immediate validation** (not just dev):
   ```typescript
   if (!supabaseUrl || !supabaseUrl.trim()) {
     throw new Error('NEXT_PUBLIC_SUPABASE_URL is missing or empty at runtime...')
   }
   ```

2. **Detailed logging** (dev-only):
   - Logs URL, project ref, anon key length
   - Compares cookie project refs with URL project ref
   - Warns if mismatch detected

3. **Enhanced error logging**:
   - Always logs exchange errors (even in production)
   - Logs Supabase URL and anon key (first 50 chars) on error
   - Full error object in development

## Code Diffs

### File: `app/[locale]/auth/callback/route.ts`

**Lines 54-103**: Enhanced validation and logging
```typescript
// BEFORE: Only validated in dev, silent in production
if (isDevelopment) {
  if (!supabaseUrl || !supabaseUrl.trim()) {
    throw new Error('...')
  }
}

// AFTER: Always validates, detailed logging in dev
if (!supabaseUrl || !supabaseUrl.trim()) {
  const error = 'NEXT_PUBLIC_SUPABASE_URL is missing or empty at runtime...'
  console.error('❌ [Callback]', error)
  console.error('❌ [Callback] Current env value:', supabaseUrl === undefined ? 'undefined' : `"${supabaseUrl}"`)
  throw new Error(error)
}

if (isDevelopment) {
  console.log('✅ [Callback] Environment variables loaded:')
  console.log('   URL:', supabaseUrl)
  console.log('   Project ref:', urlProjectRef)
  // ... more logging
}
```

**Lines 153-180**: Enhanced error logging
```typescript
// BEFORE: Only logged in dev
if (isDevelopment) {
  console.error('❌ [Callback] Exchange failed:', exchangeError.message)
}

// AFTER: Always logs, detailed in dev
console.error('❌ [Callback] Exchange failed:', exchangeError.message)
console.error('❌ [Callback] Error details:', {
  message: exchangeError.message,
  status: exchangeError.status,
  name: exchangeError.name,
  code: exchangeError.status,
})

if (isDevelopment) {
  console.error('❌ [Callback] Supabase URL used:', supabaseUrl)
  console.error('❌ [Callback] Anon key length:', supabaseAnonKey.length)
  // ... more details
}
```

## Required Restart Steps

1. **Stop dev server** (Ctrl+C)

2. **Verify .env.local exists and has correct values**:
   ```bash
   cat .env.local | grep SUPABASE
   ```
   Should show:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://imlrsvugipgkqwjcffdq.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```

3. **Restart dev server**:
   ```bash
   npm run dev
   ```

4. **Clear browser cookies** (or use incognito):
   - Open DevTools → Application → Cookies
   - Delete all `sb-*` cookies
   - Or use incognito mode

5. **Test OAuth flow**:
   - Go to `/en/auth/login`
   - Click "Continue with Google"
   - Watch terminal console for detailed logs

## Debugging Output

When you test OAuth now, you should see in the terminal:

```
✅ [Callback] Environment variables loaded:
   URL: https://imlrsvugipgkqwjcffdq.supabase.co
   Project ref: imlrsvugipgkqwjcffdq
   Anon key length: 200
   Anon key starts with: eyJhbGciOiJIUzI1NiIsInR5cCI6Ik...
🍪 [Callback] Supabase cookies found: 2
🍪 [Callback] Cookie project refs: ['imlrsvugipgkqwjcffdq']
✅ [Callback] Project refs match: imlrsvugipgkqwjcffdq
🔄 [Callback] Exchanging code for session...
🔄 [Callback] Using Supabase URL: https://imlrsvugipgkqwjcffdq.supabase.co
```

If you see an error, it will now show:
```
❌ [Callback] Exchange failed: Invalid API key
❌ [Callback] Error details: { message: '...', status: 401, ... }
❌ [Callback] Supabase URL used: https://imlrsvugipgkqwjcffdq.supabase.co
❌ [Callback] Anon key length: 200
❌ [Callback] Anon key (first 50 chars): eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Next Steps if Still Failing

If you still get "Invalid API key" after restart:

1. **Verify anon key is correct**:
   - Go to Supabase Dashboard → Settings → API
   - Copy the "anon public" key
   - Compare with `.env.local` (should match exactly)

2. **Check for whitespace**:
   ```bash
   # Check if key has trailing newline or spaces
   node -e "require('dotenv').config({path:'.env.local'}); console.log('Key length:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.length); console.log('Key (first 50):', JSON.stringify(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.substring(0, 50)))"
   ```

3. **Verify project is active**:
   - Check Supabase Dashboard
   - Ensure project is not paused
   - Ensure billing is active (if required)

4. **Check Next.js env loading**:
   - Next.js should auto-load `.env.local`
   - But verify by checking console logs on startup
   - Should see env vars loaded in the callback route logs

## Files Changed

1. ✅ `app/[locale]/auth/callback/route.ts` - Added runtime assertions and detailed logging
