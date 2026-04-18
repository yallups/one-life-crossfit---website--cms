import { calendarDate, isWithinYmdRange, scoringDate, todayYmd } from "./date";
import {
  extractMetricWindows,
  latestByBucket,
  loadSubmissions,
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
  completedDays: number;
  possibleDays: number;
  habitPointsInRange: number;
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
  totalScoreEstimate: number;
}

export interface ReviewSummary {
  totalParticipants: number;
  activeParticipants: number;
  averageComplianceRate: number;
  totalCompletedDays: number;
  totalPossibleDays: number;
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
  challenge: {
    id: string;
    slug: string;
    year: number;
    title: string;
  };
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
  correlations: {
    complianceVsSuccess: ReviewCorrelationPoint[];
  };
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
  const ms = parseYmd(end).getTime() - parseYmd(start).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24)) + 1;
}

function formatShortRange(start: string, end: string) {
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  const startLabel = startDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  const endLabel = endDate.toLocaleDateString("en-US", {
    month: startDate.getMonth() === endDate.getMonth() ? undefined : "short",
    day: "numeric",
  });
  return `${startLabel}–${endLabel}`;
}

function buildWeekOptions(cfg: ChallengeConfig): ReviewWeekOption[] {
  const totalDays = diffDaysInclusive(
    cfg.challengeWindow.start,
    cfg.challengeWindow.end,
  );
  const totalWeeks = Math.ceil(totalDays / 7);
  const today = todayYmd(cfg.timezone);
  const currentWeek = Math.min(
    totalWeeks,
    Math.max(
      1,
      Math.floor(
        diffDaysInclusive(cfg.challengeWindow.start, today) / 7,
      ) + 1,
    ),
  );

  const weeks: ReviewWeekOption[] = [];
  for (let week = 1; week <= totalWeeks; week++) {
    const start = addDays(cfg.challengeWindow.start, (week - 1) * 7);
    const rawEnd = addDays(start, 6);
    const end = rawEnd > cfg.challengeWindow.end ? cfg.challengeWindow.end : rawEnd;
    weeks.push({
      week,
      start,
      end,
      label: `Week ${week} · ${formatShortRange(start, end)}`,
      isCurrentWeek: week === currentWeek,
    });
  }
  return weeks;
}

function resolveRange(
  cfg: ChallengeConfig,
  selection: ReviewRangeSelection,
): {
  label: string;
  start: string;
  end: string;
  week?: number;
  currentWeek: number;
  weekOptions: ReviewWeekOption[];
} {
  const weekOptions = buildWeekOptions(cfg);
  const currentWeek = weekOptions.find((option) => option.isCurrentWeek)?.week ?? 1;

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
    const start = selection.start && selection.start >= cfg.challengeWindow.start
      ? selection.start
      : cfg.challengeWindow.start;
    const end = selection.end && selection.end <= cfg.challengeWindow.end
      ? selection.end
      : cfg.challengeWindow.end;
    return {
      label: `Custom · ${formatShortRange(start, end)}`,
      start,
      end,
      currentWeek,
      weekOptions,
    };
  }

  if (selection.mode === "last_week") {
    const week = Math.max(1, currentWeek - 1);
    const option = weekOptions.find((item) => item.week === week) ?? weekOptions[0]!;
    return {
      label: option.label,
      start: option.start,
      end: option.end,
      week: option.week,
      currentWeek,
      weekOptions,
    };
  }

  const targetWeek = selection.mode === "week"
    ? selection.week ?? currentWeek
    : currentWeek;
  const option = weekOptions.find((item) => item.week === targetWeek) ?? weekOptions[0]!;
  return {
    label: option.label,
    start: option.start,
    end: option.end,
    week: option.week,
    currentWeek,
    weekOptions,
  };
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function improvementDown(baseline?: number, latest?: number) {
  if (baseline == null || latest == null) return undefined;
  return baseline - latest;
}

function improvementUp(baseline?: number, latest?: number) {
  if (baseline == null || latest == null) return undefined;
  return latest - baseline;
}

