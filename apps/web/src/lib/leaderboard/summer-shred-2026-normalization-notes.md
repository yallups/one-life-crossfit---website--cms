# Summer Shred 2026 Normalization Notes

This note captures the scoring and data-quality findings from the Summer Shred
2026 final weigh-in review. It intentionally omits email addresses and phone
numbers.

## Current Code Behavior

- Config: `summerShred2026` in `apps/web/src/lib/leaderboard/registry.ts`.
- Challenge route: `/leaderboard/summer-shred-challenge/2026`.
- Current performance scoring uses only `inbody_body_fat_pct`.
- Score formula today: `max(0, baselinePbf - finalPbf) * 80`.
- `body_weight_lb`, `inbody_muscle_mass_lb`, and `inbody_fat_mass_lb` are
  ingested and displayed as sensitive metrics, but award zero points.
- The engine selects the first metric value in the baseline window and the
  latest metric value in the final/live window.
- For this config, the daily habit challenge still starts on `2026-04-05`.
  Apr 4 InBody scans are treated as valid baseline scans and can credit the
  first challenge-day InBody point without creating an extra expected day.
- Baseline performance scoring starts on `2026-04-04`, so the public first-scan
  day is included for body-fat scoring.

## Source Data Audit

- Form response rows reviewed: 614.
- Rows with at least one body-composition metric: 115.
- Participants with at least one scan metric: 21.
- Participants with current leaderboard rows: 22.
- Several rows have body-composition entry inconsistencies where reported body
  fat mass does not match `weight * PBF / 100`. In those cases, derive fat mass
  from weight and PBF rather than trusting the entered fat-mass column.
- Example data-quality pattern: a row can omit SMM but contain an SMM-like value
  under Body Fat Mass. This does not affect current BFP scoring, but it affects
  any future fat-mass or muscle-mass summary.

## Largest Adjacent SMM Swings

These swings are too large to treat as real skeletal muscle change and are good
examples of why raw SMM should not decide winners.

| Participant | Window | SMM change |
| --- | --- | ---: |
| Daniel De La Cruz | Apr 12 to Apr 19 | -5.1 lb |
| Shawn Jones | Apr 5 to Apr 7 | -4.2 lb |
| Miguel Salas | Apr 27 to May 2 | +4.0 lb |
| Manny Zepeda | Apr 7 to Apr 14 | -3.8 lb |
| Daniel De La Cruz | May 10 to May 16 | +3.3 lb |

## Current First-to-Latest BFP Drops

This is the present leaderboard-style performance result from the current
engine logic, before any normalization beyond the existing first/latest metric
window selection.

| Participant | Division | Scan count | BFP drop |
| --- | --- | ---: | ---: |
| Daniel De La Cruz | men | 6 | 6.0 |
| Melissa Marcois | women | 7 | 5.4 |
| Jennifer Zepeda | women | 5 | 5.2 |
| Miguel Salas | men | 5 | 5.0 |
| Paul Zwilling | men | 5 | 4.4 |
| Maria Salas | women | 7 | 4.2 |
| Monique Verdin | women | 8 | 4.2 |
| Jessica Kwong | women | 7 | 4.0 |
| Manny Zepeda | men | 8 | 2.7 |
| Chuck Marcois | men | 12 | 2.7 |
| Cara Jones | women | 7 | 2.6 |
| Jazmin Cortez | women | 6 | 2.0 |
| Shawn Jones | men | 11 | 1.7 |
| Corena Mena | women | 3 | 1.3 |
| Matt Palm | men | 3 | 1.2 |
| Dharamesh Patel | men | 9 | 1.0 |

## Final 2026 Adjusted BFP Scoring Method

For this year, keep the promised scoring surface: points are awarded for body
fat percentage points reduced. The normalization should change how start/end BFP
is estimated, not introduce a new scoring category after the fact.

1. Use all valid scans per participant, sorted by timestamp.
2. Treat weight as measured. Weight difference should use the raw first and
   latest scale weights.
3. Treat raw BFP, raw fat mass, and raw SMM as useful but noisy InBody
   estimates.
4. Use the first valid scan's weight and BFP as the starting body-fat estimate:
   `startFatMass = startWeight * startBfp / 100`.
5. Build an early SMM baseline from the first scan week. If there are fewer than
   two SMM readings in the first 7 days, extend to 14 days and use at most the
   first three readings. Use the median after removing readings more than
   `max(2 lb, 2% of median)` from the median.
6. Limit credited SMM loss:
   `allowedSmmLoss = smmBaseline * 1%`;
   `reportedSmmLoss = smmBaseline - latestSmm`;
   `usedSmmLoss = clamp(reportedSmmLoss, 0, allowedSmmLoss)`.
7. Temper fat-loss credit for deeper cuts:
   `weightLossPct = max(0, startWeight - latestWeight) / startWeight * 100`;
   `fatLossCreditPct = 100 * exp(-0.018 * max(0, weightLossPct - 3) ^ 1.5)`.
   This gives full credit through the first 3% of starting body weight lost,
   then reduces credit faster as the cut gets deeper.
8. Estimate fat loss:
   `maxCreditedFatLoss = max(0, startWeight - latestWeight) * fatLossCreditPct / 100`;
   `estimatedFatLoss = min(max(0, startWeight - latestWeight - usedSmmLoss), maxCreditedFatLoss)`.
9. Derive final adjusted BFP:
   `finalFatMass = clamp(startFatMass - estimatedFatLoss, 0, latestWeight)`;
   `bfpAdjusted = finalFatMass / latestWeight * 100`.
10. Score:
   `bfpPointsDropped = max(0, startBfp - bfpAdjusted)`;
   `performancePoints = bfpPointsDropped * 80`.

The public name for this score is `BFP adjusted*`.

## Implemented Support

- Review URL: `/challenge-review/summer-shred-challenge/2026`.
- API URL:
  `/api/challenge-review/summer-shred-challenge/2026?rangeMode=all`.
- Use `participants=eligible` to exclude members who do not have at least two
  scans with body weight and BFP.
- The review response marks each participant as `eligible`,
  `insufficient_scans`, or `no_scans`.
- The review response includes `muscleStabilizedScore` for every score-eligible
  body-composition participant. This is displayed as `BFP adjusted*`.
- The review UI presents raw first/latest values beside the adjusted
  calculation for transparency.
- The public member page includes a performance chart with entered weight, SMM,
  fat mass, BFP, and `BFP adjusted*`. Weight/SMM/fat mass share the pounds axis;
  BFP and `BFP adjusted*` share the percent axis.
- The challenge engine has an Apr 4 InBody credit window that preserves the
  first-day InBody scan point even if a member submits a later Apr 5 daily log.
- The public leaderboard now uses `BFP adjusted*` for body-composition
  performance points.

As of the final review data, the review screen identifies 17 score-eligible
participants and 5 ineligible/non-participant entries.

## Next-Year Scoring Options

- Keep simple BFP percentage-point reduction, but use normalized endpoints.
- Add relative fat-loss scoring so smaller/leaner athletes are not judged only
  on raw percentage-point drops.
- Add a small lean-retention component, but use normalized lean mass
  (`weight - derivedFatMass`) rather than raw SMM.
- Avoid making raw SMM a winner-deciding metric. It is useful for coaching
  discussion, but this data shows too much short-term variance for fair scoring.
