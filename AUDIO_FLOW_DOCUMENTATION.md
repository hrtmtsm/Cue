# Audio Flow Documentation & Error Tracking

## A) Current Flow (Post-Fixes)

### Step-by-Step Flow from User Opens Respond Page

1. **Page Load / Component Mount**
   - **File**: `app/(app)/practice/respond/page.tsx`
   - **Function**: `RespondPageContent` component mounts
   - **State**: `uiPhase='boot'`, `audioStatus='needs_generation'`, `transcript='Loading...'`
   - **Runs even when transcript is empty**: Yes

2. **Initial useEffect Hook (clipId change)**
   - **File**: `app/(app)/practice/respond/page.tsx`
   - **Function**: `useEffect(() => {...}, [effectiveClipId, storyId, storyClipId, clipId])`
   - **What it does**: 
     - Resets state, stops polling
     - Validates `effectiveClipId` exists
     - Loads transcript from story data (via `getStoryByIdClient`) or sessionStorage
     - Sets `transcript` (may be empty temporarily)
     - Calls `loadAudioMetadata()` async function
   - **State variables**: `uiPhase`, `practiceData.transcript`, `practiceData.audioStatus`
   - **Runs even when transcript is empty**: Yes (calls `loadAudioMetadata()` with empty string)

3. **loadAudioMetadata() Function**
   - **File**: `app/(app)/practice/respond/page.tsx`
   - **Function**: `loadAudioMetadata` (defined inside useEffect)
   - **What it does**:
     - Calls `getAudioMetadata(effectiveClipId, transcript || '', 'clean_normal')`
     - Server fallback: if transcript is empty, server returns latest ready audio for that clip
     - Updates `practiceData.audioUrl` and `practiceData.audioStatus` based on response:
       - `'ready'` + `audioUrl` → sets ready, `uiPhase='ready'`
       - `'generating'` → starts polling (if transcript exists), else `uiPhase='waiting_transcript'`
       - `'needs_generation'` → auto-triggers generation (if transcript exists), else `uiPhase='waiting_transcript'`
       - `'error'` → sets error state
   - **State variables**: `practiceData.audioUrl`, `practiceData.audioStatus`, `uiPhase`
   - **Runs even when transcript is empty**: Yes (server fallback path)

4. **Auto-trigger Generation (if needed)**
   - **File**: `app/(app)/practice/respond/page.tsx`
   - **Function**: `triggerGeneration(clipId, transcript, storyId)`
   - **What it does**:
     - Validates transcript is non-empty (returns early if empty)
     - Guards against duplicate generation requests
     - Tries streaming first (`streamAudio()`)
     - Falls back to non-streaming (`generateAudio()`)
     - Sets `audioStatus='generating'` then `'ready'` or `'error'`
   - **State variables**: `practiceData.audioStatus`, `practiceData.audioUrl`
   - **Runs even when transcript is empty**: No (early return if empty)

5. **Audio Element Creation**
   - **File**: `app/(app)/practice/respond/page.tsx`
   - **Function**: `useEffect(() => {...}, [practiceData?.audioUrl, practiceData?.audioStatus, ...])`
   - **What it does**:
     - Only runs when `audioStatus === 'ready'` AND `audioUrl` is valid (http/blob URL)
     - Creates `new Audio(audioUrl)` with `preload='auto'`
     - Attaches event handlers: `error`, `loadeddata`, `play`, `pause`, `ended`
     - Cleans up previous audio element
   - **State variables**: `audioRef.current`, `objectUrlRef.current`
   - **Runs even when transcript is empty**: No (requires `audioStatus='ready'`)

6. **User Clicks Play Button**
   - **File**: `app/(app)/practice/respond/page.tsx`
   - **Function**: `handlePlayPause()`
   - **What it does**:
     - Checks `isAudioPlayable` (derived state: `audioStatus==='ready'` && valid URL && `audioRef.current.src` exists)
     - If NOT playable:
       - If transcript empty: returns silently (no error)
       - If transcript exists but `audioUrl` missing: shows "Preparing..." toast, calls `loadAudioMetadata()`, may trigger generation
       - If `audioRef.current` is null: shows "Preparing..." toast, returns
     - If playable: calls `audioRef.current.play()`
   - **State variables**: `isPlaying`, `userPlayToastOpen`
   - **Runs even when transcript is empty**: Yes (but returns early if transcript empty)

7. **Audio Playback**
   - **File**: `app/(app)/practice/respond/page.tsx`
   - **Function**: `audioRef.current.play()` (native browser API)
   - **What it does**: Starts audio playback
   - **State variables**: `isPlaying` (updated via `play` event listener)
   - **Runs even when transcript is empty**: No (only if `isAudioPlayable` is true)

## B) Error Banner Trigger Points

The "Audio problem" banner is shown when `uiPhase === 'error' && audioStatus === 'error'`. The banner is triggered by setting `audioStatus='error'` in one of these locations:

### All Error Trigger Points (with structured logging)

