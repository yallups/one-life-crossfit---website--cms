import { calendarDate, isWithinYmdRange, todayYmd } from "./date";
import {
  extractMetricWindows,
  latestByBucket,
  loadRegisteredMembers,
  loadSubmissions,
  scoreHabits,
  scorePerformance,
  type DailyAggregate,
} from "./engine";
import { getChallengeConfig } from "./registry";
import { roundTo } from "./scoring";
import type { ChallengeConfig, DivisionKey, SubmissionRow } from "./types";

export type ReviewRangeMode = "this_week" | "last_week" | "week" | "all" | "custom";

export interface ReviewRangeSelection {
  mode: ReviewRangeMode;
  week?: number;
  start?: string;
  end?: string;
}

export interface ReviewWeekOption {
  week: number;
  label: string;
  start: string;
  end: string;
  isCurrentWeek: boolean;
}

export interface MemberReviewRow {
  memberId: string;
  memberName: string;
  division: DivisionKey;
  complianceRate: number;
  habitPointsInRange: number;
  possibleHabitPointsInRange: number;
  completedDays: number;
  possibleDays: number;
  totalScoreToDate: number;
  habitPointsToDate: number;
  performancePointsToDate: number;
  baselineWeight?: number;
  latestWeight?: number;
  weightDelta?: number;
  baselineBodyFatPct?: number;
  latestBodyFatPct?: number;
  bodyFatPctDelta?: number;
  baselineFatMass?: number;
  latestFatMass?: number;
  fatMassDelta?: number;
  baselineMuscleMass?: number;
  latestMuscleMass?: number;
  muscleMassDelta?: number;
}

export interface ReviewSummary {
  totalParticipants: number;
  activeParticipants: number;
  averageComplianceRate: number;
  totalHabitPoints: number;
  totalPossibleHabitPoints: number;
  averageWeightLoss: number;
  totalWeightLoss: number;
  averageBodyFatPctDrop: number;
  averageFatMassLoss: number;
  totalFatMassLoss: number;
  averageMuscleMassGain: number;
}

export interface ReviewCorrelationPoint {
  memberId: string;
  memberName: string;
  division: DivisionKey;
  complianceRate: number;
  weightLoss?: number;
  bodyFatPctDrop?: number;
  fatMassLoss?: number;
  score: number;
}

export interface ReviewResponse {
  challenge: { id: string; slug: string; year: number; title: string };
  division: DivisionKey | "all";
  range: {
    mode: ReviewRangeMode;
    label: string;
    start: string;
    end: string;
    week?: number;
    currentWeek: number;
    weekOptions: ReviewWeekOption[];
  };
  summary: ReviewSummary;
  challengeToDateSummary: ReviewSummary;
  members: MemberReviewRow[];
  biggestImpact: {
    topCompliance: MemberReviewRow[];
    topBodyFatImprovement: MemberReviewRow[];
    topFatMassLoss: MemberReviewRow[];
    topOverallImpact: MemberReviewRow[];
  };
  correlations: { complianceVsSuccess: ReviewCorrelationPoint[] };
  generatedAt: string;
}

function parseYmd(ymd: string) {
  return new Date(`${ymd}T00:00:00.000Z`);
}

