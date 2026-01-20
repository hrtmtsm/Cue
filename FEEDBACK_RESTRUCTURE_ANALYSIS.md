# Feedback Content Structure Analysis & Implementation Plan

## 1. Current File Map & Data Flow

### Routes & Pages
- **Review Page**: `app/(app)/practice/review/page.tsx`
  - URL: `/practice/review?storyId=...&clipId=...&userText=...`
  - Shows summary with "Compared to what you heard" section
  - Generates review summary via `pickTopIssue()` from `lib/reviewSummary.ts`

- **Practice Page**: `app/(app)/practice/[clipId]/practice/page.tsx`
  - URL: `/practice/[clipId]/practice`
  - Shows individual practice steps with phrase cards
  - Uses `extractPracticeSteps()` from `lib/practiceSteps.ts`

### Components
- **PhraseCard**: `components/PhraseCard.tsx`
  - Currently displays: `phrase`, `meaning`, `howItSounds`
  - Used in practice flow to show feedback for each missed item

- **StepDiff**: `components/StepDiff.tsx`
  - Shows "Compared to what you heard" diff view

### Data Generation Logic
- **Primary Generator**: `lib/practiceSteps.ts`
  - `extractPracticeSteps()` - extracts top 3-5 mistakes from alignment events
  - `generateMeaning()` - generates context-specific meaning (hardcoded dictionary)
  - `generateHowItSounds()` - generates sound explanations (hardcoded reductions)

- **LLM-Based Insight**: `lib/coachingInsights.ts`
  - `generateCoachingInsight()` - generates detailed insight via OpenAI
  - Used by `/api/insight` route (called when tapping error tokens)
  - Returns `CoachingInsight` with: `title`, `what_you_might_have_heard`, `what_it_was`, `why_this_happens_here`, `try_this`

### Data Types
- **AlignmentEvent**: `lib/alignmentEngine.ts`
  - Contains: `eventId`, `type`, `expectedSpan`, `actualSpan`, `refStart`, `refEnd`, `context`, `phraseHint`

- **PracticeStep**: `lib/practiceSteps.ts`
  - Current: `id`, `expectedSpan`, `actualSpan`, `refStart`, `refEnd`, `type`, `meaning`, `howItSounds`

## 2. Current Logic Explanation

### Inputs Used
1. **Alignment Events** - from `/api/check-answer` response
   - `events`: Array of `AlignmentEvent` (missing, substitution, extra)
   - `refTokens`: Reference transcript tokens
   - `userTokens`: User input tokens
   - `transcript`: Full reference text
   - `userText`: Full user input

2. **Token-level diff** - from alignment engine (Levenshtein-based)

### Current Generation Rules

#### "Meaning" Generation (`generateMeaning()`)
- Uses hardcoded dictionary of 18 common phrases
- Falls back to generic messages based on error type:
  - `missing`: "This phrase connects other words together."
  - `substitution`: "A small phrase that can sound different in fast speech."

#### "How it sounds" Generation (`generateHowItSounds()`)
- Uses hardcoded dictionary of 13 reductions (e.g., "have you" → "Often blends into 'hav-ya'")
- Falls back to generic messages based on error type:
  - `missing`: "Words often blend together when spoken quickly."
  - `substitution`: "Can sound different from how it looks when written."

#### "Example" Selection
- Currently NO extra example sentence - only uses phrase from original sentence
- `extractPracticeSteps()` prioritizes `phraseHint` events (multi-word spans)
- Expands single words to 2-5 word phrases by including context

### Issues with Current Approach
1. ❌ No context-aware meaning (always uses dictionary or generic fallback)
2. ❌ No "how it sounded in original sentence" field
3. ❌ No transfer example (another sentence using same word/phrase)
4. ❌ No category classification (weak form, linking, elision, etc.)
5. ❌ No listening tips
6. ❌ Hardcoded reductions don't cover all cases (e.g., "you're", "I'm", "we're")

## 3. Proposed New Structure

```typescript
export type FeedbackCategory = 
  | 'weak_form'      // Function words reduced (the, to, and → thuh, ta, n)
  | 'linking'        // Words blend at boundaries (want to → wanna)
  | 'elision'        // Sounds dropped (going to → gonna)
  | 'contraction'    // Contractions (you're → yer, I'm → im)
  | 'similar_words'  // Phonetically similar words (a/the, your/you're)
  | 'missed'         // Generic missed content
  | 'speed_chunking' // Fast speech chunking

export interface FeedbackItem {
  // Existing fields
  id: string
  target: string                    // The word/phrase (expectedSpan)
  actualSpan?: string               // What user heard/typed
  refStart: number
  refEnd: number
  type: 'missing' | 'substitution' | 'extra'
  
  // NEW: Categorized feedback
  category: FeedbackCategory
  
  // NEW: Enhanced feedback fields
  meaningInContext: string          // What this word/phrase means IN THIS sentence (1-2 sentences)
  soundRule: string                 // What happens to the sound in fast speech (phonetic/weak-form/linking)
  inSentence: {                     // How it sounded in the ORIGINAL sentence
    original: string                 // Full original sentence with highlighted target
    highlighted: string              // Just the target phrase
    heardAs: string                  // How it sounds (e.g., "later" → "layder")
  }
  extraExample: {                   // Transfer example - another sentence
    sentence: string                 // New sentence using same word/phrase
    heardAs?: string                 // Optional: how it sounds in this new context
  }
  tip?: string                      // Optional: Short listening tip
}
```

## 4. Implementation Plan

### Step 1: Update Type Definitions
- Add `FeedbackCategory` type
- Update `PracticeStep` interface to match `FeedbackItem` (or extend it)
- Ensure backward compatibility

### Step 2: Update Generation Logic (`lib/practiceSteps.ts`)
- Create `generateFeedbackItem()` function that:
  1. Detects category from phrase/context
  2. Generates context-aware `meaningInContext` using transcript context
  3. Generates `soundRule` with phonetic explanation
  4. Creates `inSentence` object with original sentence and "heardAs" approximation
  5. Generates `extraExample` sentence (simple template-based or LLM if needed)
  6. Optionally generates `tip`

### Step 3: Update UI Component (`components/PhraseCard.tsx`)
- Add new sections:
  - Meaning (enhanced with context)
  - Sound rule (phonetic/weak-form/linking)
  - "In this sentence: [original] - often sounds like '[heardAs]'"
  - "Another example: [extraExample.sentence]"
  - Optional tip section

### Step 4: Add Validation
- Runtime checks in `extractPracticeSteps()` to ensure required fields
- Contraction defaults for "you're" → "yer", "I'm" → "im", etc.

## 5. Code Changes

See implementation below.


