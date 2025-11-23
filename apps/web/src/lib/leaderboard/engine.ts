import { fetchCsvText, parseCsv } from "./csv";
import { isWithinYmdRange, monthKeyFromYmd, scoringDate, todayYmd, weekKeyFromYmd } from "./date";
import type { ChallengeConfig, DivisionKey, LeaderboardResponse, MemberScores, SubmissionRow, } from "./types";
import { roundTo } from "./scoring";

function stableHash(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export async function loadSubmissions(config: ChallengeConfig): Promise<SubmissionRow[]> {
  if (config.dataSource.type !== "csv" || !config.dataSource.url) return [];
  const text = await fetchCsvText(config.dataSource.url);
  const rows = parseCsv(text);
  const out: SubmissionRow[] = [];
  for (const r of rows) {
    const mapped = config.mapCsvRow(r);
    if (!mapped) continue;
    if (Array.isArray(mapped)) out.push(...mapped);
    else out.push(mapped);
  }
  return out;
}

export type DailyAggregate = {
  key: string; // member_id|date
  member_id: string;
  member_name: string;
  division: DivisionKey;
  date: string; // yyyy-mm-dd (bucket)
  checkins: Record<string, boolean>;
  metrics: Record<string, number>;
  timestamp: string; // latest per bucket
};

export function latestByBucket(subs: SubmissionRow[], cfg: ChallengeConfig): DailyAggregate[] {
  const latest = new Map<string, DailyAggregate>();
  for (const s of subs) {
    const date = scoringDate(s.timestamp, cfg.timezone, cfg.checkinWindow.startHour);
    if (!isWithinYmdRange(date, cfg.challengeWindow.start, cfg.challengeWindow.end)) continue;
    const division: DivisionKey = s.division || "open";
    const key = `${s.member_id}|${date}`;
    const rec: DailyAggregate = {
      key,
      member_id: s.member_id,
      member_name: s.member_name,
      division,
      date,
      checkins: s.checkins ?? {},
      metrics: s.metrics ?? {},
      timestamp: s.timestamp,
    };
    const prev = latest.get(key);
    if (!prev || new Date(s.timestamp) > new Date(prev.timestamp)) {
      latest.set(key, rec);
    }
  }
  return Array.from(latest.values());
}

export function scoreHabits(dailies: DailyAggregate[], cfg: ChallengeConfig) {
  const pointsByKey = new Map(cfg.checkins.items.map((i) => [i.key, i.points] as const));
  const limitsByKey = new Map(cfg.checkins.items.map((i) => [i.key, i.limits || []] as const));
  const cap = cfg.checkins.maxDailyPoints ?? null;
  const totalByMember = new Map<string, number>();
  // Track per-member awarded points per habit per window key to enforce limits
  const awardedByMemberHabitWindow = new Map<string, Map<string, Map<string, number>>>(); // member -> habit -> windowKey -> points

  function windowKeysFor(habitKey: string, dateYmd: string) {
    const limits = limitsByKey.get(habitKey) || [];
    const keys: Array<{ key: string; max: number }> = [];
    for (const lim of limits) {
      if (lim.window === "day") keys.push({ key: `day:${dateYmd}`, max: lim.maxPoints });
      else if (lim.window === "week")
        keys.push({ key: `week:${weekKeyFromYmd(dateYmd, lim.weekStartsOn || "sun")}`, max: lim.maxPoints });
      else if (lim.window === "month") keys.push({ key: `month:${monthKeyFromYmd(dateYmd)}`, max: lim.maxPoints });
      else if (lim.window === "challenge")
        keys.push({ key: `challenge:${cfg.challengeWindow.start}-${cfg.challengeWindow.end}`, max: lim.maxPoints });
    }
    return keys;
  }

  for (const d of dailies) {
    let dayAward = 0;
    for (const [key, value] of Object.entries(d.checkins)) {
      if (!value || !pointsByKey.has(key)) continue;
      const base = pointsByKey.get(key)!;
      // enforce limits
      const windowKeys = windowKeysFor(key, d.date);
      let allowed = base;
      for (const wk of windowKeys) {
        const m = (awardedByMemberHabitWindow.get(d.member_id) || new Map());
        if (!awardedByMemberHabitWindow.has(d.member_id)) awardedByMemberHabitWindow.set(d.member_id, m);
        const hmap = (m.get(key) || new Map());
        if (!m.has(key)) m.set(key, hmap);
        const used = hmap.get(wk.key) ?? 0;
        const remaining = Math.max(0, wk.max - used);
        allowed = Math.min(allowed, remaining);
      }
      if (allowed > 0) {
        dayAward += allowed;
        // record usage across all windows
        for (const wk of windowKeys) {
          const m = awardedByMemberHabitWindow.get(d.member_id)!;
          const hmap = m.get(key)!;
          hmap.set(wk.key, (hmap.get(wk.key) ?? 0) + allowed);
        }
      }
    }
    if (cap != null) dayAward = Math.min(dayAward, cap);
    totalByMember.set(d.member_id, (totalByMember.get(d.member_id) ?? 0) + dayAward);
  }
  return totalByMember; // member_id -> habit points
}

export type MetricWindows = {
  baseline: Record<string, number | undefined>; // metric -> value
  final: Record<string, number | undefined>;
};

export function extractMetricWindows(dailies: DailyAggregate[], cfg: ChallengeConfig) {
  // Determine live scoring mode
  const live = cfg.performance.liveScoring?.mode === "latest_to_date";
  const lockAfterEnd = !!cfg.performance.liveScoring?.lockAfterEnd;
  const today = todayYmd(cfg.timezone);
  const challengeEnd = cfg.challengeWindow.end;
  // In live mode before end (or if not locking after end), allow any date up to cutoff
  const liveCutoff = today < challengeEnd || !lockAfterEnd ? today : challengeEnd;

  // Sort by timestamp asc so that later overwrites win for finals
  const sorted = [...dailies].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  // For each member, find per-metric baseline (first in baseline window) and final
  // Final selection:
  // - live==false: latest in final window only
  // - live==true: latest with date within challengeWindow and <= liveCutoff; if also within final window, that's fine
  const byMember = new Map<string, MetricWindows>();
  for (const d of sorted) {
    // baseline
    if (isWithinYmdRange(d.date, cfg.performance.baselineWindow.start, cfg.performance.baselineWindow.end)) {
      let mw = byMember.get(d.member_id);
      if (!mw) {
        mw = { baseline: {}, final: {} };
        byMember.set(d.member_id, mw);
      }
      for (const [k, v] of Object.entries(d.metrics)) {
        if (mw.baseline[k] == null && isFinite(v)) {
          mw.baseline[k] = v;
        }
      }
    }

    // final
    const eligibleFinal = live
      ? (isWithinYmdRange(d.date, cfg.challengeWindow.start, cfg.challengeWindow.end) && d.date <= liveCutoff)
      : isWithinYmdRange(d.date, cfg.performance.finalWindow.start, cfg.performance.finalWindow.end);

    if (eligibleFinal) {
      let mw = byMember.get(d.member_id);
      if (!mw) {
        mw = { baseline: {}, final: {} };
        byMember.set(d.member_id, mw);
      }
      for (const [k, v] of Object.entries(d.metrics)) {
        if (isFinite(v)) {
          mw.final[k] = v; // sorted asc, so latest value seen wins
        }
      }
    }
  }
  return byMember;
}

function improvementForMetric(kind: string, baseline?: number, final?: number, direction: "up" | "down" = "up") {
  if (baseline == null || final == null) return 0;
  if (!isFinite(baseline) || !isFinite(final)) return 0;
  if (kind === "percent_gain") {
    if (baseline <= 0) return 0;
    const pct = (final - baseline) / baseline;
    return Math.max(0, pct);
  } else {
    const delta = final - baseline;
    const raw = direction === "down" ? -delta : delta; // down means baseline-final
    return Math.max(0, raw);
  }
}

export function scorePerformance(
  dailies: DailyAggregate[],
  cfg: ChallengeConfig,
  memberDivision: Map<string, DivisionKey>
) {
  const windowsByMember = extractMetricWindows(dailies, cfg);

  // Precompute top improvements per division for relative metrics, if any
  const topByDivisionMetric = new Map<string, number>(); // key: division|metric

  // First pass: compute improvements per member per metric to find tops
  const improvements: Map<string, Map<string, number>> = new Map(); // member -> metric -> improvement

  for (const [member, windows] of windowsByMember) {
    const div = memberDivision.get(member) ?? "open";
    for (const spec of cfg.performance.metrics) {
      const baseline = windows.baseline[spec.key];
      const final = windows.final[spec.key];
      // Direction support: encoded by scoring function? We'll add a convention: if label contains "(down)", treat as down
      const direction: "up" | "down" = (spec as any).direction === "down" ? "down" : "up";
      const imp = improvementForMetric(spec.kind, baseline, final, direction);
      if (!improvements.has(member)) improvements.set(member, new Map());
      improvements.get(member)!.set(spec.key, imp);
      // track top per division
      const topKey = `${div}|${spec.key}`;
      if ((spec.scoring as any)._method === "relative") {
        const prev = topByDivisionMetric.get(topKey) ?? 0;
        if (imp > prev) topByDivisionMetric.set(topKey, imp);
      }
    }
  }

  // Second pass: apply scoring
  const perfPoints = new Map<string, number>();
  for (const [member, impByMetric] of improvements) {
    const div = memberDivision.get(member) ?? "open";
    let pts = 0;
    for (const spec of cfg.performance.metrics) {
      const imp = impByMetric.get(spec.key) ?? 0;
      const topKey = `${div}|${spec.key}`;
      const top = topByDivisionMetric.get(topKey);
      // Try to pass top to scoring if it expects it
      const val = spec.scoring({
        improvement: imp,
        baseline: undefined,
        final: undefined,
        topImprovementInDivision: top
      });
      pts += val;
    }
    perfPoints.set(member, pts);
  }
  return perfPoints; // member_id -> performance points
}

export interface MemberDailyLog {
  date: string;
  dailyPoints: number;
  checkins: Record<string, boolean>;
  metrics: Record<string, number>;
}

export interface HabitAwardDetail {
  attempted: boolean; // whether user checked the habit
  basePoints: number; // raw per-habit points defined in config
  awarded: number; // points actually awarded after applying per-habit limits
  reasons: string[]; // explanations when awarded < basePoints
}

export interface DailySubmissionAudit {
  timestamp: string; // ISO
  checkins: Record<string, boolean>;
  metrics: Record<string, number>;
  isLatestForWindow: boolean; // only latest submission per 7pm window counts
  notCountedReason?: string; // explanation when not counted (e.g., superseded)
  dayOfChallenge: number;
}

export interface DailyWindowAudit {
  date: string; // yyyy-mm-dd window bucket
  submissions: DailySubmissionAudit[]; // all submissions for that day window, latest last
  countedIndex: number; // index in submissions that counted (latest)
  perHabitAwards: Record<string, HabitAwardDetail>; // based on counted submission
  dailyPointsAwarded: number; // after applying daily cap
  dailyCapApplied?: { cap: number; before: number; after: number };
}

export interface MemberDetailResponse {
  member_id: string;
  member_name: string;
  division: DivisionKey;
  habitPoints: number;
  performancePoints: number;
  total: number;
  dailyLogs: MemberDailyLog[]; // kept for backward-compat
  dailyWindows?: DailyWindowAudit[]; // enhanced audit data for UI annotations
  improvements: Record<string, { improvement: number; points: number; baseline?: number; final?: number }>;
  updatedAt: string;
}

export async function computeMemberDetail(cfg: ChallengeConfig, memberId: string): Promise<MemberDetailResponse | undefined> {
  const submissions = await loadSubmissions(cfg);

  // 1) Build per-day ALL submissions for this member (not just latest), within challenge window buckets
  type RawSub = { timestamp: string; date: string; checkins: Record<string, boolean>; metrics: Record<string, number> };
  const rawMine: RawSub[] = [];
  for (const s of submissions) {
    if (s.member_id !== memberId) continue;
    const date = scoringDate(s.timestamp, cfg.timezone, cfg.checkinWindow.startHour);
    if (!isWithinYmdRange(date, cfg.challengeWindow.start, cfg.challengeWindow.end)) continue;
    rawMine.push({ timestamp: s.timestamp, date, checkins: s.checkins ?? {}, metrics: s.metrics ?? {} });
  }
  if (rawMine.length === 0) return undefined;

  // Determine member name/division from any latestByBucket entry (fallback to first submission)
  const allLatest = latestByBucket(submissions, cfg).filter((d) => d.member_id === memberId).sort((a, b) => a.date.localeCompare(b.date));
  const idMeta = allLatest.length ? allLatest[allLatest.length - 1]! : undefined;
  const member_name = idMeta?.member_name || submissions.find((s) => s.member_id === memberId)?.member_name || memberId;
  const division = idMeta?.division || (submissions.find((s) => s.member_id === memberId)?.division as DivisionKey) || "open";

  // 2) Build daily windows with submissions and compute per-habit awards with reasons
  const byDate = new Map<string, RawSub[]>();
  for (const r of rawMine) {
    const list = byDate.get(r.date) || [];
    list.push(r);
    byDate.set(r.date, list);
  }
  // track per-habit awarded points usage across windows for this member to enforce limits
  const limitsByKey = new Map(cfg.checkins.items.map((i) => [i.key, i.limits || []] as const));
  const pointsByKey = new Map(cfg.checkins.items.map((i) => [i.key, i.points] as const));
  const awardedByHabitWindow = new Map<string, Map<string, number>>(); // habit -> windowKey -> points
  function windowKeysFor(habitKey: string, dateYmd: string) {
    const limits = limitsByKey.get(habitKey) || [];
    const keys: Array<{ key: string; max: number; label: string }> = [];
    for (const lim of limits) {
      if (lim.window === "day") keys.push({
        key: `day:${dateYmd}`,
        max: lim.maxPoints,
        label: `Daily cap (${lim.maxPoints})`
      });
      else if (lim.window === "week") keys.push({
        key: `week:${weekKeyFromYmd(dateYmd, lim.weekStartsOn || "sun")}`,
        max: lim.maxPoints,
        label: `Weekly cap (${lim.maxPoints})`
      });
      else if (lim.window === "month") keys.push({
        key: `month:${monthKeyFromYmd(dateYmd)}`,
        max: lim.maxPoints,
        label: `Monthly cap (${lim.maxPoints})`
      });
      else if (lim.window === "challenge") keys.push({
        key: `challenge:${cfg.challengeWindow.start}-${cfg.challengeWindow.end}`,
        max: lim.maxPoints,
        label: `Challenge cap (${lim.maxPoints})`
      });
    }
    return keys;
  }

  const cap = cfg.checkins.maxDailyPoints ?? null;
  const windows: DailyWindowAudit[] = [];
  const datesSorted = Array.from(byDate.keys()).sort();
  for (const date of datesSorted) {
    const subs = (byDate.get(date) || []).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    if (subs.length === 0) {
      // Nothing submitted for this window; skip
      continue;
    }
    const countedIndex = Math.max(0, subs.length - 1);
    const latest = subs[countedIndex];
    if (!latest) {
      // Should not happen since subs.length > 0, but guard for type safety
      continue;
    }
    const submissionsAudit: DailySubmissionAudit[] = subs.map((s, idx) => {
      const dayOfChallenge = Math.round((new Date(s.date).getTime() - new Date(cfg.challengeWindow.start).getTime()) / (1000 * 60 * 60 * 24)) + 1;
      return ({
        // calculate the day of the challenge base on challengeWindow + checkinWindow
        dayOfChallenge,
        timestamp: s.timestamp,
        checkins: s.checkins,
        metrics: s.metrics,
        isLatestForWindow: idx === countedIndex,
        notCountedReason: idx === countedIndex ? undefined : `Superseded by later submission at ${new Date(latest.timestamp).toLocaleTimeString("en-US", {
          timeZone: cfg.timezone,
          hour: "numeric",
          minute: "2-digit"
        })}`,
      })
    });

    const counted = latest;
    const perHabitAwards: Record<string, HabitAwardDetail> = {};
    let dailyBeforeCap = 0;
    for (const [key, basePoints] of pointsByKey.entries()) {
      const attempted = !!counted.checkins[key];
      let awarded = 0;
      const reasons: string[] = [];
      if (attempted && basePoints > 0) {
        let allow = basePoints;
        for (const wk of windowKeysFor(key, date)) {
          const hmap = awardedByHabitWindow.get(key) || new Map<string, number>();
          if (!awardedByHabitWindow.has(key)) awardedByHabitWindow.set(key, hmap);
          const used = hmap.get(wk.key) ?? 0;
          const remaining = Math.max(0, wk.max - used);
          if (remaining <= 0) {
            reasons.push(`${wk.label} reached`);
          }
          allow = Math.min(allow, remaining);
        }
        awarded = Math.max(0, allow);
        if (awarded < basePoints && reasons.length === 0) {
          reasons.push("Limited by configured cap");
        }
        // record awarded across windows
        if (awarded > 0) {
          for (const wk of windowKeysFor(key, date)) {
            const hmap = awardedByHabitWindow.get(key)!;
            hmap.set(wk.key, (hmap.get(wk.key) ?? 0) + awarded);
          }
        }
      }
      perHabitAwards[key] = { attempted, basePoints, awarded, reasons };
      dailyBeforeCap += awarded;
    }

    let dailyPointsAwarded = dailyBeforeCap;
    let dailyCapApplied: { cap: number; before: number; after: number } | undefined;
    if (cap != null && dailyBeforeCap > cap) {
      dailyCapApplied = { cap, before: dailyBeforeCap, after: cap };
      dailyPointsAwarded = cap;
    }

    windows.push({
      date,
      submissions: submissionsAudit,
      countedIndex,
      perHabitAwards,
      dailyPointsAwarded,
      dailyCapApplied
    });
  }

  // Habit totals based on computed windows
  const habitTotal = windows.reduce((sum, w) => sum + w.dailyPointsAwarded, 0);

  // Build latest-by-bucket dailies for performance windows using only counted submissions
  const dailiesForPerf: DailyAggregate[] = windows
    .map((w) => {
      const sub = w.submissions[w.countedIndex];
      if (!sub) return undefined;
      return {
        key: `${memberId}|${w.date}`,
        member_id: memberId,
        member_name,
        division,
        date: w.date,
        checkins: sub.checkins,
        metrics: sub.metrics,
        timestamp: sub.timestamp,
      } as DailyAggregate;
    })
    .filter((x): x is DailyAggregate => !!x);

  const windowsByMember = extractMetricWindows(dailiesForPerf, cfg);
  const w = windowsByMember.get(memberId) || { baseline: {}, final: {} };
  const improvements: Record<string, { improvement: number; points: number; baseline?: number; final?: number }> = {};
  let perfTotal = 0;
  for (const spec of cfg.performance.metrics) {
    const baseline = w.baseline[spec.key];
    const final = w.final[spec.key];
    const direction: "up" | "down" = spec.direction === "down" ? "down" : "up";
    const imp = improvementForMetric(spec.kind, baseline, final, direction);
    const points = spec.scoring({ improvement: imp, baseline, final });
    const hide = !!(spec as any).sensitive;
    improvements[spec.key] = {
      improvement: imp,
      points,
      baseline: hide ? undefined : baseline,
      final: hide ? undefined : final,
    };
    perfTotal += points;
  }

  // Maintain backward-compatible dailyLogs derived from windows
  const dailyLogs: MemberDailyLog[] = windows
    .map((w) => {
      const sub = w.submissions[w.countedIndex];
      if (!sub) return undefined;
      return {
        date: w.date,
        dailyPoints: w.dailyPointsAwarded,
        checkins: sub.checkins,
        metrics: sub.metrics
      } as MemberDailyLog;
    })
    .filter((x): x is MemberDailyLog => !!x);

  const total = habitTotal * cfg.weights.habits + perfTotal * cfg.weights.performance;
  return {
    member_id: memberId,
    member_name,
    division,
    habitPoints: roundTo(habitTotal, 2),
    performancePoints: roundTo(perfTotal, 2),
    total: roundTo(total, 2),
    dailyLogs,
    dailyWindows: windows,
    improvements,
    updatedAt: new Date().toISOString(),
  };
}

export async function computeLeaderboard(cfg: ChallengeConfig, division?: DivisionKey) {
  const submissions = await loadSubmissions(cfg);
  // Latest per (member, date) within challenge window
  const dailies = latestByBucket(submissions, cfg).sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  // Track last known name and division per member
  const memberName = new Map<string, string>();
  const memberDivision = new Map<string, DivisionKey>();
  for (const d of dailies) {
    memberName.set(d.member_id, d.member_name);
    memberDivision.set(d.member_id, d.division);
  }

  const habitByMember = scoreHabits(dailies, cfg);
  const perfByMember = scorePerformance(dailies, cfg, memberDivision);

  const divisions = new Set<DivisionKey>(cfg.divisions.keys.length ? cfg.divisions.keys : Array.from(new Set(Array.from(memberDivision.values()))));

  function buildDivision(div: DivisionKey) {
    const members = Array.from(new Set(Array.from(memberDivision.entries()).filter(([m, d]) => d === div).map(([m]) => m)));
    const rows: MemberScores[] = members.map((m) => {
      const habit = habitByMember.get(m) ?? 0;
      const perf = perfByMember.get(m) ?? 0;
      const total = habit * cfg.weights.habits + perf * cfg.weights.performance;
      return {
        member_id: m,
        member_name: memberName.get(m) ?? m,
        division: div,
        habitPoints: roundTo(habit, 2),
        performancePoints: roundTo(perf, 2),
        total: roundTo(total, 2),
        rank: 0,
      };
    });
    // sort and apply tie-breakers
    rows.sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      if (b.performancePoints !== a.performancePoints) return b.performancePoints - a.performancePoints;
      if (b.habitPoints !== a.habitPoints) return b.habitPoints - a.habitPoints;
      // stable hash fallback
      return (stableHash(a.member_id) % 1000) - (stableHash(b.member_id) % 1000);
    });
    rows.forEach((r, i) => (r.rank = i + 1));
    return rows;
  }

  const nowIso = new Date().toISOString();
  if (division) {
    const rows = buildDivision(division);
    return {
      challengeId: cfg.id,
      challengeTitle: cfg.title,
      division,
      updatedAt: nowIso,
      rows,
    } satisfies LeaderboardResponse;
  }

  // If no division specified, return the first division by default
  const first = Array.from(divisions)[0] ?? "open";
  const rows = buildDivision(first);
  return {
    challengeId: cfg.id,
    challengeTitle: cfg.title,
    division: first,
    updatedAt: nowIso,
    rows,
  } satisfies LeaderboardResponse;
}