1. **`triggerGeneration_transcript_empty`**
   - **Location**: `triggerGeneration()` function, line ~227
   - **Condition**: Transcript is empty when trying to generate
   - **Should trigger banner**: No (this is a validation error, not a real audio failure)
   - **Fix needed**: This should NOT set error when transcript is temporarily empty

2. **`triggerGeneration_api_failed`**
   - **Location**: `triggerGeneration()` function, line ~336
   - **Condition**: Generation API returns `success=false`
   - **Should trigger banner**: Yes (real API failure)

3. **`triggerGeneration_exception`**
   - **Location**: `triggerGeneration()` function, line ~346
   - **Condition**: Exception during generation
   - **Should trigger banner**: Yes (real exception)

4. **`useEffect_no_clipId`**
   - **Location**: Main `useEffect`, line ~381
   - **Condition**: `effectiveClipId` is null/undefined
   - **Should trigger banner**: Yes (invalid state)

5. **`useEffect_clip_not_found`**
   - **Location**: Main `useEffect`, line ~420
   - **Condition**: Clip not found in story data or sessionStorage
   - **Should trigger banner**: Yes (data not found)

6. **`loadAudioMetadata_db_error`**
   - **Location**: `loadAudioMetadata()` function, line ~488
   - **Condition**: Metadata API returns `audioStatus='error'`
   - **Should trigger banner**: Yes (DB explicitly says error)

7. **`loadAudioMetadata_fetch_failed`**
   - **Location**: `loadAudioMetadata()` function, line ~504
   - **Condition**: Exception during metadata fetch AND transcript exists
   - **Should trigger banner**: Yes (real fetch failure, transcript available)

8. **`useEffect_exception`**
   - **Location**: Main `useEffect` catch block, line ~530
   - **Condition**: Exception in useEffect
   - **Should trigger banner**: Yes (real exception)

9. **`audio_element_error_event`** ⚠️ **LIKELY CULPRIT**
   - **Location**: `handleAudioError()` event handler, line ~656
   - **Condition**: Audio element fires `error` event AND `currentSrc` is non-empty AND `audioStatus==='ready'`
   - **Should trigger banner**: Yes (real media load failure)
   - **Potential issue**: May fire if user clicks play before audio element is fully ready, even if `currentSrc` is set

10. **`handleAudioEnded_replay_error`**
    - **Location**: `handleAudioEnded()` event handler, line ~690
    - **Condition**: Error replaying audio in loop mode (not `NotAllowedError`)
    - **Should trigger banner**: Yes (real replay failure)

11. **`startPolling_metadata_error`**
    - **Location**: `startPolling()` function, line ~208
    - **Condition**: Polling metadata returns `audioStatus='error'`
    - **Should trigger banner**: Yes (DB explicitly says error)

12. **`handleRetry_metadata_error`**
    - **Location**: `handleRetry()` function, line ~956
    - **Condition**: Retry metadata returns `audioStatus='error'`
    - **Should trigger banner**: Yes (DB explicitly says error)

13. **`handleRetry_api_exception`**
    - **Location**: `handleRetry()` function, line ~961
    - **Condition**: Exception during retry metadata fetch
    - **Should trigger banner**: Yes (real exception)

14. **`handleGenerateAudio_no_storyId`**
    - **Location**: `handleGenerateAudio()` function, line ~976
    - **Condition**: `storyId` is missing
    - **Should trigger banner**: Yes (invalid state)

15. **`handleGenerateAudio_queue_error`**
    - **Location**: `handleGenerateAudio()` function, line ~1002
    - **Condition**: Queue callback returns error
    - **Should trigger banner**: Yes (real queue error)

## C) How to Reproduce & Debug

1. **Open respond page** where it shows "No text shown yet"
2. **Tap Play button**
3. **Check console** for structured logs:
   - `🎮 [AUDIO_FLOW] Play button clicked:` - Shows state when play is clicked
   - `📞 [AUDIO_FLOW] loadAudioMetadata called:` - Shows when metadata is fetched
   - `📥 [AUDIO_FLOW] loadAudioMetadata response:` - Shows metadata response
   - `🔴 [AUDIO_FLOW] ERROR TRIGGERED:` - Shows which error path was taken

4. **Look for the `reason` field** in the error log to identify the exact trigger point

## D) Expected Root Cause

Based on the code analysis, the most likely culprit is:

**`audio_element_error_event`** - The audio element's `error` event may fire when:
- User clicks Play before audio element is fully loaded (even if `currentSrc` is set)
- Audio URL is not yet accessible (CDN propagation delay)
- Network issue during playback

The current guard (`currentSrc` non-empty) may not be sufficient if the audio element has a `src` but hasn't started loading yet.

## Minimal Fix Strategy

1. **Prevent error banner when user clicks Play before ready**:
   - Ensure `handlePlayPause()` never triggers an error state
   - Only show "Preparing..." toast, never set `audioStatus='error'`

2. **Tighten audio element error handler**:
   - Only set error if `networkState !== 0` (EMPTY) AND `readyState >= 1` (HAVE_METADATA)
   - This ensures the audio element actually attempted to load

3. **Remove error trigger for empty transcript in `triggerGeneration`**:
   - Don't set error when transcript is empty; just return early
   - This is expected behavior, not an error

