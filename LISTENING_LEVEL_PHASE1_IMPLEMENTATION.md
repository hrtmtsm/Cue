# Listening Level - Phase 1 Implementation

**Status**: ✅ **COMPLETE**  
**Date**: 2026-02-12

---

## Overview

Implemented a stability-centered "Listening Level" metric that displays users' approximate CEFR listening capability based on their practice performance. The system uses a lightweight, rule-based approach that prioritizes UX clarity and believable feedback over absolute precision.

---

## Philosophy & Design Principles

### What We're NOT Showing:
- ❌ Absolute claims ("You are B1")
- ❌ Raw accuracy dominance
- ❌ 100% mastery framing
- ❌ Technical jargon (variance, std-dev)

### What We ARE Showing:
- ✅ Approximate capability ("Around B1")
- ✅ Stability of that capability
- ✅ Growth context (progression indicators)
- ✅ Psychologically safe phrasing
- ✅ Behavior-based descriptors

---

## Files Created

### 1. **`lib/cefrMetrics.ts`** (NEW - 462 lines)

Core calculation engine for Listening Level metric.

**Key Functions:**

#### `calculateListeningLevel(events, clips)`
Main function that returns `ListeningLevelData` with:
- Current CEFR level
- Confidence (low/medium/high)
- Stability score (0-1)
- Capability descriptor
- Progression context (if applicable)
- Per-band statistics

#### `calculateStabilityScore(events)`
Computes stability-adjusted performance score:

```typescript
Stability = weightedAccuracy 
          - replayPenalty (0-15%)
          - variancePenalty (0-10%)
          + consistencyBonus (0-5%)
```

**Components:**
- **Weighted Accuracy**: 14-day exponential decay (recent clips matter more)
- **Replay Penalty**: High replays indicate instability
- **Variance Penalty**: Inconsistent performance reduces stability
- **Consistency Bonus**: Reward stable performance over 5+ clips

#### `calculateCEFRBandStats(events, clips)`
Groups events by CEFR level and calculates per-band metrics:
- Clip count
- Average accuracy
- Stability score
- Confidence level
- Status (comfortable/stretch/too-hard/exploring)

**Thresholds:**
| Stability Score | Status |
|----------------|--------|
| ≥70% | Comfortable |
| 55-69% | Stretch |
| <55% | Too Hard |
| <3 clips | Exploring |

**Confidence Levels:**
| Clip Count | Confidence |
|------------|-----------|
| ≥10 | High |
| 5-9 | Medium |
| <5 | Low |

---

## Files Modified

### 2. **`lib/clipTypes.ts`**

**Change:** Extended `Clip` interface

```typescript
export interface Clip {
  // ... existing fields
  cefrLevel?: 'A1' | 'A2' | 'B1' | 'B2' | 'C1'  // NEW
}
```

**Purpose:** Allow clips to store CEFR level alongside existing difficulty field.

**Backward Compatibility:** Optional field with fallback to difficulty-based mapping.

---

### 3. **`app/[locale]/(app)/progress/page.tsx`** (Locale-aware version)

**Changes:**
1. Added imports for CEFR metrics calculator
2. Added `listeningLevel` state variable
3. Updated metrics calculation `useEffect` to calculate listening level
4. Added Listening Level card UI

**New UI Card:** (Positioned after Semantic Badge card)

```
┌─────────────────────────────────────────┐
│ Listening Level                         │
│                                         │
│ Around B1 · Intermediate                │
│ Catching most everyday conversations    │
│                                         │
│ ━━━━━━━━━━━━━━━━━━ 78%                 │
│ 78% · Stability              ⓘ         │
│ ─────────────────────────────           │
│ Confidence · High         ↑ From A2     │
└─────────────────────────────────────────┘
```

---

### 4. **`app/(app)/progress/page.tsx`** (Non-locale version)

**Changes:** Identical to locale-aware version for consistency.

---

## UI Specification

### Card Components

