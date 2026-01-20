# Story Generation Analysis

## Current Behavior: Why Only 1 Story is Created

### The Flow

1. **Onboarding Completion** (`app/onboarding/ready/page.tsx`)
   - Calls `/api/clips/generate` **once** (line 30)
   - Receives **3 clips** (easy, medium, hard)

2. **Clip Generation** (`app/api/clips/generate/route.ts`)
   - `createClipProfiles()` creates **exactly 3 profiles** (lines 334-342)
   - All 3 profiles have the **same `targetStyle`** (from onboarding genre)
   - All 3 profiles have the **same `focus`** (from onboarding difficulties)
   - Generates **3 clips** (one for each difficulty level)

3. **Clip Profile Mapping** (`lib/clipProfileMapper.ts`)
   - Returns exactly 3 profiles: easy (10s), medium (15s), hard (18s)
   - All share the same `targetStyle` and `focus`

4. **Story Conversion** (`lib/clipToStoryConverter.ts`)
   - Groups clips by `situation` (line 19-26)
   - **PROBLEM**: All 3 clips have the same situation (from same `targetStyle`)
   - Splits each situation group into stories with **5 clips per story** (line 33)
   - **RESULT**: 3 clips ÷ 5 = **1 story** (with all 3 clips)

### The Math

```
Generated Clips: 3
Clips per Story: 5
Stories Created: ⌈3 / 5⌉ = 1 story
```

## Current Numbers

- **Clips Generated**: 3 (easy, medium, hard)
- **Stories Created**: 1 (contains all 3 clips)
- **Clips per Story**: 3 (less than the target of 5)

## Solutions to Generate 5-8 Stories

### Option 1: Generate More Clips (Recommended)

**Modify**: `app/api/clips/generate/route.ts`

Change from generating 3 clips to generating 15-24 clips:

```typescript
// Current: 3 profiles (easy, medium, hard)
// Change to: Generate multiple variations

// Example: Generate 5-8 stories × 3 clips each = 15-24 clips
// Or: Generate 5-8 stories × 2 clips each = 10-16 clips
```

**Implementation**:
- Create multiple clip profiles with different situations/topics
- Generate 15-24 clips total
- With `clipsPerStory = 5`, you'll get 3-5 stories
- With `clipsPerStory = 3`, you'll get 5-8 stories

### Option 2: Reduce Clips Per Story

**Modify**: `lib/clipToStoryConverter.ts` (line 33)

Change `clipsPerStory` from 5 to 1-2:

```typescript
// Current
const clipsPerStory = 5

// Change to
const clipsPerStory = 1  // Creates 3 stories from 3 clips
// or
const clipsPerStory = 2  // Creates 2 stories (1 with 2 clips, 1 with 1 clip)
```

**Pros**: Quick fix, no API changes needed
**Cons**: Stories will have very few clips (1-2 each), less engaging

### Option 3: Generate Clips with Different Situations

**Modify**: `lib/clipProfileMapper.ts`

Create profiles with different situations/topics:

```typescript
export function createClipProfiles(
  onboardingData: OnboardingData
): ClipProfile[] {
  const focus = mapOnboardingToFocus(onboardingData.listeningDifficulties)
  const baseStyle = onboardingData.preferredGenre || 'Everyday conversations'
  
  // Generate multiple situations/topics
  const situations = [
    baseStyle,
    'Work',
    'Social',
    'Travel',
    'Media',
  ]
  
  const profiles: ClipProfile[] = []
  
  // Generate 2-3 clips per situation
  for (const situation of situations.slice(0, 3)) {
    profiles.push(
      { focus, targetStyle: situation, lengthSec: 10, difficulty: 'easy' },
      { focus, targetStyle: situation, lengthSec: 15, difficulty: 'medium' },
    )
  }
  
  return profiles  // Returns 6 profiles (3 situations × 2 difficulties)
}
```

This would generate 6 clips across 3 situations, creating 2 stories (3 clips per situation ÷ 5 = 1 story per situation, but with 3 clips each, you'd get 2 stories).

## Recommended Solution

**Generate 15-20 clips** with varied situations:

1. Modify `createClipProfiles()` to return 15-20 profiles
2. Each situation gets 3 clips (easy, medium, hard)
3. With `clipsPerStory = 3`, you'll get 5-7 stories
4. With `clipsPerStory = 5`, you'll get 3-4 stories

## Debug Logs Added

Console logs now show:
- `Generated clips: X`
- `Converted stories: X`
- `userStories in localStorage: X`
- Situation grouping details
- Story creation details

Check browser console after onboarding completion to see these values.


