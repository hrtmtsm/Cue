# Typography Audit Report - Cue Web App

**Date:** 2025-02-03  
**Scope:** Practice, Progress, Profile pages + Sidebar + Shared UI components  
**Method:** Static code analysis (no runtime inspection)

---

## 1. File Map

### Pages
- **Practice (Home):** `app/[locale]/(app)/practice/select/page.tsx`
- **Progress:** `app/[locale]/(app)/progress/page.tsx`
- **Profile:** `app/[locale]/(app)/profile/page.tsx`

### Shared Components
- **Sidebar:** `components/Sidebar.tsx`
- **BottomNav:** `components/BottomNav.tsx`
- **Typography System:** `components/ui/Typography.tsx` (Heading, Body, Label, Caption, Numeric)
- **StatCard:** Inline component in `progress/page.tsx`

### Custom CSS Classes (globals.css)
- `.text-display` - text-3xl, font-bold, tracking-tight (30px)
- `.text-heading-1` - text-3xl, font-bold, tracking-tight (30px)
- `.text-heading-2` - text-xl, font-bold (20px)
- `.text-heading-3` - text-lg, font-semibold (18px)
- `.text-body-large` - text-base, font-medium (16px)
- `.text-body` - text-base (16px)
- `.text-body-small` - text-sm (14px)
- `.text-label` - text-xs, font-medium, uppercase, tracking-wide (12px)

---

## 2. Typography Inventory

### Practice Page (`app/[locale]/(app)/practice/select/page.tsx`)

| Visible Text | Component | File | Font Size | Font Weight | Line Height | Text Color | Notes |
|-------------|-----------|------|-----------|-------------|-------------|------------|-------|
| "👋 Hi {name}" | `<h1>` | practice/select | `text-heading-2` (20px) | `font-bold` | default | `text-gray-900` | Uses custom class |
| "{streak} day streak" | `<span>` | practice/select | `text-sm` | `font-semibold` | default | `text-orange-900` | Inline Tailwind |
| "Back" | `<Link>` | practice/select | `text-lg` | `font-medium` | default | `text-blue-600` | Inline Tailwind |
| "No practice stories yet" | `<h2>` | practice/select | `text-heading-3` (18px) | `font-semibold` | default | `text-gray-900` | Uses custom class |
| "Complete the onboarding..." | `<p>` | practice/select | `text-body` (16px) | default (400) | default | `text-gray-600` | Uses custom class |
| "Start Onboarding" | `<Link>` (button) | practice/select | default (16px) | `font-semibold` | default | `text-white` | Inline Tailwind |
| "Today's Practice" | `<h2>` | practice/select | `text-heading-2` (20px) | `font-bold` | default | `text-gray-900` | Uses custom class |
| "Build your ear..." | `<p>` | practice/select | `text-body` (16px) | default (400) | default | `text-gray-600` | Uses custom class |
| "Quick session • ~1 minute" | `<div>` | practice/select | `text-body-small` (14px) | default (400) | default | `text-gray-500` | Uses custom class |
| "3 short clips" | `<div>` | practice/select | `text-body-small` (14px) | default (400) | default | `text-gray-500` | Uses custom class |
| "Start Practice →" | `<button>` | practice/select | `text-body-large` (16px) | `font-semibold` | default | `text-white` | Uses custom class |
| "{X} / {Y} stories completed" | `<p>` | practice/select | `text-body-small` (14px) | default (400) | default | `text-gray-500` | Uses custom class |
| "Clips from: Daily, Formal" | `<p>` | practice/select | `text-body-small` (14px) | default (400) | default | `text-gray-500` | Uses custom class |
| "Your Progress" | `<h3>` | practice/select | `text-heading-3` (18px) | `font-semibold` | default | `text-gray-900` | Uses custom class |
| "Keep showing up..." | `<p>` | practice/select | `text-body-small` (14px) | default (400) | default | `text-gray-600` | Uses custom class |
| "This week" | `<span>` | practice/select | `text-body-small` (14px) | default (400) | default | `text-gray-600` | Uses custom class |
| "3/7 days" | `<span>` | practice/select | `text-body` (16px) | `font-bold` | default | `text-gray-900` | Uses custom class + bold override |
| "Pick a story to practice" | `<h1>` | practice/select | `text-2xl` | `font-bold` | default | `text-gray-900` | Inline Tailwind (inconsistent) |
| "Practice with complete..." | `<p>` | practice/select | default (16px) | default (400) | default | `text-gray-600` | No size class |
| "No stories available..." | `<p>` | practice/select | `text-sm` | default (400) | default | `text-gray-500` | Inline Tailwind |
| "Great work today!" | `<h2>` | practice/select | `text-heading-2` (20px) | `font-bold` | default | `text-gray-900` | Uses custom class |
| "Completed daily practice" | `<p>` | practice/select | `text-body` (16px) | default (400) | default | `text-gray-600` | Uses custom class |
| "Next session available..." | `<div>` | practice/select | `text-sm` | default (400) | default | `text-gray-500` | Inline Tailwind |
| "💎 Want to practice more?" | `<p>` | practice/select | `text-base` | `font-medium` | default | `text-gray-900` | Inline Tailwind |
| "Upgrade to Pro" | `<p>` | practice/select | `text-sm` | default (400) | default | `text-gray-700` | Inline Tailwind |
| "Learn About Pro" | `<button>` | practice/select | default (16px) | `font-semibold` | default | `text-white` | No size class |

