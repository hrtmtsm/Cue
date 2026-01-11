# Check Answer Navigation Debug Report

## Current Code Analysis

### 1. Router Import ✅
```typescript
import { useRouter } from 'next/navigation'  // ✅ Correct for Next.js 14 App Router
```

### 2. handleCheckAnswer() Function (lines 1463-1518)
```typescript
const handleCheckAnswer = (e?: React.MouseEvent) => {
  // Enhanced debugging added
  // Prevents default and stops propagation
  // Has comprehensive logging
  // Routes based on storyId, clipId, or sessionId
  // Calls router.push(reviewUrl)
}
```

**Routing Logic:**
- Story-based: `/practice/review?storyId=...&clipId=...&userText=...`
- Clip-based: `/practice/review?clip=...&userText=...`
- Session-based: `/practice/review?session=...&index=...&userText=...`

### 3. Check Answer Button JSX (lines 1720-1731)
```tsx
<button
  type="button"  // ✅ Explicitly set to prevent form submission
  onClick={handleCheckAnswer}
  disabled={inputMode === 'type' && !userInput.trim()}
  className="..."
>
  Check answer
</button>
```

**Parent Elements:**
- Wrapped in `<div className="pt-6 pb-6">` (no form)
- Inside `<main className="flex min-h-screen flex-col px-6 py-6">`
- No form wrapper found ✅

### 4. Back Button (lines 1524-1537)
```tsx
<button
  onClick={() => {
    if (storyId) {
      router.push(`/practice/story/${storyId}`)
    } else {
      router.push('/practice/select')
    }
  }}
  className="..."
>
  <ChevronLeft />
  Back
</button>
```

**Analysis:**
- Uses `router.push()` (not `router.back()`) ✅
- Separate from Check Answer button ✅
- No overlap detected ✅

### 5. Review Page Route ✅
- File exists: `app/(app)/practice/review/page.tsx`
- Route should be accessible at `/practice/review`

## Enhanced Debugging Added

Added comprehensive logging to `handleCheckAnswer()`:
- Logs when function is called
- Logs current pathname and search params
- Logs userInput (first 50 chars)
- Logs all routing parameters
- Logs router object type
- Logs before/after router.push()
- Logs pathname 100ms after navigation

## Next Steps for Debugging

1. **Click "Check Answer" button**
2. **Check browser console** for:
   - `🔍 [DEBUG] handleCheckAnswer called`
   - `🔍 [DEBUG] Current pathname: ...`
   - `✅ [RespondPage] Navigating to review (story-based/clip-based/etc): ...`
   - `✅ [DEBUG] router.push() called successfully`
   - `🔍 [DEBUG] After 100ms, pathname is: ...`

3. **What to look for:**
   - Does `handleCheckAnswer` get called? (If no, button click isn't reaching handler)
   - What pathname is logged before navigation?
   - What reviewUrl is constructed?
   - Does `router.push()` get called?
   - What pathname is logged after 100ms? (Should be `/practice/review`)

## Potential Issues to Check

### Issue 1: Button Disabled
- If `inputMode === 'type' && !userInput.trim()`, button is disabled
- **Check**: Is userInput actually populated?

### Issue 2: Event Not Reaching Handler
- If no console logs appear, click isn't reaching handler
- **Check**: Is there CSS z-index or pointer-events blocking clicks?

### Issue 3: Router.push() Not Working
- If logs show router.push() called but pathname doesn't change
- **Check**: Is router object valid? Is there an error in router.push()?

### Issue 4: Wrong Route Constructed
- If reviewUrl is wrong, navigation goes to wrong place
- **Check**: Are storyId, clipId, etc. actually set?

### Issue 5: Navigation Intercepted
- If navigation happens but goes to wrong place
- **Check**: Is there middleware or layout intercepting routes?

## Expected Console Output

When clicking "Check Answer" with valid input, you should see:
```
🔍 [DEBUG] handleCheckAnswer called
🔍 [DEBUG] Current pathname: /practice/respond
🔍 [DEBUG] userInput: [your input text]
🔍 [RespondPage] handleCheckAnswer called: { storyId: ..., clipId: ..., ... }
✅ [RespondPage] Navigating to review (story-based): /practice/review?storyId=...&clipId=...&userText=...
🔍 [DEBUG] About to call router.push() with URL: /practice/review?...
✅ [DEBUG] router.push() called successfully
🔍 [DEBUG] After 100ms, pathname is: /practice/review
```

If you see different output, that will tell us what's wrong!