function addDays(ymd: string, days: number) {
  const dt = parseYmd(ymd);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function diffDaysInclusive(start: string, end: string) {
  return Math.floor((parseYmd(end).getTime() - parseYmd(start).getTime()) / 86400000) + 1;
}

function formatShortRange(start: string, end: string) {
  const a = new Date(`${start}T00:00:00`);
  const b = new Date(`${end}T00:00:00`);
  const left = a.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const right = b.toLocaleDateString("en-US", {
    month: a.getMonth() === b.getMonth() ? undefined : "short",
    day: "numeric",
  });
  return `${left}–${right}`;
}

function buildWeekOptions(cfg: ChallengeConfig): ReviewWeekOption[] {
  const totalWeeks = Math.ceil(diffDaysInclusive(cfg.challengeWindow.start, cfg.challengeWindow.end) / 7);
  const today = todayYmd(cfg.timezone);
  const elapsedDays = today < cfg.challengeWindow.start ? 0 : diffDaysInclusive(cfg.challengeWindow.start, today) - 1;
  const currentWeek = Math.min(totalWeeks, Math.max(1, Math.floor(elapsedDays / 7) + 1));
  const out: ReviewWeekOption[] = [];
  for (let week = 1; week <= totalWeeks; week++) {
    const start = addDays(cfg.challengeWindow.start, (week - 1) * 7);
    const rawEnd = addDays(start, 6);
    const end = rawEnd > cfg.challengeWindow.end ? cfg.challengeWindow.end : rawEnd;
    out.push({
      week,
      start,
      end,
      label: `Week ${week} · ${formatShortRange(start, end)}`,
      isCurrentWeek: week === currentWeek,
    });
  }
  return out;
}

function resolveRange(cfg: ChallengeConfig, selection: ReviewRangeSelection) {
  const weekOptions = buildWeekOptions(cfg);
  const currentWeek = weekOptions.find((w) => w.isCurrentWeek)?.week ?? 1;
  if (selection.mode === "all") {
    return { label: "All weeks", start: cfg.challengeWindow.start, end: cfg.challengeWindow.end, currentWeek, weekOptions };
  }
  if (selection.mode === "custom") {
    const start = selection.start && selection.start >= cfg.challengeWindow.start ? selection.start : cfg.challengeWindow.start;
    const end = selection.end && selection.end <= cfg.challengeWindow.end ? selection.end : cfg.challengeWindow.end;
    return { label: `Custom · ${formatShortRange(start, end)}`, start, end, currentWeek, weekOptions };
  }
  const weekNum = selection.mode === "last_week" ? Math.max(1, currentWeek - 1) : (selection.mode === "week" ? (selection.week ?? currentWeek) : currentWeek);
  const week = weekOptions.find((w) => w.week === weekNum) ?? weekOptions[0]!;
  return { label: week.label, start: week.start, end: week.end, week: week.week, currentWeek, weekOptions };
}

function average(values: number[]) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function safeRound(value: number, decimals = 2) {
  return Number.isFinite(value) ? roundTo(value, decimals) : 0;
}

function improvementDown(baseline?: number, latest?: number) {
  return baseline == null || latest == null ? undefined : baseline - latest;
}

function improvementUp(baseline?: number, latest?: number) {
  return baseline == null || latest == null ? undefined : latest - baseline;
}

function findMetricKey(cfg: ChallengeConfig, preferred: string[], labels: string[]) {
  for (const key of preferred) {
    if (cfg.performance.metrics.some((m) => m.key === key)) return key;
  }
  const match = cfg.performance.metrics.find((m) => {
    const hay = `${m.key} ${m.label}`.toLowerCase();
    return labels.some((label) => hay.includes(label.toLowerCase()));
  });
  return match?.key;
}

function latestMetricInRange(submissions: SubmissionRow[], cfg: ChallengeConfig, memberId: string, key: string | undefined, start: string, end: string) {
  if (!key) return undefined;
  const rows = submissions
    .filter((s) => s.member_id === memberId)
    .map((s) => ({ date: calendarDate(s.timestamp, cfg.timezone), timestamp: s.timestamp, value: s.metrics?.[key] }))
    .filter((row) => row.value != null && isWithinYmdRange(row.date, start, end))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return rows.length ? rows[rows.length - 1]!.value : undefined;
}

function possibleHabitPointsForRange(cfg: ChallengeConfig, division: DivisionKey, start: string, end: string) {
  const dailies: DailyAggregate[] = [];
  let date = start;
  while (date <= end) {
    const checkins = Object.fromEntries(cfg.checkins.items.map((item) => [item.key, true]));
    dailies.push({
      key: `possible|${date}`,
      member_id: "possible",
      member_name: "Possible",
      division,
      date,
      checkins,
      metrics: {},
      timestamp: `${date}T12:00:00.000Z`,
    });
    date = addDays(date, 1);
  }
  return scoreHabits(dailies, cfg).get("possible") ?? 0;
}

function buildSummary(rows: MemberReviewRow[]): ReviewSummary {
  const weightLosses = rows.map((r) => r.weightDelta).filter((v): v is number => v != null);
  const bodyFatDrops = rows.map((r) => r.bodyFatPctDelta).filter((v): v is number => v != null);
  const fatMassLosses = rows.map((r) => r.fatMassDelta).filter((v): v is number => v != null);
  const muscleGains = rows.map((r) => r.muscleMassDelta).filter((v): v is number => v != null);
  const totalHabitPoints = rows.reduce((sum, r) => sum + r.habitPointsInRange, 0);
  const totalPossibleHabitPoints = rows.reduce((sum, r) => sum + r.possibleHabitPointsInRange, 0);
  return {
    totalParticipants: rows.length,
    activeParticipants: rows.filter((r) => r.habitPointsInRange > 0).length,
    averageComplianceRate: safeRound(average(rows.map((r) => r.complianceRate)), 4),
    totalHabitPoints: safeRound(totalHabitPoints),
    totalPossibleHabitPoints: safeRound(totalPossibleHabitPoints),
    averageWeightLoss: safeRound(average(weightLosses)),
    totalWeightLoss: safeRound(weightLosses.reduce((a, b) => a + b, 0)),
    averageBodyFatPctDrop: safeRound(average(bodyFatDrops)),
    averageFatMassLoss: safeRound(average(fatMassLosses)),
    totalFatMassLoss: safeRound(fatMassLosses.reduce((a, b) => a + b, 0)),
    averageMuscleMassGain: safeRound(average(muscleGains)),
  };
}

function toDateBoundedSubmissions(submissions: SubmissionRow[], cfg: ChallengeConfig, end: string) {
  return submissions.filter((s) => {
    const date = calendarDate(s.timestamp, cfg.timezone);
    return isWithinYmdRange(date, cfg.challengeWindow.start, end);
  });
}

export async function computeChallengeReview(challenge: string, year: number, division: DivisionKey | "all", selection: ReviewRangeSelection): Promise<ReviewResponse | undefined> {
  const cfg = getChallengeConfig(challenge, year);
  if (!cfg) return undefined;
  const [submissions, registrations] = await Promise.all([loadSubmissions(cfg), loadRegisteredMembers(cfg)]);
  const resolvedRange = resolveRange(cfg, selection);
  const allDailies = latestByBucket(submissions, cfg, registrations).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const memberDivision = new Map<string, DivisionKey>();
  const memberName = new Map<string, string>();
  for (const d of allDailies) {
    memberDivision.set(d.member_id, d.division);
    memberName.set(d.member_id, d.member_name);
  }
  const metricWindows = extractMetricWindows(submissions, cfg);
  const scoreSubsToDate = toDateBoundedSubmissions(submissions, cfg, resolvedRange.end);
  const dailiesToDate = allDailies.filter((d) => d.date <= resolvedRange.end);
  const memberIds = Array.from(new Set(Array.from(memberDivision.entries()).filter(([_, divKey]) => division === "all" || divKey === division).map(([id]) => id)));

  const habitToDate = scoreHabits(
    dailiesToDate.filter((d) => division === "all" || d.division === division),
    cfg,
  );
  const perfToDate = scorePerformance(scoreSubsToDate, cfg, memberDivision);

  const weightKey = findMetricKey(cfg, ["body_weight_lb"], ["body weight", "weight"]);
  const bodyFatPctKey = findMetricKey(cfg, ["inbody_body_fat_pct"], ["body fat percentage", "percent body fat", "body fat %", "pbf"]);
  const fatMassKey = findMetricKey(cfg, ["inbody_fat_mass_lb"], ["body fat mass", "fat mass"]);
  const muscleKey = findMetricKey(cfg, ["inbody_muscle_mass_lb"], ["muscle mass", "skeletal muscle mass", "smm"]);

  const rangePossibleHabitPoints = possibleHabitPointsForRange(cfg, division === "all" ? "open" : division, resolvedRange.start, resolvedRange.end);
  const challengeToDatePossibleHabitPoints = possibleHabitPointsForRange(cfg, division === "all" ? "open" : division, cfg.challengeWindow.start, resolvedRange.end);

  const rows = memberIds.map((memberId) => {
    const memberDailiesInRange = allDailies.filter((d) => d.member_id === memberId && isWithinYmdRange(d.date, resolvedRange.start, resolvedRange.end));
    const memberHabitPointsInRange = scoreHabits(memberDailiesInRange, cfg).get(memberId) ?? 0;
    const completedDays = memberDailiesInRange.length;
    const possibleDays = diffDaysInclusive(resolvedRange.start, resolvedRange.end);
    const complianceRate = rangePossibleHabitPoints > 0 ? memberHabitPointsInRange / rangePossibleHabitPoints : 0;

    const windows = metricWindows.get(memberId);
    const baselineWeight = weightKey ? windows?.baseline[weightKey] : undefined;
    const latestWeight = latestMetricInRange(submissions, cfg, memberId, weightKey, resolvedRange.start, resolvedRange.end) ?? (weightKey ? windows?.final[weightKey] : undefined);
    const baselineBodyFatPct = bodyFatPctKey ? windows?.baseline[bodyFatPctKey] : undefined;
    const latestBodyFatPct = latestMetricInRange(submissions, cfg, memberId, bodyFatPctKey, resolvedRange.start, resolvedRange.end) ?? (bodyFatPctKey ? windows?.final[bodyFatPctKey] : undefined);
    const baselineFatMass = fatMassKey ? windows?.baseline[fatMassKey] : undefined;
    const latestFatMass = latestMetricInRange(submissions, cfg, memberId, fatMassKey, resolvedRange.start, resolvedRange.end) ?? (fatMassKey ? windows?.final[fatMassKey] : undefined);
    const baselineMuscleMass = muscleKey ? windows?.baseline[muscleKey] : undefined;
    const latestMuscleMass = latestMetricInRange(submissions, cfg, memberId, muscleKey, resolvedRange.start, resolvedRange.end) ?? (muscleKey ? windows?.final[muscleKey] : undefined);

    const habitPointsToDate = habitToDate.get(memberId) ?? 0;
    const performancePointsToDate = perfToDate.get(memberId) ?? 0;
    const totalScoreToDate = habitPointsToDate * cfg.weights.habits + performancePointsToDate * cfg.weights.performance;

    return {
      memberId,
      memberName: memberName.get(memberId) ?? memberId,
      division: memberDivision.get(memberId) ?? "open",
      complianceRate: safeRound(complianceRate, 4),
      habitPointsInRange: safeRound(memberHabitPointsInRange),
      possibleHabitPointsInRange: safeRound(rangePossibleHabitPoints),
      completedDays,
      possibleDays,
      totalScoreToDate: safeRound(totalScoreToDate),
      habitPointsToDate: safeRound(habitPointsToDate),
      performancePointsToDate: safeRound(performancePointsToDate),
      baselineWeight,
      latestWeight,
      weightDelta: baselineWeight != null && latestWeight != null ? safeRound(improvementDown(baselineWeight, latestWeight) ?? 0) : undefined,
      baselineBodyFatPct,
      latestBodyFatPct,
      bodyFatPctDelta: baselineBodyFatPct != null && latestBodyFatPct != null ? safeRound(improvementDown(baselineBodyFatPct, latestBodyFatPct) ?? 0) : undefined,
      baselineFatMass,
      latestFatMass,
      fatMassDelta: baselineFatMass != null && latestFatMass != null ? safeRound(improvementDown(baselineFatMass, latestFatMass) ?? 0) : undefined,
      baselineMuscleMass,
      latestMuscleMass,
      muscleMassDelta: baselineMuscleMass != null && latestMuscleMass != null ? safeRound(improvementUp(baselineMuscleMass, latestMuscleMass) ?? 0) : undefined,
    } satisfies MemberReviewRow;
  }).sort((a, b) => b.totalScoreToDate - a.totalScoreToDate);

  const challengeToDateRows = rows.map((row) => ({
    ...row,
    complianceRate: challengeToDatePossibleHabitPoints > 0 ? safeRound(row.habitPointsToDate / challengeToDatePossibleHabitPoints, 4) : 0,
    habitPointsInRange: row.habitPointsToDate,
    possibleHabitPointsInRange: safeRound(challengeToDatePossibleHabitPoints),
  }));

  return {
    challenge: { id: cfg.id, slug: cfg.slug, year: cfg.year, title: cfg.title },
    division,
    range: {
      mode: selection.mode,
      label: resolvedRange.label,
      start: resolvedRange.start,
      end: resolvedRange.end,
      week: resolvedRange.week,
      currentWeek: resolvedRange.currentWeek,
      weekOptions: resolvedRange.weekOptions,
    },
    summary: buildSummary(rows),
    challengeToDateSummary: buildSummary(challengeToDateRows),
    members: rows,
    biggestImpact: {
      topCompliance: [...rows].sort((a, b) => b.complianceRate - a.complianceRate).slice(0, 5),
      topBodyFatImprovement: [...rows].sort((a, b) => (b.bodyFatPctDelta ?? -Infinity) - (a.bodyFatPctDelta ?? -Infinity)).slice(0, 5),
      topFatMassLoss: [...rows].sort((a, b) => (b.fatMassDelta ?? -Infinity) - (a.fatMassDelta ?? -Infinity)).slice(0, 5),
      topOverallImpact: rows.slice(0, 5),
    },
    correlations: {
      complianceVsSuccess: rows.map((row) => ({
        memberId: row.memberId,
        memberName: row.memberName,
        division: row.division,
        complianceRate: row.complianceRate,
        weightLoss: row.weightDelta,
        bodyFatPctDrop: row.bodyFatPctDelta,
        fatMassLoss: row.fatMassDelta,
        score: row.totalScoreToDate,
      })),
    },
    generatedAt: new Date().toISOString(),
  };
}
