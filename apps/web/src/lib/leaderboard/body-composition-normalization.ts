import { calendarDate } from "./date";
import { roundTo } from "./scoring";
import type { ChallengeConfig, DivisionKey, SubmissionRow } from "./types";

export type BodyCompositionParticipantStatus =
  | "eligible"
  | "insufficient_scans"
  | "no_scans";

export type BodyCompositionScoreMethod = "muscle_stabilized";

export interface BodyCompositionScanPoint {
  timestamp: string;
  date: string;
  label: string;
  day: number;
  bodyWeight?: number;
  bodyFatPct?: number;
  reportedFatMass?: number;
  muscleMass?: number;
  stabilizedMuscleMass?: number;
  muscleAdjustedBodyFatPct?: number;
  muscleStabilizedBodyFatPct?: number;
}

export interface BodyCompositionScoreModel {
  method: BodyCompositionScoreMethod;
  label: string;
  baselineDate?: string;
  finalDate?: string;
  baselineBodyFatPct?: number;
  finalBodyFatPct?: number;
  bodyFatPctDrop?: number;
  points?: number;
  baselineWeight?: number;
  finalWeight?: number;
  weightLoss?: number;
  baselineFatMass?: number;
  finalFatMass?: number;
  fatMassLoss?: number;
  baselineMuscleMass?: number;
  baselineMuscleScanCount?: number;
  baselineMuscleSpread?: number;
  baselineMuscleLowConfidence?: boolean;
  allowedMuscleLoss?: number;
  reportedMuscleLoss?: number;
  usedMuscleLoss?: number;
  weightLossPct?: number;
  fatLossCreditCurvePct?: number;
  fatLossCreditPctOfWeightLoss?: number;
  maxCreditedFatLoss?: number;
  estimatedFatMassLoss?: number;
}

export interface BodyCompositionParticipantAnalysis {
  memberId: string;
  memberName: string;
  division: DivisionKey;
  status: BodyCompositionParticipantStatus;
  statusLabel: string;
  exclusionReason?: string;
  scanCount: number;
  validScoreScanCount: number;
  rawBodyFatPctDrop?: number;
  rawWeightLoss?: number;
  muscleStabilizedScore?: BodyCompositionScoreModel;
  scans: BodyCompositionScanPoint[];
  notes: string[];
}

type MetricRow = Pick<SubmissionRow, "member_id" | "metrics" | "timestamp">;

type MemberMeta = {
  name: string;
  division: DivisionKey;
};

type MuscleAdjustedScanPoint = {
  scan: BodyCompositionScanPoint;
  baselineMuscleMass?: number;
  baselineMuscleScanCount?: number;
  baselineMuscleSpread?: number;
  baselineMuscleLowConfidence?: boolean;
  stabilizedMuscleMass?: number;
  muscleAdjustedBodyFatPct?: number;
  allowedMuscleLoss?: number;
  reportedMuscleLoss?: number;
  usedMuscleLoss?: number;
  weightLossPct?: number;
  fatLossCreditCurvePct?: number;
  fatLossCreditPctOfWeightLoss?: number;
  maxCreditedFatLoss?: number;
  estimatedFatMassLoss?: number;
};

const MS_PER_DAY = 86_400_000;
const MUSCLE_BASELINE_PRIMARY_WINDOW_DAYS = 7;
const MUSCLE_BASELINE_EXTENDED_WINDOW_DAYS = 14;
const MUSCLE_BASELINE_MAX_EXTENDED_SCANS = 3;
const MUSCLE_BASELINE_OUTLIER_MIN_LB = 2;
const MUSCLE_BASELINE_OUTLIER_PCT = 0.02;
const MUSCLE_MASS_DROP_LIMIT_PCT = 1;
const FAT_LOSS_CREDIT_FULL_CREDIT_WEIGHT_LOSS_PCT = 3;
const FAT_LOSS_CREDIT_DECAY_RATE = 0.018;
const FAT_LOSS_CREDIT_DECAY_EXPONENT = 1.5;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function roundOptional(value: number | undefined, decimals = 2) {
  return isFiniteNumber(value) ? roundTo(value, decimals) : undefined;
}

function median(values: number[]) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return undefined;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function fatLossCreditPctForWeightLossPct(weightLossPct: number) {
  const excessWeightLossPct = Math.max(
    0,
    weightLossPct - FAT_LOSS_CREDIT_FULL_CREDIT_WEIGHT_LOSS_PCT,
  );
  return clamp(
    100 *
      Math.exp(
        -FAT_LOSS_CREDIT_DECAY_RATE *
          excessWeightLossPct ** FAT_LOSS_CREDIT_DECAY_EXPONENT,
      ),
    0,
    100,
  );
}