### Progress Page (`app/[locale]/(app)/progress/page.tsx`)

| Visible Text | Component | File | Font Size | Font Weight | Line Height | Text Color | Notes |
|-------------|-----------|------|-----------|-------------|-------------|------------|-------|
| "Progress" | `<Heading>` | progress | `text-2xl → text-4xl` | `font-semibold` (600) | default | `text-gray-900` | Typography component |
| "Track your progress..." | `<Body>` | progress | `text-base → text-lg` | `font-normal` (400) | default | `text-gray-600` | Typography component |
| "{minutes} min" | `<Numeric>` | progress | default (inherits) | `font-medium` (500) | default | `text-gray-900` | Typography component, wrapped in StatCard |
| "Minutes" | `<Label>` | progress | `text-sm → text-base` | `font-medium` (500) | default | `text-gray-600` | Typography component |
| "{sessions}" | `<Numeric>` | progress | `text-2xl` | `font-medium` (500) | default | `text-gray-900` | Typography component + size override |
| "Sessions" | `<Label>` | progress | `text-sm → text-base` | `font-medium` (500) | default | `text-gray-600` | Typography component |
| "{streak}" | `<Numeric>` | progress | `text-2xl` | `font-medium` (500) | default | `text-gray-900` | Typography component + size override |
| "Streak" | `<Label>` | progress | `text-sm → text-base` | `font-medium` (500) | default | `text-gray-600` | Typography component |
| "All Time" | `<Heading>` | progress | `text-lg` | `font-semibold` (600) | default | `text-gray-900` | Typography component + size override |
| "Total Clips" | `<Label>` | progress | `text-sm → text-base` | `font-medium` (500) | default | `text-gray-600` | Typography component |
| "{totalClips}" | `<Numeric>` | progress | `text-2xl` | `font-medium` (500) | default | `text-gray-900` | Typography component + size override |
| "~{seconds} seconds" | `<Caption>` | progress | `text-xs → text-sm` | `font-normal` (400) | default | `text-gray-500` | Typography component |
| "Stories Completed" | `<Label>` | progress | `text-sm → text-base` | `font-medium` (500) | default | `text-gray-600` | Typography component |
| "{stories}" | `<Numeric>` | progress | `text-2xl` | `font-medium` (500) | default | `text-gray-900` | Typography component + size override |
| "Keep going!" / "Start your first session" | `<Caption>` | progress | `text-xs → text-sm` | `font-normal` (400) | default | `text-gray-500` | Typography component |
| "🎯 Complete your first..." | `<Body>` | progress | `text-sm` | `font-normal` (400) | default | `text-blue-900` | Typography component + size override |
| "🔥 {streak} day streak..." | `<Body>` | progress | `text-sm` | `font-normal` (400) | default | `text-orange-900` | Typography component + size override |
| "Vocab" | `<Heading>` | progress | `text-lg` | `font-semibold` (600) | default | `text-gray-900` | Typography component + size override |
| "Saved vocabulary" | `<Label>` | progress | `text-sm → text-base` | `font-medium` (500) | default | `text-gray-900` | Typography component |
| "{count} items · Last saved {date}" | `<Caption>` | progress | `text-xs → text-sm` | `font-normal` (400) | default | `text-gray-500` | Typography component |
| "No saved vocab yet" | `<Caption>` | progress | `text-xs → text-sm` | `font-normal` (400) | default | `text-gray-500` | Typography component |
| "Saved" | `<Heading>` | progress | `text-lg` | `font-semibold` (600) | default | `text-gray-900` | Typography component + size override |
| "Words" | `<Label>` | progress | `text-sm → text-base` | `font-medium` (500) | default | `text-gray-900` | Typography component |
| "Loading..." | `<Caption>` | progress | `text-xs → text-sm` | `font-normal` (400) | default | `text-gray-500` | Typography component |
| "{chunk_text}" | `<Label>` | progress | `text-sm → text-base` | `font-medium` (500) | default | `text-gray-900` | Typography component |
| "{meaning_en}" | `<Caption>` | progress | `text-xs → text-sm` | `font-normal` (400) | default | `text-gray-600` | Typography component |
| "+{count} more" | `<Caption>` | progress | `text-xs → text-sm` | `font-normal` (400) | default | `text-gray-500` | Typography component |
| "Phrases" | `<Label>` | progress | `text-sm → text-base` | `font-medium` (500) | default | `text-gray-900` | Typography component |
| "Tips" | `<Label>` | progress | `text-sm → text-base` | `font-medium` (500) | default | `text-gray-900` | Typography component |

