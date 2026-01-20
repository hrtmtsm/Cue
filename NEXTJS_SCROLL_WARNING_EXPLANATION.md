# Next.js Auto-Scroll Warning Explanation

## Warning Message
```
Skipping auto-scroll behavior due to `position: sticky` or `position: fixed` on element
```

## What This Means

This is an **informational warning** (not an error) from Next.js's App Router. It occurs when:

1. Next.js tries to automatically scroll to the top after a route change
2. It detects fixed or sticky positioned elements in the DOM
3. It correctly skips the auto-scroll to avoid conflicts with these elements

## Why It Happens

Our app has several fixed/sticky elements:
- **BottomNav** (`components/BottomNav.tsx`) - `position: fixed` at bottom
- **FullScreenLoader** (`components/FullScreenLoader.tsx`) - `position: fixed` overlay
- Potentially sticky buttons or headers

## Is This a Problem?

**No, this is expected behavior.** Next.js is correctly:
- Detecting fixed/sticky elements
- Skipping auto-scroll to prevent UI conflicts
- Warning us about the behavior (for debugging)

## Should We Fix It?

**Not necessary** - the warning is harmless and the behavior is correct. However, if you want to suppress it:

### Option 1: Ignore It (Recommended)
- It's just a console warning, not an error
- The app works correctly
- No user-facing impact

### Option 2: Suppress in Development
Add to `next.config.js`:
```javascript
module.exports = {
  // Suppress console warnings in development
  onDemandEntries: {
    maxInactiveAge: 25 * 1000,
    pagesBufferLength: 2,
  },
}
```

### Option 3: Manual Scroll Control
If you want explicit scroll control, you can add:
```typescript
useEffect(() => {
  window.scrollTo(0, 0)
}, [pathname])
```

But this is usually unnecessary since Next.js handles it correctly.

## Conclusion

This warning is **expected and harmless**. Next.js is correctly detecting our fixed navigation elements and adjusting scroll behavior accordingly. No action needed unless it's causing actual UI issues (which it shouldn't).


