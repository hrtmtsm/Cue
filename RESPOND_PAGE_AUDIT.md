# Respond Page "Type / Speak + Check Answer" Feature Audit

## 1. LOCATION & COMPONENT STRUCTURE

**File**: `app/(app)/practice/respond/page.tsx`
- **Component**: `RespondPageContent` (wrapped in `RespondPage` with Suspense)
- **Lines**: 40-1710

**Key State Variables**:
- `inputMode`: `'type' | 'speak'` (line 53) - Controls active tab
- `userInput`: `string` (line 54) - Stores typed text
- `handleCheckAnswer`: Function (line 1463) - CTA handler

## 2. TYPE MODE IMPLEMENTATION

### ✅ Already Working:

**Textarea Input** (lines 1653-1665):
- ✅ Textarea exists with `id="answer-input"`
- ✅ State: `userInput` (line 54) stores typed text
- ✅ Controlled input: `value={userInput}`, `onChange={(e) => setUserInput(e.target.value)}`
- ✅ Placeholder: "Type what you heard..."
- ✅ Styling: Full width, 40px height, rounded, focus states

**Check Answer Button** (lines 1683-1695):
- ✅ Button exists with `onClick={handleCheckAnswer}`
- ✅ Disabled when `inputMode === 'type' && !userInput.trim()`
- ✅ Visual feedback: Blue when enabled, gray when disabled

**Navigation to Review** (lines 1463-1482):
- ✅ `handleCheckAnswer()` function is wired
- ✅ Routes to `/practice/review` with `userText` query param
- ✅ Supports multiple routing modes:
  - Story-based: `?storyId=...&clipId=...&userText=...`
  - Clip-based: `?clip=...&userText=...`
  - Session-based: `?session=...&index=...&userText=...`

### 🟡 Partially Implemented:

**Answer Comparison**:
- 🟡 **NOT done in Respond page** - just passes `userText` to review page
- 🟡 Review page uses `generateFeedback()` (line 161 in review/page.tsx)
- 🟡 `generateFeedback()` does basic comparison but **no accuracy score**
- 🟡 Uses simple heuristics (word count, phrase matching) - not true diff/accuracy

**API Endpoint**:
- 🟡 `/api/check-answer/route.ts` exists with similarity calculation
- 🟡 **NOT currently used** - Respond page doesn't call it
- 🟡 API has Levenshtein distance similarity (0-1 score)
- 🟡 API returns `{ correct, message, similarity }` but never called

### ❌ Missing:

- ❌ No accuracy score calculation in Respond page
- ❌ No immediate feedback (correct/incorrect) before navigation
- ❌ No diff highlighting
- ❌ No result storage/persistence
- ❌ Check-answer API not integrated

## 3. SPEAK MODE IMPLEMENTATION

### ❌ Missing (Purely Placeholder):

**UI** (lines 1667-1678):
- ❌ Placeholder div with message: "Speak functionality coming soon"
- ❌ No microphone access
- ❌ No speech recognition
- ❌ No recording functionality
- ❌ No transcription

**State/Logic**:
- ❌ No mic permission handling
- ❌ No Web Speech API integration
- ❌ No recording state management
- ❌ No audio recording/playback
- ❌ No transcription service

## 4. TRANSCRIPT/ANSWER REFERENCES

**Transcript Loading** (lines 407-683):
- ✅ Loaded from story data via `getStoryByIdClient()` (line 458)
- ✅ Falls back to sessionStorage (line 471) and localStorage (line 75 in review/page.tsx)
- ✅ Stored in `practiceData.transcript` (line 510)
- ✅ Used internally for audio generation

**Transcript Display**:
- ❌ **NOT shown to user** - page says "No text shown yet" (line 1573)
- ❌ Transcript is only used internally for audio generation
- ❌ User never sees the correct answer until review page

**Answer Comparison**:
- 🟡 Happens in review page, not respond page
- 🟡 Uses `generateFeedback()` which does heuristic matching
- 🟡 No true diff/accuracy calculation

## 5. SUMMARY: What's Working vs Missing

### ✅ Already Working:
- Type mode textarea with state management
- Check answer button with validation (disabled when empty)
- Navigation to review page with user input
- Transcript loading from story/session data
- Input mode toggle (Type/Speak tabs)
- Empty state handling for transcript

### 🟡 Partially Implemented:
- Answer comparison exists in review page (`generateFeedback()`) but:
  - No accuracy score
  - No diff calculation
  - Uses simple heuristics, not true comparison
- Check-answer API exists (`/api/check-answer/route.ts`) but:
  - Never called from Respond page
  - Has similarity calculation but unused

### ❌ Missing:
- **Type Mode**:
  - No accuracy score calculation
  - No immediate feedback (correct/incorrect)
  - No diff highlighting
  - No result storage/persistence
  - Check-answer API not integrated
  
- **Speak Mode**:
  - No microphone access
  - No speech recognition
  - No recording functionality
  - No transcription
  - Purely placeholder UI

- **General**:
  - Transcript not shown to user (only used internally)
  - No comparison happens in Respond page (only in Review page)

## 6. NEXT MINIMAL STEP

**Recommended**: Integrate check-answer API into Respond page

**Why**: 
- API already exists and has similarity calculation
- Would provide immediate feedback before navigation
- Minimal change - just add API call before routing

**Implementation**:
1. Call `/api/check-answer` in `handleCheckAnswer()` before navigation
2. Show accuracy score/similarity in UI (optional toast or inline)
3. Still navigate to review page (existing flow)
4. Pass accuracy data to review page via query params

**Alternative (even smaller)**: 
- Just call the API and log the result (no UI change)
- Verify the API works with real data
- Then add UI feedback in next step

## 7. FILE LOCATIONS & KEY FUNCTIONS

**Respond Page**:
- File: `app/(app)/practice/respond/page.tsx`
- Function: `handleCheckAnswer()` (line 1463)
- State: `userInput` (line 54), `inputMode` (line 53)
- Component: `RespondPageContent` (line 40)

**Review Page**:
- File: `app/(app)/practice/review/page.tsx`
- Function: `generateFeedback()` (line 161) - calls `lib/mockFeedbackGenerator.ts`
- Receives: `userText` from query params (line 42)

**Check Answer API**:
- File: `app/api/check-answer/route.ts`
- Function: `POST` handler (line 3)
- Returns: `{ correct, message, similarity }`
- Uses: Levenshtein distance for similarity (line 49)**Feedback Generator**:
- File: `lib/mockFeedbackGenerator.ts`
- Function: `generateFeedback()` (line 4)
- Logic: Heuristic-based, no true accuracy score