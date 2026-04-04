# Leaderboard: How to Add a New Challenge

This folder contains the reusable, multi‑challenge leaderboard framework used by the site.
Challenges are defined in code via a typed config and rendered by dynamic routes.

Use this guide to register a new challenge, connect a Google Sheet as its data source,
and verify everything locally and on Vercel.


## Where things live
- Config registry: `apps/web/src/lib/leaderboard/registry.ts`
- Types: `apps/web/src/lib/leaderboard/types.ts`
- Scoring helpers: `apps/web/src/lib/leaderboard/scoring.ts`
- Date/window helpers: `apps/web/src/lib/leaderboard/date.ts`
- CSV ingestion: `apps/web/src/lib/leaderboard/csv.ts`
- Engine (ingest + score + detail): `apps/web/src/lib/leaderboard/engine.ts`
- Public routes (all dynamic):
  - Page: `/leaderboard/[challenge]/[year]`
  - Member detail: `/leaderboard/[challenge]/[year]/member/[memberId]`
  - JSON API: `/api/leaderboard/[challenge]/[year]?division=<slug>`
  - Member JSON: `/api/leaderboard/[challenge]/[year]/member/[memberId]`
  - Canva PNG image (no‑cache): `/leaderboard/[challenge]/[year]/image?division=:division&limit=:n&width=:px&height=:px&quality=:1-100`
  - Latest image alias: `/leaderboard/[challenge]/[year]/image/latest?division=:division&limit=:n&width=:px&height=:px&quality=:1-100`

Notes
- All endpoints are public and set to no‑cache for Vercel.
- Dynamic route params in pages/handlers follow Next 16 RSC rules (params is a Promise, we await it). 


## Step 1 — Create/Publish your Google Sheet (CSV)
You can use either of these options:

1) "Publish to the web" (CSV)
- File → Share → Publish to web → Sheet (tab) → CSV
- Copy the public CSV URL and use it directly in the registry as `dataSource.url`.

2) gviz CSV by sheet+tab name (works for public sheets)
- Sheet ID is the long ID in the URL: `https://docs.google.com/spreadsheets/d/<SHEET_ID>/...`
- Tab name appears at the bottom of the sheet (e.g., `Form Responses 1`).
- Build URL: `https://docs.google.com/spreadsheets/d/<SHEET_ID>/gviz/tq?tqx=out:csv&sheet=<TAB_NAME>`

Make sure the sheet is publicly readable:
- File → Share → General access → "Anyone with the link" (Viewer) OR use Publish to web.


## Step 2 — Decide your challenge basics
You'll need:
- slug: string used in the URL, e.g., `flex-the-halls-challenge`
- year: numeric, e.g., `2025`
- title: display name
- timezone: IANA ID, e.g., `America/Los_Angeles`
- daily window start hour (default 19 → 7:00 PM)
- challenge window dates: `{ start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' }`
- divisions: any labels you want (e.g., ["men","women"] or ["open"])—fully dynamic


## Step 3 — Define your habits and optional per‑habit limits
Each daily habit is an item with a key, label, and points. You can add period caps like
"InBody scan = 2 pts, max 2 pts per week" or "Social media = 1 pt/day, max 5 per week".

Example:
```ts
checkins: {
  items: [
    { key: 'protein', label: 'Protein target met', points: 1 },
    { key: 'inbody_scan', label: 'InBody Scan', points: 2,
      limits: [{ window: 'week', maxPoints: 2, weekStartsOn: 'sun' }] },
    { key: 'social_media', label: 'Social Post', points: 1,
      limits: [{ window: 'week', maxPoints: 5, weekStartsOn: 'sun' }] },
    { key: 'daily_submission', label: 'Submitted daily', points: 1 },
  ],
  maxDailyPoints: 8, // optional daily cap
}
```
How it works:
- The engine awards points for attempts, then clamps per‑habit within active windows (day/week/month/challenge).
- After per‑habit limits, the overall `maxDailyPoints` cap is applied.
- The member detail page shows crossed‑out checkboxes and tooltips explaining why a habit didn't count.