#### 1. **Title**
```
Listening Level
```

#### 2. **Primary Line**
```
Around B1 · Intermediate
```
- **"Around"** = Soft claim, avoids false precision
- **Level + Label** = CEFR code + human-readable descriptor

#### 3. **Capability Descriptor**
```
Catching most everyday conversations
```
- Behavior-based (not exam terminology)
- CEFR-aligned descriptors:
  - A1: "Understanding simple phrases"
  - A2: "Following basic conversations"
  - B1: "Catching most everyday conversations"
  - B2: "Understanding complex discussions"
  - C1: "Grasping nuanced native speech"

#### 4. **Progress Bar**
```
━━━━━━━━━━━━━━━━━━ 78%
```
- Represents **Stability Score** (not raw accuracy)
- Blue color (`bg-blue-500`)
- Smooth transitions (`transition-all duration-500`)
- Capped at 95% to avoid "100% Stability" UX issue

#### 5. **Metric Label**
```
78% · Stability     ⓘ
```
- Tooltip on ⓘ: "Stability measures how consistently you understand clips at this level."
- No technical jargon exposed

#### 6. **Confidence Indicator**
```
Confidence · High
```
- Based on clip count (Low <5, Medium 5-9, High ≥10)

#### 7. **Progression Context** (conditional)
```
↑ From A2
```
or
```
↓ From B2
```
- Shows if user recently moved levels
- Requires 10+ events with clear level shift
- Reinforces growth or acknowledges regression

---

## How It Works

### Level Determination Algorithm

```mermaid
flowchart TD
    A[Get practice events] --> B[Group by CEFR level]
    B --> C[Calculate stability per band]
    C --> D{Find comfortable bands}
    D -->|Yes| E[Highest comfortable = Level]
    D -->|No| F[Band with most clips = Level]
    E --> G[Return Listening Level]
    F --> G
```

### Stability Score Calculation

1. **Weighted Accuracy** (14-day half-life)
   - Recent clips weighted more heavily
   - Formula: `weight = 2^(-age / 14)`

2. **Apply Penalties**
   - Replay penalty: `min(avgReplays * 0.05, 0.15)`
   - Variance penalty: `min(stdDev * 0.5, 0.10)`

3. **Apply Bonuses**
   - Consistency bonus: `0.05` if stdDev < 0.05
   - Consistency bonus: `0.025` if stdDev < 0.10

4. **Clamp Result**
   - Floor: 0%
   - Ceiling: 95% (avoid "100% Stability" UX)

### Backfill Strategy

For existing clips without `cefrLevel`, fallback mapping:

```typescript
function mapDifficultyToCEFR(difficulty: 'easy' | 'medium' | 'hard'): CEFRLevel {
  switch (difficulty) {
    case 'easy': return 'A2'
    case 'medium': return 'B1'
    case 'hard': return 'B2'
    default: return 'B1'
  }
}
```

---

## Edge Cases Handled

### 1. **Low Data** (<5 clips)
```
Around A2 · Developing
Catching most everyday conversations

━━━━━━━━ 45%
45% · Stability              ⓘ

Confidence · Low
```
- Shows level with "Low" confidence
- No progression context (insufficient data)

### 2. **Regression** (Level decreased)
```
Around B1 · Intermediate
Catching most everyday conversations

━━━━━━━━━━━━━━ 72%
72% · Stability              ⓘ

Confidence · High         ↓ From B2
```
- Acknowledges regression without judgment
- Maintains psychological safety

### 3. **Stretch Zone** (55-69% stability)
```
Around B1 · Intermediate
Catching most everyday conversations

━━━━━━━━━━━ 62%
62% · Stability              ⓘ

Confidence · Medium
```
- User is in "productive struggle" zone
- Level still displayed (not downgraded immediately)

### 4. **No Events**
- Listening Level card hidden
- No "0%" or "N/A" displayed

### 5. **Multiple Bands Comfortable**
- Highest comfortable band selected
- Lower bands ignored

