# Premium Upsell Discovery PRD (Draft)

## 1) Purpose

Validate interest in a paid premium tier for Dawn of War: DE ladder players by adding an in-app teaser, a dedicated landing page, and an email waitlist capture—without building billing or premium-only data yet.

## 2) Background and context

- Existing product surfaces Top-100 ladder data with limited historical insight. Power users routinely request deeper stats.
- Community scraping efforts are ad hoc and costly; a $2.99/mo fee could offset hosting and nightly crawler jobs.
- We need evidence that players value richer insights before investing in infrastructure.

## 3) Target users and problems

- **Competitive grinders**: want full match history, ELO trends, matchup win rates, and map performance to guide practice.
- **Returning veterans**: struggle to understand current meta performance without accessible historical data.
- **Community organizers**: need reliable stats to produce spotlights or event coverage and may fund maintenance if value is clear.

Key pain points today: only snapshot ladder data is available; players manually track matches; no way to benchmark progress over time.

## 4) Goals and success metrics (v0 discovery)

- Make premium value obvious within the player search experience.
- Route engaged users to a premium landing page explaining features and pricing ($2.99/mo as cost-recovery framing).
- Capture waitlist emails; target ≥10% email conversion from `/premium` visitors sourced via upsell CTAs.
- Collect qualitative feedback via optional notes field to guide actual premium build scope.

## 5) Non-goals

- No payments, authentication updates, or live premium data generation.
- No guarantee on delivery timelines; messaging must frame this as a discovery/waitlist.
- No full analytics dashboard; limit to teaser visuals and static descriptions.

## 6) Experience overview

### 6.1 Search results premium teaser

- Insert a "Premium statistics" block inside the player detail/search history panel near existing recent matches.
- Showcase future insights (blurred/obscured): complete match history, daily ELO graph per ladder, map win rates, matchup breakdowns, streak summaries, frequent opponent win %, and premium badge preview.
- Use frosted overlay or placeholder charts with lock icon to imply gated content while keeping teaser enticing.
- Primary CTA: **Unlock full match history** (copy adjustable). Secondary link: **Learn more** → `/premium`.
- Support copy: 1–2 sentences that mention nightly robot scraping and personal analytics.

### 6.2 Premium landing page (`/premium`)

- Hero section with headline, subheadline explaining $2.99/mo covers hosting + crawlers.
- Feature columns/cards for: complete match log, ELO history per ladder, map/matchup analytics, frequent opponent scouting, premium badge + alias color customization, early access to new analytics, community Discord feedback loop.
- Include messaging that premium is under development and users are joining a waitlist.
- CTA button: **Subscribe for $2.99/mo** leading into waitlist capture instead of checkout.

### 6.3 Waitlist capture flow

- When CTA pressed, show modal or inline panel saying "Premium is not live yet—get notified when it launches." 
- Form fields: required email, optional alias/profile link, optional feedback textarea. Add discreet honeypot field for bots.
- On submit, call API to store lead in Supabase; show success toast/confirmation state with CTA to return to search or join Discord.

## 7) Copy and messaging guardrails

- Emphasize community-first positioning ("helps cover hosting and nightly crawlers").
- Clearly state premium access is coming soon; use phrases like "Join the waitlist" or "Not live yet".
- Highlight concrete analytics (map win %, matchup stats) rather than generic "more data" statements.
- Tag any visuals with "Preview" to avoid implying live availability.

## 8) User flows

1. Player searches for alias → detailed panel opens.
2. Premium teaser appears with blurred metrics and CTAs.
3. Player clicks primary CTA → navigates to `/premium`.
4. Landing page explains benefits and pricing; player clicks "Subscribe for $2.99/mo".
5. Waitlist panel appears; player submits email (optionally alias/feedback).
6. Confirmation message appears; offer link back to leaderboard/search or to follow community updates.

Edge cases: invalid email error (inline messaging), repeat submissions (return friendly "You’re already on the list" state), feature flag off (teaser hidden, `/premium` returns 404 or redirect).

## 9) Analytics and telemetry

- Event `premium_teaser_shown` with context (player profile id, leaderboard id, device).
- Events `premium_teaser_cta_click` and `premium_learn_more_click`.
- Landing page events: `premium_subscribe_click`, `premium_waitlist_submitted`, `premium_waitlist_error`.
- Capture `source` field (e.g., `search_teaser`, `direct`) for leads.
- Aggregate funnel in analytics dashboard to evaluate conversion.

## 10) Technical requirements

### 10.1 Feature flag
- Gate teaser and landing page behind `NEXT_PUBLIC_ENABLE_PREMIUM_TEASER` (default false). Allow runtime disable without redeploy via environment variables.

### 10.2 API and data storage
- New route `POST /api/premium-interest`: validate email, normalize to lowercase, apply basic rate limiting (IP hash + minimum submission interval), persist to Supabase using service role key (server-side only).
- Response: success boolean + message; errors return descriptive copy for UI.

### 10.3 Supabase schema
- Table `premium_interest_leads`:
  - `id` (uuid, default `gen_random_uuid()`)
  - `email` (text, unique, not null)
  - `alias_submitted` (text)
  - `profile_id` (text)
  - `source` (text, required, e.g., `search_teaser`|`landing_page`)
  - `notes` (text)
  - `utm_campaign` (text)
  - `ip_hash` (text) – optional SHA-256 for throttling
  - `created_at` (timestamp, default `now()`)
- Row Level Security: allow anonymous inserts via SQL function that validates email format and optional honeypot. Deny selects for anon role by default.

### 10.4 Client implementation
- Reuse existing card/layout components; ensure blurred stats card falls back gracefully if search data missing.
- Landing page built as static App Router segment (`src/app/premium/page.tsx`) with metadata for sharing.
- Form submits via SWR/fetch with inline loading state and success toast.
- Add honeypot input (hidden field) and time-to-submit measurement to mitigate spam.

### 10.5 Accessibility and performance
- Keyboard focus management for modal/waitlist panel.
- Buttons and links meet contrast requirements; blurred stats still accessible (include descriptive text for screen readers).
- Ensure teaser does not significantly impact search detail performance; lazy-load heavy visuals.

## 11) Dependencies & stakeholders

- Design for blurred teaser visuals and landing page layout (can start with placeholders if bandwidth limited).
- Copy review with community moderators to maintain tone.
- Supabase admin to run migration & update RLS policies.
- Legal/privacy review for collecting emails (update privacy notice before launch).

## 12) Risks and mitigations

- **Community backlash to premium mention** → frame as optional support, highlight ongoing free access to leaderboards.
- **Low conversion** → iterate on messaging, gather Discord feedback, possibly A/B different feature emphasis.
- **Spam submissions** → enforce validation + throttling, monitor `ip_hash` metrics.
- **Scope creep toward full premium build** → keep feature flag and messaging limited to discovery; schedule separate planning for actual data pipelines.

## 13) Open questions

- Should teaser show anonymized real stats (with consent) or purely fictional placeholders?
- Do we need regional pricing variants beyond USD, or display approximate equivalents?
- Where will premium badge/alias color appear once implemented (leaderboard, search detail, future profile page)?
- What is the planned cadence for waitlist outreach (manual emails vs. automated campaign)?

## 14) Next steps

1. Review PRD with stakeholder group; finalize copy and CTA wording.
2. Align on visual direction (blur treatment, landing imagery).
3. Draft Supabase migration and API route spec.
4. Confirm analytics instrumentation plan with tracking owner.
5. Once approved, schedule implementation tasks across frontend, backend, and data teams.