function buildSummary(rows: MemberReviewRow[], dayCount: number): ReviewSummary {
  const activeRows = rows.filter((row) => row.completedDays > 0);
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
  const totalCompletedDays = rows.reduce((sum, row) => sum + row.completedDays, 0);
  const totalPossibleDays = rows.length * dayCount;

  return {
    totalParticipants: rows.length,
    activeParticipants: activeRows.length,
    averageComplianceRate: roundTo(average(rows.map((row) => row.complianceRate)), 4),
    totalCompletedDays,
    totalPossibleDays,
    averageWeightLoss: roundTo(average(weightLosses), 2),
    totalWeightLoss: roundTo(weightLosses.reduce((sum, value) => sum + value, 0), 2),
    averageBodyFatPctDrop: roundTo(average(bodyFatDrops), 2),
    averageFatMassLoss: roundTo(average(fatMassLosses), 2),
    totalFatMassLoss: roundTo(fatMassLosses.reduce((sum, value) => sum + value, 0), 2),
    averageMuscleMassGain: roundTo(average(muscleGains), 2),
  };
}

function getLatestMetricInRange(
  submissions: SubmissionRow[],
  cfg: ChallengeConfig,
  memberId: string,
  start: string,
  end: string,
  metricKey: string,
) {
  const rows = submissions
    .filter((row) => row.member_id === memberId)
    .map((row) => ({
      date: calendarDate(row.timestamp, cfg.timezone),
      metrics: row.metrics ?? {},
      timestamp: row.timestamp,
    }))
    .filter((row) => isWithinYmdRange(row.date, start, end))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  for (let i = rows.length - 1; i >= 0; i--) {
    const value = rows[i]?.metrics[metricKey];
    if (value != null && Number.isFinite(value)) return value;
  }
  return undefined;
}

