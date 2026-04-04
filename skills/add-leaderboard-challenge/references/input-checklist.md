# Challenge Input Checklist

Collect only the blockers. If the user already supplied an item, do not ask for it again.

- Challenge identity
  - `title`
  - `slug`
  - `year`
- Data source
  - Google Sheet URL
  - target tab name or `gid`
  - whether the sheet is public or published as CSV
- Dates
  - `challengeWindow.start`
  - `challengeWindow.end`
  - `performance.baselineWindow`
  - `performance.finalWindow`
  - timezone, usually `America/Los_Angeles`
- Divisions
  - default `open` is fine unless the challenge explicitly splits divisions
- Daily habits
  - each habit key, label, points, and any day/week/month/challenge caps
  - whether a daily max cap should apply
- Performance metrics
  - metric key and label
  - `kind`: `absolute_delta` or `percent_gain`
  - `direction`: `up` or `down`
  - scoring rule
  - `sanityMax`
  - `sensitive` flag for values that should not display raw measurements
- Live behavior
  - whether scores should update throughout the challenge
  - whether scores should lock after the challenge ends
- Theming
  - background color
  - background image URL
  - logo URL

If the request is underspecified, ask for the sheet first. Real CSV headers usually answer most of the remaining mapper questions.
