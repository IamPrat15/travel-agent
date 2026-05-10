# Phase 4 Update — FIRST AI Design System Retrofit

This update brings the standalone travel-agent visually in line with the
FIRST AI Workspace design system, so when you eventually port the module
into FirstAI as a feature, the visual is already correct.

## What changed visually

**Foundation:**
- Warm cream paper canvas (#f5e9e0) replaces cold gray/white background
- Subtle peach radial wash + barely-perceptible grain texture for paper feel
- Manrope (UI sans), Newsreader Italic (whisper headlines), JetBrains Mono
  (eyebrows) loaded from Google Fonts
- Generous corner radii — 28px on cards, 36px on hero surfaces, pill-rounded
  buttons
- Brand maroon strictly rationed — only on F brandmark, focus rings, period
  dots, recognition CTAs (Mark booked button), and within-card primary
  actions. Default primary CTA is BLACK, not red.

**Page structure:**
- Top bar is now glass-thin with backdrop blur (the "surgical liquid glass")
  with the F brandmark in maroon-80
- Both daily screens (Submit, Finance Queue) use the Whisper headline
  pattern: italic Newsreader serif + brand-red period dot
- Eyebrow lines use JetBrains Mono caps tracked 0.12em ("MON · DD MAY ·
  TRAVEL REQUEST")
- Status as DOTS, not banners — green/amber/red colored dots with mono caps
  uppercase labels, never bright bars across the screen
- Tag chips have the bullet-dot prefix (• Salesforce style)
- Tabular figures applied to all numeric values

**Cards rebuilt:**
- AI Verdict card uses Surface + Eyebrow + Status dots + confidence meter
  (warm-tuned palette, not bright Tailwind)
- Route map card has cream surface, eyebrow labels, chip for cab class
- Hotel card displays photo with star chip overlay, Eyebrow + Whisper-flow
- Segment cards (Outbound/Return/Hotel) all share the same surface +
  eyebrow + tabular-figure pattern

**What this means for porting later:**
- New primitives in `apps/web/src/components/first/` (`Surface`, `Headline`,
  `Eyebrow`, `Status`, `Chip`, `Brandmark`, `GlassSurface`, `PeriodDot`)
  match FirstAI's `shared/design-system/*` API exactly. Future port is a
  one-line import path change.

## Files in this zip (19 total — cumulative with Phase 2, 3, 4)

This is a complete frontend + backend snapshot. Upload everything to
GitHub and you're caught up to today.

### Backend (Phase 2 + 3 — same as before)
- `apps/api/src/services/verdict.ts`
- `apps/api/src/services/orchestrator.ts`
- `apps/api/src/services/inventory.ts`
- `apps/api/src/services/googleMaps.ts`
- `apps/api/src/services/cabTariff.ts`
- `apps/api/src/routes/finance.ts`
- `apps/api/src/index.ts`
- `apps/api/.env.example`

### Frontend (Phase 4 visual retrofit — all changed)
- `apps/web/index.html` — Google Fonts links added
- `apps/web/src/index.css` — token import + shadcn HSL remap + body wash
- `apps/web/src/App.tsx` — glass topbar with F brandmark
- `apps/web/src/styles/first-tokens.css` — NEW: full FIRST AI token system
- `apps/web/src/components/first/index.tsx` — NEW: design primitives
- `apps/web/src/components/VerdictCard.tsx` — fully rebuilt
- `apps/web/src/components/RouteMap.tsx` — fully rebuilt
- `apps/web/src/lib/api.ts` — Phase 3 types (route + cab fare)
- `apps/web/src/pages/EmployeeView.tsx` — fully rebuilt
- `apps/web/src/pages/FinanceView.tsx` — fully rebuilt

### Reference doc
- `GOOGLE_MAPS_SETUP.md` — 10-min walkthrough for the API key

## How to upload to GitHub

For new files (`googleMaps.ts`, `cabTariff.ts`, `verdict.ts`, the `first/`
folder, `first-tokens.css`, `RouteMap.tsx`, `VerdictCard.tsx`):
- Navigate to the parent folder on GitHub
- Click **Add file → Create new file**
- For folder creation: type `components/first/index.tsx` or
  `styles/first-tokens.css` — the slash creates the folder
- Paste contents → Commit

For existing files (everything else):
- Click the file → pencil icon → select-all + paste → Commit

Render auto-redeploys on each commit. Wait 3-5 minutes after the last
upload, then refresh your web URL to see the warm cream + Whisper
headlines + glass topbar.

## What you'll notice immediately

When the deploy completes:
1. The whole app feels warmer — cream paper instead of cold white/gray
2. Top bar is glassy, sits above a subtle wash; "F" mark replaces airplane
3. Headlines are italic serif with red period dots
4. Status indicators are colored dots, not banner cards
5. Hotel/segment cards use generous radii (28px) with warm cream surfaces
6. Numeric values align (tabular figures everywhere amounts appear)

## What's still unchanged

- All functionality identical to Phase 3 — no API changes, no behavior
  changes
- All four senior feedback items still delivered:
  - AI Verdict ✓ (Phase 2)
  - Google Maps with prices ✓ (Phase 3)
  - Hotel cards with photos ✓ (Phase 2)
  - "MakeMyTrip-like" presentation — visually closer now thanks to the
    polished card design

## What's still pending (Phase 5+ candidates)

- Actual MakeMyTrip / Booking.com / Amadeus integration (vendor onboarding)
- IRCTC partner agreement (months)
- Cab booking via Uber for Business (Axis procurement)
- Photo validation (clarification still needed)
- Port into FirstAI as a feature module (architectural conversation)