### Profile Page (`app/[locale]/(app)/profile/page.tsx`)

| Visible Text | Component | File | Font Size | Font Weight | Line Height | Text Color | Notes |
|-------------|-----------|------|-----------|-------------|-------------|------------|-------|
| "Profile" | `<h1>` | profile | `text-2xl` | `font-bold` | default | `text-gray-900` | Inline Tailwind |
| "Account" | `<h2>` | profile | `text-lg` | `font-semibold` | default | `text-gray-900` | Inline Tailwind |
| "Name" | `<div>` | profile | `text-sm` | default (400) | default | `text-gray-600` | Inline Tailwind |
| "{firstName}" | `<div>` | profile | default (16px) | `font-medium` | default | `text-gray-900` | No size class |
| "Edit" | `<button>` | profile | `text-sm` | `font-medium` | default | `text-blue-600` | Inline Tailwind |
| "Email" | `<div>` | profile | `text-sm` | default (400) | default | `text-gray-600` | Inline Tailwind |
| "{email}" | `<div>` | profile | default (16px) | `font-medium` | default | `text-gray-900` | No size class |
| "Preferences" | `<h2>` | profile | `text-lg` | `font-semibold` | default | `text-gray-900` | Inline Tailwind |
| "Language" | `<div>` | profile | default (16px) | `font-medium` | default | `text-gray-900` | No size class |
| "Playback Speed" | `<div>` | profile | default (16px) | `font-medium` | default | `text-gray-900` | No size class |
| "Default speed" | `<div>` | profile | `text-sm` | default (400) | default | `text-gray-600` | Inline Tailwind |
| "Change" | `<button>` | profile | `text-sm` | `font-medium` | default | `text-blue-600` | Inline Tailwind |
| "Captions" | `<div>` | profile | default (16px) | `font-medium` | default | `text-gray-900` | No size class |
| "Show subtitles" | `<div>` | profile | `text-sm` | default (400) | default | `text-gray-600` | Inline Tailwind |
| "Toggle" | `<button>` | profile | `text-sm` | `font-medium` | default | `text-blue-600` | Inline Tailwind |
| "Sign Out" | `<button>` | profile | `text-lg` | `font-medium` | default | `text-red-600` | Inline Tailwind |

