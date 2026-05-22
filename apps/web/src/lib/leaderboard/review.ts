import {
  type BodyCompositionParticipantAnalysis,
  type BodyCompositionParticipantStatus,
  buildBodyCompositionParticipantAnalyses,
} from "./body-composition-normalization";
import { calendarDate, isWithinYmdRange, todayYmd } from "./date";
import {
  awardHabitPoints,
  type DailyAggregate,
  extractMetricWindows,
  latestByBucket,
  loadRegisteredMembers,
  loadSubmissions,
  scoreHabits,
  scorePerformance,
  usesAdjustedBfpScoring,
} from "./engine";
import { getChallengeConfig } from "./registry";
import { roundTo } from "./scoring";
import type { ChallengeConfig, DivisionKey, SubmissionRow } from "./types";

export type ReviewRangeMode =
  | "this_week"
  | "last_week"
  | "week"
  | "all"
  | "custom";

export type ReviewParticipantMode = "all" | "eligible";

export type ReviewSuccessMetricKey =
  | "bodyFatPct"
  | "weight"
  | "fatMass"
  | "muscleMass";

export interface ReviewRangeSelection {
  mode: ReviewRangeMode;
  week?: number;
  start?: string;
  end?: string;
  participantMode?: ReviewParticipantMode;
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
  bodyCompositionStatus: BodyCompositionParticipantStatus;
  bodyCompositionStatusLabel: string;
  bodyCompositionScanCount: number;
  validBodyCompositionScanCount: number;
  normalizedBodyFatPctDrop?: number;
  normalizedBodyCompositionPoints?: number;
}

export interface ReviewSummary {
  totalParticipants: number;
  activeParticipants: number;
  participationRate: number;
  averageComplianceRate: number;
  totalHabitPoints: number;
  totalPossibleHabitPoints: number;
  totalExpectedSubmissions: number;
  totalSubmittedSubmissions: number;
  totalMissedSubmissions: number;
  averageDailyMissedSubmissions: number;
  averageWeightLoss: number;
  totalWeightLoss: number;
  averageBodyFatPctDrop: number;
  totalBodyFatPctDrop: number;
  participantsImprovedBodyFatPct: number;
  bodyFatImprovementRate: number;
  averageFatMassLoss: number;
  totalFatMassLoss: number;
  averageMuscleMassGain: number;
  bodyCompositionEligibleParticipants: number;
  bodyCompositionIneligibleParticipants: number;
}

export interface ReviewCorrelationPoint {
  memberId: string;
  memberName: string;
  division: DivisionKey;
  complianceRate: number;
  weightChange?: number;
  bodyFatPctChange?: number;
  fatMassChange?: number;
  muscleMassChange?: number;
}

export interface ReviewHabitCompliance {
  key: string;
  label: string;
  awardedPoints: number;
  possiblePoints: number;
  complianceRate: number;
}

export interface ReviewTrendBucket {
  key: string;
  label: string;
  start: string;
  end: string;
  dayCount: number;
  expectedSubmissions: number;
  submittedCount: number;
  missedCount: number;
  submissionRate: number;
  averageMissingPerDay: number;
  habitCompletions: Record<string, number>;
  habitRates: Record<string, number>;
  cumulativeHabitCompletions: Record<string, number>;
  cumulativeHabitRates: Record<string, number>;
}

export interface ReviewBodyCompositionBucket {
  key: string;
  label: string;
  start: string;
  end: string;
  participantCount: number;
  totalWeight?: number;
  totalMuscleMass?: number;
  totalFatMass?: number;
  averageBodyFatPct?: number;
}

export interface ReviewComplianceBand {
  key: string;
  label: string;
  participantCount: number;
  averageComplianceRate: number;
  bodyFatPctDrop?: number;
  weightLoss?: number;
  fatMassLoss?: number;
  score?: number;
}

export interface ReviewResponse {
  challenge: {
    id: string;
    slug: string;
    year: number;
    title: string;
    theme?: ChallengeConfig["theme"];
  };
  division: DivisionKey | "all";
  habits: Array<{ key: string; label: string }>;
  range: {
    mode: ReviewRangeMode;
    label: string;
    start: string;
    end: string;
    week?: number;
    currentWeek: number;
    weekOptions: ReviewWeekOption[];
  };
  participantMode: ReviewParticipantMode;
  summary: ReviewSummary;
  challengeToDateSummary: ReviewSummary;
  members: MemberReviewRow[];
  habitCompliance: ReviewHabitCompliance[];
  challengeToDateHabitCompliance: ReviewHabitCompliance[];
  trends: {
    daily: ReviewTrendBucket[];
    weekly: ReviewTrendBucket[];
  };
  complianceTrends: {
    daily: ReviewTrendBucket[];
    weekly: ReviewTrendBucket[];
  };
  bodyComposition: {
    daily: ReviewBodyCompositionBucket[];
    participants: BodyCompositionParticipantAnalysis[];
    eligibility: {
      mode: ReviewParticipantMode;
      totalParticipants: number;
      includedParticipants: number;
      excludedParticipants: number;
      eligibleParticipants: number;
      ineligibleParticipants: number;
    };
  };
  complianceBands: ReviewComplianceBand[];
  successMetrics: Array<{ key: ReviewSuccessMetricKey; label: string }>;
  correlations: {
    complianceVsSuccess: ReviewCorrelationPoint[];
    complianceVsBodyFatChange: ReviewCorrelationPoint[];
    complianceVsFatMassLoss: ReviewCorrelationPoint[];
  };
  story: {
    title: string;
    bullets: string[];
    insight?: string;
  };
  generatedAt: string;
}

type BucketAccumulator = {
  key: string;
  start: string;
  end: string;
  dayCount: number;
  expectedSubmissions: number;
  submittedCount: number;
  habitCompletions: Record<string, number>;
};

type BodyCompositionMetricRow = Pick<
  SubmissionRow,
  "member_id" | "metrics" | "timestamp"
>;

function parseYmd(ymd: string) {
  return new Date(`${ymd}T00:00:00.000Z`);
}

