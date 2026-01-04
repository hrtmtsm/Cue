# Cue - English Listening Practice App

A mobile-first responsive Next.js (App Router) MVP for practicing English listening skills.

## Features

- **Intro Screen**: Landing page with value proposition
- **3-Step Onboarding**: Topics → Level → Ready
- **Practice Flow**: Select → Listen → Respond → Feedback
- **Feedback Screen**: Shows what made the clip hard with AI explanations

## Tech Stack

- Next.js 14 (App Router)
- React 18
- TypeScript
- Tailwind CSS

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Run the development server:
```bash
npm run dev
```

3. Open [http://localhost:3000](http://localhost:3000) in your browser

## Project Structure

```
/app
  /api
    /check-answer
      route.ts              # API endpoint (for future use)
  /onboarding
    /topics
      page.tsx              # Step 1: Topic selection (multi-select)
    /level
      page.tsx              # Step 2: Listening level (single-select)
    /ready
      page.tsx              # Step 3: How it works
  /practice
    /select
      page.tsx              # Content selection screen
    /listen
      page.tsx              # Listen first (no text)
    /respond
      page.tsx              # Type/Speak input
    /feedback
      page.tsx              # Explanation of what made it hard
  layout.tsx                # Root layout with mobile container
  page.tsx                  # Intro/landing screen
  globals.css               # Global styles with Tailwind
```

## Screen Flow

1. `/` - Intro screen
2. `/onboarding/topics` - Select topics (multi-select)
3. `/onboarding/level` - Select listening level
4. `/onboarding/ready` - How it works
5. `/practice/select` - Choose a clip
6. `/practice/listen` - Listen first (no text shown)
7. `/practice/respond` - Type or speak what you heard
8. `/practice/feedback` - See explanation, then retry

## Design Notes

- Mobile-first design (max-width: 420px, centered on desktop)
- Large tap targets (minimum 44x44px)
- iOS-like spacing and styling
- Sticky bottom buttons for primary actions
- Simple transitions

## Mock Data

The app includes mock practice data with transcripts and explanations. Audio URLs are stubbed - add actual audio files to `/public/audio/` when ready.