export async function computeChallengeReview(
  challenge: string,
  year: number,
  division: DivisionKey | "all",
  selection: ReviewRangeSelection,
): Promise<ReviewResponse | undefined> {
  const cfg = getChallengeConfig(challenge, year);
  if (!cfg) return undefined;

  const submissions = await loadSubmissions(cfg);
  const dailies = latestByBucket(submissions, cfg).sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp),
  );
  const memberDivision = new Map<string, DivisionKey>();
  const memberName = new Map<string, string>();
  for (const daily of dailies) {
    memberDivision.set(daily.member_id, daily.division);
    memberName.set(daily.member_id, daily.member_name);
  }

  const resolvedRange = resolveRange(cfg, selection);
  const metricWindowsByMember = extractMetricWindows(submissions, cfg);
  const dayCount = diffDaysInclusive(resolvedRange.start, resolvedRange.end);
  const filteredDailies = dailies.filter((daily) => {
    if (division !== "all" && daily.division !== division) return false;
    return isWithinYmdRange(daily.date, resolvedRange.start, resolvedRange.end);
  });

  const memberIds = Array.from(new Set(
    Array.from(memberDivision.entries())
      .filter(([_, memberDiv]) => division === "all" || memberDiv === division)
      .map(([memberId]) => memberId),
  ));

  const memberRows: MemberReviewRow[] = memberIds.map((memberId) => {
    const memberDailies = filteredDailies.filter((daily) => daily.member_id === memberId);
    const completedDays = memberDailies.length;
    const complianceRate = dayCount > 0 ? completedDays / dayCount : 0;
    const habitPointsInRange = memberDailies.reduce((sum, daily) => {
      return (
        sum +
        Object.entries(daily.checkins).reduce((dailySum, [key, checked]) => {
          if (!checked) return dailySum;
          const item = cfg.checkins.items.find((checkin) => checkin.key === key);
          return dailySum + (item?.points ?? 0);
        }, 0)
      );
    }, 0);

    const metricWindows = metricWindowsByMember.get(memberId);
    const baselineWeight = metricWindows?.baseline.body_weight_lb;
    const baselineBodyFatPct = metricWindows?.baseline.inbody_body_fat_pct;
    const baselineFatMass = metricWindows?.baseline.inbody_fat_mass_lb;
    const baselineMuscleMass = metricWindows?.baseline.inbody_muscle_mass_lb;

    const latestWeight = getLatestMetricInRange(
      submissions,
      cfg,
      memberId,
      resolvedRange.start,
      resolvedRange.end,
      "body_weight_lb",
    ) ?? metricWindows?.final.body_weight_lb;
    const latestBodyFatPct = getLatestMetricInRange(
      submissions,
      cfg,
      memberId,
      resolvedRange.start,
      resolvedRange.end,
      "inbody_body_fat_pct",
    ) ?? metricWindows?.final.inbody_body_fat_pct;
    const latestFatMass = getLatestMetricInRange(
      submissions,
      cfg,
      memberId,
      resolvedRange.start,
      resolvedRange.end,
      "inbody_fat_mass_lb",
    ) ?? metricWindows?.final.inbody_fat_mass_lb;
    const latestMuscleMass = getLatestMetricInRange(
      submissions,
      cfg,
      memberId,
      resolvedRange.start,
      resolvedRange.end,
      "inbody_muscle_mass_lb",
    ) ?? metricWindows?.final.inbody_muscle_mass_lb;

    const weightDelta = improvementDown(baselineWeight, latestWeight);
    const bodyFatPctDelta = improvementDown(baselineBodyFatPct, latestBodyFatPct);
    const fatMassDelta = improvementDown(baselineFatMass, latestFatMass);
    const muscleMassDelta = improvementUp(baselineMuscleMass, latestMuscleMass);

    const totalScoreEstimate = roundTo(
      habitPointsInRange +
        Math.max(0, (bodyFatPctDelta ?? 0) * 80),
      2,
    );

    return {
      memberId,
      memberName: memberName.get(memberId) ?? memberId,
      division: memberDivision.get(memberId) ?? "open",
      complianceRate: roundTo(complianceRate, 4),
      completedDays,
      possibleDays: dayCount,
      habitPointsInRange: roundTo(habitPointsInRange, 2),
      baselineWeight,
      latestWeight,
      weightDelta: weightDelta != null ? roundTo(weightDelta, 2) : undefined,
      baselineBodyFatPct,
      latestBodyFatPct,
      bodyFatPctDelta: bodyFatPctDelta != null ? roundTo(bodyFatPctDelta, 2) : undefined,
      baselineFatMass,
      latestFatMass,
      fatMassDelta: fatMassDelta != null ? roundTo(fatMassDelta, 2) : undefined,
      baselineMuscleMass,
      latestMuscleMass,
      muscleMassDelta: muscleMassDelta != null ? roundTo(muscleMassDelta, 2) : undefined,
      totalScoreEstimate,
    };
  });

  memberRows.sort((a, b) => b.totalScoreEstimate - a.totalScoreEstimate);

  const challengeToDateSummary = buildSummary(
    memberRows.map((row) => ({ ...row, possibleDays: diffDaysInclusive(cfg.challengeWindow.start, resolvedRange.end) })),
    dayCount,
  );

  return {
    challenge: {
      id: cfg.id,
      slug: cfg.slug,
      year: cfg.year,
      title: cfg.title,
    },
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
    summary: buildSummary(memberRows, dayCount),
    challengeToDateSummary,
    members: memberRows,
    biggestImpact: {
      topCompliance: [...memberRows]
        .sort((a, b) => b.complianceRate - a.complianceRate)
        .slice(0, 5),
      topBodyFatImprovement: [...memberRows]
        .sort((a, b) => (b.bodyFatPctDelta ?? -Infinity) - (a.bodyFatPctDelta ?? -Infinity))
        .slice(0, 5),
      topFatMassLoss: [...memberRows]
        .sort((a, b) => (b.fatMassDelta ?? -Infinity) - (a.fatMassDelta ?? -Infinity))
        .slice(0, 5),
      topOverallImpact: memberRows.slice(0, 5),
    },
    correlations: {
      complianceVsSuccess: memberRows.map((row) => ({
        memberId: row.memberId,
        memberName: row.memberName,
        division: row.division,
        complianceRate: row.complianceRate,
        weightLoss: row.weightDelta,
        bodyFatPctDrop: row.bodyFatPctDelta,
        fatMassLoss: row.fatMassDelta,
        score: row.totalScoreEstimate,
      })),
    },
    generatedAt: new Date().toISOString(),
  };
}