function addDays(ymd: string, days: number) {
  const dt = parseYmd(ymd);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function diffDaysInclusive(start: string, end: string) {
  return (
    Math.floor(
      (parseYmd(end).getTime() - parseYmd(start).getTime()) / 86400000,
    ) + 1
  );
}

function formatShortRange(start: string, end: string) {
  const a = new Date(`${start}T00:00:00`);
  const b = new Date(`${end}T00:00:00`);
  const left = a.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  const right = b.toLocaleDateString("en-US", {
    month: a.getMonth() === b.getMonth() ? undefined : "short",
    day: "numeric",
  });
  return `${left}–${right}`;
}

function average(values: number[]) {
  return values.length
    ? values.reduce((left, right) => left + right, 0) / values.length
    : 0;
}

function normalizeBodyCompositionMetricRows(
  metricRows: BodyCompositionMetricRow[],
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

function safeRound(value: number, decimals = 2) {
  return Number.isFinite(value) ? roundTo(value, decimals) : 0;
}

function percent(numerator: number, denominator: number, decimals = 4) {
  if (denominator <= 0) return 0;
  return safeRound(numerator / denominator, decimals);
}

function improvementDown(baseline?: number, latest?: number) {
  return baseline == null || latest == null ? undefined : baseline - latest;
}

function improvementUp(baseline?: number, latest?: number) {
  return baseline == null || latest == null ? undefined : latest - baseline;
}

function findMetricKey(
  cfg: ChallengeConfig,
  preferred: string[],
  labels: string[],
) {
  for (const key of preferred) {
    if (cfg.performance.metrics.some((metric) => metric.key === key)) {
      return key;
    }
  }
  const match = cfg.performance.metrics.find((metric) => {
    const haystack = `${metric.key} ${metric.label}`.toLowerCase();
    return labels.some((label) => haystack.includes(label.toLowerCase()));
  });
  return match?.key;
}

function buildWeekOptions(cfg: ChallengeConfig): ReviewWeekOption[] {
  const totalWeeks = Math.ceil(
    diffDaysInclusive(cfg.challengeWindow.start, cfg.challengeWindow.end) / 7,
  );
  const today = todayYmd(cfg.timezone);
  const elapsedDays =
    today < cfg.challengeWindow.start
      ? 0
      : diffDaysInclusive(cfg.challengeWindow.start, today) - 1;
  const currentWeek = Math.min(
    totalWeeks,
    Math.max(1, Math.floor(elapsedDays / 7) + 1),
  );
  const out: ReviewWeekOption[] = [];

  for (let week = 1; week <= totalWeeks; week++) {
    const start = addDays(cfg.challengeWindow.start, (week - 1) * 7);
    const rawEnd = addDays(start, 6);
    const end =
      rawEnd > cfg.challengeWindow.end ? cfg.challengeWindow.end : rawEnd;
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
  const currentWeek = weekOptions.find((week) => week.isCurrentWeek)?.week ?? 1;

  if (selection.mode === "all") {
    return {
      label: "All weeks",
      start: cfg.challengeWindow.start,
      end: cfg.challengeWindow.end,
      currentWeek,
      weekOptions,
    };
  }

  if (selection.mode === "custom") {
    const start =
      selection.start && selection.start >= cfg.challengeWindow.start
        ? selection.start
        : cfg.challengeWindow.start;
    const end =
      selection.end && selection.end <= cfg.challengeWindow.end
        ? selection.end
        : cfg.challengeWindow.end;
    const boundedStart = start <= end ? start : end;
    const boundedEnd = end >= start ? end : start;
    return {
      label: `Custom · ${formatShortRange(boundedStart, boundedEnd)}`,
      start: boundedStart,
      end: boundedEnd,
      currentWeek,
      weekOptions,
    };
  }

  const weekNum =
    selection.mode === "last_week"
      ? Math.max(1, currentWeek - 1)
      : selection.mode === "week"
        ? (selection.week ?? currentWeek)
        : currentWeek;
  const week =
    weekOptions.find((option) => option.week === weekNum) ?? weekOptions[0]!;
  return {
    label: week.label,
    start: week.start,
    end: week.end,
    week: week.week,
    currentWeek,
    weekOptions,
  };
}

function iterateDates(start: string, end: string) {
  const dates: string[] = [];
  let current = start;
  while (current <= end) {
    dates.push(current);
    current = addDays(current, 1);
  }
  return dates;
}

function possibleHabitPointsForRange(
  cfg: ChallengeConfig,
  division: DivisionKey,
  start: string,
  end: string,
) {
  const dailies: DailyAggregate[] = [];
  for (const date of iterateDates(start, end)) {
    const checkins = Object.fromEntries(
      cfg.checkins.items.map((item) => [item.key, true] as const),
    );
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
  }
  return scoreHabits(dailies, cfg).get("possible") ?? 0;
}

function buildPossibleDailies(
  cfg: ChallengeConfig,
  division: DivisionKey,
  start: string,
  end: string,
  memberId = "possible",
) {
  return iterateDates(start, end).map((date) => ({
    key: `${memberId}|${date}`,
    member_id: memberId,
    member_name: "Possible",
    division,
    date,
    checkins: Object.fromEntries(
      cfg.checkins.items.map((item) => [item.key, true] as const),
    ),
    metrics: {},
    timestamp: `${date}T12:00:00.000Z`,
  })) satisfies DailyAggregate[];
}

function toDateBoundedSubmissions(
  submissions: SubmissionRow[],
  cfg: ChallengeConfig,
  end: string,
) {
  const start =
    cfg.performance.baselineWindow.start < cfg.challengeWindow.start
      ? cfg.performance.baselineWindow.start
      : cfg.challengeWindow.start;
  return submissions.filter((submission) => {
    const date = calendarDate(submission.timestamp, cfg.timezone);
    return isWithinYmdRange(date, start, end);
  });
}

function buildSummary(args: {
  rows: MemberReviewRow[];
  start: string;
  end: string;
}) {
  const { rows, start, end } = args;
  const weightLosses = rows
    .map((row) => row.weightDelta)
    .filter((value): value is number => value != null);
  const bodyFatDrops = rows
    .map((row) => row.bodyFatPctDelta)
    .filter((value): value is number => value != null);
  const fatMassLosses = rows
    .map((row) => row.fatMassDelta)
    .filter((value): value is number => value != null);
  const muscleGains = rows
    .map((row) => row.muscleMassDelta)
    .filter((value): value is number => value != null);
  const totalHabitPoints = rows.reduce(
    (sum, row) => sum + row.habitPointsInRange,
    0,
  );
  const totalPossibleHabitPoints = rows.reduce(
    (sum, row) => sum + row.possibleHabitPointsInRange,
    0,
  );
  const participantsImprovedBodyFatPct = rows.filter(
    (row) => (row.bodyFatPctDelta ?? 0) > 0,
  ).length;
  const totalParticipants = rows.length;
  const bodyCompositionEligibleParticipants = rows.filter(
    (row) => row.bodyCompositionStatus === "eligible",
  ).length;
  const bodyCompositionIneligibleParticipants =
    totalParticipants - bodyCompositionEligibleParticipants;
  const totalExpectedSubmissions =
    totalParticipants * diffDaysInclusive(start, end);
  const totalSubmittedSubmissions = rows.reduce(
    (sum, row) => sum + row.completedDays,
    0,
  );
  const totalMissedSubmissions = Math.max(
    0,
    totalExpectedSubmissions - totalSubmittedSubmissions,
  );

  return {
    totalParticipants,
    activeParticipants: rows.filter((row) => row.habitPointsInRange > 0).length,
    participationRate: percent(
      rows.filter((row) => row.habitPointsInRange > 0).length,
      totalParticipants,
    ),
    averageComplianceRate: safeRound(
      average(rows.map((row) => row.complianceRate)),
      4,
    ),
    totalHabitPoints: safeRound(totalHabitPoints),
    totalPossibleHabitPoints: safeRound(totalPossibleHabitPoints),
    totalExpectedSubmissions,
    totalSubmittedSubmissions,
    totalMissedSubmissions,
    averageDailyMissedSubmissions: safeRound(
      totalMissedSubmissions / Math.max(1, diffDaysInclusive(start, end)),
      1,
    ),
    averageWeightLoss: safeRound(average(weightLosses)),
    totalWeightLoss: safeRound(weightLosses.reduce((a, b) => a + b, 0)),
    averageBodyFatPctDrop: safeRound(average(bodyFatDrops)),
    totalBodyFatPctDrop: safeRound(bodyFatDrops.reduce((a, b) => a + b, 0)),
    participantsImprovedBodyFatPct,
    bodyFatImprovementRate: percent(
      participantsImprovedBodyFatPct,
      totalParticipants,
    ),
    averageFatMassLoss: safeRound(average(fatMassLosses)),
    totalFatMassLoss: safeRound(fatMassLosses.reduce((a, b) => a + b, 0)),
    averageMuscleMassGain: safeRound(average(muscleGains)),
    bodyCompositionEligibleParticipants,
    bodyCompositionIneligibleParticipants,
  } satisfies ReviewSummary;
}

function buildHabitCompliance(args: {
  cfg: ChallengeConfig;
  dailies: DailyAggregate[];
  memberIds: string[];
  start: string;
  end: string;
  division: DivisionKey | "all";
}) {
  const { cfg, dailies, memberIds, start, end, division } = args;
  const awarded = awardHabitPoints(dailies, cfg);
  const possible = awardHabitPoints(
    buildPossibleDailies(
      cfg,
      division === "all" ? "open" : division,
      start,
      end,
    ),
    cfg,
  );
  const possibleByHabit =
    possible.totalByMemberHabit.get("possible") ?? new Map();

  return cfg.checkins.items.map((item) => {
    const awardedPoints = Array.from(
      awarded.totalByMemberHabit.values(),
    ).reduce((sum, byHabit) => sum + (byHabit.get(item.key) ?? 0), 0);
    const possiblePoints =
      (possibleByHabit.get(item.key) ?? 0) * memberIds.length;
    return {
      key: item.key,
      label: item.label,
      awardedPoints,
      possiblePoints,
      complianceRate: percent(awardedPoints, possiblePoints),
    } satisfies ReviewHabitCompliance;
  });
}

function buildTrendBuckets(args: {
  cfg: ChallengeConfig;
  dailies: DailyAggregate[];
  memberIds: string[];
  start: string;
  end: string;
  division: DivisionKey | "all";
  mode: "daily" | "weekly";
  normalizationStart?: string;
  normalizationEnd?: string;
}) {
  const {
    cfg,
    dailies,
    memberIds,
    start,
    end,
    division,
    mode,
    normalizationStart = start,
    normalizationEnd = end,
  } = args;
  const byKey = new Map<string, BucketAccumulator>();
  const possibleAwards = awardHabitPoints(
    buildPossibleDailies(
      cfg,
      division === "all" ? "open" : division,
      start,
      end,
    ),
    cfg,
  );
  const normalizationPossibleAwards = awardHabitPoints(
    buildPossibleDailies(
      cfg,
      division === "all" ? "open" : division,
      normalizationStart,
      normalizationEnd,
    ),
    cfg,
  );
  const normalizationPossibleByHabit =
    normalizationPossibleAwards.totalByMemberHabit.get("possible") ?? new Map();

  const weekOptions = buildWeekOptions(cfg);
  for (const date of iterateDates(start, end)) {
    const weekOption = weekOptions.find((week) =>
      isWithinYmdRange(date, week.start, week.end),
    );
    const key =
      mode === "daily" ? date : (weekOption?.week?.toString() ?? date);
    const existing = byKey.get(key);
    if (existing) {
      existing.dayCount += 1;
      existing.expectedSubmissions += memberIds.length;
      existing.end = date;
      continue;
    }
    byKey.set(key, {
      key,
      start: date,
      end: date,
      dayCount: 1,
      expectedSubmissions: memberIds.length,
      submittedCount: 0,
      habitCompletions: Object.fromEntries(
        cfg.checkins.items.map((item) => [item.key, 0] as const),
      ),
    });
  }

  const actualAwards = awardHabitPoints(dailies, cfg);

  for (const daily of dailies) {
    const weekOption = weekOptions.find((week) =>
      isWithinYmdRange(daily.date, week.start, week.end),
    );
    const key =
      mode === "daily"
        ? daily.date
        : (weekOption?.week?.toString() ?? daily.date);
    const bucket = byKey.get(key);
    if (!bucket) continue;
    bucket.submittedCount += 1;
    const habitAwards = actualAwards.awardedByMemberDateHabit.get(daily.key);
    for (const item of cfg.checkins.items) {
      bucket.habitCompletions[item.key] =
        (bucket.habitCompletions[item.key] ?? 0) +
        (habitAwards?.get(item.key) ?? 0);
    }
  }

  const runningHabitCompletions = Object.fromEntries(
    cfg.checkins.items.map((item) => [item.key, 0] as const),
  ) as Record<string, number>;

  return Array.from(byKey.values())
    .sort((left, right) => left.start.localeCompare(right.start))
    .map((bucket) => {
      const missedCount = Math.max(
        0,
        bucket.expectedSubmissions - bucket.submittedCount,
      );
      for (const item of cfg.checkins.items) {
        runningHabitCompletions[item.key] =
          (runningHabitCompletions[item.key] ?? 0) +
          (bucket.habitCompletions[item.key] ?? 0);
      }
      return {
        key: bucket.key,
        label:
          mode === "daily"
            ? new Date(`${bucket.start}T12:00:00`).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })
            : `Week ${bucket.key}`,
        start: bucket.start,
        end: bucket.end,
        dayCount: bucket.dayCount,
        expectedSubmissions: bucket.expectedSubmissions,
        submittedCount: bucket.submittedCount,
        missedCount,
        submissionRate: percent(
          bucket.submittedCount,
          bucket.expectedSubmissions,
        ),
        averageMissingPerDay: safeRound(
          missedCount / Math.max(1, bucket.dayCount),
          1,
        ),
        habitCompletions: bucket.habitCompletions,
        habitRates: Object.fromEntries(
          cfg.checkins.items.map((item) => {
            const possiblePointsForOneMember = Array.from(
              possibleAwards.awardedByMemberDateHabit.entries(),
            )
              .filter(([dailyKey]) => {
                const [, date] = dailyKey.split("|");
                if (!date) return false;
                return mode === "daily"
                  ? date === bucket.start
                  : isWithinYmdRange(date, bucket.start, bucket.end);
              })
              .reduce(
                (sum, [, habitAwards]) =>
                  sum + (habitAwards.get(item.key) ?? 0),
                0,
              );

            return [
              item.key,
              percent(
                bucket.habitCompletions[item.key] ?? 0,
                possiblePointsForOneMember * memberIds.length,
              ),
            ] as const;
          }),
        ),
        cumulativeHabitCompletions: Object.fromEntries(
          cfg.checkins.items.map((item) => [
            item.key,
            runningHabitCompletions[item.key] ?? 0,
          ]),
        ),
        cumulativeHabitRates: Object.fromEntries(
          cfg.checkins.items.map((item) => [
            item.key,
            percent(
              runningHabitCompletions[item.key] ?? 0,
              (normalizationPossibleByHabit.get(item.key) ?? 0) *
                memberIds.length,
            ),
          ]),
        ),
      } satisfies ReviewTrendBucket;
    });
}

function buildComplianceBands(rows: MemberReviewRow[]) {
  const bands = [
    { key: "0-20", label: "0–20%", min: 0, max: 0.2 },
    { key: "20-40", label: "20–40%", min: 0.2, max: 0.4 },
    { key: "40-60", label: "40–60%", min: 0.4, max: 0.6 },
    { key: "60-80", label: "60–80%", min: 0.6, max: 0.8 },
    { key: "80-100", label: "80–100%", min: 0.8, max: 1.00001 },
  ];

  return bands.map((band) => {
    const members = rows.filter(
      (row) => row.complianceRate >= band.min && row.complianceRate < band.max,
    );
    const bodyFatValues = members
      .map((row) => row.bodyFatPctDelta)
      .filter((value): value is number => value != null);
    const weightValues = members
      .map((row) => row.weightDelta)
      .filter((value): value is number => value != null);
    const fatMassValues = members
      .map((row) => row.fatMassDelta)
      .filter((value): value is number => value != null);

    return {
      key: band.key,
      label: band.label,
      participantCount: members.length,
      averageComplianceRate: safeRound(
        average(members.map((row) => row.complianceRate)),
        4,
      ),
      bodyFatPctDrop: bodyFatValues.length
        ? safeRound(average(bodyFatValues))
        : undefined,
      weightLoss: weightValues.length
        ? safeRound(average(weightValues))
        : undefined,
      fatMassLoss: fatMassValues.length
        ? safeRound(average(fatMassValues))
        : undefined,
      score: members.length
        ? safeRound(average(members.map((row) => row.totalScoreToDate)))
        : undefined,
    } satisfies ReviewComplianceBand;
  });
}

function buildBodyCompositionBuckets(args: {
  cfg: ChallengeConfig;
  metricRows: BodyCompositionMetricRow[];
  memberIds: string[];
  start: string;
  end: string;
  mode: "daily" | "weekly";
  weightKey?: string;
  bodyFatPctKey?: string;
  fatMassKey?: string;
  muscleKey?: string;
}) {
  const {
    cfg,
    metricRows,
    memberIds,
    start,
    end,
    mode,
    weightKey,
    bodyFatPctKey,
    fatMassKey,
    muscleKey,
  } = args;
  const dates = iterateDates(start, end);
  const trackedMetricKeys = [
    weightKey,
    bodyFatPctKey,
    fatMassKey,
    muscleKey,
  ].filter((key): key is string => !!key);
  const memberIdSet = new Set(memberIds);
  const normalizedRows = normalizeBodyCompositionMetricRows(
    metricRows,
    cfg,
  ).filter(
    (row) =>
      memberIdSet.has(row.member_id) &&
      isWithinYmdRange(row.date, cfg.challengeWindow.start, end),
  );

  const updatesByDate = new Map<string, Map<string, Record<string, number>>>();
  const seededMetricKeys = new Set<string>();
  for (const daily of normalizedRows) {
    for (const metricKey of trackedMetricKeys) {
      const weight = weightKey ? daily.metrics[weightKey] : undefined;
      const bodyFatPct = bodyFatPctKey
        ? daily.metrics[bodyFatPctKey]
        : undefined;
      const value =
        metricKey === fatMassKey &&
        Number.isFinite(weight) &&
        Number.isFinite(bodyFatPct)
          ? (weight! * bodyFatPct!) / 100
          : daily.metrics[metricKey];
      if (!Number.isFinite(value)) continue;
      const compoundKey = `${daily.member_id}|${metricKey}`;
      const effectiveDate = seededMetricKeys.has(compoundKey)
        ? daily.date
        : cfg.challengeWindow.start;
      seededMetricKeys.add(compoundKey);

      const updatesForDate = updatesByDate.get(effectiveDate) ?? new Map();
      if (!updatesByDate.has(effectiveDate)) {
        updatesByDate.set(effectiveDate, updatesForDate);
      }
      const memberUpdates = {
        ...(updatesForDate.get(daily.member_id) ?? {}),
        [metricKey]: value,
      };
      updatesForDate.set(daily.member_id, memberUpdates);
    }
  }

  const latestByMember = new Map<string, Record<string, number>>();
  const dailySnapshots = dates.map((date) => {
    for (const [memberId, metricUpdates] of updatesByDate.get(date) ??
      new Map()) {
      const next = {
        ...(latestByMember.get(memberId) ?? {}),
        ...metricUpdates,
      };
      latestByMember.set(memberId, next);
    }

    const snapshots = memberIds
      .map((memberId) => latestByMember.get(memberId))
      .filter((snapshot): snapshot is Record<string, number> => !!snapshot);

    const weightValues = weightKey
      ? snapshots
          .map((snapshot) => snapshot[weightKey])
          .filter((value): value is number => Number.isFinite(value))
      : [];
    const bodyFatPctValues = bodyFatPctKey
      ? snapshots
          .map((snapshot) => snapshot[bodyFatPctKey])
          .filter((value): value is number => Number.isFinite(value))
      : [];
    const fatMassValues = fatMassKey
      ? snapshots
          .map((snapshot) => snapshot[fatMassKey])
          .filter((value): value is number => Number.isFinite(value))
      : [];
    const muscleMassValues = muscleKey
      ? snapshots
          .map((snapshot) => snapshot[muscleKey])
          .filter((value): value is number => Number.isFinite(value))
      : [];

    return {
      key: date,
      label: new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      start: date,
      end: date,
      participantCount: snapshots.length,
      totalWeight: weightValues.length
        ? safeRound(
            weightValues.reduce((sum, value) => sum + value, 0),
            1,
          )
        : undefined,
      totalMuscleMass: muscleMassValues.length
        ? safeRound(
            muscleMassValues.reduce((sum, value) => sum + value, 0),
            1,
          )
        : undefined,
      totalFatMass: fatMassValues.length
        ? safeRound(
            fatMassValues.reduce((sum, value) => sum + value, 0),
            1,
          )
        : undefined,
      averageBodyFatPct: bodyFatPctValues.length
        ? safeRound(average(bodyFatPctValues), 2)
        : undefined,
    } satisfies ReviewBodyCompositionBucket;
  });

  if (mode === "daily") return dailySnapshots;

  const weekOptions = buildWeekOptions(cfg).filter(
    (week) => week.end >= start && week.start <= end,
  );

  const weeklyBuckets: ReviewBodyCompositionBucket[] = [];
  for (const week of weekOptions) {
    const snapshot = [...dailySnapshots]
      .filter((bucket) => isWithinYmdRange(bucket.start, week.start, week.end))
      .at(-1);
    if (!snapshot) continue;
    weeklyBuckets.push({
      ...snapshot,
      key: week.week.toString(),
      label: `Week ${week.week}`,
      start: week.start < start ? start : week.start,
      end: week.end > end ? end : week.end,
    });
  }

  return weeklyBuckets;
}

function bestAndWorstHabits(habits: ReviewHabitCompliance[]) {
  const ranked = [...habits].sort(
    (left, right) => right.complianceRate - left.complianceRate,
  );
  return {
    best: ranked[0],
    worst: ranked[ranked.length - 1],
  };
}

function buildStory(args: {
  rangeLabel: string;
  summary: ReviewSummary;
  challengeToDateSummary: ReviewSummary;
  habitCompliance: ReviewHabitCompliance[];
  dailyTrends: ReviewTrendBucket[];
  complianceBands: ReviewComplianceBand[];
}) {
  const {
    rangeLabel,
    summary,
    challengeToDateSummary,
    habitCompliance,
    dailyTrends,
    complianceBands,
  } = args;
  const { best, worst } = bestAndWorstHabits(habitCompliance);
  const worstMissedDay = [...dailyTrends].sort(
    (left, right) => right.missedCount - left.missedCount,
  )[0];
  const highestBand = complianceBands.find((band) => band.key === "80-100");
  const lowestBand = complianceBands.find((band) => band.key === "0-20");

  const bullets = [
    `${Math.round(summary.averageComplianceRate * 100)}% average compliance in ${rangeLabel.toLowerCase()}, with ${summary.totalMissedSubmissions} missed daily check-ins.`,
    best
      ? `${best.label} was the strongest habit at ${Math.round(best.complianceRate * 100)}% compliance across the full group.`
      : "No habit compliance data is available yet.",
    worst
      ? `${worst.label} was the main drop-off point at ${Math.round(worst.complianceRate * 100)}% compliance.`
      : "No weak-habit signal has emerged yet.",
    worstMissedDay
      ? `${worstMissedDay.label} had the biggest submission gap with ${worstMissedDay.missedCount} missed check-ins.`
      : "Daily submission gaps have not been recorded yet.",
    summary.averageBodyFatPctDrop > 0
      ? `Average body fat dropped ${summary.averageBodyFatPctDrop.toFixed(2)}%, and the group has lost ${summary.totalWeightLoss.toFixed(1)} lb total.`
      : `Body composition change is still building, but challenge-to-date body fat change is ${challengeToDateSummary.averageBodyFatPctDrop.toFixed(2)}% on average.`,
  ];

  let insight: string | undefined;
  if (
    highestBand?.bodyFatPctDrop != null &&
    lowestBand?.bodyFatPctDrop != null &&
    highestBand.participantCount > 0 &&
    lowestBand.participantCount > 0
  ) {
    if (lowestBand.bodyFatPctDrop > 0) {
      insight = `The ${highestBand.label} compliance group is averaging ${safeRound(highestBand.bodyFatPctDrop / lowestBand.bodyFatPctDrop, 1)}x the body fat reduction of the ${lowestBand.label} group.`;
    } else if (highestBand.bodyFatPctDrop > 0) {
      insight = `Meaningful body fat change is showing up first in the ${highestBand.label} compliance band.`;
    }
  }

  return {
    title: `${rangeLabel} group story`,
    bullets,
    insight,
  };
}

export async function computeChallengeReview(
  challenge: string,
  year: number,
  division: DivisionKey | "all",
  selection: ReviewRangeSelection,
): Promise<ReviewResponse | undefined> {
  const cfg = getChallengeConfig(challenge, year);
  if (!cfg) return undefined;

  const [submissions, registrations] = await Promise.all([
    loadSubmissions(cfg),
    loadRegisteredMembers(cfg),
  ]);
  const resolvedRange = resolveRange(cfg, selection);
  const today = todayYmd(cfg.timezone);
  const challengeToDateEnd =
    today < cfg.challengeWindow.start
      ? cfg.challengeWindow.start
      : today > cfg.challengeWindow.end
        ? cfg.challengeWindow.end
        : today;
  const weekOptions = buildWeekOptions(cfg);
  const allDailies = latestByBucket(submissions, cfg, registrations).sort(
    (a, b) => a.timestamp.localeCompare(b.timestamp),
  );
  const participantMode = selection.participantMode ?? "all";

  const memberDivision = new Map<string, DivisionKey>();
  const memberName = new Map<string, string>();

  for (const [id, member] of registrations) {
    memberName.set(id, member.name);
    memberDivision.set(
      id,
      cfg.divisions.resolveDivisionForMember?.(member) ?? "open",
    );
  }

  for (const daily of allDailies) {
    memberDivision.set(daily.member_id, daily.division);
    memberName.set(daily.member_id, daily.member_name);
  }

  const candidateMemberIds = Array.from(
    new Set(
      Array.from(memberDivision.entries())
        .filter(([_, divKey]) => division === "all" || divKey === division)
        .map(([id]) => id),
    ),
  );

  const weightKey = findMetricKey(
    cfg,
    ["body_weight_lb"],
    ["body weight", "weight"],
  );
  const bodyFatPctKey = findMetricKey(
    cfg,
    ["inbody_body_fat_pct"],
    ["body fat percentage", "percent body fat", "body fat %", "pbf"],
  );
  const fatMassKey = findMetricKey(
    cfg,
    ["inbody_fat_mass_lb"],
    ["body fat mass", "fat mass"],
  );
  const muscleKey = findMetricKey(
    cfg,
    ["inbody_muscle_mass_lb"],
    ["muscle mass", "skeletal muscle mass", "smm"],
  );

  const memberMeta = new Map(
    candidateMemberIds.map((memberId) => [
      memberId,
      {
        name: memberName.get(memberId) ?? memberId,
        division: memberDivision.get(memberId) ?? "open",
      },
    ]),
  );
  const allBodyCompositionParticipants =
    buildBodyCompositionParticipantAnalyses({
      cfg,
      submissions,
      memberIds: candidateMemberIds,
      memberMeta,
      end: challengeToDateEnd,
      weightKey,
      bodyFatPctKey,
      fatMassKey,
      muscleKey,
    });
  const eligibleBodyCompositionMemberIds = new Set(
    allBodyCompositionParticipants
      .filter((participant) => participant.status === "eligible")
      .map((participant) => participant.memberId),
  );
  const memberIds =
    participantMode === "eligible"
      ? candidateMemberIds.filter((memberId) =>
          eligibleBodyCompositionMemberIds.has(memberId),
        )
      : candidateMemberIds;
  const includedMemberIdSet = new Set(memberIds);
  const bodyCompositionParticipants = allBodyCompositionParticipants.filter(
    (participant) => includedMemberIdSet.has(participant.memberId),
  );
  const bodyCompositionByMember = new Map(
    allBodyCompositionParticipants.map((participant) => [
      participant.memberId,
      participant,
    ]),
  );

  const filteredDailies = allDailies.filter((daily) =>
    memberIds.includes(daily.member_id),
  );
  const dailiesInRange = filteredDailies.filter((daily) =>
    isWithinYmdRange(daily.date, resolvedRange.start, resolvedRange.end),
  );
  const dailiesToDate = filteredDailies.filter(
    (daily) => daily.date <= challengeToDateEnd,
  );

  const scoreSubsToDate = toDateBoundedSubmissions(
    submissions,
    cfg,
    challengeToDateEnd,
  ).filter((submission) => memberIds.includes(submission.member_id));
  const metricWindowsToDate = extractMetricWindows(scoreSubsToDate, cfg);

  const habitToDate = scoreHabits(dailiesToDate, cfg);
  const perfToDate = usesAdjustedBfpScoring(cfg)
    ? new Map(
        memberIds.map((memberId) => [
          memberId,
          bodyCompositionByMember.get(memberId)?.muscleStabilizedScore
            ?.points ?? 0,
        ]),
      )
    : scorePerformance(scoreSubsToDate, cfg, memberDivision);

  const rangePossibleHabitPoints = possibleHabitPointsForRange(
    cfg,
    division === "all" ? "open" : division,
    resolvedRange.start,
    resolvedRange.end,
  );
  const challengeToDatePossibleHabitPoints = possibleHabitPointsForRange(
    cfg,
    division === "all" ? "open" : division,
    cfg.challengeWindow.start,
    challengeToDateEnd,
  );

  const rows = memberIds
    .map((memberId) => {
      const memberDailiesInRange = dailiesInRange.filter(
        (daily) => daily.member_id === memberId,
      );
      const memberHabitPointsInRange =
        scoreHabits(memberDailiesInRange, cfg).get(memberId) ?? 0;
      const windows = metricWindowsToDate.get(memberId);
      const baselineWeight = weightKey
        ? windows?.baseline[weightKey]
        : undefined;
      const latestWeight = weightKey ? windows?.final[weightKey] : undefined;
      const baselineBodyFatPct = bodyFatPctKey
        ? windows?.baseline[bodyFatPctKey]
        : undefined;
      const latestBodyFatPct = bodyFatPctKey
        ? windows?.final[bodyFatPctKey]
        : undefined;
      const baselineFatMass = fatMassKey
        ? windows?.baseline[fatMassKey]
        : undefined;
      const latestFatMass = fatMassKey ? windows?.final[fatMassKey] : undefined;
      const baselineMuscleMass = muscleKey
        ? windows?.baseline[muscleKey]
        : undefined;
      const latestMuscleMass = muscleKey
        ? windows?.final[muscleKey]
        : undefined;
      const habitPointsToDate = habitToDate.get(memberId) ?? 0;
      const performancePointsToDate = perfToDate.get(memberId) ?? 0;
      const totalScoreToDate =
        habitPointsToDate * cfg.weights.habits +
        performancePointsToDate * cfg.weights.performance;
      const completedDays = memberDailiesInRange.length;
      const possibleDays = diffDaysInclusive(
        resolvedRange.start,
        resolvedRange.end,
      );
      const bodyComposition = bodyCompositionByMember.get(memberId);

      return {
        memberId,
        memberName: memberName.get(memberId) ?? memberId,
        division: memberDivision.get(memberId) ?? "open",
        complianceRate: safeRound(
          percent(memberHabitPointsInRange, rangePossibleHabitPoints),
          4,
        ),
        habitPointsInRange: safeRound(memberHabitPointsInRange),
        possibleHabitPointsInRange: safeRound(rangePossibleHabitPoints),
        completedDays,
        possibleDays,
        totalScoreToDate: safeRound(totalScoreToDate),
        habitPointsToDate: safeRound(habitPointsToDate),
        performancePointsToDate: safeRound(performancePointsToDate),
        baselineWeight,
        latestWeight,
        weightDelta:
          baselineWeight != null && latestWeight != null
            ? safeRound(improvementDown(baselineWeight, latestWeight) ?? 0)
            : undefined,
        baselineBodyFatPct,
        latestBodyFatPct,
        bodyFatPctDelta:
          baselineBodyFatPct != null && latestBodyFatPct != null
            ? safeRound(
                improvementDown(baselineBodyFatPct, latestBodyFatPct) ?? 0,
              )
            : undefined,
        baselineFatMass,
        latestFatMass,
        fatMassDelta:
          baselineFatMass != null && latestFatMass != null
            ? safeRound(improvementDown(baselineFatMass, latestFatMass) ?? 0)
            : undefined,
        baselineMuscleMass,
        latestMuscleMass,
        muscleMassDelta:
          baselineMuscleMass != null && latestMuscleMass != null
            ? safeRound(
                improvementUp(baselineMuscleMass, latestMuscleMass) ?? 0,
              )
            : undefined,
        bodyCompositionStatus: bodyComposition?.status ?? "no_scans",
        bodyCompositionStatusLabel:
          bodyComposition?.statusLabel ?? "No score scans",
        bodyCompositionScanCount: bodyComposition?.scanCount ?? 0,
        validBodyCompositionScanCount:
          bodyComposition?.validScoreScanCount ?? 0,
        normalizedBodyFatPctDrop:
          bodyComposition?.muscleStabilizedScore?.bodyFatPctDrop,
        normalizedBodyCompositionPoints:
          bodyComposition?.muscleStabilizedScore?.points,
      } satisfies MemberReviewRow;
    })
    .sort((left, right) => right.complianceRate - left.complianceRate);

  const challengeToDateRows = rows.map((row) => ({
    ...row,
    complianceRate: challengeToDatePossibleHabitPoints
      ? safeRound(
          percent(row.habitPointsToDate, challengeToDatePossibleHabitPoints),
          4,
        )
      : 0,
    habitPointsInRange: row.habitPointsToDate,
    possibleHabitPointsInRange: safeRound(challengeToDatePossibleHabitPoints),
    completedDays: dailiesToDate.filter(
      (daily) => daily.member_id === row.memberId,
    ).length,
    possibleDays: diffDaysInclusive(
      cfg.challengeWindow.start,
      challengeToDateEnd,
    ),
  }));

  const summary = buildSummary({
    rows,
    start: resolvedRange.start,
    end: resolvedRange.end,
  });
  const challengeToDateSummary = buildSummary({
    rows: challengeToDateRows,
    start: cfg.challengeWindow.start,
    end: challengeToDateEnd,
  });

  const habitCompliance = buildHabitCompliance({
    cfg,
    dailies: dailiesInRange,
    memberIds,
    start: resolvedRange.start,
    end: resolvedRange.end,
    division,
  }).sort((left, right) => right.complianceRate - left.complianceRate);

  const challengeToDateHabitCompliance = buildHabitCompliance({
    cfg,
    dailies: dailiesToDate,
    memberIds,
    start: cfg.challengeWindow.start,
    end: challengeToDateEnd,
    division,
  }).sort((left, right) => right.complianceRate - left.complianceRate);

  const dailyTrends = buildTrendBuckets({
    cfg,
    dailies: dailiesInRange,
    memberIds,
    start: resolvedRange.start,
    end: resolvedRange.end,
    division,
    mode: "daily",
  });
  const weeklyTrends = buildTrendBuckets({
    cfg,
    dailies: dailiesInRange,
    memberIds,
    start: resolvedRange.start,
    end: resolvedRange.end,
    division,
    mode: "weekly",
  }).map((bucket) => {
    const matchingWeek = weekOptions.find(
      (week) => week.week.toString() === bucket.key,
    );
    return {
      ...bucket,
      label: matchingWeek ? `Week ${matchingWeek.week}` : bucket.label,
    };
  });

  const complianceDailyTrends = buildTrendBuckets({
    cfg,
    dailies: filteredDailies,
    memberIds,
    start: cfg.challengeWindow.start,
    end: cfg.challengeWindow.end,
    division,
    mode: "daily",
    normalizationStart: cfg.challengeWindow.start,
    normalizationEnd: cfg.challengeWindow.end,
  });
  const complianceWeeklyTrends = buildTrendBuckets({
    cfg,
    dailies: filteredDailies,
    memberIds,
    start: cfg.challengeWindow.start,
    end: cfg.challengeWindow.end,
    division,
    mode: "weekly",
    normalizationStart: cfg.challengeWindow.start,
    normalizationEnd: cfg.challengeWindow.end,
  }).map((bucket) => {
    const matchingWeek = weekOptions.find(
      (week) => week.week.toString() === bucket.key,
    );
    return {
      ...bucket,
      label: matchingWeek ? `Week ${matchingWeek.week}` : bucket.label,
    };
  });

  const dailyBodyComposition = buildBodyCompositionBuckets({
    cfg,
    metricRows: scoreSubsToDate,
    memberIds,
    start: cfg.challengeWindow.start,
    end: challengeToDateEnd,
    mode: "daily",
    weightKey,
    bodyFatPctKey,
    fatMassKey,
    muscleKey,
  });

  const complianceBands = buildComplianceBands(challengeToDateRows);
  const successMetricCandidates: Array<{
    key: ReviewSuccessMetricKey;
    label: string;
    available: boolean;
  }> = [
    {
      key: "bodyFatPct",
      label: "Change in Body Fat %",
      available: rows.some(
        (row) => row.baselineBodyFatPct != null && row.latestBodyFatPct != null,
      ),
    },
    {
      key: "weight",
      label: "Change in Weight",
      available: rows.some(
        (row) => row.baselineWeight != null && row.latestWeight != null,
      ),
    },
    {
      key: "fatMass",
      label: "Change in Fat Mass",
      available: rows.some(
        (row) => row.baselineFatMass != null && row.latestFatMass != null,
      ),
    },
    {
      key: "muscleMass",
      label: "Change in Muscle Mass",
      available: rows.some(
        (row) => row.baselineMuscleMass != null && row.latestMuscleMass != null,
      ),
    },
  ];
  const successMetrics = successMetricCandidates
    .filter((metric) => metric.available)
    .map(({ available: _, ...metric }) => metric);

  const story = buildStory({
    rangeLabel: resolvedRange.label,
    summary,
    challengeToDateSummary,
    habitCompliance,
    dailyTrends,
    complianceBands,
  });

  return {
    challenge: {
      id: cfg.id,
      slug: cfg.slug,
      year: cfg.year,
      title: cfg.title,
      theme: cfg.theme,
    },
    division,
    habits: cfg.checkins.items.map((item) => ({
      key: item.key,
      label: item.label,
    })),
    range: {
      mode: selection.mode,
      label: resolvedRange.label,
      start: resolvedRange.start,
      end: resolvedRange.end,
      week: resolvedRange.week,
      currentWeek: resolvedRange.currentWeek,
      weekOptions,
    },
    participantMode,
    summary,
    challengeToDateSummary,
    members: rows,
    habitCompliance,
    challengeToDateHabitCompliance,
    trends: {
      daily: dailyTrends,
      weekly: weeklyTrends,
    },
    complianceTrends: {
      daily: complianceDailyTrends,
      weekly: complianceWeeklyTrends,
    },
    bodyComposition: {
      daily: dailyBodyComposition,
      participants: bodyCompositionParticipants,
      eligibility: {
        mode: participantMode,
        totalParticipants: candidateMemberIds.length,
        includedParticipants: memberIds.length,
        excludedParticipants: candidateMemberIds.length - memberIds.length,
        eligibleParticipants: eligibleBodyCompositionMemberIds.size,
        ineligibleParticipants:
          candidateMemberIds.length - eligibleBodyCompositionMemberIds.size,
      },
    },
    complianceBands,
    successMetrics,
    correlations: {
      complianceVsSuccess: challengeToDateRows.map((row) => ({
        memberId: row.memberId,
        memberName: row.memberName,
        division: row.division,
        complianceRate: row.complianceRate,
        weightChange:
          row.baselineWeight != null && row.latestWeight != null
            ? safeRound(row.latestWeight - row.baselineWeight)
            : undefined,
        bodyFatPctChange:
          row.baselineBodyFatPct != null && row.latestBodyFatPct != null
            ? safeRound(row.latestBodyFatPct - row.baselineBodyFatPct)
            : undefined,
        fatMassChange:
          row.baselineFatMass != null && row.latestFatMass != null
            ? safeRound(row.latestFatMass - row.baselineFatMass)
            : undefined,
        muscleMassChange:
          row.baselineMuscleMass != null && row.latestMuscleMass != null
            ? safeRound(row.latestMuscleMass - row.baselineMuscleMass)
            : undefined,
      })),
      complianceVsBodyFatChange: challengeToDateRows
        .filter((row) => row.bodyFatPctDelta != null)
        .map((row) => ({
          memberId: row.memberId,
          memberName: row.memberName,
          division: row.division,
          complianceRate: row.complianceRate,
          weightLoss: row.weightDelta,
          bodyFatPctDrop: row.bodyFatPctDelta,
          fatMassLoss: row.fatMassDelta,
          score: row.totalScoreToDate,
        })),
      complianceVsFatMassLoss: challengeToDateRows
        .filter((row) => row.fatMassDelta != null)
        .map((row) => ({
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
    story,
    generatedAt: new Date().toISOString(),
  };
}