### Sidebar (`components/Sidebar.tsx`)

| Visible Text | Component | File | Font Size | Font Weight | Line Height | Text Color | Notes |
|-------------|-----------|------|-----------|-------------|-------------|------------|-------|
| "Cue" | `<Heading>` | Sidebar | `text-2xl → text-4xl` | `font-semibold` (600) | default | `text-blue-600` | Typography component |
| "Practice" | `<Label>` | Sidebar | `text-sm → text-base` | `font-medium` (500) | default | `text-gray-600` / `text-blue-600` | Typography component, active state changes color |
| "Progress" | `<Label>` | Sidebar | `text-sm → text-base` | `font-medium` (500) | default | `text-gray-600` / `text-blue-600` | Typography component |
| "Profile" | `<Label>` | Sidebar | `text-sm → text-base` | `font-medium` (500) | default | `text-gray-600` / `text-blue-600` | Typography component |
| "Build your listening skills" | `<Caption>` | Sidebar | `text-xs → text-sm` | `font-normal` (400) | default | `text-gray-500` | Typography component |

### BottomNav (`components/BottomNav.tsx`)

| Visible Text | Component | File | Font Size | Font Weight | Line Height | Text Color | Notes |
|-------------|-----------|------|-----------|-------------|-------------|------------|-------|
| "Practice" | `<Caption>` | BottomNav | `text-xs → text-sm` | `font-medium` (500) | default | `text-gray-500` / `text-blue-600` | Typography component + weight override |
| "Progress" | `<Caption>` | BottomNav | `text-xs → text-sm` | `font-medium` (500) | default | `text-gray-500` / `text-blue-600` | Typography component + weight override |
| "Profile" | `<Caption>` | BottomNav | `text-xs → text-sm` | `font-medium` (500) | default | `text-gray-500` / `text-blue-600` | Typography component + weight override |

---

## 3. Grouped by Semantic Role

### Page Titles
- **Practice:** `text-heading-2` (20px, bold) - custom class
- **Progress:** `<Heading>` component (responsive: 2xl→4xl, semibold 600)
- **Profile:** `text-2xl` (24px, bold) - inline Tailwind
- **Inconsistency:** Three different approaches (custom class, Typography component, inline Tailwind)

### Section Titles
- **Practice:** `text-heading-2` (20px, bold) or `text-heading-3` (18px, semibold) - custom classes
- **Progress:** `<Heading>` with `text-lg` override (18px, semibold 600) - Typography component
- **Profile:** `text-lg` (18px, semibold) - inline Tailwind
- **Inconsistency:** Mix of custom classes, Typography components, and inline Tailwind

### Card Titles
- **Practice:** `text-heading-2` (20px, bold) - custom class
- **Progress:** `<Label>` (responsive: sm→base, medium 500) - Typography component
- **Inconsistency:** Different sizes and weights for similar semantic roles

### Body Text
- **Practice:** `text-body` (16px, normal 400) - custom class
- **Progress:** `<Body>` (responsive: base→lg, normal 400) - Typography component
- **Profile:** Default (16px, normal 400) - no size class
- **Inconsistency:** Mix of custom classes, Typography components, and no classes

### Meta / Caption Text
- **Practice:** `text-body-small` (14px, normal 400) or `text-sm` (14px, normal 400) - custom class or inline
- **Progress:** `<Caption>` (responsive: xs→sm, normal 400) - Typography component
- **Profile:** `text-sm` (14px, normal 400) - inline Tailwind
- **Inconsistency:** Three different approaches for same semantic role

### KPI Values
- **Progress:** `<Numeric>` with `text-2xl` override (24px, medium 500) - Typography component
- **Practice:** `text-body` with `font-bold` override (16px, bold 700) - custom class + override
- **Inconsistency:** Different sizes (24px vs 16px) and weights (500 vs 700)

### KPI Labels
- **Progress:** `<Label>` (responsive: sm→base, medium 500) - Typography component
- **Practice:** `text-body-small` (14px, normal 400) - custom class
- **Inconsistency:** Different sizes and weights