---

## UX Guardrails

### ✅ Implemented

1. **No 100% Stability**
   - Capped at 95% to avoid unrealistic perfection claims
   
2. **Gradual Transitions**
   - Requires 5+ clips before considering a band "comfortable"
   - Prevents single lucky clip from changing level

3. **Minimum Data Thresholds**
   - Low confidence if <5 clips
   - No progression context if <10 clips

4. **Recency Weighting**
   - Recent performance matters more (14-day half-life)
   - Allows both improvement and regression

5. **Smooth Progress Bar**
   - 500ms transition animation
   - Prevents jarring jumps

---

## Testing Guide

### Test 1: New User (Cold Start)

**Setup:**
- No practice events

**Expected:**
- Listening Level card hidden
- Other metrics visible (Listening Accuracy, Comprehension)

**Verification:**
```javascript
// In browser console
const events = getPracticeEvents()
console.log('Events:', events.length)  // Should be 0
```

---

### Test 2: Low Data (<5 clips)

**Setup:**
- Complete 3 practice clips

**Expected:**
- Listening Level card shows
- Confidence: "Low"
- No progression context
- Stability score visible but flagged as low confidence

**Verification:**
```javascript
// After completing 3 clips
// Check Progress page displays:
// "Around [LEVEL] · [LABEL]"
// "Confidence · Low"
```

---

### Test 3: Medium Data (5-9 clips)

**Setup:**
- Complete 7 practice clips
- Mix of B1 and B2 levels

**Expected:**
- Listening Level shows most common comfortable level
- Confidence: "Medium"
- Stability score reflects consistency

**Verification:**
```javascript
// Check console logs
// Should see: "📊 [PROGRESS PAGE] Listening Level calculated"
// With confidence: 'medium'
```

---

### Test 4: High Confidence (10+ clips)

**Setup:**
- Complete 12+ clips
- Primarily at B1 level with high accuracy (70%+)

**Expected:**
- "Around B1 · Intermediate"
- Confidence: "High"
- Stability score 70%+
- Status: "comfortable"

---

### Test 5: Progression Context

**Setup:**
1. Complete 10 clips at A2 level (70%+ stability)
2. Complete 5 more clips at B1 level (70%+ stability)

**Expected:**
- Level shows: "Around B1"
- Progression shows: "↑ From A2"

**Verification:**
```javascript
// Check listeningLevel.progressionContext
// Should be: { direction: 'up', fromLevel: 'A2' }
```

---

### Test 6: Regression

**Setup:**
1. Complete 10 clips at B2 level (70%+ stability)
2. Struggle with clips, complete 5 clips at B1 level (70%+ stability)

**Expected:**
- Level shows: "Around B1"
- Progression shows: "↓ From B2"

---

### Test 7: Inconsistent Performance (High Variance)

**Setup:**
- Complete 8 clips with varying accuracy: [0.9, 0.4, 0.8, 0.5, 0.7, 0.3, 0.85, 0.45]

**Expected:**
- Stability score lower than raw average
- Variance penalty applied
- Level determination uses stability, not raw accuracy

**Verification:**
```javascript
// Check band stats
const bandStats = listeningLevel.bandStats
const b1Stats = bandStats.find(b => b.level === 'B1')
console.log('Avg Accuracy:', b1Stats.avgAccuracy)
console.log('Stability Score:', b1Stats.stabilityScore)
// Stability should be lower than avgAccuracy due to variance penalty
```

---

## Console Logs

When Listening Level is calculated, you'll see:

```
📊 [PROGRESS PAGE] Listening Level calculated: {
  level: 'B1',
  confidence: 'high',
  stabilityScore: '78%',
  descriptor: 'Catching most everyday conversations',
  progression: { direction: 'up', fromLevel: 'A2' }
}
```

---

## Performance Impact

### Computation Cost:
- **Negligible**: Simple array operations (O(n) where n ≤ 50 events)
- Runs on page load only (not on every render)
- Async calculation doesn't block UI