## Step 4 — Define performance metrics and scoring
Metrics are dynamic per challenge. You can combine:
- `kind: 'absolute_delta'` (raw delta) or `kind: 'percent_gain'` (final vs baseline)
- `direction: 'up' | 'down'` (e.g., weight loss uses `down` → lower is better)
- A scoring function from `scoring.ts`:
  - `absolutePerUnit(unit, pointsPerUnit)` → e.g., 0.1 lb → 1 point
  - `absoluteScaledLinear(maxPoints, normalizeMax)` → linear scale to max points
  - `relativeScaledMax(maxPoints)` → top improvement gets max points, others scale by ratio

Sensitive metrics (hide raw values):
- Set `sensitive: true` on any `MetricSpec` to hide its raw baseline/final values in member detail outputs.
- The engine still computes the improvement and awards points normally; UI will show improvement and points only (baseline/final will appear as —).
- Good candidates: body fat %, body fat lb, muscle mass lb, body weight, waist/arm circumference.

Baselines and finals:
- Baseline window = first valid value in `{ baselineWindow }`.
- Final selection depends on `performance.liveScoring`:
  - `final_window_only` → latest in the configured final window.
  - `latest_to_date` → latest on or before "today" within the challenge window (keeps updating live).
- Negative/zero improvements score 0.

Example metrics:
```ts
performance: {
  baselineWindow: { start: '2025-11-16', end: '2025-11-22' },
  finalWindow: { start: '2025-12-22', end: '2025-12-27' },
  liveScoring: { mode: 'latest_to_date', lockAfterEnd: true },
  metrics: [
    { key: 'inbody_muscle_mass_lb', label: 'Muscle Mass (lb)', kind: 'absolute_delta',
      scoring: absolutePerUnit(0.1, 1), sanityMax: 300, sensitive: true },
    { key: 'back_squat_1rm', label: 'Back Squat 1RM', kind: 'percent_gain',
      scoring: absoluteScaledLinear(15, 1), sanityMax: 1000 },
  ],
}
```


## Step 5 — Map your Google Sheet columns to the normalized shape
Provide a `mapCsvRow(row)` function in your config. It converts a raw CSV row
(header → value) into a `SubmissionRow`:

```ts
mapCsvRow: (row) => {
  const ts = row['Timestamp'] || row['timestamp'];
  const id = row['Email'] || row['member_id'];
  const name = row['Name'] || row['member_name'] || (id?.split('@')[0] ?? '');
  if (!ts || !id || !name) return undefined;

  // Habits (booleans)
  const truthy = (v?: string) => (v ?? '').toString().trim().length > 0 && !/^no$/i.test((v ?? '').trim());
  const checkins = {
    protein: truthy(row['Protein']),
    inbody_scan: truthy(row['InBody Scan']),
    daily_submission: true,
  };

  // Metrics (numbers)
  const num = (v?: string) => {
    const n = Number((v || '').replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? n : undefined;
  };
  const metrics: Record<string, number> = {};
  const squat = num(row['Back Squat 1RM']); if (squat != null) metrics['back_squat_1rm'] = squat;

  return {
    timestamp: new Date(ts).toISOString(),
    member_id: id,
    member_name: name,
    division: 'open',
    checkins,
    metrics,
  };
}
```

Tips
- Boolean detection: your form may store descriptive strings (not "true/false"). Treat non‑empty as true.
- Numeric parsing: strip unit text ("275 lb") then `Number(...)`.
- If a row is invalid/incomplete, return `undefined` to skip it safely.


## Optional — Join a registration roster by email
If form responses do not include a participant name or division, add an optional
`registration` block to the config. This lets you load a second CSV tab keyed by
email and use it to derive display names or divisions.

```ts
registration: {
  dataSource: { type: 'csv', url: 'https://docs.google.com/.../gviz/tq?tqx=out:csv&sheet=Registration' },
  mapCsvRow: (row) => ({
    id: row['Email'].trim().toLowerCase(),
    name: row['Name'],
    profile: { division: row['Division'] },
  }),
},
divisions: {
  keys: ['men', 'women'],
  resolveDivisionForMember: (member) => member.profile?.division === 'women' ? 'women' : 'men',
},
```

