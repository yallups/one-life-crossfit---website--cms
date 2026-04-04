# Config Patterns

## File Touchpoints

- `apps/web/src/lib/leaderboard/registry.ts`
  - Add the new `ChallengeConfig`.
  - Add any sheet constants near the config.
  - Register the config in the exported `registry` array.
- `apps/web/src/lib/leaderboard/types.ts`
  - Read this before editing the config.
  - Only change it if the new challenge truly needs a new framework capability.
- `apps/web/src/lib/leaderboard/scoring.ts`
  - Reuse existing helpers first.
  - Add a new scoring helper only when the challenge rules cannot be expressed with the current ones.
- `apps/web/src/app/leaderboard/[challenge]/[year]/page.tsx`
  - Do not clone this file per challenge.
  - It already renders any registered config.

## Choose the Closest Existing Example

- `flex2025`
  - Use for daily form submissions with one row per member submission.
  - Good example for `truthy`, `toNum`, `timeToSeconds`, live scoring, theme assets, and tolerant header lookup.
- `summerShred2025`
  - Use for summary tabs with one row per member and before/after values.
  - Good example for `pick(...)`, tolerant metric aliases, and returning multiple synthetic `SubmissionRow` objects from one CSV row.

## Mapper Guidelines

- Read the CSV headers directly before writing `mapCsvRow`.
- Return `undefined` for rows missing the required identity fields.
- Prefer tolerant lookup across likely header variants instead of a single exact string.
- Use `parseToZonedISOString` when the source timestamps are local-formatted strings.
- Keep helper functions inside the config block when they are challenge-specific.
- Return `SubmissionRow[]` when one source row needs to synthesize baseline and final records.
- Keep `division` explicit or default it to `open`.

## Verification Flow

1. Confirm the CSV URL opens and returns text.
2. Run `pnpm --filter web typecheck`.
3. Run `pnpm --filter web build` when the request includes implementation or release readiness.
4. Verify the generated routes:
   - `/leaderboard/<slug>/<year>`
   - `/api/leaderboard/<slug>/<year>?division=<division>`
   - `/leaderboard/<slug>/<year>/member/<member_id>`
   - `/leaderboard/<slug>/<year>/image?division=<division>`

## Common Failure Modes

- `404` on the page usually means the new config was not added to `registry` or the slug/year do not match the URL.
- Empty or partial results usually mean the sheet is not public or the mapper keys do not match the real CSV headers.
- Incorrect day bucketing usually means the challenge window or `checkinWindow.startHour` does not match the form’s local submission timing.
- If a request seems to need a custom layout instead of the standard leaderboard, pause and confirm whether the user still wants the shared leaderboard system.
