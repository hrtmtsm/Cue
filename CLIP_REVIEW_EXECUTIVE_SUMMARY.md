# Clip Review: Executive Summary

**Date:** 2026-01-29  
**Analyst:** AI Assistant  
**Database:** `scripts/clip-templates.csv` (300 clips)

---

## 🎯 KEY FINDINGS

### ✅ STRENGTHS
1. **Native English Quality:** EXCELLENT - All clips use authentic, natural phrasing
2. **No exact duplicates:** All 300 clips are unique
3. **CEFR Progression:** Good difficulty scaling from A1 to B2
4. **Common patterns covered:** "gonna", "wanna", "gotta", "should've", "didja" well represented

### ⚠️ WEAKNESSES
1. **"gonna" overuse:** 157 clips (52%) - WAY too much
2. **Pattern monotony:** 6 main patterns, missing 10+ common native reductions
3. **Structural repetition:** Many clips differ only by object/verb substitution
4. **B2 clips too long:** Many 15-25 word run-on sentences (unnatural for speech)
5. **Limited variety:** Same structures repeated dozens of times

---

## 📊 PATTERN BREAKDOWN

| Pattern | Count | % of Total | Assessment |
|---------|-------|------------|------------|
| **gonna** | 157 | 52% | ❌ OVERUSED - Reduce by 50% |
| **should've/could've/would've** | 53 | 18% | ⚠️ Slightly high - Reduce by 20% |
| **gotta** | 28 | 9% | ✅ Good |
| **wanna** | 21 | 7% | ✅ Good |
| **didja** | 21 | 7% | ✅ Good |
| **It's kind of** | 21 | 7% | ⚠️ Slightly high - Reduce by 40% |
| **lemme** | 0 | 0% | ❌ MISSING - Add 10 |
| **gimme** | 0 | 0% | ❌ MISSING - Add 10 |
| **dunno** | 0 | 0% | ❌ MISSING - Add 10 |
| **hafta** | 0 | 0% | ❌ MISSING - Add 10 |
| **whaddya/whatcha** | 0 | 0% | ❌ MISSING - Add 10 |
| **outta** | 0 | 0% | ❌ MISSING - Add 5 |
| **betcha** | 0 | 0% | ❌ MISSING - Add 5 |
| **kinda/sorta** | 0 | 0% | ❌ MISSING - Add 10 |

---

## 🚨 IMMEDIATE ACTION REQUIRED

### 1. Remove Unnatural B2 Clips (7 clips)
**Priority: CRITICAL**

These clips are 18-25 words and sound like written text, not speech:

```
❌ clip-practice-293 (20 words)
❌ clip-practice-295 (18 words)
❌ clip-practice-296 (20 words)
❌ clip-practice-297 (20 words)
❌ clip-practice-298 (20 words)
❌ clip-practice-299 (19 words)
❌ clip-practice-300 (25 words) ← WORST OFFENDER
```

**Example of WORST clip:**
> "You shoulda known I was gonna need your help when I told you I was gonna start this new project and I'd never done anything like it before but you were gonna be busy with your own work so I understand why you couldn't help"

**Why remove:** No native speaker says this in one breath. Would be broken into 3-4 separate utterances.

---

### 2. Reduce "gonna" Clips (Remove ~70 clips)
**Priority: HIGH**

**Current:** 157 clips (52% of database!)  
**Target:** 80 clips (27%)  
**Remove:** 70 clips with most repetitive structures

**Keep:**
- "I'm gonna grab some coffee" ✅ (super common)
- "She's gonna call you back" ✅ (natural promise)
- "We're gonna start at three" ✅ (specific time)

**Remove:**
- "He's gonna park the car" ❌ (generic, less useful)
- "They're gonna play outside" ❌ (redundant)
- "I'm gonna prepare the presentation" ❌ (formal)

See `CLIPS_TO_REMOVE.txt` for full list.

---

### 3. Add Missing Patterns (Add 70-80 clips)
**Priority: HIGH**