Notes
- Submission rows still use `member_id` (usually email) as the primary key.
- Registration lookups are optional and do not replace the main challenge CSV.
- If the registration tab is unavailable, the engine falls back to the submission row name and division.


## Step 6 — Register the challenge in the registry
Open `apps/web/src/lib/leaderboard/registry.ts` and add your new `ChallengeConfig`
to the exported `registry` array. Use one of the existing entries (e.g., `flex2025` or `summerShred2025`) as a reference.

```ts
export const myNewChallenge: ChallengeConfig = {
  id: 'my-challenge-2026',
  slug: 'my-challenge',
  year: 2026,
  title: 'My Challenge 2026',
  timezone: 'America/Los_Angeles',
  checkinWindow: { startHour: 19, durationHours: 24 },
  challengeWindow: { start: '2026-01-05', end: '2026-02-16' },
  divisions: { keys: ['open'] },
  checkins: { items: [/* ... */], maxDailyPoints: 8 },
  performance: { baselineWindow: { start: '2026-01-05', end: '2026-01-11' }, finalWindow: { start: '2026-02-10', end: '2026-02-16' }, metrics: [/* ... */], liveScoring: { mode: 'latest_to_date', lockAfterEnd: true } },
  weights: { habits: 1, performance: 1 },
  tieBreakers: [{ type: 'performance' }, { type: 'habits' }, { type: 'stable_member_hash' }],
  dataSource: { type: 'csv', url: 'https://...' },
  mapCsvRow: (row) => { /* map as shown above */ },
};

export const registry: ChallengeConfig[] = [
  flex2025,
  summerShred2025,
  myNewChallenge, // ← add it here
];
```


## Step 7 — Run locally and verify
- Install and build the web app:
  ```bash
  pnpm install
  pnpm --filter web build
  pnpm --filter web start
  ```
- Open the page:
  - `http://localhost:3000/leaderboard/<slug>/<year>`
- Open JSON API (useful for debugging):
  - `http://localhost:3000/api/leaderboard/<slug>/<year>?division=open`
- Member detail:
  - `http://localhost:3000/leaderboard/<slug>/<year>/member/<member_id>`
- Canva PNG image (no cache):
  - `http://localhost:3000/leaderboard/<slug>/<year>/image?division=open&limit=10`

If you see a 404, confirm your challenge `slug` and `year` match the config, and that you added it to `registry`.
If you see empty rows, verify the sheet is public and your `mapCsvRow` header keys line up.


## Step 8 — Live performance updates (optional)
Enable live updates so members can submit metrics any time and see their score move during the challenge:
```ts
performance: {
  baselineWindow: { start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' },
  finalWindow: { start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' },
  liveScoring: { mode: 'latest_to_date', lockAfterEnd: true },
  metrics: [ /* ... */ ],
}
```
- Baseline still comes from the baseline window (first valid).
- The "final" used for scoring is the latest measurement up to today (within the challenge window). After the challenge ends, scores freeze if `lockAfterEnd` is true.


## Troubleshooting
- JSON/API returns data but the page looks empty
  - Hard refresh your browser during dev; ensure `division` in your URL is present in `divisions.keys`.
- PNG image route returns 500 in dev
  - Our image routes use Satori via `next/og`. All containers with multiple children must set `display: 'flex'` (already enforced). If you customize the layout, keep this rule in mind.
  - Try a production run locally (`pnpm --filter web build && pnpm --filter web start`).
- No data ingested
  - Make sure the sheet is public or published to the web. Open the `dataSource.url` directly in your browser—you should see CSV text.
  - Check your `mapCsvRow` for exact header strings. Update the mapper to your sheet’s real column names.
- Date windows
  - The engine buckets submissions into local 7pm→7pm windows (configurable via `checkinWindow.startHour`). Ensure your `challengeWindow` covers the timestamp range in your sheet when testing.


## Copy‑paste template
Use this as a starting point for a new challenge config.

