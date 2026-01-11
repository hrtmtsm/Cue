# Check Answer Button Navigation Debug

## Current Implementation

### handleCheckAnswer() Function (lines 1463-1482):
```typescript
const handleCheckAnswer = () => {
  if (inputMode === 'type' && !userInput.trim()) return

  // Route to review screen - support story-based, clip-based, and session-based routing
  if (storyId && storyClipId) {
    // Story-based routing - mark as done and navigate to review
    router.push(
      `/practice/review?storyId=${storyId}&clipId=${storyClipId}&userText=${encodeURIComponent(userInput)}`
    )
  } else if (clipId) {
    // Clip-based routing (single phrase session - Quick Practice)
    router.push(`/practice/review?clip=${clipId}&userText=${encodeURIComponent(userInput)}`)
  } else {
    // Session-based routing
    const phraseIdParam = phraseId ? `&phraseId=${phraseId}` : ''
    router.push(
      `/practice/review?session=${sessionId}&index=${phraseIndex}&userText=${encodeURIComponent(userInput)}${phraseIdParam}`
    )
  }
}
```

### Button JSX (lines 1684-1694):
```tsx
<button
  onClick={handleCheckAnswer}
  disabled={inputMode === 'type' && !userInput.trim()}
  className={...}
>
  Check answer
</button>
```

## Potential Issues

### Issue 1: Missing `type="button"`
- Button doesn't have explicit `type="button"`
- Default button type might cause issues in some browsers
- **Fix**: Add `type="button"` to prevent any form-like behavior

### Issue 2: Routing Conditions
- If `storyId`, `storyClipId`, and `clipId` are all null/undefined, it falls to else branch
- Else branch uses `sessionId` which defaults to 'quick' (line 48)
- This should still work, but might not be the intended route

### Issue 3: Event Propagation
- No `event.preventDefault()` or `event.stopPropagation()`
- If there's a parent handler, it might interfere
- **Fix**: Add event parameter and prevent default

### Issue 4: Query Parameter Reading
- Query params are read from `useSearchParams()` at component level
- If params aren't available when button is clicked, routing might fail
- **Fix**: Add logging to see what params are available

## Recommended Fixes

1. **Add explicit button type**
2. **Add event handling**
3. **Add logging for debugging**
4. **Add fallback navigation**

