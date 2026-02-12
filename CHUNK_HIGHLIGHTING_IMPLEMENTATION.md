# Chunk-Level Highlighting Implementation

## Summary

Implemented two changes to make chunk-level data (phraseHint) visually prominent in the UI:

1. **Insights Modal**: Made `what_it_was` (chunk-level) prominently displayed, demoted word-level text
2. **Transcript Highlighting**: Added visual highlighting of chunk spans based on `replay_target.refStart/refEnd`

## Code Changes

### File: `app/[locale]/(app)/practice/review/page.tsx`

#### Change 1: Insights Modal - Prominent Chunk Display

**Location:** Lines ~1580-1616

**Before:**
```tsx
{/* Always show what it was/should be */}
<div>
  <div className="text-xs text-gray-600 mb-1">{labels.correctLabel}:</div>
  <div className="text-sm font-medium text-blue-700">
    {currentInsight.what_it_was}
  </div>
</div>
```

**After:**
```tsx
{/* PRIMARY: Chunk-level "missed part" - prominently displayed */}
<div className="p-3 bg-blue-100 rounded-lg border-2 border-blue-300">
  <div className="text-xs font-semibold text-blue-900 mb-2 uppercase tracking-wide">
    {labels.correctLabel}
  </div>
  <div className="text-lg font-bold text-blue-900">
    "{currentInsight.what_it_was}"
  </div>
</div>

{/* SECONDARY: Word-level "what you heard" - demoted to small text */}
{labels.userLabel && currentInsight.what_you_might_have_heard && (
  <div className="pt-2 border-t border-gray-200">
    <div className="text-xs text-gray-500 mb-1">{labels.userLabel}:</div>
    <div className="text-xs text-gray-600 italic">
      {currentInsight.what_you_might_have_heard}
    </div>
  </div>
)}
```

**Added Dev Logging:**
```tsx
// Dev logging: Check what we're displaying
if (process.env.NODE_ENV === 'development') {
  console.log('🎯 [Insights Modal] Current insight:', {
    what_it_was: currentInsight.what_it_was,
    replay_target: currentInsight.replay_target,
    replay_refStart: currentInsight.replay_target?.refStart,
    replay_refEnd: currentInsight.replay_target?.refEnd,
    what_you_might_have_heard: currentInsight.what_you_might_have_heard
  })
}
```

#### Change 2: Transcript Chunk Highlighting

**Location:** Lines ~1319-1375

**Added before token mapping:**
```tsx
// Get current insight's replay_target for highlighting (if insights modal is open)
const currentInsight = showInsightsModal && aiInsights.length > 0 
  ? aiInsights[currentInsightIndex] 
  : null
const replayTarget = currentInsight?.replay_target
const highlightStart = replayTarget?.refStart ?? -1
const highlightEnd = replayTarget?.refEnd ?? -1

// Dev logging: Log highlight range and first/last tokens
if (process.env.NODE_ENV === 'development' && replayTarget) {
  const refTokens = diffResult.refTokens || []
  const firstHighlightToken = highlightStart >= 0 && highlightStart < refTokens.length 
    ? refTokens[highlightStart] 
    : null
  const lastHighlightToken = highlightEnd >= 0 && highlightEnd < refTokens.length 
    ? refTokens[highlightEnd] 
    : null
  console.log('🎨 [Transcript Highlight] Applying chunk highlight:', {
    replay_target: replayTarget,
    highlightRange: [highlightStart, highlightEnd],
    firstToken: firstHighlightToken,
    lastToken: lastHighlightToken,
    what_it_was: currentInsight?.what_it_was
  })
}
```

**Modified token mapping loop:**
```tsx
// Track current position in refTokens for highlighting
// refTokens indices are what replay_target.refStart/refEnd refer to
let refTokenIndex = 0

return (diffResult.tokens || []).map((t: any, idx: number) => {
  // ... existing word position mapping code ...
  
  // Determine refTokenIndex: tokens that exist in reference (correct/missing/substitution) map to refTokens
  // Extra tokens don't exist in refTokens, so they get -1
  let currentRefTokenIndex = -1
  if (t.type !== 'extra') {
    // This token corresponds to a position in refTokens
    // Use refIndex if available, otherwise use the tracked refTokenIndex
    currentRefTokenIndex = t.refIndex !== undefined ? t.refIndex : refTokenIndex
    refTokenIndex++ // Advance for next reference token
  }
  
  // Check if this token should be highlighted (refTokenIndex within replay_target range)
  const isHighlighted = replayTarget && 
    highlightStart >= 0 && 
    highlightEnd >= 0 && 
    currentRefTokenIndex >= 0 && // Only highlight tokens that exist in reference
    currentRefTokenIndex >= highlightStart && 
    currentRefTokenIndex <= highlightEnd
  
  // Base className for token type
  let baseClassName = 
    t.type === 'correct'
      ? 'px-0.5 rounded text-gray-900 cursor-pointer hover:bg-blue-50'
      : t.type === 'missing'
      ? 'px-0.5 rounded text-gray-500 underline decoration-dotted decoration-gray-400 cursor-pointer hover:bg-blue-50'
      : t.type === 'extra'
      ? 'px-0.5 rounded text-gray-500 line-through cursor-pointer hover:bg-blue-50'
      : 'px-0.5 rounded text-red-600 underline decoration-dotted decoration-red-400 cursor-pointer hover:bg-blue-50'
  
  // Add highlight class if within replay_target range
  const className = isHighlighted 
    ? `${baseClassName} bg-blue-100 rounded px-0.5 font-semibold`
    : baseClassName
```

## Behavior

### Insights Modal
- **Primary Display**: `what_it_was` (chunk-level text) shown prominently in large, bold text with blue background
- **Secondary Display**: `what_you_might_have_heard` (word-level) shown in small, italic text below
- **Backward Compatible**: If `what_you_might_have_heard` is missing, secondary section is hidden

### Transcript Highlighting
- **Highlighting**: When insights modal is open, tokens within `replay_target.refStart` to `replay_target.refEnd` get `bg-blue-100` background and `font-semibold`
- **Token Mapping**: Correctly maps tokens to refTokens indices (extra tokens excluded)
- **Backward Compatible**: If `replay_target` is missing, no highlighting applied

## Dev Logs

1. **Insights Modal Log** (when modal renders):
   - `what_it_was`: The chunk-level text being displayed
   - `replay_target`: Full replay target object
   - `replay_refStart/refEnd`: Highlight range indices
   - `what_you_might_have_heard`: Word-level text (if present)

2. **Transcript Highlight Log** (when highlighting is applied):
   - `replay_target`: Full replay target object
   - `highlightRange`: [refStart, refEnd] array
   - `firstToken`: First token text in highlight range
   - `lastToken`: Last token text in highlight range
   - `what_it_was`: Chunk text being highlighted

## Testing

1. Open review page after submitting an answer
2. Click "Why did I miss this?" to open insights modal
3. Check console logs:
   - Should see `🎯 [Insights Modal]` log with chunk-level data
   - Should see `🎨 [Transcript Highlight]` log with highlight range
4. Verify UI:
   - Insights modal shows chunk-level text prominently
   - Transcript highlights the chunk span with blue background
