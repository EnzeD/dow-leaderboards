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
- **Commits**: Prefer Conventional Commits (seen in history): `feat:`, `fix:`, `doc:`, etc. Keep messages imperative and scoped (e.g., `feat: add country filtering`). Ask for commit after every substantial development. Never ask for push.
- **Validation step**: Before running tests or staging files, share the proposed changes with the user and wait for their explicit validation. Do not run `typecheck`, `lint`, or `build`, and do not commit, until the user confirms the work looks correct.
- **PRs**: Include:
  - Clear description with motivation and screenshots of UI changes (`.screenshots/` helpful).
  - Linked issue (if applicable) and notes on API/cache behavior.
  - Checklist: `npm run lint` passes; no type errors; docs updated when endpoints/UX change.
- **Push**: Do NOT push unless the user ask for it (it will deploy automatically)

## Security & Configuration Tips
- Do not add secrets; the app uses public Relic/Steam endpoints. Respect rate limits (soft-throttling already implemented in `relic.ts`).
- Keep endpoints pinned to `title=dow1-de`. Avoid introducing client-side keys.

## Agent Push Policy (Required)
When the user asks to "push", always perform the following checks locally before committing and pushing to `main` to avoid deployment failures:

- Build gate: Run `npm run typecheck` and `npm run build` and ensure both succeed. If either fails, fix the issue first; do not push broken code.
- Lint gate: If ESLint is configured (no interactive prompt), run `npm run lint`. If it prompts for setup, skip lint in this step and rely on the build/type gates.
- Conventional commit: Use an imperative Conventional Commit message (e.g., `fix(search): handle null recentMatches shape`).
- CI parity: Prefer to land changes only when typecheck, lint, and build pass locally to mirror Vercel’s build stage (`Linting and checking validity of types ...`).

Recommended command sequence:

1. `npm run typecheck`
2. `npm run lint` (if non-interactive)
3. `npm run build`
4. `git add -A && git commit -m "<conventional message>" && git push`

Notes:

- If a push is requested mid-failure, inform the user what fails (type/lint/build), propose a fix, implement it, and re-run the checks before pushing.
- Avoid pushing if Next.js type validation fails in production mode even when `npm run dev` works locally.
- Keep these checks lightweight and fast; prioritize type correctness and a clean production build over exhaustive testing.
- After committing changes, always ask the user for permission before pushing (`git push`) to avoid triggering an unintended production deployment.
