# Auth Callback Hardening Summary

## Changes Made

### 1. Consolidated Callback Routes

**Before**: Two separate callback routes handling OAuth
- `app/[locale]/auth/callback/route.ts` - Locale-based callback
- `app/auth/callback/route.ts` - Non-locale callback (duplicate logic)

**After**: Single canonical callback with redirect
- `app/[locale]/auth/callback/route.ts` - **Canonical route** (handles all OAuth exchanges)
- `app/auth/callback/route.ts` - **Redirect route** (extracts locale and redirects to canonical)

### 2. Development-Only Logging

All debug logs in the canonical callback route are now wrapped with:
```typescript
const isDevelopment = process.env.NODE_ENV === 'development'
if (isDevelopment) {
  console.log('...')
}
```

This ensures:
- ✅ No sensitive information logged in production
- ✅ Reduced log noise in production
- ✅ Full debugging available in development

### 3. Verified OAuth Redirect URLs

All OAuth `redirectTo` URLs use absolute URLs with locale:

**Locale-based pages** (✅ Correct):
- `app/[locale]/auth/login/page.tsx`: `${window.location.origin}/${locale}/auth/callback`
- `app/[locale]/auth/signup/page.tsx`: `${window.location.origin}/${locale}/auth/callback`
- `app/[locale]/auth/page.tsx`: `${window.location.origin}/${locale}/auth/callback`

**Non-locale pages** (⚠️ Acceptable - redirects through non-locale callback):
- `app/auth/login/page.tsx`: `${window.location.origin}/auth/callback` → redirects to locale callback
- `app/auth/page.tsx`: `${window.location.origin}/auth/callback` → redirects to locale callback

## Route Structure

```
app/
├── [locale]/
│   └── auth/
│       └── callback/
│           └── route.ts          ← CANONICAL (handles OAuth exchange)
└── auth/
    └── callback/
        └── route.ts              ← REDIRECT (extracts locale, redirects to canonical)
```

## Flow Diagram

```
User clicks "Continue with Google"
    ↓
signInWithOAuth({ redirectTo: 'http://localhost:3000/{locale}/auth/callback' })
    ↓
Google OAuth
    ↓
Redirect to: /{locale}/auth/callback?code=...
    ↓
[locale]/auth/callback/route.ts (CANONICAL)
    ├─ Read PKCE verifier from request.cookies
    ├─ Exchange code for session
    └─ Redirect to onboarding or practice
```

**Alternative flow** (non-locale pages):
```
User on /auth/login clicks "Continue with Google"
    ↓
signInWithOAuth({ redirectTo: 'http://localhost:3000/auth/callback' })
    ↓
Google OAuth
    ↓
Redirect to: /auth/callback?code=...
    ↓
auth/callback/route.ts (REDIRECT)
    ├─ Extract locale from Accept-Language header
    └─ Redirect to: /{locale}/auth/callback?code=...
        ↓
    [locale]/auth/callback/route.ts (CANONICAL)
        ├─ Read PKCE verifier from request.cookies
        ├─ Exchange code for session
        └─ Redirect to onboarding or practice
```

## Key Implementation Details

### Canonical Callback Route (`app/[locale]/auth/callback/route.ts`)

1. **PKCE Cookie Handling**: Reads `code_verifier` from `request.cookies` (not `cookies()` from next/headers)
2. **Locale Extraction**: Extracts locale from URL pathname
3. **Error Handling**: Proper error redirects with locale prefix
4. **New User Detection**: 30-second window to detect new users
5. **Development Logging**: All debug logs wrapped in `isDevelopment` check

### Redirect Route (`app/auth/callback/route.ts`)

1. **Locale Detection**: Extracts locale from `Accept-Language` header (defaults to `defaultLocale` from i18n config)
2. **Query Preservation**: Preserves all query parameters (`code`, `error`, etc.)
3. **Simple Redirect**: Minimal logic - just redirects to canonical route

## Testing Checklist

- [ ] Test OAuth flow from locale-based login page (`/en/auth/login`)
- [ ] Test OAuth flow from locale-based signup page (`/en/auth/signup`)
- [ ] Test OAuth flow from locale-based auth choice page (`/en/auth`)
- [ ] Test OAuth flow from non-locale login page (`/auth/login`) - should redirect through non-locale callback
- [ ] Verify no debug logs appear in production build
- [ ] Verify PKCE exchange succeeds (no `exchange_failed` error)
- [ ] Verify new users redirect to onboarding
- [ ] Verify existing users redirect to practice

## Production Considerations

1. **Supabase Dashboard Configuration**: Ensure both callback URLs are configured:
   - `http://localhost:3000/en/auth/callback` (development)
   - `http://localhost:3000/ja/auth/callback` (development)
   - `https://yourdomain.com/en/auth/callback` (production)
   - `https://yourdomain.com/ja/auth/callback` (production)

2. **Logging**: Production logs will only show:
   - Error messages (not full debug details)
   - Critical failures (exchange errors, missing code, etc.)

3. **Performance**: Non-locale callback adds one redirect, but this is minimal overhead and ensures consistent locale handling.
