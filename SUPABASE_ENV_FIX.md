# Supabase Environment Variable Fix

## Problem
`exchangeCodeForSession` was failing with `AuthApiError: Invalid API key (401)` because:
1. Fallback placeholder values were being used when env vars appeared missing
2. No validation to ensure env vars are actually set (empty strings would pass)
3. No project ref validation to detect mismatches between URL and cookies

## Root Cause

### File: `lib/supabase/client.ts` (Lines 20-29)
**Issue**: Fallback logic returned a placeholder client if env vars were missing:
```typescript
if (!url || !anonKey) {
  // Returned placeholder client with 'https://placeholder.supabase.co'
  // This would cause "Invalid API key" errors
}
```

### File: `app/[locale]/auth/callback/route.ts` (Lines 78-80)
**Issue**: Used `!` assertion operator which doesn't validate at runtime:
```typescript
const supabase = createServerClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,  // Could be undefined
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,  // Could be undefined
)
```

## Fixes Applied

### 1. Removed Placeholder Fallback (`lib/supabase/client.ts`)
- ✅ Removed fallback that created client with `'https://placeholder.supabase.co'`
- ✅ Added development-only assertion that throws if env vars are missing
- ✅ Added project ref extraction and validation
- ✅ Production fails gracefully with clear error message

### 2. Added Environment Validation (`app/[locale]/auth/callback/route.ts`)
- ✅ Validates env vars are set and not empty strings
- ✅ Extracts project ref from URL and validates format
- ✅ Compares URL project ref with cookie project refs (dev-only warning)
- ✅ Throws clear errors if env vars are missing

### 3. Project Ref Mismatch Detection
- ✅ Extracts project ref from `NEXT_PUBLIC_SUPABASE_URL`
- ✅ Extracts project refs from Supabase cookie names (`sb-<ref>-auth-token`)
- ✅ Warns in development if mismatch detected

## Code Changes

### `lib/supabase/client.ts`
```typescript
// BEFORE: Fallback to placeholder
if (!url || !anonKey) {
  supabaseInstance = createClient('https://placeholder.supabase.co', 'placeholder-key')
  return supabaseInstance
}

// AFTER: Validation and error throwing
if (process.env.NODE_ENV === 'development') {
  if (!url || !url.trim()) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is missing or empty...')
  }
  // ... validation
}
if (!url || !anonKey) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is missing')
}
```

### `app/[locale]/auth/callback/route.ts`
```typescript
// BEFORE: Unsafe assertion
const supabase = createServerClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

// AFTER: Validation before use
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (isDevelopment) {
  // Validate and check project ref mismatch
}
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('...')
}

const supabase = createServerClient(supabaseUrl, supabaseAnonKey, ...)
```

## Verification Checklist

### 1. Environment Variables
- [ ] Check `.env.local` has both variables set:
  ```bash
  NEXT_PUBLIC_SUPABASE_URL=https://imlrsvugipgkqwjcffdq.supabase.co
  NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
  ```

### 2. Project Ref Match
- [ ] Extract project ref from URL: `imlrsvugipgkqwjcffdq`
- [ ] Check browser cookies for Supabase cookies:
  - Open DevTools → Application → Cookies
  - Look for cookies starting with `sb-`
  - Extract project ref from cookie name: `sb-<project-ref>-auth-token`
  - Verify cookie project ref matches URL project ref

### 3. Test OAuth Flow
- [ ] Clear all Supabase cookies (or use incognito)
- [ ] Go to `/en/auth/login`
- [ ] Click "Continue with Google"
- [ ] Complete Google authentication
- [ ] Should redirect to `/en/onboarding/name` or `/en/practice/select`
- [ ] Check console for any project ref mismatch warnings

### 4. Development Assertions
- [ ] If env vars are missing, app should throw clear error on startup
- [ ] Error should mention which variable is missing
- [ ] Error should point to `.env.local` file

## Expected Behavior

### ✅ Success Case
1. User clicks "Continue with Google"
2. Redirects to Google OAuth
3. Google redirects back to `/en/auth/callback?code=...`
4. Callback route validates env vars
5. Extracts project ref from URL: `imlrsvugipgkqwjcffdq`
6. Checks cookies match project ref (dev-only warning if mismatch)
7. Exchanges code for session successfully
8. Redirects to onboarding or practice

### ❌ Failure Cases (Now Caught Early)

**Missing env var:**
```
Error: NEXT_PUBLIC_SUPABASE_URL is missing or empty. Check your .env.local file.
```

**Invalid URL format:**
```
Error: Invalid NEXT_PUBLIC_SUPABASE_URL format: <url>. Expected format: https://<project-ref>.supabase.co
```

**Project ref mismatch (dev-only warning):**
```
⚠️ [Callback] Project ref mismatch detected:
   URL project ref: imlrsvugipgkqwjcffdq
   Cookie project refs: ['different-ref']
   This may cause "Invalid API key" errors if cookies are from a different project.
```

## Troubleshooting

### If you still see "Invalid API key" error:

1. **Check env vars are loaded:**
   ```bash
   # In terminal
   node -e "console.log(process.env.NEXT_PUBLIC_SUPABASE_URL)"
   ```
   Should output your Supabase URL, not `undefined`

2. **Restart dev server:**
   ```bash
   # Stop server (Ctrl+C)
   npm run dev
   ```
   Env vars are loaded at startup

3. **Clear cookies and retry:**
   - Clear all `sb-*` cookies
   - Or use incognito mode
   - Retry OAuth flow

4. **Verify project ref matches:**
   - URL: Extract from `NEXT_PUBLIC_SUPABASE_URL`
   - Cookies: Check cookie names in DevTools
   - Must match exactly

5. **Check Supabase Dashboard:**
   - Verify anon key is correct
   - Verify URL is correct
   - Check if project is active (not paused)

## Files Changed

1. ✅ `lib/supabase/client.ts` - Removed fallback, added validation
2. ✅ `app/[locale]/auth/callback/route.ts` - Added env validation and project ref checking

## Next Steps

1. Restart dev server to load updated code
2. Test OAuth flow end-to-end
3. Check console for any warnings
4. Verify project ref matches between URL and cookies