### Navigation Items
- **Sidebar:** `<Label>` (responsive: sm→base, medium 500) - Typography component
- **BottomNav:** `<Caption>` with `font-medium` override (responsive: xs→sm, medium 500) - Typography component + override
- **Inconsistency:** Different base sizes (sm→base vs xs→sm) for same semantic role

### Buttons
- **Practice:** `text-body-large` (16px, semibold 600) or default (16px, semibold 600) - custom class or no class
- **Profile:** `text-lg` (18px, medium 500) or `text-sm` (14px, medium 500) - inline Tailwind
- **Inconsistency:** Three different sizes (16px, 18px, 14px) and two weights (600, 500)

### Inline Actions (Edit / Change / Toggle)
- **Profile:** `text-sm` (14px, medium 500) - inline Tailwind
- **Consistent:** All use same size and weight

### Empty State Text
- **Practice:** `text-heading-3` (18px, semibold) for title, `text-body` (16px, normal) for description
- **Consistent:** Uses custom classes consistently

---

## 4. Problems Identified

### Critical Inconsistencies

1. **Page Titles Use 3 Different Approaches**
   - Practice: `text-heading-2` (custom class, 20px, bold)
   - Progress: `<Heading>` component (responsive, semibold 600)
   - Profile: `text-2xl` (inline Tailwind, 24px, bold)
   - **Impact:** Visual hierarchy feels broken across pages

2. **KPI Values Have Inconsistent Sizing**
   - Progress: `text-2xl` (24px, medium 500)
   - Practice: `text-body` + `font-bold` (16px, bold 700)
   - **Impact:** Stats feel different importance levels

3. **Body Text Uses 3 Different Methods**
   - Practice: `text-body` custom class
   - Progress: `<Body>` Typography component
   - Profile: No size class (inherits default)
   - **Impact:** Reading experience feels inconsistent

4. **Navigation Items Have Different Base Sizes**
   - Sidebar: `text-sm → text-base` (14px → 16px)
   - BottomNav: `text-xs → text-sm` (12px → 14px)
   - **Impact:** Navigation feels disconnected between desktop/mobile

5. **Buttons Use 3 Different Sizes**
   - Practice: `text-body-large` (16px) or default (16px)
   - Profile: `text-lg` (18px) or `text-sm` (14px)
   - **Impact:** CTA hierarchy is unclear

6. **Section Titles Mix Approaches**
   - Practice: Custom classes (`text-heading-2`, `text-heading-3`)
   - Progress: Typography component with override (`<Heading>` + `text-lg`)
   - Profile: Inline Tailwind (`text-lg`)
   - **Impact:** Section hierarchy feels arbitrary

### Medium Priority Issues

7. **Caption/Meta Text Inconsistency**
   - Practice: `text-body-small` (14px) or `text-sm` (14px)
   - Progress: `<Caption>` (12px → 14px responsive)
   - Profile: `text-sm` (14px)
   - **Impact:** Secondary information feels inconsistent

8. **Typography Components Have Overrides**
   - `<Heading>` used with `text-lg` override (should be default)
   - `<Body>` used with `text-sm` override (should be default)
   - `<Caption>` used with `font-medium` override (should be default)
   - **Impact:** Typography system is being bypassed

9. **Custom Classes Duplicate Typography Components**
   - `.text-heading-2` (20px, bold) vs `<Heading>` (responsive, semibold)
   - `.text-body` (16px) vs `<Body>` (responsive)
   - `.text-body-small` (14px) vs `<Caption>` (responsive)
   - **Impact:** Two parallel systems create confusion

10. **Weight Inconsistencies**
    - Headings: Mix of `font-bold` (700) and `font-semibold` (600)
    - Body: Mix of `font-normal` (400) and `font-medium` (500)
    - **Impact:** Visual weight feels arbitrary

### Low Priority Issues

11. **Arbitrary Sizes**
    - `text-2xl` used directly (24px) - should use scale
    - `text-xl` used for emoji (20px) - not semantic
    - **Impact:** Hard to maintain consistent scale

