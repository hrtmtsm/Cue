# Insight Modal Header Improvement Summary

## Changes Made

### 1. Prominent Two-Row Comparison Component

**Replaced**: Small inline "You heard / Actual" text  
**With**: Large, prominent two-row component with icons

**Design**:
- Row 1 (Negative): Red background, ❌ icon, large text (18px)
- Row 2 (Positive): Green background, ✅ icon, large text (18px)
- Labels: 12-13px, uppercase, tracking-wide
- Values: 18px, bold, break-words for long phrases

### 2. Label Switching Logic

**Missing/Not Heard Cases**:
- Row 1: "What you missed" + actualChunkText
- Row 2: "Actual" + actualChunkText (same value)
- NO "You heard" row

**Substitution Cases**:
- Row 1: "You heard" + heardText
- Row 2: "Actual" + actualChunkText

**Detection**:
```typescript
const isNotHeard = eventType === 'missing' || 
                  !heardText || 
                  heardText === null ||
                  actualSpan === '(not heard)' ||
                  actualSpan.toLowerCase().includes('not heard')
```

### 3. Cue-Style B Format for "How it sounds"

**New Helper**: `lib/formatHowItSounds.ts`

**Format Rules**:
- Minimal pairs: `"light" → "L-ait"`, `"right" → "R-ait"`
- Function word reduction: `"the train" → "thətrain"`
- Multi-word blending: Join without spaces
- If formatted equals original (normalized), show `/.../` placeholder or omit arrow

**Examples**:
- `"light"` → `"L-ait"`
- `"right"` → `"R-ait"`
- `"the train"` → `"thətrain"`
- `"to get to"` → `"təgettə"`

### 4. Files Modified

**1. `lib/formatHowItSounds.ts` (NEW)**
- `formatHowItSounds()` function
- Minimal pair patterns
- Function word reductions
- Multi-word blending

**2. `app/[locale]/(app)/practice/review/page.tsx`**
- Updated modal rendering (lines ~1870-1980)
- Added prominent two-row comparison component
- Integrated `formatHowItSounds()` for display
- Removed old small inline comparison text

## UI Structure

### Before
```
[Small text: "You heard: ... Actual: ..."]
[Big red box with chunk]
```

### After
```
[❌ What you missed / You heard]
  Large text: chunk/heard

[✅ Actual]
  Large text: chunk

[👂 How it sounds]
  "chunk" → "formatted"

[🔁 One example]
  Example sentence
```

## Example Outputs

### Missing "train" (with "the" before it)
**Row 1**: ❌ What you missed: **the train**  
**Row 2**: ✅ Actual: **the train**  
**How it sounds**: `"the train" → "thətrain"`

### Missing "get" (within "to get to")
**Row 1**: ❌ What you missed: **to get to**  
**Row 2**: ✅ Actual: **to get to**  
**How it sounds**: `"to get to" → "təgettə"`

### Substitution (user typed "car" instead of "train")
**Row 1**: ❌ You heard: **car**  
**Row 2**: ✅ Actual: **the train**  
**How it sounds**: `"the train" → "thətrain"`

### Minimal pair: "light"
**Row 1**: ❌ What you missed: **light**  
**Row 2**: ✅ Actual: **light**  
**How it sounds**: `"light" → "L-ait"`

## Responsive Design

- Values use `break-words` for long phrases
- Icons are `flex-shrink-0` to prevent squishing
- Container uses `min-w-0` to allow text wrapping
- Padding and spacing optimized for mobile

## Acceptance Criteria ✅

- ✅ Two-row comparison is highly visible (18px text, colored backgrounds)
- ✅ Missing cases show "What you missed" (not "You heard")
- ✅ Substitution cases show "You heard" + "Actual"
- ✅ "How it sounds" uses Cue-style B format (L-ait, R-ait, etc.)
- ✅ Long phrases wrap nicely (no overflow)
- ✅ Icons aligned left for fast scanning
- ✅ Responsive layout works on mobile