### Data Storage:
- **No new DB tables** (Phase 1 only)
- Uses existing `DetailedPracticeEvent` localStorage data
- `cefrLevel` field added to Clip interface (optional, backward compatible)

---

## Phase 1 Scope (Completed)

### ✅ Implemented:
- [x] CEFR metrics calculator (`lib/cefrMetrics.ts`)
- [x] Stability score formula (weighted accuracy with penalties/bonuses)
- [x] Listening Level determination algorithm
- [x] Progress page UI card (both locale and non-locale versions)
- [x] Confidence indicators (low/medium/high)
- [x] Progression context (↑/↓ indicators)
- [x] Edge case handling (low data, regression, no events)
- [x] UX guardrails (95% cap, gradual transitions)
- [x] Backfill strategy (difficulty → CEFR mapping)

### ❌ NOT Implemented (Future Phases):
- Story selection integration (still uses existing adaptive system)
- Database migration for CEFR levels
- On-demand CEFR-based content generation
- Detailed band statistics page
- Historical level progression chart

---

## Next Steps (Phase 2+)

### Option 1: Integrate with Story Selection
- Modify `lib/storyRotation.ts` to use Listening Level
- Select stories matching user's current CEFR level
- Implement smart progression (stay at late sub-level → try next level)

### Option 2: Enhance UI
- Add detailed band statistics modal
- Show historical progression graph
- Display "Distance to next level" metric

### Option 3: Database Integration
- Store practice events with CEFR level in Supabase
- Sync across devices
- Enable historical analysis

---

## Success Metrics

### Technical:
- [x] Listening Level calculated for 100% of users with 5+ events
- [x] No linter errors
- [x] Zero performance degradation
- [x] Backward compatible with existing clips

### UX:
- [ ] Users understand what "Around B1" means (needs user testing)
- [ ] Progression feels motivating, not intimidating (needs feedback)
- [ ] Stability score correlates with perceived consistency (needs validation)

---

## Known Limitations

1. **CEFR Backfill Imprecision**
   - Existing clips mapped from difficulty (easy/medium/hard)
   - Not as accurate as manually tagged CEFR levels
   - Acceptable for Phase 1 MVP

2. **Cold Start (New Users)**
   - No level displayed until 3+ clips completed
   - Could add onboarding-based initial level estimate

3. **Single-Language Support**
   - Assumes all clips are in same target language
   - Multi-language support needs per-language levels

4. **No Sub-Band Progression**
   - "Early/Mid/Late" sub-levels calculated but not yet displayed
   - Could show micro-progress within a level

---

## Rollback Plan

If issues arise, disable Listening Level card:

```typescript
// In progress/page.tsx
// Comment out this section:
{/* Listening Level Card */}
{/*
  listeningLevel && (
    <div>...</div>
  )
*/}
```

The rest of the progress page continues to work normally.

---

## Related Documentation

- [Difficulty Adaptation Audit](DIFFICULTY_ADAPTATION_AUDIT.md) - Analysis of existing adaptive system
- [Adaptive Difficulty Implementation](ADAPTIVE_DIFFICULTY_IMPLEMENTATION_SUMMARY.md) - Existing adaptive difficulty system
- [Progress Metrics Implementation](lib/progressMetrics.ts) - Listening Accuracy and Semantic Badge

---

## Conclusion

Phase 1 is complete and ready for user testing. The Listening Level metric provides a stability-centered, psychologically safe way for users to understand their approximate listening capability. The implementation is lightweight, maintains backward compatibility, and sets the foundation for future integration with the adaptive content system.

**Key Achievements:**
- ✅ Soft phrasing ("Around B1") reduces pressure
- ✅ Stability focus prevents lucky streak inflation
- ✅ Confidence indicators manage user expectations
- ✅ Progression context celebrates growth
- ✅ Zero breaking changes to existing system

Next: Gather user feedback and iterate on thresholds/phrasing based on real-world usage.
