# Repository Guidelines

## Project Structure & Module Organization
- `apps/web`: Next.js App Router frontend (TypeScript, Tailwind/Shadcn). Source lives in `apps/web/src`, static assets in `apps/web/public`.
- `apps/studio`: Sanity Studio v3 CMS. Schemas and utilities live under `apps/studio`.
- `packages/ui`: Shared UI components used across apps.
- `packages/typescript-config`: Shared TS config presets.
- Repo tooling is orchestrated with Turborepo (`turbo.json`) and PNPM workspaces (`pnpm-workspace.yaml`).

## Build, Test, and Development Commands
- `pnpm dev`: Run all apps via Turborepo (web + studio).
- `pnpm build`: Build all apps/packages through Turborepo.
- `pnpm lint`: Run Ultracite checks across the repo.
- `pnpm format`: Apply Ultracite/Biome formatting fixes.
- `pnpm check-types`: Typecheck all workspaces.
- App-specific (when needed):
  - `pnpm -C apps/web dev` / `build` / `start`
  - `pnpm -C apps/studio dev` / `build` / `deploy`

## Coding Style & Naming Conventions
- TypeScript-first, React components in `apps/web/src`.
- Formatting and linting are driven by Ultracite + Biome (`biome.jsonc`).
- Follow existing file conventions for naming (kebab-case routes, PascalCase components).
- Prefer explicit types for public APIs; avoid `any` unless required (lint warns on `any`).

## Testing Guidelines
- No formal test framework is configured.
- Wodify integration checks live in:
  - Test page: run `pnpm dev` then open `http://localhost:3000/wodify-test.html`.
  - Script: `npx tsx apps/web/scripts/test-wodify-integration.ts`.
- If you add tests, document the runner and add a script in the relevant `package.json`.

## Wodify API Notes
- Schedule queries use `GET /v1/classes/search` with the `q` parameter for date/program filtering.
- Search clauses use `field|operator|value` and multiple clauses are joined by `;` (AND logic).
- Example: `startTime|gte|2024-01-01T00:00:00;startTime|lte|2024-01-07T23:59:59;programId|eq|15678` (URL-encode before sending).

## Commit & Pull Request Guidelines
- Commit messages in history are short, imperative, and lower-case (e.g., `upgrade next`, `add vercel analytics`).
- PRs should include:
  - A concise summary of user-visible changes.
  - How the change was verified (commands or pages).
  - Screenshots for frontend or Studio UI changes.

## Configuration & Secrets
- Sanity deployment relies on repo secrets (see `README.md` for required keys).
- Never commit `.env` files or tokens; use local environment variables instead.