```ts
import type { ChallengeConfig } from './types';
import { absolutePerUnit, absoluteScaledLinear, relativeScaledMax } from './scoring';

export const myChallenge2026: ChallengeConfig = {
  id: 'my-challenge-2026',
  slug: 'my-challenge',
  year: 2026,
  title: 'My Challenge 2026',
  timezone: 'America/Los_Angeles',
  checkinWindow: { startHour: 19, durationHours: 24 },
  challengeWindow: { start: '2026-01-05', end: '2026-02-16' },
  divisions: { keys: ['open'] },
  checkins: {
    items: [
      { key: 'protein', label: 'Protein target met', points: 1 },
      { key: 'inbody_scan', label: 'InBody Scan', points: 2, limits: [{ window: 'week', maxPoints: 2, weekStartsOn: 'sun' }] },
      { key: 'daily_submission', label: 'Submitted daily', points: 1 },
    ],
    maxDailyPoints: 8,
  },
  performance: {
    baselineWindow: { start: '2026-01-05', end: '2026-01-11' },
    finalWindow: { start: '2026-02-10', end: '2026-02-16' },
    liveScoring: { mode: 'latest_to_date', lockAfterEnd: true },
    metrics: [
      { key: 'body_weight_lb', label: 'Body Weight (lb)', kind: 'absolute_delta', direction: 'down', scoring: absolutePerUnit(1, 1), sanityMax: 500 },
      { key: 'back_squat_1rm', label: 'Back Squat 1RM', kind: 'percent_gain', scoring: absoluteScaledLinear(15, 1), sanityMax: 1000 },
      // Or use relative scoring: scoring: relativeScaledMax(15)
    ],
  },
  weights: { habits: 1, performance: 1 },
  tieBreakers: [{ type: 'performance' }, { type: 'habits' }, { type: 'stable_member_hash' }],
  dataSource: { type: 'csv', url: 'https://docs.google.com/spreadsheets/d/<SHEET_ID>/gviz/tq?tqx=out:csv&sheet=<TAB>' },
  mapCsvRow: (row) => {
    const ts = row['Timestamp'] || row['timestamp'];
    const id = row['Email'] || row['member_id'];
    const name = row['Name'] || row['member_name'] || (id?.split('@')[0] ?? '');
    if (!ts || !id || !name) return undefined;
    const truthy = (v?: string) => (v ?? '').trim().length > 0 && !/^no$/i.test((v ?? '').trim());
    const num = (v?: string) => {
      const n = Number((v || '').replace(/[^0-9.\-]/g, ''));
      return Number.isFinite(n) ? n : undefined;
    };
    const checkins = {
      protein: truthy(row['Protein']),
      inbody_scan: truthy(row['InBody Scan']),
      daily_submission: true,
    } as Record<string, boolean>;
    const metrics: Record<string, number> = {};
    const squat = num(row['Back Squat 1RM']); if (squat != null) metrics['back_squat_1rm'] = squat;
    return { timestamp: new Date(ts).toISOString(), member_id: id, member_name: name, division: 'open', checkins, metrics };
  },
};
```

That’s it. Add the new config to the `registry` array, point `dataSource.url` to your CSV, and the routes will be available immediately:
- `/leaderboard/<slug>/<year>`
- `/leaderboard/<slug>/<year>/image?division=open&limit=10`
- `/leaderboard/<slug>/<year>/member/<member_id>`
- `/api/leaderboard/<slug>/<year>`



## Image endpoints — size and quality parameters
Both image endpoints accept optional query parameters to control output size and compression:

- width: integer pixels, clamped to 320–4096. Default 1080.
- height: integer pixels, clamped to 320–4096. Default 1350.
- quality: integer 1–100, clamped to 10–100. Default 92.

Examples:
- /leaderboard/<slug>/<year>/image?division=open&limit=10&width=1200&height=628
- /leaderboard/<slug>/<year>/image/latest?division=open&limit=10&width=1080&height=1920&quality=90

Notes:
- The layout is responsive to width/height while preserving the podium and left-then-right column order.
- Cache is disabled (no-store) so Canva and other clients get fresh renders every request.
- Quality is forwarded to the renderer when supported by the runtime; PNG renders may not use it, but it is safe to include.
