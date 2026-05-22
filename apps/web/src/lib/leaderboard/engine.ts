import {
  type BodyCompositionParticipantAnalysis,
  buildBodyCompositionMemberMeta,
  buildConfiguredBodyCompositionParticipantAnalyses,
  getAdjustedBfpScoringConfig,
  usesAdjustedBfpScoring,
} from "./body-composition-normalization";
import { fetchCsvText, parseCsv } from "./csv";
import {
  calendarDate,
  isWithinYmdRange,
  monthKeyFromYmd,
  scoringDate,
  todayYmd,
  weekKeyFromYmd,
} from "./date";
import { roundTo } from "./scoring";
import type {
  ChallengeConfig,
  DivisionKey,
  LeaderboardResponse,
  Member,
  MemberScores,
  SubmissionRow,
} from "./types";

function stableHash(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function currentChallengeDate(cfg: ChallengeConfig) {
  const today = todayYmd(cfg.timezone);
  if (today < cfg.challengeWindow.start) return cfg.challengeWindow.start;
  if (today > cfg.challengeWindow.end) return cfg.challengeWindow.end;
  return today;
}

export async function loadSubmissions(
  config: ChallengeConfig,
): Promise<SubmissionRow[]> {
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

export async function loadRegisteredMembers(
  config: ChallengeConfig,
): Promise<Map<string, Member>> {
  const registration = config.registration;
  if (
    !registration ||
    registration.dataSource.type !== "csv" ||
    !registration.dataSource.url
  ) {
    return new Map();
  }

  try {
    const text = await fetchCsvText(registration.dataSource.url);
    const rows = parseCsv(text);
    const out = new Map<string, Member>();
    for (const row of rows) {
      const mapped = registration.mapCsvRow(row);
      if (!mapped?.id) continue;
      out.set(mapped.id, mapped);
    }
    return out;
  } catch (error) {
    console.warn(
      `Failed to load registration CSV for challenge ${config.id}:`,
      error,
    );
    return new Map();
  }
}

function resolveSubmissionMember(
  submission: SubmissionRow,
  cfg: ChallengeConfig,
  registrations: Map<string, Member>,
): { memberName: string; division: DivisionKey } {
  const registered = registrations.get(submission.member_id);
  const memberName =
    registered?.name?.trim() ||
    submission.member_name?.trim() ||
    submission.member_id;

  let division = submission.division;
  if (!division && registered && cfg.divisions.resolveDivisionForMember) {
    division = cfg.divisions.resolveDivisionForMember(registered);
  }

  return {
    memberName,
    division: division || "open",
  };
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

function creditCheckinWindow(
  submission: SubmissionRow,
  cfg: ChallengeConfig,
  scoredDate: string,
) {
  const checkins = submission.checkins ?? {};
  if (
    isWithinYmdRange(
      scoredDate,
      cfg.challengeWindow.start,
      cfg.challengeWindow.end,
    )
  ) {
    return {
      date: scoredDate,
      checkins,
      preserveCheckins: {},
    };
  }

  const calendar = calendarDate(submission.timestamp, cfg.timezone);
  const creditedCheckins: Record<string, boolean> = {};
  let creditDate: string | undefined;

  for (const window of cfg.checkins.creditWindows ?? []) {
    if (!checkins[window.key]) continue;
    if (!isWithinYmdRange(calendar, window.start, window.end)) continue;
    creditedCheckins[window.key] = true;
    creditDate = window.creditDate ?? cfg.challengeWindow.start;
  }

  if (!Object.keys(creditedCheckins).length || !creditDate) return undefined;

  return {
    date: creditDate,
    checkins: creditedCheckins,
    preserveCheckins: creditedCheckins,
  };
}

export function latestByBucket(
  subs: SubmissionRow[],
  cfg: ChallengeConfig,
  registrations: Map<string, Member> = new Map(),
): DailyAggregate[] {
  const latest = new Map<string, DailyAggregate>();
  const preservedCheckinsByBucket = new Map<string, Record<string, boolean>>();
  for (const s of subs) {
    const scoredDate = scoringDate(
      s.timestamp,
      cfg.timezone,
      cfg.checkinWindow.startHour,
    );
    const credited = creditCheckinWindow(s, cfg, scoredDate);
    if (!credited) continue;
    const resolved = resolveSubmissionMember(s, cfg, registrations);
    const key = `${s.member_id}|${credited.date}`;
    const preserved = preservedCheckinsByBucket.get(key) ?? {};
    if (Object.keys(credited.preserveCheckins).length > 0) {
      for (const [checkinKey, value] of Object.entries(
        credited.preserveCheckins,
      )) {
        if (value) preserved[checkinKey] = true;
      }
      preservedCheckinsByBucket.set(key, preserved);
    }
    const rec: DailyAggregate = {
      key,
      member_id: s.member_id,
      member_name: resolved.memberName,
      division: resolved.division,
      date: credited.date,
      checkins: { ...credited.checkins, ...preserved },
      metrics: s.metrics ?? {},
      timestamp: s.timestamp,
    };
    const prev = latest.get(key);
    if (!prev || new Date(s.timestamp) > new Date(prev.timestamp)) {
      rec.metrics = { ...(prev?.metrics ?? {}), ...rec.metrics };
      latest.set(key, rec);
    } else if (Object.keys(credited.preserveCheckins).length > 0) {
      prev.checkins = { ...prev.checkins, ...credited.preserveCheckins };
      prev.metrics = { ...rec.metrics, ...prev.metrics };
    }
  }
  return Array.from(latest.values());
}

export function scoreHabits(dailies: DailyAggregate[], cfg: ChallengeConfig) {
  return awardHabitPoints(dailies, cfg).totalByMember;
}

export function awardHabitPoints(
  dailies: DailyAggregate[],
  cfg: ChallengeConfig,
) {
  const pointsByKey = new Map(
    cfg.checkins.items.map((i) => [i.key, i.points] as const),
  );
  const limitsByKey = new Map(
    cfg.checkins.items.map((i) => [i.key, i.limits || []] as const),
  );
  const cap = cfg.checkins.maxDailyPoints ?? null;
  const totalByMember = new Map<string, number>();
  const totalByMemberHabit = new Map<string, Map<string, number>>();
  const awardedByMemberDateHabit = new Map<string, Map<string, number>>();
  const awardedByMemberHabitWindow = new Map<
    string,
    Map<string, Map<string, number>>
  >();

  function windowKeysFor(habitKey: string, dateYmd: string) {
    const limits = limitsByKey.get(habitKey) || [];
    const keys: Array<{ key: string; max: number }> = [];
    for (const lim of limits) {
      if (lim.window === "day") {
        keys.push({ key: `day:${dateYmd}`, max: lim.maxPoints });
      } else if (lim.window === "week") {
        keys.push({
          key: `week:${weekKeyFromYmd(dateYmd, lim.weekStartsOn || "sun")}`,
          max: lim.maxPoints,
        });
      } else if (lim.window === "month") {
        keys.push({
          key: `month:${monthKeyFromYmd(dateYmd)}`,
          max: lim.maxPoints,
        });
      } else if (lim.window === "challenge") {
        keys.push({
          key: `challenge:${cfg.challengeWindow.start}-${cfg.challengeWindow.end}`,
          max: lim.maxPoints,
        });
      }
    }
    return keys;
  }

  for (const d of dailies) {
    let dayAward = 0;
    const perHabitAward = new Map<string, number>();
    for (const [key, value] of Object.entries(d.checkins)) {
      if (!value || !pointsByKey.has(key)) continue;
      const base = pointsByKey.get(key)!;
      const windowKeys = windowKeysFor(key, d.date);
      let allowed = base;
      for (const wk of windowKeys) {
        const memberWindows =
          awardedByMemberHabitWindow.get(d.member_id) || new Map();
        if (!awardedByMemberHabitWindow.has(d.member_id)) {
          awardedByMemberHabitWindow.set(d.member_id, memberWindows);
        }
        const habitWindows = memberWindows.get(key) || new Map();
        if (!memberWindows.has(key)) {
          memberWindows.set(key, habitWindows);
        }
        const used = habitWindows.get(wk.key) ?? 0;
        const remaining = Math.max(0, wk.max - used);
        allowed = Math.min(allowed, remaining);
      }
      if (cap != null) {
        allowed = Math.min(allowed, Math.max(0, cap - dayAward));
      }
      if (allowed > 0) {
        dayAward += allowed;
        perHabitAward.set(key, (perHabitAward.get(key) ?? 0) + allowed);
        for (const wk of windowKeys) {
          const memberWindows = awardedByMemberHabitWindow.get(d.member_id)!;
          const habitWindows = memberWindows.get(key)!;
          habitWindows.set(wk.key, (habitWindows.get(wk.key) ?? 0) + allowed);
        }
      }
    }
    totalByMember.set(
      d.member_id,
      (totalByMember.get(d.member_id) ?? 0) + dayAward,
    );
    if (perHabitAward.size > 0) {
      const memberHabitTotals =
        totalByMemberHabit.get(d.member_id) ?? new Map<string, number>();
      if (!totalByMemberHabit.has(d.member_id)) {
        totalByMemberHabit.set(d.member_id, memberHabitTotals);
      }
      for (const [habitKey, habitAward] of perHabitAward) {
        memberHabitTotals.set(
          habitKey,
          (memberHabitTotals.get(habitKey) ?? 0) + habitAward,
        );
      }
      awardedByMemberDateHabit.set(d.key, perHabitAward);
    }
  }
  return {
    totalByMember,
    totalByMemberHabit,
    awardedByMemberDateHabit,
  };
}

export type MetricWindows = {
  baseline: Record<string, number | undefined>;
  final: Record<string, number | undefined>;
};

type MetricSourceRow = Pick<
  SubmissionRow,
  "member_id" | "metrics" | "timestamp"
>;

function normalizeMetricRows(
  metricRows: MetricSourceRow[],
  cfg: ChallengeConfig,
) {
  return metricRows
    .map((row) => ({
      member_id: row.member_id,
      date: calendarDate(row.timestamp, cfg.timezone),
      metrics: row.metrics ?? {},
      timestamp: row.timestamp,
    }))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export function extractMetricWindows(
  metricRows: MetricSourceRow[],
  cfg: ChallengeConfig,
) {
  const live = cfg.performance.liveScoring?.mode === "latest_to_date";
  const lockAfterEnd = !!cfg.performance.liveScoring?.lockAfterEnd;
  const today = todayYmd(cfg.timezone);
  const challengeEnd = cfg.challengeWindow.end;
  const liveCutoff =
    today < challengeEnd || !lockAfterEnd ? today : challengeEnd;

  const byMember = new Map<string, MetricWindows>();
  for (const row of normalizeMetricRows(metricRows, cfg)) {
    if (
      isWithinYmdRange(
        row.date,
        cfg.performance.baselineWindow.start,
        cfg.performance.baselineWindow.end,
      )
    ) {
      let mw = byMember.get(row.member_id);
      if (!mw) {
        mw = { baseline: {}, final: {} };
        byMember.set(row.member_id, mw);
      }
      for (const [k, v] of Object.entries(row.metrics)) {
        if (mw.baseline[k] == null && isFinite(v)) {
          mw.baseline[k] = v;
        }
      }
    }

    const eligibleFinal = live
      ? isWithinYmdRange(
          row.date,
          cfg.challengeWindow.start,
          cfg.challengeWindow.end,
        ) && row.date <= liveCutoff
      : isWithinYmdRange(
          row.date,
          cfg.performance.finalWindow.start,
          cfg.performance.finalWindow.end,
        );

    if (eligibleFinal) {
      let mw = byMember.get(row.member_id);
      if (!mw) {
        mw = { baseline: {}, final: {} };
        byMember.set(row.member_id, mw);
      }
      for (const [k, v] of Object.entries(row.metrics)) {
        if (isFinite(v)) {
          mw.final[k] = v;
        }
      }
    }
  }
  return byMember;
}

function improvementForMetric(
  kind: string,
  baseline?: number,
  final?: number,
  direction: "up" | "down" = "up",
) {
  if (baseline == null || final == null) return 0;
  if (!isFinite(baseline) || !isFinite(final)) return 0;
  if (kind === "percent_gain") {
    if (baseline <= 0) return 0;
    const pct = (final - baseline) / baseline;
    return Math.max(0, pct);
  }
  const delta = final - baseline;
  const raw = direction === "down" ? -delta : delta;
  return Math.max(0, raw);
}

export function scorePerformance(
  metricRows: MetricSourceRow[],
  cfg: ChallengeConfig,
  memberDivision: Map<string, DivisionKey>,
) {
  const windowsByMember = extractMetricWindows(metricRows, cfg);
  const topByDivisionMetric = new Map<string, number>();
  const improvements: Map<string, Map<string, number>> = new Map();

  for (const [member, windows] of windowsByMember) {
    const div = memberDivision.get(member) ?? "open";
    for (const spec of cfg.performance.metrics) {
      const baseline = windows.baseline[spec.key];
      const final = windows.final[spec.key];
      const direction: "up" | "down" =
        (spec as { direction?: "up" | "down" }).direction === "down"
          ? "down"
          : "up";
      const imp = improvementForMetric(spec.kind, baseline, final, direction);
      if (!improvements.has(member)) improvements.set(member, new Map());
      improvements.get(member)!.set(spec.key, imp);
      const topKey = `${div}|${spec.key}`;
      if ((spec.scoring as { _method?: string })._method === "relative") {
        const prev = topByDivisionMetric.get(topKey) ?? 0;
        if (imp > prev) topByDivisionMetric.set(topKey, imp);
      }
    }
  }

  const perfPoints = new Map<string, number>();
  for (const [member, impByMetric] of improvements) {
    const div = memberDivision.get(member) ?? "open";
    let pts = 0;
    for (const spec of cfg.performance.metrics) {
      const imp = impByMetric.get(spec.key) ?? 0;
      const top = topByDivisionMetric.get(`${div}|${spec.key}`);
      pts += spec.scoring({
        improvement: imp,
        baseline: undefined,
        final: undefined,
        topImprovementInDivision: top,
      });
    }
    perfPoints.set(member, pts);
  }
  return perfPoints;
}

function adjustedBfpPerformanceOverrides(args: {
  cfg: ChallengeConfig;
  submissions: SubmissionRow[];
  memberIds: string[];
  memberName: Map<string, string>;
  memberDivision: Map<string, DivisionKey>;
}) {
  const { cfg, memberDivision, memberIds, memberName, submissions } = args;
  const scoring = getAdjustedBfpScoringConfig(cfg);
  if (!scoring) return undefined;
  if (
    !cfg.performance.metrics.some(
      (metric) => metric.key === scoring.metricKeys.bodyFatPct,
    )
  ) {
    return undefined;
  }

  const analyses = buildConfiguredBodyCompositionParticipantAnalyses({
    cfg,
    submissions,
    memberIds,
    memberMeta: buildBodyCompositionMemberMeta({
      memberIds,
      memberName,
      memberDivision,
    }),
    end: currentChallengeDate(cfg),
  });

  return new Map(
    analyses.map((analysis) => [
      analysis.memberId,
      analysis.muscleStabilizedScore?.points ?? 0,
    ]),
  );
}

export interface MemberDailyLog {
  date: string;
  dailyPoints: number;
  checkins: Record<string, boolean>;
  metrics: Record<string, number>;
}

export interface HabitAwardDetail {
  attempted: boolean;
  basePoints: number;
  awarded: number;
  reasons: string[];
}

export interface DailySubmissionAudit {
  timestamp: string;
  checkins: Record<string, boolean>;
  metrics: Record<string, number>;
  isLatestForWindow: boolean;
  notCountedReason?: string;
  dayOfChallenge: number;
}

export interface DailyWindowAudit {
  date: string;
  submissions: DailySubmissionAudit[];
  countedIndex: number;
  perHabitAwards: Record<string, HabitAwardDetail>;
  dailyPointsAwarded: number;
  dailyCapApplied?: { cap: number; before: number; after: number };
}

export interface MemberDetailResponse {
  member_id: string;
  member_name: string;
  division: DivisionKey;
  habitPoints: number;
  performancePoints: number;
  total: number;
  dailyLogs: MemberDailyLog[];
  dailyWindows?: DailyWindowAudit[];
  improvements: Record<
    string,
    { improvement: number; points: number; baseline?: number; final?: number }
  >;
  bodyComposition?: BodyCompositionParticipantAnalysis;
  updatedAt: string;
}

export async function computeMemberDetail(
  cfg: ChallengeConfig,
  memberId: string,
): Promise<MemberDetailResponse | undefined> {
  const [submissions, registrations] = await Promise.all([
    loadSubmissions(cfg),
    loadRegisteredMembers(cfg),
  ]);

  type RawSub = {
    timestamp: string;
    date: string;
    checkins: Record<string, boolean>;
    preserveCheckins: Record<string, boolean>;
    metrics: Record<string, number>;
  };
  const rawMine: RawSub[] = [];
  for (const s of submissions) {
    if (s.member_id !== memberId) continue;
    const date = scoringDate(
      s.timestamp,
      cfg.timezone,
      cfg.checkinWindow.startHour,
    );
    const credited = creditCheckinWindow(s, cfg, date);
    if (!credited) continue;
    rawMine.push({
      timestamp: s.timestamp,
      date: credited.date,
      checkins: credited.checkins,
      preserveCheckins: credited.preserveCheckins,
      metrics: s.metrics ?? {},
    });
  }
  if (rawMine.length === 0) return undefined;

  const allLatest = latestByBucket(submissions, cfg, registrations)
    .filter((d) => d.member_id === memberId)
    .sort((a, b) => a.date.localeCompare(b.date));
  const idMeta = allLatest.length ? allLatest[allLatest.length - 1] : undefined;
  const member_name =
    idMeta?.member_name ||
    submissions.find((s) => s.member_id === memberId)?.member_name ||
    memberId;
  const division =
    idMeta?.division ||
    (submissions.find((s) => s.member_id === memberId)
      ?.division as DivisionKey) ||
    "open";

  const byDate = new Map<string, RawSub[]>();
  for (const r of rawMine) {
    const list = byDate.get(r.date) || [];
    list.push(r);
    byDate.set(r.date, list);
  }
  const limitsByKey = new Map(
    cfg.checkins.items.map((i) => [i.key, i.limits || []] as const),
  );
  const pointsByKey = new Map(
    cfg.checkins.items.map((i) => [i.key, i.points] as const),
  );
  const awardedByHabitWindow = new Map<string, Map<string, number>>();
  function windowKeysFor(habitKey: string, dateYmd: string) {
    const limits = limitsByKey.get(habitKey) || [];
    const keys: Array<{ key: string; max: number; label: string }> = [];
    for (const lim of limits) {
      if (lim.window === "day") {
        keys.push({
          key: `day:${dateYmd}`,
          max: lim.maxPoints,
          label: `Daily cap (${lim.maxPoints})`,
        });
      } else if (lim.window === "week") {
        keys.push({
          key: `week:${weekKeyFromYmd(dateYmd, lim.weekStartsOn || "sun")}`,
          max: lim.maxPoints,
          label: `Weekly cap (${lim.maxPoints})`,
        });
      } else if (lim.window === "month") {
        keys.push({
          key: `month:${monthKeyFromYmd(dateYmd)}`,
          max: lim.maxPoints,
          label: `Monthly cap (${lim.maxPoints})`,
        });
      } else if (lim.window === "challenge") {
        keys.push({
          key: `challenge:${cfg.challengeWindow.start}-${cfg.challengeWindow.end}`,
          max: lim.maxPoints,
          label: `Challenge cap (${lim.maxPoints})`,
        });
      }
    }
    return keys;
  }

  const cap = cfg.checkins.maxDailyPoints ?? null;
  const windows: DailyWindowAudit[] = [];
  const datesSorted = Array.from(byDate.keys()).sort();
  for (const date of datesSorted) {
    const subs = (byDate.get(date) || []).sort((a, b) =>
      a.timestamp.localeCompare(b.timestamp),
    );
    if (subs.length === 0) continue;
    const countedIndex = Math.max(0, subs.length - 1);
    const latest = subs[countedIndex];
    if (!latest) continue;
    const preservedCheckins: Record<string, boolean> = {};
    const mergedMetrics: Record<string, number> = {};
    for (const sub of subs) {
      Object.assign(mergedMetrics, sub.metrics);
      for (const [checkinKey, value] of Object.entries(sub.preserveCheckins)) {
        if (value) preservedCheckins[checkinKey] = true;
      }
    }
    const counted: RawSub = {
      ...latest,
      checkins: { ...latest.checkins, ...preservedCheckins },
      metrics: mergedMetrics,
    };
    const submissionsAudit: DailySubmissionAudit[] = subs.map((s, idx) => {
      const dayOfChallenge =
        Math.round(
          (new Date(s.date).getTime() -
            new Date(cfg.challengeWindow.start).getTime()) /
            (1000 * 60 * 60 * 24),
        ) + 1;
      return {
        dayOfChallenge,
        timestamp: s.timestamp,
        checkins: s.checkins,
        metrics: s.metrics,
        isLatestForWindow: idx === countedIndex,
        notCountedReason:
          idx === countedIndex
            ? undefined
            : `Superseded by later submission at ${new Date(
                latest.timestamp,
              ).toLocaleTimeString("en-US", {
                timeZone: cfg.timezone,
                hour: "numeric",
                minute: "2-digit",
              })}`,
      };
    });

    const perHabitAwards: Record<string, HabitAwardDetail> = {};
    let dailyBeforeCap = 0;
    for (const [key, basePoints] of pointsByKey.entries()) {
      const attempted = !!counted.checkins[key];
      let awarded = 0;
      const reasons: string[] = [];
      if (attempted && basePoints > 0) {
        let allow = basePoints;
        for (const wk of windowKeysFor(key, date)) {
          const hmap =
            awardedByHabitWindow.get(key) || new Map<string, number>();
          if (!awardedByHabitWindow.has(key)) {
            awardedByHabitWindow.set(key, hmap);
          }
          const used = hmap.get(wk.key) ?? 0;
          const remaining = Math.max(0, wk.max - used);
          if (remaining <= 0) reasons.push(`${wk.label} reached`);
          allow = Math.min(allow, remaining);
        }
        awarded = Math.max(0, allow);
        if (awarded < basePoints && reasons.length === 0) {
          reasons.push("Limited by configured cap");
        }
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
    let dailyCapApplied:
      | { cap: number; before: number; after: number }
      | undefined;
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
      dailyCapApplied,
    });
  }

  const habitTotal = windows.reduce((sum, w) => sum + w.dailyPointsAwarded, 0);
  const metricRows = submissions.filter((s) => s.member_id === memberId);
  const hasAdjustedBfpScoring = usesAdjustedBfpScoring(cfg);
  const bodyComposition = hasAdjustedBfpScoring
    ? buildConfiguredBodyCompositionParticipantAnalyses({
        cfg,
        submissions,
        memberIds: [memberId],
        memberMeta: new Map([
          [
            memberId,
            {
              name: member_name,
              division,
            },
          ],
        ]),
        end: currentChallengeDate(cfg),
      })[0]
    : undefined;
  const windowsByMember = extractMetricWindows(metricRows, cfg);
  const w = windowsByMember.get(memberId) || { baseline: {}, final: {} };
  const improvements: Record<
    string,
    { improvement: number; points: number; baseline?: number; final?: number }
  > = {};
  let perfTotal = 0;
  const adjustedBfpMetricKey = getAdjustedBfpScoringConfig(cfg)?.metricKeys
    .bodyFatPct;
  const performanceMetricsToScore = hasAdjustedBfpScoring
    ? cfg.performance.metrics.filter(
        (spec) => spec.key === adjustedBfpMetricKey,
      )
    : cfg.performance.metrics;

  for (const spec of performanceMetricsToScore) {
    const baseline = w.baseline[spec.key];
    const final = w.final[spec.key];
    const direction: "up" | "down" = spec.direction === "down" ? "down" : "up";
    const adjustedBfpScore =
      spec.key === adjustedBfpMetricKey
        ? bodyComposition?.muscleStabilizedScore
        : undefined;
    const imp =
      adjustedBfpScore?.bodyFatPctDrop ??
      improvementForMetric(spec.kind, baseline, final, direction);
    const points =
      adjustedBfpScore?.points ??
      spec.scoring({ improvement: imp, baseline, final });
    const hide = !!(spec as { sensitive?: boolean }).sensitive;
    improvements[spec.key] = {
      improvement: imp,
      points,
      baseline: hide ? undefined : baseline,
      final: hide ? undefined : final,
    };
    perfTotal += points;
  }

  const dailyLogs: MemberDailyLog[] = windows
    .map((w) => {
      const sub = w.submissions[w.countedIndex];
      if (!sub) return undefined;
      return {
        date: w.date,
        dailyPoints: w.dailyPointsAwarded,
        checkins: sub.checkins,
        metrics: sub.metrics,
      };
    })
    .filter((x): x is MemberDailyLog => !!x);

  const total =
    habitTotal * cfg.weights.habits + perfTotal * cfg.weights.performance;
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
    bodyComposition,
    updatedAt: new Date().toISOString(),
  };
}

export async function computeLeaderboard(
  cfg: ChallengeConfig,
  division?: DivisionKey,
) {
  const [submissions, registrations] = await Promise.all([
    loadSubmissions(cfg),
    loadRegisteredMembers(cfg),
  ]);
  const dailies = latestByBucket(submissions, cfg, registrations).sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp),
  );

  const memberName = new Map<string, string>();
  const memberDivision = new Map<string, DivisionKey>();
  for (const d of dailies) {
    memberName.set(d.member_id, d.member_name);
    memberDivision.set(d.member_id, d.division);
  }

  const allMemberIds = Array.from(memberDivision.keys());
  const habitByMember = scoreHabits(dailies, cfg);
  const rawPerfByMember = scorePerformance(submissions, cfg, memberDivision);
  const adjustedBfpPerfOverride = adjustedBfpPerformanceOverrides({
    cfg,
    submissions,
    memberIds: allMemberIds,
    memberName,
    memberDivision,
  });
  const perfByMember = adjustedBfpPerfOverride ?? rawPerfByMember;

  const divisions = new Set<DivisionKey>(
    cfg.divisions.keys.length
      ? cfg.divisions.keys
      : Array.from(new Set(Array.from(memberDivision.values()))),
  );

  function buildDivision(div: DivisionKey) {
    const members = Array.from(
      new Set(
        Array.from(memberDivision.entries())
          .filter(([m, d]) => d === div)
          .map(([m]) => m),
      ),
    );
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
    rows.sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      if (b.performancePoints !== a.performancePoints) {
        return b.performancePoints - a.performancePoints;
      }
      if (b.habitPoints !== a.habitPoints) return b.habitPoints - a.habitPoints;
      return (
        (stableHash(a.member_id) % 1000) - (stableHash(b.member_id) % 1000)
      );
    });
    rows.forEach((r, i) => (r.rank = i + 1));
    return rows;
  }

  const nowIso = new Date().toISOString();
  if (division) {
    return {
      challengeId: cfg.id,
      challengeTitle: cfg.title,
      division,
      updatedAt: nowIso,
      rows: buildDivision(division),
    } satisfies LeaderboardResponse;
  }

  const first = Array.from(divisions)[0] ?? "open";
  return {
    challengeId: cfg.id,
    challengeTitle: cfg.title,
    division: first,
    updatedAt: nowIso,
    rows: buildDivision(first),
  } satisfies LeaderboardResponse;
}