function formatScanLabel(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function bodyCompositionStatus(scanCount: number, validScoreScanCount: number) {
  if (validScoreScanCount >= 2) {
    return {
      status: "eligible",
      label: "Eligible",
      reason: undefined,
    } satisfies {
      status: BodyCompositionParticipantStatus;
      label: string;
      reason?: string;
    };
  }
  if (scanCount > 0 || validScoreScanCount === 1) {
    return {
      status: "insufficient_scans",
      label: "Needs 2 scans",
      reason: "At least two scans with body weight and BFP are required.",
    } satisfies {
      status: BodyCompositionParticipantStatus;
      label: string;
      reason?: string;
    };
  }
  return {
    status: "no_scans",
    label: "No score scans",
    reason: "No scoreable body-composition scan was recorded.",
  } satisfies {
    status: BodyCompositionParticipantStatus;
    label: string;
    reason?: string;
  };
}

function scanDay(timestamp: string, firstTimestamp: string) {
  const value =
    (new Date(timestamp).getTime() - new Date(firstTimestamp).getTime()) /
    MS_PER_DAY;
  return Number.isFinite(value) ? value : 0;
}

function buildScanPoints(args: {
  cfg: ChallengeConfig;
  rows: MetricRow[];
  firstTimestamp: string;
  weightKey?: string;
  bodyFatPctKey?: string;
  fatMassKey?: string;
  muscleKey?: string;
}) {
  const {
    cfg,
    rows,
    firstTimestamp,
    weightKey,
    bodyFatPctKey,
    fatMassKey,
    muscleKey,
  } = args;

  return rows
    .map((row) => {
      const metrics = row.metrics ?? {};
      const bodyWeight = weightKey ? metrics[weightKey] : undefined;
      const bodyFatPct = bodyFatPctKey ? metrics[bodyFatPctKey] : undefined;
      const reportedFatMass = fatMassKey ? metrics[fatMassKey] : undefined;
      const muscleMass = muscleKey ? metrics[muscleKey] : undefined;

      const date = calendarDate(row.timestamp, cfg.timezone);

      return {
        timestamp: row.timestamp,
        date,
        label: formatScanLabel(date),
        day: scanDay(row.timestamp, firstTimestamp),
        bodyWeight: roundOptional(bodyWeight, 1),
        bodyFatPct: roundOptional(bodyFatPct, 1),
        reportedFatMass: roundOptional(reportedFatMass, 1),
        muscleMass: roundOptional(muscleMass, 1),
      } satisfies BodyCompositionScanPoint;
    })
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

function buildBaselineMuscleCluster(scans: BodyCompositionScanPoint[]) {
  const firstScanDay = scans[0]?.day ?? 0;
  const muscleScans = scans
    .filter((scan) => isFiniteNumber(scan.muscleMass))
    .map((scan) => ({
      day: scan.day,
      date: scan.date,
      value: scan.muscleMass!,
    }));

  if (!muscleScans.length) {
    return {
      value: undefined,
      scanCount: 0,
      spread: undefined,
      lowConfidence: true,
    };
  }

  let candidates = muscleScans.filter(
    (scan) =>
      scan.day >= firstScanDay &&
      scan.day - firstScanDay <= MUSCLE_BASELINE_PRIMARY_WINDOW_DAYS,
  );

  if (candidates.length < 2) {
    candidates = muscleScans
      .filter(
        (scan) =>
          scan.day >= firstScanDay &&
          scan.day - firstScanDay <= MUSCLE_BASELINE_EXTENDED_WINDOW_DAYS,
      )
      .slice(0, MUSCLE_BASELINE_MAX_EXTENDED_SCANS);
  }

  if (!candidates.length) {
    candidates = muscleScans.slice(0, 1);
  }

  const values = candidates.map((scan) => scan.value);
  const center = median(values);
  const spread = Math.max(...values) - Math.min(...values);
  const outlierBand = isFiniteNumber(center)
    ? Math.max(
        MUSCLE_BASELINE_OUTLIER_MIN_LB,
        center * MUSCLE_BASELINE_OUTLIER_PCT,
      )
    : MUSCLE_BASELINE_OUTLIER_MIN_LB;
  const kept = isFiniteNumber(center)
    ? candidates.filter((scan) => Math.abs(scan.value - center) <= outlierBand)
    : candidates;
  const keptValues = kept.length ? kept.map((scan) => scan.value) : values;
  const value = median(keptValues);

  return {
    value,
    scanCount: keptValues.length,
    spread,
    lowConfidence:
      keptValues.length < 2 || spread > outlierBand || !isFiniteNumber(value),
  };
}

function buildMuscleAdjustedScanPoints(
  scans: BodyCompositionScanPoint[],
): MuscleAdjustedScanPoint[] {
  const baseline = scans.find(
    (scan) =>
      isFiniteNumber(scan.bodyWeight) && isFiniteNumber(scan.bodyFatPct),
  );

  if (
    !baseline ||
    !isFiniteNumber(baseline.bodyWeight) ||
    !isFiniteNumber(baseline.bodyFatPct)
  ) {
    return scans.map((scan) => ({ scan }) satisfies MuscleAdjustedScanPoint);
  }

  const baselineWeight = baseline.bodyWeight;
  const baselineBodyFatPct = baseline.bodyFatPct;
  const baselineFatMass = (baselineWeight * baselineBodyFatPct) / 100;
  const baselineMuscleCluster = buildBaselineMuscleCluster(scans);
  const baselineMuscleMass = baselineMuscleCluster.value;
  const allowedMuscleLoss = isFiniteNumber(baselineMuscleMass)
    ? (baselineMuscleMass * MUSCLE_MASS_DROP_LIMIT_PCT) / 100
    : 0;

  return scans.map((scan) => {
    if (!isFiniteNumber(scan.bodyWeight) || scan.bodyWeight <= 0) {
      return {
        scan,
        baselineMuscleMass,
        baselineMuscleScanCount: baselineMuscleCluster.scanCount,
        baselineMuscleSpread: baselineMuscleCluster.spread,
        baselineMuscleLowConfidence: baselineMuscleCluster.lowConfidence,
        allowedMuscleLoss,
      } satisfies MuscleAdjustedScanPoint;
    }

    const weightLoss = baselineWeight - scan.bodyWeight;
    const reportedMuscleLoss =
      isFiniteNumber(baselineMuscleMass) && isFiniteNumber(scan.muscleMass)
        ? baselineMuscleMass - scan.muscleMass
        : undefined;
    const usedMuscleLoss = isFiniteNumber(reportedMuscleLoss)
      ? clamp(reportedMuscleLoss, 0, allowedMuscleLoss)
      : Math.min(Math.max(0, weightLoss), allowedMuscleLoss);
    const weightLossPct =
      baselineWeight > 0 ? (Math.max(0, weightLoss) / baselineWeight) * 100 : 0;
    const fatLossCreditCurvePct =
      fatLossCreditPctForWeightLossPct(weightLossPct);
    const fatLossCreditPctOfWeightLoss = fatLossCreditCurvePct;
    const maxCreditedFatLoss =
      Math.max(0, weightLoss) * (fatLossCreditPctOfWeightLoss / 100);
    const estimatedFatMassLoss = Math.min(
      Math.max(0, weightLoss - usedMuscleLoss),
      maxCreditedFatLoss,
    );
    const adjustedFatMass = clamp(
      baselineFatMass - estimatedFatMassLoss,
      0,
      scan.bodyWeight,
    );
    const stabilizedMuscleMass = isFiniteNumber(baselineMuscleMass)
      ? baselineMuscleMass - usedMuscleLoss
      : scan.muscleMass;
    const muscleAdjustedBodyFatPct =
      isFiniteNumber(adjustedFatMass) &&
      isFiniteNumber(scan.bodyWeight) &&
      scan.bodyWeight > 0
        ? (adjustedFatMass / scan.bodyWeight) * 100
        : undefined;

    return {
      scan,
      baselineMuscleMass,
      baselineMuscleScanCount: baselineMuscleCluster.scanCount,
      baselineMuscleSpread: baselineMuscleCluster.spread,
      baselineMuscleLowConfidence: baselineMuscleCluster.lowConfidence,
      allowedMuscleLoss,
      reportedMuscleLoss,
      stabilizedMuscleMass,
      muscleAdjustedBodyFatPct,
      usedMuscleLoss,
      weightLossPct,
      fatLossCreditCurvePct,
      fatLossCreditPctOfWeightLoss,
      maxCreditedFatLoss,
      estimatedFatMassLoss,
    } satisfies MuscleAdjustedScanPoint;
  });
}

function buildMuscleStabilizedScore(
  scans: BodyCompositionScanPoint[],
): BodyCompositionScoreModel | undefined {
  const adjustedScans = buildMuscleAdjustedScanPoints(scans).filter(
    (
      point,
    ): point is MuscleAdjustedScanPoint & {
      scan: BodyCompositionScanPoint & { bodyWeight: number };
      muscleAdjustedBodyFatPct: number;
    } =>
      isFiniteNumber(point.scan.bodyWeight) &&
      isFiniteNumber(point.muscleAdjustedBodyFatPct),
  );
  if (adjustedScans.length < 2) return undefined;

  const first = adjustedScans[0]!;
  const latest = adjustedScans[adjustedScans.length - 1]!;
  const startBodyFatPct = first.muscleAdjustedBodyFatPct;
  const finalBodyFatPct = latest.muscleAdjustedBodyFatPct;
  const startWeight = first.scan.bodyWeight;
  const finalWeight = latest.scan.bodyWeight;

  if (
    !isFiniteNumber(startBodyFatPct) ||
    !isFiniteNumber(finalBodyFatPct) ||
    !isFiniteNumber(startWeight) ||
    !isFiniteNumber(finalWeight)
  ) {
    return undefined;
  }

  const baselineFatMass = (startWeight * startBodyFatPct) / 100;
  const finalFatMass = (finalWeight * finalBodyFatPct) / 100;
  const bodyFatPctDrop = Math.max(0, startBodyFatPct - finalBodyFatPct);
  const weightLoss = startWeight - finalWeight;
  const fatMassLoss = baselineFatMass - finalFatMass;

  return {
    method: "muscle_stabilized",
    label: "BFP adjusted",
    baselineDate: first.scan.date,
    finalDate: latest.scan.date,
    baselineBodyFatPct: roundOptional(startBodyFatPct, 2),
    finalBodyFatPct: roundOptional(finalBodyFatPct, 2),
    bodyFatPctDrop: roundOptional(bodyFatPctDrop, 2),
    points: roundOptional(bodyFatPctDrop * 80, 0),
    baselineWeight: roundOptional(startWeight, 1),
    finalWeight: roundOptional(finalWeight, 1),
    weightLoss: roundOptional(weightLoss, 1),
    baselineFatMass: roundOptional(baselineFatMass, 1),
    finalFatMass: roundOptional(finalFatMass, 1),
    fatMassLoss: roundOptional(fatMassLoss, 1),
    baselineMuscleMass: roundOptional(latest.baselineMuscleMass, 1),
    baselineMuscleScanCount: latest.baselineMuscleScanCount,
    baselineMuscleSpread: roundOptional(latest.baselineMuscleSpread, 1),
    baselineMuscleLowConfidence: latest.baselineMuscleLowConfidence,
    allowedMuscleLoss: roundOptional(latest.allowedMuscleLoss, 1),
    reportedMuscleLoss: roundOptional(latest.reportedMuscleLoss, 1),
    usedMuscleLoss: roundOptional(latest.usedMuscleLoss, 1),
    weightLossPct: roundOptional(latest.weightLossPct, 2),
    fatLossCreditCurvePct: roundOptional(latest.fatLossCreditCurvePct, 2),
    fatLossCreditPctOfWeightLoss: roundOptional(
      latest.fatLossCreditPctOfWeightLoss,
      2,
    ),
    maxCreditedFatLoss: roundOptional(latest.maxCreditedFatLoss, 1),
    estimatedFatMassLoss: roundOptional(latest.estimatedFatMassLoss, 1),
  } satisfies BodyCompositionScoreModel;
}

function addAdjustedBodyFatLine(
  scans: BodyCompositionScanPoint[],
  muscleStabilizedScore: BodyCompositionScoreModel | undefined,
) {
  const muscleAdjustedScans = buildMuscleAdjustedScanPoints(scans);
  const muscleAdjustedByTimestamp = new Map(
    muscleAdjustedScans.map((point) => [point.scan.timestamp, point]),
  );

  return scans.map((scan) => {
    const muscleAdjusted = muscleAdjustedByTimestamp.get(scan.timestamp);
    const muscleStabilizedBodyFatPct = muscleAdjusted?.muscleAdjustedBodyFatPct;

    return {
      ...scan,
      stabilizedMuscleMass: roundOptional(
        muscleAdjusted?.stabilizedMuscleMass,
        1,
      ),
      muscleAdjustedBodyFatPct: roundOptional(
        muscleAdjusted?.muscleAdjustedBodyFatPct,
        2,
      ),
      muscleStabilizedBodyFatPct:
        muscleStabilizedScore && muscleStabilizedBodyFatPct != null
          ? roundOptional(muscleStabilizedBodyFatPct, 2)
          : undefined,
    } satisfies BodyCompositionScanPoint;
  });
}

export function buildBodyCompositionParticipantAnalyses(args: {
  cfg: ChallengeConfig;
  submissions: SubmissionRow[];
  memberIds: string[];
  memberMeta: Map<string, MemberMeta>;
  end: string;
  weightKey?: string;
  bodyFatPctKey?: string;
  fatMassKey?: string;
  muscleKey?: string;
}) {
  const {
    cfg,
    submissions,
    memberIds,
    memberMeta,
    end,
    weightKey,
    bodyFatPctKey,
    fatMassKey,
    muscleKey,
  } = args;
  const memberIdSet = new Set(memberIds);
  const rowsByMember = new Map<string, MetricRow[]>();

  for (const submission of submissions) {
    if (!memberIdSet.has(submission.member_id)) continue;
    const date = calendarDate(submission.timestamp, cfg.timezone);
    if (date > end || date > cfg.challengeWindow.end) continue;
    const metrics = submission.metrics ?? {};
    const hasAnyMetric = [weightKey, bodyFatPctKey, fatMassKey, muscleKey].some(
      (key) => key && Number.isFinite(metrics[key]),
    );
    if (!hasAnyMetric) continue;
    const rows = rowsByMember.get(submission.member_id) ?? [];
    rows.push(submission);
    rowsByMember.set(submission.member_id, rows);
  }

  return memberIds
    .map((memberId) => {
      const meta = memberMeta.get(memberId);
      const rows = (rowsByMember.get(memberId) ?? []).sort((a, b) =>
        a.timestamp.localeCompare(b.timestamp),
      );
      const firstTimestamp =
        rows[0]?.timestamp ?? `${cfg.challengeWindow.start}T12:00:00.000Z`;
      const scans = buildScanPoints({
        cfg,
        rows,
        firstTimestamp,
        weightKey,
        bodyFatPctKey,
        fatMassKey,
        muscleKey,
      });
      const validScoreScans = scans.filter(
        (scan) =>
          isFiniteNumber(scan.bodyWeight) && isFiniteNumber(scan.bodyFatPct),
      );
      const first = validScoreScans[0];
      const latest = validScoreScans[validScoreScans.length - 1];
      const status = bodyCompositionStatus(
        scans.length,
        validScoreScans.length,
      );
      const muscleStabilizedScore = buildMuscleStabilizedScore(scans);
      const scansWithAdjustedBodyFat = addAdjustedBodyFatLine(
        scans,
        muscleStabilizedScore,
      );
      const notes = [
        muscleStabilizedScore
          ? "BFP adjusted* uses an early SMM baseline cluster, caps SMM loss from that baseline, and applies a depth-of-cut fat-loss credit curve."
          : undefined,
        muscleStabilizedScore?.baselineMuscleLowConfidence
          ? "SMM baseline is low confidence because the early readings were sparse or spread wider than the outlier band."
          : undefined,
      ].filter((note): note is string => !!note);

      return {
        memberId,
        memberName: meta?.name ?? memberId,
        division: meta?.division ?? "open",
        status: status.status,
        statusLabel: status.label,
        exclusionReason: status.reason,
        scanCount: scans.length,
        validScoreScanCount: validScoreScans.length,
        rawBodyFatPctDrop:
          first?.bodyFatPct != null && latest?.bodyFatPct != null
            ? roundOptional(
                Math.max(0, first.bodyFatPct - latest.bodyFatPct),
                2,
              )
            : undefined,
        rawWeightLoss:
          first?.bodyWeight != null && latest?.bodyWeight != null
            ? roundOptional(first.bodyWeight - latest.bodyWeight, 1)
            : undefined,
        muscleStabilizedScore,
        scans: scansWithAdjustedBodyFat,
        notes,
      } satisfies BodyCompositionParticipantAnalysis;
    })
    .sort((left, right) => {
      if (left.status !== right.status) {
        return left.status === "eligible" ? -1 : 1;
      }
      return (
        (right.muscleStabilizedScore?.bodyFatPctDrop ?? -1) -
          (left.muscleStabilizedScore?.bodyFatPctDrop ?? -1) ||
        left.memberName.localeCompare(right.memberName)
      );
    });
}
