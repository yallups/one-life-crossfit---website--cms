---
name: add-leaderboard-challenge
description: Create or update a leaderboard-style challenge page in the One Life CrossFit CMS website by adding a new ChallengeConfig entry and CSV mapper to the reusable leaderboard registry. Use when Codex is asked to add a new challenge page, challenge leaderboard, yearly challenge route, or challenge results page under /leaderboard/[challenge]/[year], especially when the work involves apps/web/src/lib/leaderboard/registry.ts, Google Sheets CSV ingestion, scoring rules, divisions, or challenge theming.
---

# Add Leaderboard Challenge

Start from the existing reusable leaderboard system. New challenge pages in this repo are usually config additions, not new route files.

## Core Rules

- Inspect `apps/web/src/lib/leaderboard/README.md`, `apps/web/src/lib/leaderboard/types.ts`, and `apps/web/src/lib/leaderboard/registry.ts` before editing.
- Treat `flex2025` as the reference for daily check-in submissions and `summerShred2025` as the reference for summary-row or synthesized baseline/final data.
- Do not create a new page component for each challenge unless the user explicitly wants a one-off experience. The dynamic routes under `apps/web/src/app/leaderboard/[challenge]/[year]` already render any registered config.
- Use the real Google Sheet headers and rules. Do not invent column names, score caps, or date windows.
- Ask only for blocking inputs: slug, year, title, data source, date windows, divisions, scoring rules, and any theme assets.

## Workflow

1. Confirm the target.
   - Use this skill for leaderboard pages served from `/leaderboard/[challenge]/[year]`.
   - If the user actually wants a Sanity marketing or landing page, stop and use the site content workflow instead.
2. Gather the minimum viable inputs.
   - Inspect the published CSV or export URL directly and read real headers.
   - Decide whether the source is daily submissions or member summary rows.
   - Load `references/input-checklist.md` when challenge requirements are incomplete.
3. Pick the nearest existing pattern.
   - Daily submissions plus live updates: start from `flex2025`.
   - Summary tab with before/after values: start from `summerShred2025`.
   - Load `references/config-patterns.md` when implementing the config and mapper.
4. Add the new challenge config.
   - Create a named `ChallengeConfig` export in `apps/web/src/lib/leaderboard/registry.ts`.
   - Set `theme`, `divisions`, `checkins`, `performance`, `weights`, `tieBreakers`, `dataSource`, and `mapCsvRow`.
   - Append the new config to the exported `registry` array.
5. Verify the route and data.
   - Run `pnpm --filter web typecheck`.
   - Run `pnpm --filter web build` when practical.
   - Validate the CSV URL directly.
   - Check:
     - `/leaderboard/<slug>/<year>`
     - `/api/leaderboard/<slug>/<year>?division=<division>`
     - `/leaderboard/<slug>/<year>/member/<member_id>`
     - `/leaderboard/<slug>/<year>/image?division=<division>`
6. Close with exact assumptions.
   - Report the slug/year added, the sheet or tab used, any inferred header mappings, and anything not verified locally.

## References

- Load `references/input-checklist.md` when the request is missing challenge parameters or source-sheet details.
- Load `references/config-patterns.md` when editing the leaderboard registry, mapping CSV rows, or validating the generated routes.
