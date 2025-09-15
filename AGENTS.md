# Repository Guidelines

## Project Structure & Module Organization
- `src/app/`: Next.js App Router pages and API routes.
  - `src/app/api/*/route.ts`: Server endpoints (leaderboards, combined, search).
  - `src/app/page.tsx` + `globals.css`: Main UI and styles.
- `src/lib/relic.ts`: Data fetching, parsing, and helpers.
- `public/assets/`: Static images (e.g., `daw-logo.webp`).
- Root docs: `README.md`, `API-DOCUMENTATION.md`, `PRD.md`, `IMPLEMENTATION.MD`.

## Build, Test, and Development Commands
- `npm run dev`: Run the Next.js dev server at `http://localhost:3000`.
- `npm run build`: Production build (`.next/`).
- `npm start`: Start the production server (after build).
- `npm run lint`: Lint using ESLint + `eslint-config-next`.

## Coding Style & Naming Conventions
- **Language**: TypeScript + React (Next.js 14) and Tailwind CSS.
- **Files**: Components/entries as `*.tsx`; API routes in `src/app/api/**/route.ts`.
- **Imports**: Use `@/` alias for `src/` modules.
- **Styling**: Prefer Tailwind utility classes; keep class lists readable and grouped by layout → color → state.
- **Formatting**: Follow ESLint; run `npm run lint -- --fix` before commits.
- **Errors**: Handle API failures gracefully; return typed fallbacks and cache headers where applicable.

## Testing Guidelines
- Current: No formal test suite. Validate changes by:
  - Running `npm run dev` and exercising UI filters, search, and API routes.
  - Checking console/server logs for API errors and rate-limit warnings.
- If adding tests, co-locate by area (e.g., `src/lib/__tests__/relic.test.ts`). Aim for fast, unit-level coverage of parsing utilities.

## Commit & Pull Request Guidelines
- **Commits**: Prefer Conventional Commits (seen in history): `feat:`, `fix:`, `doc:`, etc. Keep messages imperative and scoped (e.g., `feat: add country filtering`).
- **PRs**: Include:
  - Clear description with motivation and screenshots of UI changes (`.screenshots/` helpful).
  - Linked issue (if applicable) and notes on API/cache behavior.
  - Checklist: `npm run lint` passes; no type errors; docs updated when endpoints/UX change.

## Security & Configuration Tips
- Do not add secrets; the app uses public Relic/Steam endpoints. Respect rate limits (soft-throttling already implemented in `relic.ts`).
- Keep endpoints pinned to `title=dow1-de`. Avoid introducing client-side keys.