**Patterns to add:**
- **"lemme"** (let me) - 10 clips
- **"gimme"** (give me) - 10 clips
- **"dunno"** (don't know) - 10 clips
- **"hafta"** (have to) - 10 clips
- **"whaddya/whatcha"** - 10 clips
- **"outta"** (out of) - 6 clips
- **"betcha"** (bet you) - 5 clips
- **"kinda/sorta"** - 10 clips

**Why:** These are extremely common in native speech but completely missing from database.

**Examples:**
- "Lemme think about it" ✅
- "Gimme a minute" ✅
- "I dunno what to do" ✅
- "I hafta go now" ✅
- "Whatcha doing?" ✅

See `NEW_CLIPS_TO_ADD.csv` for full list of 80 new clips.

---

## 📈 EXPECTED OUTCOME

### Before Cleanup
- **Total clips:** 300
- **"gonna" dominance:** 52%
- **Pattern variety:** 6 patterns
- **Missing patterns:** 8-10 common reductions
- **User experience:** Repetitive, monotonous

### After Cleanup
- **Total clips:** 280-290
- **"gonna" representation:** 27-30%
- **Pattern variety:** 14+ patterns
- **Missing patterns:** 0
- **User experience:** Varied, engaging, authentic

---

## 🎯 DETAILED REPORTS

Three comprehensive documents have been created:

1. **`CLIP_ANALYSIS_REPORT.md`** (Full analysis)
   - 12 sections covering all aspects
   - Pattern analysis, duplicates, naturalness
   - Specific problematic clips identified
   - Recommendations for each category

2. **`CLIPS_TO_REMOVE.txt`** (Action list)
   - ~95 specific clip IDs to remove
   - Organized by priority
   - Reasons for each removal

3. **`NEW_CLIPS_TO_ADD.csv`** (Replacement clips)
   - 80 new clips ready to import
   - All missing patterns covered
   - Natural, authentic phrasing
   - Properly categorized by CEFR

---

## ✅ NEXT STEPS

### Step 1: Review & Approve
- [ ] Review the 7 critical B2 clips to remove
- [ ] Approve pattern reduction strategy
- [ ] Approve new pattern additions

### Step 2: Database Cleanup
```bash
# Option A: Manual removal via Supabase dashboard
# - Open Supabase dashboard
# - Navigate to curated_clips table
# - Delete clips listed in CLIPS_TO_REMOVE.txt

# Option B: Script-based removal (recommended)
# Create script: scripts/removeClips.ts
# Run: npx tsx scripts/removeClips.ts
```

### Step 3: Add New Clips
```bash
# Import new clips from CSV
npx tsx scripts/importCuratedClips.ts NEW_CLIPS_TO_ADD.csv
```

### Step 4: Verify
```bash
# Check final counts
SELECT pattern_key, COUNT(*) 
FROM curated_clips 
WHERE clip_type = 'practice' 
GROUP BY pattern_key 
ORDER BY COUNT(*) DESC;

# Should see:
# - gonna: ~80 clips (27%)
# - lemme: 10 clips
# - gimme: 10 clips
# - dunno: 10 clips
# - etc.
```

---

## 💡 QUALITY GUIDELINES FOR FUTURE CLIPS

### ✅ GOOD Clips
- **Short & natural:** 2-6 words for A1, 10-12 words max for B2
- **Conversational:** Sounds like actual speech, not written text
- **Common phrases:** Things native speakers actually say daily
- **Variety:** Different verbs, objects, contexts within pattern

**Examples:**
- "I'm gonna grab some coffee" ✅
- "Lemme think about it" ✅
- "Gimme a minute" ✅

### ❌ BAD Clips
- **Too long:** 15+ words (especially for B2)
- **Run-on sentences:** Multiple clauses without pauses
- **Formal language:** "attend the conference", "prepare the presentation"
- **Redundant:** Only object changes from another clip

**Examples:**
- "You shoulda known I was gonna need your help when I told you..." ❌
- "I'm gonna prepare the presentation" ❌
- "You're gonna attend the conference" ❌

---

## 📞 QUESTIONS?

For detailed analysis, see:
- **`CLIP_ANALYSIS_REPORT.md`** - Full 12-section report
- **`CLIPS_TO_REMOVE.txt`** - Specific removal list
- **`NEW_CLIPS_TO_ADD.csv`** - Ready-to-import replacements

---

**Summary:** Database is high-quality but needs rebalancing. Remove ~95 redundant clips, add 80 new patterns. Result: More varied, engaging, authentic content for learners.

**Estimated Time:** 2-3 hours for complete database update

**Impact:** Significantly improved user experience, less repetition, more authentic native speech patterns

---

**End of Summary**