12. **Missing Line Height Specifications**
    - Most text uses default line-height
    - Only custom classes have `tracking-tight` on headings
    - **Impact:** Readability could be improved

13. **Color Inconsistencies**
    - Same semantic roles use different grays (`text-gray-600` vs `text-gray-500`)
    - **Impact:** Visual hierarchy feels muddy

---

## 5. Recommendations for Future Type Scale

### Proposed Semantic Tokens

**Page Title**
- Size: 24px (1.5rem) / 28px (1.75rem) responsive
- Weight: 600 (semibold)
- Line height: 1.2
- Component: `<Heading>` with `as="h1"`

**Section Title**
- Size: 20px (1.25rem) / 24px (1.5rem) responsive
- Weight: 600 (semibold)
- Line height: 1.3
- Component: `<Heading>` with `as="h2"`

**Card Title**
- Size: 18px (1.125rem) / 20px (1.25rem) responsive
- Weight: 600 (semibold)
- Line height: 1.4
- Component: `<Heading>` with `as="h3"`

**Body Text**
- Size: 16px (1rem) / 18px (1.125rem) responsive
- Weight: 400 (normal)
- Line height: 1.5
- Component: `<Body>`

**Meta / Caption**
- Size: 14px (0.875rem) / 16px (1rem) responsive
- Weight: 400 (normal)
- Line height: 1.4
- Component: `<Caption>`

**KPI Value**
- Size: 24px (1.5rem) / 32px (2rem) responsive
- Weight: 600 (semibold)
- Line height: 1.2
- Component: `<Numeric>` with size prop

**KPI Label**
- Size: 14px (0.875rem) / 16px (1rem) responsive
- Weight: 500 (medium)
- Line height: 1.4
- Component: `<Label>`

**Navigation Item**
- Size: 14px (0.875rem) / 16px (1rem) responsive
- Weight: 500 (medium)
- Line height: 1.4
- Component: `<Label>`

**Button Text (Primary)**
- Size: 16px (1rem) / 18px (1.125rem) responsive
- Weight: 600 (semibold)
- Line height: 1.4
- Component: `<Label>` or dedicated Button component

**Button Text (Secondary)**
- Size: 14px (0.875rem) / 16px (1rem) responsive
- Weight: 500 (medium)
- Line height: 1.4
- Component: `<Label>`

**Inline Action**
- Size: 14px (0.875rem)
- Weight: 500 (medium)
- Line height: 1.4
- Component: `<Label>`

### Migration Strategy

1. **Phase 1: Standardize Typography Components**
   - Remove all custom CSS classes (`.text-heading-*`, `.text-body-*`)
   - Update Typography components to match proposed scale
   - Add size variants as props (e.g., `<Heading size="lg">`)

2. **Phase 2: Replace Inline Tailwind**
   - Find all `text-*` and `font-*` classes
   - Replace with appropriate Typography components
   - Remove inline typography classes

3. **Phase 3: Consolidate Navigation**
   - Use same Typography component for Sidebar and BottomNav
   - Ensure consistent sizing across breakpoints

4. **Phase 4: Standardize Buttons**
   - Create Button component with typography built-in
   - Remove typography classes from button elements

5. **Phase 5: Add Line Height**
   - Specify line-height for all Typography components
   - Ensure readability standards

### Implementation Notes

- **Do NOT** implement these changes yet (investigation only)
- Typography components should be the single source of truth
- Remove custom CSS classes to avoid duplication
- Use props for size variants instead of className overrides
- Ensure responsive scaling is consistent across all components

---

## 6. Summary Statistics

- **Total unique font sizes found:** 8 (12px, 14px, 16px, 18px, 20px, 24px, 30px, plus responsive)
- **Total unique font weights found:** 4 (400 normal, 500 medium, 600 semibold, 700 bold)
- **Typography components used:** 5 (Heading, Body, Label, Caption, Numeric)
- **Custom CSS classes used:** 7 (text-display, text-heading-1/2/3, text-body, text-body-large, text-body-small, text-label)
- **Inline Tailwind classes:** ~30+ instances
- **Typography component overrides:** 8+ instances

---

**End of Report**
