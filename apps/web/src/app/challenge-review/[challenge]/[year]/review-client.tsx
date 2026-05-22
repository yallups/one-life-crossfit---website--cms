"use client";

import { toPng } from "html-to-image";
import { useRouter } from "next/navigation";
import type { ReactNode, RefObject } from "react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  ReviewBodyCompositionBucket,
  ReviewResponse,
  ReviewSuccessMetricKey,
  ReviewSummary,
  ReviewTrendBucket,
} from "@/lib/leaderboard/review";
import { BodyCompositionPerformanceChart } from "@/components/leaderboard/body-composition-performance-chart";

type ReviewClientProps = {
  basePath: string;
  data: ReviewResponse;
  divisions: string[];
};

type BodyCompositionMetricKey =
  | "totalWeight"
  | "totalMuscleMass"
  | "totalFatMass"
  | "averageBodyFatPct";

type ChartFrameProps = {
  children: (size: { height: number; width: number }) => ReactNode;
  className: string;
};

const CHART_COLORS = [
  "#f4c95d",
  "#ff8f6b",
  "#78c4d4",
  "#a2d27f",
  "#f97171",
  "#86a8ff",
  "#c5a3ff",
  "#7ae0b5",
  "#f2adff",
  "#8dc6ff",
];

function ChartFrame({ children, className }: ChartFrameProps) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ height: 0, width: 0 });

  useEffect(() => {
    const measure = () => {
      const rect = frameRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);
      if (width <= 0 || height <= 0) return;
      setSize((current) =>
        current.width === width && current.height === height
          ? current
          : { height, width },
      );
    };

    measure();
    const frame = window.requestAnimationFrame(measure);
    const observer =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(measure);

    if (frameRef.current) observer?.observe(frameRef.current);
    window.addEventListener("resize", measure);

    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  return (
    <div className={className} ref={frameRef}>
      {size.width > 0 && size.height > 0 ? children(size) : null}
    </div>
  );
}

function formatPercent(value: number, decimals = 0) {
  return `${(value * 100).toFixed(decimals)}%`;
}

function formatDelta(value: number | undefined, suffix = "", decimals = 1) {
  if (value == null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(decimals)}${suffix}`;
}

function formatImprovement(
  value: number | undefined,
  suffix = "",
  decimals = 1,
) {
  if (value == null) return "—";
  return `${Math.abs(value).toFixed(decimals)}${suffix}`;
}

function buildQuery(params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  return search.toString();
}

function cardClassName(isMuted = false) {
  return [
    "rounded-[28px] border px-5 py-5 shadow-[0_20px_80px_rgba(0,0,0,0.25)] backdrop-blur-md",
    isMuted ? "border-white/10 bg-black/25" : "border-white/15 bg-white/10",
  ].join(" ");
}

function ShareButton({
  title,
  targetRef,
}: {
  title: string;
  targetRef: RefObject<HTMLDivElement | null>;
}) {
  const [isSharing, startTransition] = useTransition();

  return (
    <button
      className="rounded-full border border-white/20 bg-black/30 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-black/45 disabled:cursor-not-allowed disabled:opacity-60"
      disabled={isSharing}
      onClick={() => {
        startTransition(async () => {
          if (!targetRef.current) return;
          const dataUrl = await toPng(targetRef.current, {
            cacheBust: true,
            pixelRatio: 2,
            backgroundColor: "#081018",
          });
          const link = document.createElement("a");
          link.href = dataUrl;
          link.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;
          link.click();
        });
      }}
      type="button"
    >
      {isSharing ? "Exporting..." : "Share"}
    </button>
  );
}

function SummaryCard({
  label,
  summary,
  emphasis,
}: {
  label: string;
  summary: ReviewSummary;
  emphasis?: boolean;
}) {
  return (
    <div className={cardClassName(!emphasis)}>
      <div className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-white/70">
        {label}
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <div>
          <div className="text-4xl font-black text-white">
            {formatPercent(summary.averageComplianceRate)}
          </div>
          <div className="text-sm text-white/70">Average compliance</div>
        </div>
        <div>
          <div className="text-4xl font-black text-white">
            {summary.totalMissedSubmissions}
          </div>
          <div className="text-sm text-white/70">Missed check-ins</div>
        </div>
        <div>
          <div className="text-4xl font-black text-white">
            {summary.totalSubmittedSubmissions}/
            {summary.totalExpectedSubmissions}
          </div>
          <div className="text-sm text-white/70">Submitted check-ins</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-white">
            {formatImprovement(summary.averageBodyFatPctDrop, "%")}
          </div>
          <div className="text-sm text-white/70">Average body fat decrease</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-white">
            {formatImprovement(summary.totalWeightLoss, " lb")}
          </div>
          <div className="text-sm text-white/70">Total weight loss</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-white">
            {summary.participantsImprovedBodyFatPct}/{summary.totalParticipants}
          </div>
          <div className="text-sm text-white/70">Improved body fat %</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-white">
            {summary.bodyCompositionEligibleParticipants}/
            {summary.totalParticipants}
          </div>
          <div className="text-sm text-white/70">Score-eligible scans</div>
        </div>
      </div>
    </div>
  );
}

function successMetricLabel(metric: ReviewSuccessMetricKey) {
  switch (metric) {
    case "bodyFatPct":
      return "Change in Body Fat %";
    case "weight":
      return "Change in Weight";
    case "fatMass":
      return "Change in Fat Mass";
    case "muscleMass":
      return "Change in Muscle Mass";
  }
}

function successMetricSuffix(metric: ReviewSuccessMetricKey) {
  switch (metric) {
    case "bodyFatPct":
      return "%";
    case "weight":
    case "fatMass":
    case "muscleMass":
      return " lb";
  }
}

function successMetricValue(
  bucket: ReviewResponse["correlations"]["complianceVsSuccess"][number],
  metric: ReviewSuccessMetricKey,
) {
  switch (metric) {
    case "bodyFatPct":
      return bucket.bodyFatPctChange;
    case "weight":
      return bucket.weightChange;
    case "fatMass":
      return bucket.fatMassChange;
    case "muscleMass":
      return bucket.muscleMassChange;
  }
}

function buildTrendLine(
  points: Array<{ complianceRate: number; value: number }>,
) {
  if (points.length < 2) return [];

  const n = points.length;
  const sumX = points.reduce((sum, point) => sum + point.complianceRate, 0);
  const sumY = points.reduce((sum, point) => sum + point.value, 0);
  const sumXY = points.reduce(
    (sum, point) => sum + point.complianceRate * point.value,
    0,
  );
  const sumXX = points.reduce(
    (sum, point) => sum + point.complianceRate * point.complianceRate,
    0,
  );
  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) return [];

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;
  const minX = Math.min(...points.map((point) => point.complianceRate));
  const maxX = Math.max(...points.map((point) => point.complianceRate));

  return [
    { complianceRate: minX, value: slope * minX + intercept },
    { complianceRate: maxX, value: slope * maxX + intercept },
  ];
}

function normalizeTrendData(
  trends: ReviewTrendBucket[],
  habitKeys: string[],
  view: "rate" | "count",
) {
  return trends.map((bucket) => ({
    label: bucket.label,
    missedCount: bucket.missedCount,
    submissionRate: bucket.submissionRate * 100,
    averageMissingPerDay: bucket.averageMissingPerDay,
    ...Object.fromEntries(
      habitKeys.map((key) => [
        key,
        view === "rate"
          ? (bucket.habitRates[key] ?? 0) * 100
          : (bucket.habitCompletions[key] ?? 0),
      ]),
    ),
  }));
}

function formatBodyCompositionValue(
  key: BodyCompositionMetricKey,
  value: number | undefined,
) {
  if (value == null || !Number.isFinite(value)) return "—";
  if (key === "averageBodyFatPct") return `${value.toFixed(1)}%`;
  return `${value.toFixed(1)} lb`;
}

function formatBodyCompositionDelta(
  key: BodyCompositionMetricKey,
  value: number | undefined,
) {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  if (key === "averageBodyFatPct") return `${sign}${value.toFixed(1)}%`;
  return `${sign}${value.toFixed(1)} lb`;
}

function formatScoreValue(
  value: number | undefined,
  suffix = "",
  decimals = 1,
) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(decimals)}${suffix}`;
}

function formatScoreRange(
  start: number | undefined,
  final: number | undefined,
  suffix = "",
  decimals = 1,
) {
  if (
    start == null ||
    final == null ||
    !Number.isFinite(start) ||
    !Number.isFinite(final)
  ) {
    return "—";
  }
  return `${start.toFixed(decimals)}${suffix} to ${final.toFixed(decimals)}${suffix}`;
}

function isFiniteMetric(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function bodyCompositionMetricLabel(key: BodyCompositionMetricKey) {
  switch (key) {
    case "totalWeight":
      return "Total weight";
    case "totalMuscleMass":
      return "Total muscle mass";
    case "totalFatMass":
      return "Total fat mass";
    case "averageBodyFatPct":
      return "Average body fat %";
  }
}

function bodyCompositionMetricColor(key: BodyCompositionMetricKey) {
  switch (key) {
    case "totalWeight":
      return "#f4c95d";
    case "totalMuscleMass":
      return "#7ae0b5";
    case "totalFatMass":
      return "#f97171";
    case "averageBodyFatPct":
      return "#86a8ff";
  }
}

export default function ReviewClient({
  basePath,
  data,
  divisions,
}: ReviewClientProps) {
  const router = useRouter();
  const theme = data.challenge.theme;
  const [customStart, setCustomStart] = useState(data.range.start);
  const [customEnd, setCustomEnd] = useState(data.range.end);
  const [trendGranularity, setTrendGranularity] = useState<"weekly" | "daily">(
    "weekly",
  );
  const [trendView, setTrendView] = useState<"rate" | "count">("rate");
  const [successMetric, setSuccessMetric] = useState<ReviewSuccessMetricKey>(
    data.successMetrics[0]?.key ?? "bodyFatPct",
  );
  const [bodyCompositionMetric, setBodyCompositionMetric] =
    useState<BodyCompositionMetricKey>("totalWeight");
  const [selectedBodyCompositionMemberId, setSelectedBodyCompositionMemberId] =
    useState(data.bodyComposition.participants[0]?.memberId ?? "");
  const summaryRef = useRef<HTMLDivElement>(null);
  const habitsRef = useRef<HTMLDivElement>(null);
  const trendsRef = useRef<HTMLDivElement>(null);
  const normalizedBodyCompositionRef = useRef<HTMLDivElement>(null);
  const outcomeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCustomStart(data.range.start);
    setCustomEnd(data.range.end);
  }, [data.range.end, data.range.start]);

  useEffect(() => {
    if (!data.successMetrics.some((metric) => metric.key === successMetric)) {
      setSuccessMetric(data.successMetrics[0]?.key ?? "bodyFatPct");
    }
  }, [data.successMetrics, successMetric]);

  useEffect(() => {
    if (
      !data.bodyComposition.participants.some(
        (participant) =>
          participant.memberId === selectedBodyCompositionMemberId,
      )
    ) {
      setSelectedBodyCompositionMemberId(
        data.bodyComposition.participants[0]?.memberId ?? "",
      );
    }
  }, [data.bodyComposition.participants, selectedBodyCompositionMemberId]);

  const habitLookup = useMemo(
    () =>
      Object.fromEntries(data.habits.map((habit) => [habit.key, habit.label])),
    [data.habits],
  );
  const trendBuckets =
    trendGranularity === "weekly" ? data.trends.weekly : data.trends.daily;
  const bodyCompositionBuckets = data.bodyComposition.daily;
  const selectedBodyCompositionParticipant =
    data.bodyComposition.participants.find(
      (participant) => participant.memberId === selectedBodyCompositionMemberId,
    ) ?? data.bodyComposition.participants[0];
  const rawBodyCompositionComparison = useMemo(() => {
    const scoreScans =
      selectedBodyCompositionParticipant?.scans.filter(
        (scan) =>
          isFiniteMetric(scan.bodyWeight) && isFiniteMetric(scan.bodyFatPct),
      ) ?? [];
    const start = scoreScans[0];
    const final = scoreScans.at(-1);

    if (
      !start ||
      !final ||
      !isFiniteMetric(start.bodyFatPct) ||
      !isFiniteMetric(final.bodyFatPct)
    ) {
      return undefined;
    }

    const bodyFatPctDrop = Math.max(0, start.bodyFatPct - final.bodyFatPct);

    return {
      start,
      final,
      bodyFatPctDrop,
      points: bodyFatPctDrop * 80,
      weightLoss:
        isFiniteMetric(start.bodyWeight) && isFiniteMetric(final.bodyWeight)
          ? start.bodyWeight - final.bodyWeight
          : undefined,
      fatMassLoss:
        isFiniteMetric(start.reportedFatMass) &&
        isFiniteMetric(final.reportedFatMass)
          ? start.reportedFatMass - final.reportedFatMass
          : undefined,
      muscleMassChange:
        isFiniteMetric(start.muscleMass) && isFiniteMetric(final.muscleMass)
          ? final.muscleMass - start.muscleMass
          : undefined,
    };
  }, [selectedBodyCompositionParticipant]);
  useEffect(() => {
    if (
      !bodyCompositionBuckets.some(
        (bucket) => bucket[bodyCompositionMetric] != null,
      )
    ) {
      const fallback = (
        [
          "totalWeight",
          "totalMuscleMass",
          "totalFatMass",
          "averageBodyFatPct",
        ] as BodyCompositionMetricKey[]
      ).find((metric) =>
        bodyCompositionBuckets.some((bucket) => bucket[metric] != null),
      );
      if (fallback) setBodyCompositionMetric(fallback);
    }
  }, [data.bodyComposition.daily, bodyCompositionMetric]);
  const normalizedTrendData = useMemo(
    () =>
      normalizeTrendData(
        trendBuckets,
        data.habits.map((habit) => habit.key),
        trendView,
      ),
    [data.habits, trendBuckets, trendView],
  );
  const outcomeScatterData = useMemo(
    () =>
      data.correlations.complianceVsSuccess
        .map((point) => ({
          complianceRate: point.complianceRate,
          value: successMetricValue(point, successMetric),
        }))
        .filter(
          (
            point,
          ): point is {
            complianceRate: number;
            value: number;
          } => point.value != null && Number.isFinite(point.value),
        ),
    [data.complianceBands, successMetric],
  );
  const outcomeTrendLine = useMemo(
    () => buildTrendLine(outcomeScatterData),
    [outcomeScatterData],
  );
  const worstMissedBucket = useMemo(
    () =>
      [...data.trends.daily].sort(
        (left, right) => right.missedCount - left.missedCount,
      )[0],
    [data.trends.daily],
  );
  const latestBodyComposition = bodyCompositionBuckets.at(-1);
  const hasBodyCompositionData = bodyCompositionBuckets.some(
    (bucket) =>
      bucket.totalWeight != null ||
      bucket.totalMuscleMass != null ||
      bucket.totalFatMass != null ||
      bucket.averageBodyFatPct != null,
  );
  const bodyCompositionDeltas = useMemo(() => {
    const metrics = [
      "totalWeight",
      "totalMuscleMass",
      "totalFatMass",
      "averageBodyFatPct",
    ] as BodyCompositionMetricKey[];

    return Object.fromEntries(
      metrics.map((metric) => {
        const bucketsWithMetric = bodyCompositionBuckets.filter(
          (bucket) => bucket[metric] != null && Number.isFinite(bucket[metric]),
        );
        const first = bucketsWithMetric[0]?.[metric];
        const latest = bucketsWithMetric.at(-1)?.[metric];
        const delta =
          typeof first === "number" && typeof latest === "number"
            ? latest - first
            : undefined;
        return [metric, delta] as const;
      }),
    ) as Record<BodyCompositionMetricKey, number | undefined>;
  }, [bodyCompositionBuckets]);

  const goToRange = (params: Record<string, string | undefined>) => {
    const normalizedParams = { ...params };
    if (
      !("participants" in normalizedParams) &&
      data.participantMode === "eligible"
    ) {
      normalizedParams.participants = "eligible";
    }
    const query = buildQuery(normalizedParams);
    router.push(query ? `${basePath}?${query}` : basePath);
  };

  const currentReviewParams = () => ({
    division: data.division === "all" ? undefined : data.division,
    rangeMode: data.range.mode,
    week:
      data.range.mode === "week" && data.range.week
        ? String(data.range.week)
        : undefined,
    start: data.range.mode === "custom" ? customStart : undefined,
    end: data.range.mode === "custom" ? customEnd : undefined,
    participants:
      data.participantMode === "eligible" ? data.participantMode : undefined,
  });

  return (
    <main
      className="min-h-screen bg-cover bg-center text-white"
      style={{
        backgroundColor: theme?.backgroundColor ?? "#071118",
        backgroundImage: theme?.backgroundImageUrl
          ? `linear-gradient(180deg, rgba(3,9,14,0.72), rgba(3,9,14,0.96)), url(${theme.backgroundImageUrl})`
          : "linear-gradient(180deg, #071118, #11202b)",
      }}
    >
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 md:py-10">
        <section className="mb-8 overflow-hidden rounded-[36px] border border-white/12 bg-black/30 shadow-[0_40px_120px_rgba(0,0,0,0.45)] backdrop-blur-md">
          <div className="grid gap-8 px-5 py-6 md:grid-cols-[1.18fr_0.82fr] md:px-8 md:py-8">
            <div className="space-y-5">
              <div className="space-y-3">
                <div className="text-xs font-semibold uppercase tracking-[0.28em] text-white/60">
                  Group challenge board
                </div>
                {theme?.logoUrl ? (
                  <img
                    alt={data.challenge.title}
                    className="max-h-24 w-auto"
                    src={theme.logoUrl}
                  />
                ) : (
                  <h1 className="max-w-3xl text-4xl font-black tracking-tight md:text-6xl">
                    {data.challenge.title}
                  </h1>
                )}
                <p className="max-w-3xl text-sm leading-6 text-white/78 md:text-base">
                  Group storytelling for habit compliance, missed check-ins, and
                  outcome trends.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {[
                  ["this_week", "This week"],
                  ["last_week", "Last week"],
                  ["all", "All weeks"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                      data.range.mode === value
                        ? "bg-white text-black"
                        : "border border-white/20 bg-white/8 text-white hover:bg-white/16"
                    }`}
                    onClick={() =>
                      goToRange({
                        division:
                          data.division === "all" ? undefined : data.division,
                        rangeMode: value,
                      })
                    }
                    type="button"
                  >
                    {label}
                  </button>
                ))}
                {data.range.weekOptions.map((week) => (
                  <button
                    key={week.week}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                      data.range.mode === "week" &&
                      data.range.week === week.week
                        ? "bg-white text-black"
                        : "border border-white/20 bg-white/8 text-white hover:bg-white/16"
                    }`}
                    onClick={() =>
                      goToRange({
                        division:
                          data.division === "all" ? undefined : data.division,
                        rangeMode: "week",
                        week: String(week.week),
                      })
                    }
                    type="button"
                  >
                    W{week.week}
                  </button>
                ))}
              </div>
            </div>

            <div className={cardClassName()}>
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.24em] text-white/60">
                    Controls
                  </div>
                  <div className="mt-1 text-lg font-bold">
                    {data.range.label}
                  </div>
                </div>
                <div className="text-right text-xs text-white/60">
                  Updated
                  <div className="mt-1 text-sm text-white/82">
                    {new Date(data.generatedAt).toLocaleString("en-US")}
                  </div>
                </div>
              </div>

              <div className="grid gap-4">
                <label className="grid gap-2 text-sm">
                  <span className="font-semibold text-white/72">Division</span>
                  <select
                    className="rounded-2xl border border-white/15 bg-black/35 px-3 py-3 text-white outline-none"
                    onChange={(event) =>
                      goToRange({
                        division:
                          event.target.value === "all"
                            ? undefined
                            : event.target.value,
                        rangeMode: data.range.mode,
                        week:
                          data.range.mode === "week" && data.range.week
                            ? String(data.range.week)
                            : undefined,
                        start:
                          data.range.mode === "custom"
                            ? customStart
                            : undefined,
                        end:
                          data.range.mode === "custom" ? customEnd : undefined,
                      })
                    }
                    value={data.division}
                  >
                    <option value="all">All divisions</option>
                    {divisions.map((division) => (
                      <option key={division} value={division}>
                        {division}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="grid gap-2 text-sm">
                  <span className="font-semibold text-white/72">
                    Participant set
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      className={`rounded-2xl px-3 py-3 text-sm font-semibold ${
                        data.participantMode === "all"
                          ? "bg-white text-black"
                          : "border border-white/20 bg-white/8 text-white"
                      }`}
                      onClick={() =>
                        goToRange({
                          division:
                            data.division === "all" ? undefined : data.division,
                          rangeMode: data.range.mode,
                          week:
                            data.range.mode === "week" && data.range.week
                              ? String(data.range.week)
                              : undefined,
                          start:
                            data.range.mode === "custom"
                              ? customStart
                              : undefined,
                          end:
                            data.range.mode === "custom"
                              ? customEnd
                              : undefined,
                          participants: undefined,
                        })
                      }
                      type="button"
                    >
                      All
                    </button>
                    <button
                      className={`rounded-2xl px-3 py-3 text-sm font-semibold ${
                        data.participantMode === "eligible"
                          ? "bg-white text-black"
                          : "border border-white/20 bg-white/8 text-white"
                      }`}
                      onClick={() =>
                        goToRange({
                          division:
                            data.division === "all" ? undefined : data.division,
                          rangeMode: data.range.mode,
                          week:
                            data.range.mode === "week" && data.range.week
                              ? String(data.range.week)
                              : undefined,
                          start:
                            data.range.mode === "custom"
                              ? customStart
                              : undefined,
                          end:
                            data.range.mode === "custom"
                              ? customEnd
                              : undefined,
                          participants: "eligible",
                        })
                      }
                      type="button"
                    >
                      Eligible only
                    </button>
                  </div>
                  <div className="text-xs text-white/55">
                    {data.bodyComposition.eligibility.eligibleParticipants}{" "}
                    eligible ·{" "}
                    {data.bodyComposition.eligibility.ineligibleParticipants}{" "}
                    excluded when filtered
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <label className="grid gap-2 text-sm">
                    <span className="font-semibold text-white/72">
                      Start date
                    </span>
                    <input
                      className="rounded-2xl border border-white/15 bg-black/35 px-3 py-3 text-white outline-none"
                      max={
                        data.range.weekOptions[
                          data.range.weekOptions.length - 1
                        ]?.end
                      }
                      min={data.range.weekOptions[0]?.start}
                      onChange={(event) => setCustomStart(event.target.value)}
                      type="date"
                      value={customStart}
                    />
                  </label>
                  <label className="grid gap-2 text-sm">
                    <span className="font-semibold text-white/72">
                      End date
                    </span>
                    <input
                      className="rounded-2xl border border-white/15 bg-black/35 px-3 py-3 text-white outline-none"
                      max={
                        data.range.weekOptions[
                          data.range.weekOptions.length - 1
                        ]?.end
                      }
                      min={customStart}
                      onChange={(event) => setCustomEnd(event.target.value)}
                      type="date"
                      value={customEnd}
                    />
                  </label>
                </div>

                <button
                  className="rounded-2xl bg-white px-4 py-3 text-sm font-bold uppercase tracking-[0.16em] text-black"
                  onClick={() =>
                    goToRange({
                      division:
                        data.division === "all" ? undefined : data.division,
                      rangeMode: "custom",
                      start: customStart,
                      end: customEnd,
                    })
                  }
                  type="button"
                >
                  Apply custom range
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-8 grid gap-4 xl:grid-cols-2" ref={summaryRef}>
          <SummaryCard
            emphasis
            label={`Selected range · ${data.range.label}`}
            summary={data.summary}
          />
          <SummaryCard
            label="Challenge-to-date"
            summary={data.challengeToDateSummary}
          />
        </section>
        <div className="mb-10 flex justify-end">
          <ShareButton
            targetRef={summaryRef}
            title={`${data.challenge.slug}-group-summary`}
          />
        </div>

        <section className="mb-8">
          <div className={cardClassName()} ref={habitsRef}>
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.24em] text-white/60">
                  Habit compliance
                </div>
                <h2 className="mt-2 text-2xl font-black">
                  Which habits the group is actually doing
                </h2>
              </div>
              <ShareButton
                targetRef={habitsRef}
                title={`${data.challenge.slug}-habit-compliance`}
              />
            </div>

            <div className="space-y-3">
              {data.habitCompliance.map((habit, index) => (
                <div
                  className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4"
                  key={habit.key}
                >
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="font-semibold">{habit.label}</div>
                    <div className="text-sm font-bold text-white">
                      {Math.round(habit.complianceRate * 100)}%
                    </div>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full"
                      style={{
                        backgroundColor:
                          CHART_COLORS[index % CHART_COLORS.length],
                        width: `${habit.complianceRate * 100}%`,
                      }}
                    />
                  </div>
                  <div className="mt-2 text-xs text-white/60">
                    {habit.awardedPoints} awarded points out of{" "}
                    {habit.possiblePoints} possible
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mb-8 grid gap-4 xl:grid-cols-[1.18fr_0.82fr]">
          <div className={cardClassName()} ref={trendsRef}>
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.24em] text-white/60">
                  Group trend
                </div>
                <h2 className="mt-2 text-2xl font-black">
                  Compliance over time
                </h2>
                <p className="mt-2 text-sm text-white/70">
                  Compliance for each day or week, stacked by habit so you can
                  see where adherence is slipping.
                </p>
              </div>
              <ShareButton
                targetRef={trendsRef}
                title={`${data.challenge.slug}-compliance-trend`}
              />
            </div>

            <div className="mb-4 flex flex-wrap gap-2">
              <button
                className={`rounded-full px-3 py-2 text-sm font-semibold ${
                  trendGranularity === "weekly"
                    ? "bg-white text-black"
                    : "border border-white/20 bg-white/8 text-white"
                }`}
                onClick={() => setTrendGranularity("weekly")}
                type="button"
              >
                Weekly
              </button>
              <button
                className={`rounded-full px-3 py-2 text-sm font-semibold ${
                  trendGranularity === "daily"
                    ? "bg-white text-black"
                    : "border border-white/20 bg-white/8 text-white"
                }`}
                onClick={() => setTrendGranularity("daily")}
                type="button"
              >
                Daily
              </button>
              <button
                className={`rounded-full px-3 py-2 text-sm font-semibold ${
                  trendView === "rate"
                    ? "bg-white text-black"
                    : "border border-white/20 bg-white/8 text-white"
                }`}
                onClick={() => setTrendView("rate")}
                type="button"
              >
                % of group
              </button>
              <button
                className={`rounded-full px-3 py-2 text-sm font-semibold ${
                  trendView === "count"
                    ? "bg-white text-black"
                    : "border border-white/20 bg-white/8 text-white"
                }`}
                onClick={() => setTrendView("count")}
                type="button"
              >
                Completion count
              </button>
            </div>

            <ChartFrame className="h-[360px] md:h-[420px]">
              {({ height, width }) => (
                <BarChart
                  data={normalizedTrendData}
                  height={height}
                  margin={{ top: 16, right: 10, left: 0, bottom: 16 }}
                  width={width}
                >
                  <CartesianGrid
                    stroke="rgba(255,255,255,0.1)"
                    vertical={false}
                  />
                  <XAxis dataKey="label" stroke="rgba(255,255,255,0.65)" />
                  <YAxis
                    stroke="rgba(255,255,255,0.65)"
                    tickFormatter={(value: number) =>
                      trendView === "rate" ? `${value}%` : `${value}`
                    }
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#081018",
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: 16,
                    }}
                    formatter={(value, name) => {
                      const normalizedName =
                        typeof name === "string" ? name : `${name ?? ""}`;
                      const normalizedValue =
                        typeof value === "number"
                          ? value
                          : Number(Array.isArray(value) ? value[0] : value);

                      return [
                        trendView === "rate" && Number.isFinite(normalizedValue)
                          ? `${normalizedValue.toFixed(0)}%`
                          : `${Array.isArray(value) ? value.join(", ") : (value ?? "")}`,
                        habitLookup[normalizedName] ?? normalizedName,
                      ];
                    }}
                  />
                  <Legend />
                  {data.habits.map((habit, index) => (
                    <Bar
                      dataKey={habit.key}
                      fill={CHART_COLORS[index % CHART_COLORS.length]}
                      key={habit.key}
                      name={habit.label}
                      stackId="habits"
                    />
                  ))}
                </BarChart>
              )}
            </ChartFrame>
          </div>

          <div className={cardClassName()}>
            <div className="mb-5">
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-white/60">
                Missed submissions
              </div>
              <h2 className="mt-2 text-2xl font-black">
                Who is not checking in
              </h2>
            </div>
            <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-1">
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                <div className="text-xs uppercase tracking-[0.18em] text-white/55">
                  Selected range
                </div>
                <div className="mt-2 text-4xl font-black">
                  {data.summary.totalMissedSubmissions}
                </div>
                <div className="mt-1 text-sm text-white/70">
                  total missed check-ins
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                <div className="text-xs uppercase tracking-[0.18em] text-white/55">
                  Average per day
                </div>
                <div className="mt-2 text-4xl font-black">
                  {data.summary.averageDailyMissedSubmissions.toFixed(1)}
                </div>
                <div className="mt-1 text-sm text-white/70">
                  members missed each day
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                <div className="text-xs uppercase tracking-[0.18em] text-white/55">
                  Worst day
                </div>
                <div className="mt-2 text-2xl font-black">
                  {worstMissedBucket?.label ?? "—"}
                </div>
                <div className="mt-1 text-sm text-white/70">
                  {worstMissedBucket
                    ? `${worstMissedBucket.missedCount} missed check-ins`
                    : "No daily trend data"}
                </div>
              </div>
            </div>

            <ChartFrame className="mt-6 h-[240px]">
              {({ height, width }) => (
                <LineChart
                  data={trendBuckets.map((bucket) => ({
                    label: bucket.label,
                    missedCount: bucket.missedCount,
                    averageMissingPerDay: bucket.averageMissingPerDay,
                  }))}
                  height={height}
                  margin={{ top: 16, right: 10, left: 0, bottom: 8 }}
                  width={width}
                >
                  <CartesianGrid
                    stroke="rgba(255,255,255,0.1)"
                    vertical={false}
                  />
                  <XAxis dataKey="label" stroke="rgba(255,255,255,0.65)" />
                  <YAxis stroke="rgba(255,255,255,0.65)" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#081018",
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: 16,
                    }}
                  />
                  <Line
                    dataKey="missedCount"
                    dot={{ r: 3 }}
                    name="Missed check-ins"
                    stroke="#f97171"
                    strokeWidth={3}
                    type="monotone"
                  />
                </LineChart>
              )}
            </ChartFrame>
          </div>
        </section>

        <section className="mb-8">
          <div className={cardClassName()}>
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.24em] text-white/60">
                  Body composition trend
                </div>
                <h2 className="mt-2 text-2xl font-black">
                  Group body comp over time
                </h2>
                <p className="mt-2 text-sm text-white/70">
                  Daily body-comp snapshots through the latest recorded point
                  for this {data.division === "all" ? "group" : "division"}.
                </p>
              </div>
              <div className="text-right text-xs text-white/60">
                Latest snapshot
                <div className="mt-2 text-sm text-white/82">
                  {latestBodyComposition?.label ?? "—"}
                </div>
              </div>
            </div>

            {hasBodyCompositionData ? (
              <>
                <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-white/55">
                      Change in weight
                    </div>
                    <div className="mt-2 text-3xl font-black">
                      {formatBodyCompositionDelta(
                        "totalWeight",
                        bodyCompositionDeltas.totalWeight,
                      )}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-white/55">
                      Change in muscle mass
                    </div>
                    <div className="mt-2 text-3xl font-black">
                      {formatBodyCompositionDelta(
                        "totalMuscleMass",
                        bodyCompositionDeltas.totalMuscleMass,
                      )}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-white/55">
                      Change in fat mass
                    </div>
                    <div className="mt-2 text-3xl font-black">
                      {formatBodyCompositionDelta(
                        "totalFatMass",
                        bodyCompositionDeltas.totalFatMass,
                      )}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-white/55">
                      Change in body fat %
                    </div>
                    <div className="mt-2 text-3xl font-black">
                      {formatBodyCompositionDelta(
                        "averageBodyFatPct",
                        bodyCompositionDeltas.averageBodyFatPct,
                      )}
                    </div>
                  </div>
                </div>

                <div className="mb-4 flex flex-wrap gap-2">
                  {(
                    [
                      "totalWeight",
                      "totalMuscleMass",
                      "totalFatMass",
                      "averageBodyFatPct",
                    ] as BodyCompositionMetricKey[]
                  )
                    .filter((metric) =>
                      bodyCompositionBuckets.some(
                        (bucket) => bucket[metric] != null,
                      ),
                    )
                    .map((metric) => (
                      <button
                        className={`rounded-full px-3 py-2 text-sm font-semibold ${
                          bodyCompositionMetric === metric
                            ? "bg-white text-black"
                            : "border border-white/20 bg-white/8 text-white"
                        }`}
                        key={metric}
                        onClick={() => setBodyCompositionMetric(metric)}
                        type="button"
                      >
                        {bodyCompositionMetricLabel(metric)}
                      </button>
                    ))}
                </div>

                <ChartFrame className="h-[360px] md:h-[420px]">
                  {({ height, width }) => (
                    <LineChart
                      data={bodyCompositionBuckets}
                      height={height}
                      margin={{ top: 16, right: 12, left: 0, bottom: 8 }}
                      width={width}
                    >
                      <CartesianGrid
                        stroke="rgba(255,255,255,0.1)"
                        vertical={false}
                      />
                      <XAxis dataKey="label" stroke="rgba(255,255,255,0.65)" />
                      <YAxis
                        stroke="rgba(255,255,255,0.65)"
                        domain={["auto", "auto"]}
                        tickFormatter={(value: number) =>
                          bodyCompositionMetric === "averageBodyFatPct"
                            ? `${value}%`
                            : `${value}`
                        }
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#081018",
                          border: "1px solid rgba(255,255,255,0.12)",
                          borderRadius: 16,
                        }}
                        formatter={(value) => {
                          return [
                            formatBodyCompositionValue(
                              bodyCompositionMetric,
                              typeof value === "number"
                                ? value
                                : Number(
                                    Array.isArray(value) ? value[0] : value,
                                  ),
                            ),
                            bodyCompositionMetricLabel(bodyCompositionMetric),
                          ];
                        }}
                        labelFormatter={(label, payload) => {
                          const bucket = payload?.[0]?.payload as
                            | ReviewBodyCompositionBucket
                            | undefined;
                          if (!bucket) return label;
                          return `${bucket.label} · ${bucket.participantCount} members with data`;
                        }}
                      />
                      <Line
                        dataKey={bodyCompositionMetric}
                        dot={false}
                        name={bodyCompositionMetricLabel(bodyCompositionMetric)}
                        stroke={bodyCompositionMetricColor(
                          bodyCompositionMetric,
                        )}
                        strokeWidth={3}
                        type="monotone"
                      />
                    </LineChart>
                  )}
                </ChartFrame>
              </>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-5 text-sm text-white/72">
                No body-composition scan data is available in this range yet.
              </div>
            )}
          </div>
        </section>

        <section className="mb-8">
          <div className={cardClassName()} ref={normalizedBodyCompositionRef}>
            <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.24em] text-white/60">
                  Normalized scoring
                </div>
                <h2 className="mt-2 text-2xl font-black">
                  Raw scans vs derived score
                </h2>
                <p className="mt-2 max-w-3xl text-sm text-white/70">
                  Entered scan measurements compared with BFP adjusted*, the
                  scoring estimate derived from baseline BFP, scale-weight loss,
                  capped SMM loss, and a depth-of-cut fat-loss credit curve.
                  Pound-based measurements are plotted as change from the first
                  scan; BFP lines are plotted as percentage-point change from
                  the first scan.
                </p>
              </div>
              <ShareButton
                targetRef={normalizedBodyCompositionRef}
                title={`${data.challenge.slug}-normalized-body-composition`}
              />
            </div>

            <div className="mb-5 grid gap-4 lg:grid-cols-[1fr_0.72fr]">
              <label className="grid gap-2 text-sm">
                <span className="font-semibold text-white/72">Participant</span>
                <select
                  className="rounded-2xl border border-white/15 bg-black/35 px-3 py-3 text-white outline-none"
                  onChange={(event) =>
                    setSelectedBodyCompositionMemberId(event.target.value)
                  }
                  value={selectedBodyCompositionParticipant?.memberId ?? ""}
                >
                  {data.bodyComposition.participants.map((participant) => (
                    <option
                      key={participant.memberId}
                      value={participant.memberId}
                    >
                      {participant.memberName} · {participant.statusLabel}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3">
                  <div className="text-xs uppercase tracking-[0.16em] text-white/55">
                    Eligible
                  </div>
                  <div className="mt-2 text-2xl font-black">
                    {data.bodyComposition.eligibility.eligibleParticipants}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3">
                  <div className="text-xs uppercase tracking-[0.16em] text-white/55">
                    Ineligible
                  </div>
                  <div className="mt-2 text-2xl font-black">
                    {data.bodyComposition.eligibility.ineligibleParticipants}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3">
                  <div className="text-xs uppercase tracking-[0.16em] text-white/55">
                    Included
                  </div>
                  <div className="mt-2 text-2xl font-black">
                    {data.bodyComposition.eligibility.includedParticipants}
                  </div>
                </div>
              </div>
            </div>

            {selectedBodyCompositionParticipant ? (
              <>
                <div className="mb-5 grid gap-4 lg:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-white/55">
                      Status
                    </div>
                    <div className="mt-2 text-2xl font-black">
                      {selectedBodyCompositionParticipant.statusLabel}
                    </div>
                    <div className="mt-1 text-sm text-white/70">
                      {selectedBodyCompositionParticipant.validScoreScanCount}{" "}
                      scoreable scans
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-white/55">
                      Entered BFP score
                    </div>
                    <div className="mt-2 text-3xl font-black">
                      {formatScoreValue(
                        rawBodyCompositionComparison?.points,
                        " pts",
                        0,
                      )}
                    </div>
                    <div className="mt-1 text-sm text-white/70">
                      {formatScoreValue(
                        rawBodyCompositionComparison?.bodyFatPctDrop,
                        "% BFP drop",
                      )}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-white/55">
                      BFP adjusted* score
                    </div>
                    <div className="mt-2 text-3xl font-black">
                      {formatScoreValue(
                        selectedBodyCompositionParticipant.muscleStabilizedScore
                          ?.points,
                        " pts",
                        0,
                      )}
                    </div>
                    <div className="mt-1 text-sm text-white/70">
                      {formatScoreValue(
                        selectedBodyCompositionParticipant.muscleStabilizedScore
                          ?.bodyFatPctDrop,
                        "% BFP drop",
                      )}
                    </div>
                  </div>
                </div>

                {selectedBodyCompositionParticipant.scans.length ? (
                  <BodyCompositionPerformanceChart
                    analysis={selectedBodyCompositionParticipant}
                    appearance="review"
                    className="h-[420px] md:h-[500px]"
                  />
                ) : (
                  <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-5 text-sm text-white/72">
                    No body-composition scan values are available for this
                    participant.
                  </div>
                )}

                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                    <div className="text-sm font-bold text-white">
                      Entered first/latest measurements
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-white/72">
                      <div>Start scan</div>
                      <div className="text-right text-white">
                        {rawBodyCompositionComparison?.start.label ?? "—"}
                      </div>
                      <div>Final scan</div>
                      <div className="text-right text-white">
                        {rawBodyCompositionComparison?.final.label ?? "—"}
                      </div>
                      <div>Start BFP</div>
                      <div className="text-right text-white">
                        {formatScoreValue(
                          rawBodyCompositionComparison?.start.bodyFatPct,
                          "%",
                        )}
                      </div>
                      <div>Final BFP</div>
                      <div className="text-right text-white">
                        {formatScoreValue(
                          rawBodyCompositionComparison?.final.bodyFatPct,
                          "%",
                        )}
                      </div>
                      <div>BFP drop</div>
                      <div className="text-right text-white">
                        {formatScoreValue(
                          rawBodyCompositionComparison?.bodyFatPctDrop,
                          "%",
                        )}
                      </div>
                      <div>Body weight</div>
                      <div className="text-right text-white">
                        {formatScoreRange(
                          rawBodyCompositionComparison?.start.bodyWeight,
                          rawBodyCompositionComparison?.final.bodyWeight,
                          " lb",
                        )}
                      </div>
                      <div>Fat mass</div>
                      <div className="text-right text-white">
                        {formatScoreRange(
                          rawBodyCompositionComparison?.start.reportedFatMass,
                          rawBodyCompositionComparison?.final.reportedFatMass,
                          " lb",
                        )}
                      </div>
                      <div>SMM</div>
                      <div className="text-right text-white">
                        {formatScoreRange(
                          rawBodyCompositionComparison?.start.muscleMass,
                          rawBodyCompositionComparison?.final.muscleMass,
                          " lb",
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                    <div className="text-sm font-bold text-white">
                      BFP adjusted* calculation
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-white/72">
                      <div>Start BFP</div>
                      <div className="text-right text-white">
                        {formatScoreValue(
                          selectedBodyCompositionParticipant
                            .muscleStabilizedScore?.baselineBodyFatPct,
                          "%",
                        )}
                      </div>
                      <div>Final BFP</div>
                      <div className="text-right text-white">
                        {formatScoreValue(
                          selectedBodyCompositionParticipant
                            .muscleStabilizedScore?.finalBodyFatPct,
                          "%",
                        )}
                      </div>
                      <div>BFP drop</div>
                      <div className="text-right text-white">
                        {formatScoreValue(
                          selectedBodyCompositionParticipant
                            .muscleStabilizedScore?.bodyFatPctDrop,
                          "%",
                        )}
                      </div>
                      <div>Weight loss</div>
                      <div className="text-right text-white">
                        {formatScoreValue(
                          selectedBodyCompositionParticipant
                            .muscleStabilizedScore?.weightLoss,
                          " lb",
                        )}
                      </div>
                      <div>SMM baseline</div>
                      <div className="text-right text-white">
                        {formatScoreValue(
                          selectedBodyCompositionParticipant
                            .muscleStabilizedScore?.baselineMuscleMass,
                          " lb",
                        )}
                      </div>
                      <div>Baseline scans</div>
                      <div className="text-right text-white">
                        {selectedBodyCompositionParticipant
                          .muscleStabilizedScore?.baselineMuscleScanCount ??
                          "—"}
                      </div>
                      <div>Baseline spread</div>
                      <div className="text-right text-white">
                        {formatScoreValue(
                          selectedBodyCompositionParticipant
                            .muscleStabilizedScore?.baselineMuscleSpread,
                          " lb",
                        )}
                      </div>
                      <div>Reported SMM loss</div>
                      <div className="text-right text-white">
                        {formatScoreValue(
                          selectedBodyCompositionParticipant
                            .muscleStabilizedScore?.reportedMuscleLoss,
                          " lb",
                        )}
                      </div>
                      <div>Allowed SMM loss</div>
                      <div className="text-right text-white">
                        {formatScoreValue(
                          selectedBodyCompositionParticipant
                            .muscleStabilizedScore?.allowedMuscleLoss,
                          " lb",
                        )}
                      </div>
                      <div>Used SMM loss</div>
                      <div className="text-right text-white">
                        {formatScoreValue(
                          selectedBodyCompositionParticipant
                            .muscleStabilizedScore?.usedMuscleLoss,
                          " lb",
                        )}
                      </div>
                      <div>Weight loss %</div>
                      <div className="text-right text-white">
                        {formatScoreValue(
                          selectedBodyCompositionParticipant
                            .muscleStabilizedScore?.weightLossPct,
                          "%",
                          2,
                        )}
                      </div>
                      <div>Depth curve credit</div>
                      <div className="text-right text-white">
                        {formatScoreValue(
                          selectedBodyCompositionParticipant
                            .muscleStabilizedScore?.fatLossCreditCurvePct,
                          "%",
                          2,
                        )}
                      </div>
                      <div>Effective fat-loss credit</div>
                      <div className="text-right text-white">
                        {formatScoreValue(
                          selectedBodyCompositionParticipant
                            .muscleStabilizedScore
                            ?.fatLossCreditPctOfWeightLoss,
                          "%",
                          2,
                        )}
                      </div>
                      <div>Max credited fat loss</div>
                      <div className="text-right text-white">
                        {formatScoreValue(
                          selectedBodyCompositionParticipant
                            .muscleStabilizedScore?.maxCreditedFatLoss,
                          " lb",
                        )}
                      </div>
                      <div>Estimated fat loss</div>
                      <div className="text-right text-white">
                        {formatScoreValue(
                          selectedBodyCompositionParticipant
                            .muscleStabilizedScore?.estimatedFatMassLoss,
                          " lb",
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {selectedBodyCompositionParticipant.notes.length > 0 ||
                selectedBodyCompositionParticipant.exclusionReason ? (
                  <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm text-white/72">
                    {selectedBodyCompositionParticipant.exclusionReason ? (
                      <div>
                        {selectedBodyCompositionParticipant.exclusionReason}
                      </div>
                    ) : null}
                    {selectedBodyCompositionParticipant.notes.map((note) => (
                      <div key={note}>{note}</div>
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-5 text-sm text-white/72">
                No participants are available for this filter.
              </div>
            )}
          </div>
        </section>

        <section className={cardClassName()} ref={outcomeRef}>
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-white/60">
                Outcome trend
              </div>
              <h2 className="mt-2 text-2xl font-black">
                Compliance bands vs success
              </h2>
              <p className="mt-2 text-sm text-white/70">
                This replaces the unreadable scatter with a group trend view.
              </p>
            </div>
            <ShareButton
              targetRef={outcomeRef}
              title={`${data.challenge.slug}-outcome-trend`}
            />
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            {data.successMetrics.map((metric) => (
              <button
                className={`rounded-full px-3 py-2 text-sm font-semibold ${
                  successMetric === metric.key
                    ? "bg-white text-black"
                    : "border border-white/20 bg-white/8 text-white"
                }`}
                key={metric.key}
                onClick={() => setSuccessMetric(metric.key)}
                type="button"
              >
                {metric.label}
              </button>
            ))}
          </div>

          <ChartFrame className="h-[340px] md:h-[400px]">
            {({ height, width }) => (
              <ScatterChart
                height={height}
                margin={{ top: 16, right: 12, left: 0, bottom: 16 }}
                width={width}
              >
                <CartesianGrid
                  stroke="rgba(255,255,255,0.1)"
                  vertical={false}
                />
                <XAxis
                  dataKey="complianceRate"
                  domain={[0, 1]}
                  stroke="rgba(255,255,255,0.65)"
                  tickFormatter={(value: number) =>
                    `${Math.round(value * 100)}%`
                  }
                  type="number"
                />
                <YAxis
                  dataKey="value"
                  stroke="rgba(255,255,255,0.65)"
                  tickFormatter={(value: number) =>
                    `${value}${successMetricSuffix(successMetric)}`
                  }
                  type="number"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#081018",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 16,
                  }}
                  formatter={(value) => {
                    const numericValue =
                      typeof value === "number" ? value : Number(value);
                    return [
                      Number.isFinite(numericValue)
                        ? `${numericValue.toFixed(1)}${successMetricSuffix(successMetric)}`
                        : "—",
                      successMetricLabel(successMetric),
                    ];
                  }}
                />
                <Scatter
                  data={outcomeScatterData}
                  fill="#f4c95d"
                  line={false}
                  shape="circle"
                />
                <Line
                  data={outcomeTrendLine}
                  dataKey="value"
                  dot={false}
                  isAnimationActive={false}
                  legendType="none"
                  name="Trend line"
                  stroke="#78c4d4"
                  strokeWidth={3}
                  type="linear"
                />
              </ScatterChart>
            )}
          </ChartFrame>

          <div className="mt-5 grid gap-3 md:grid-cols-5">
            {data.complianceBands.map((band) => (
              <div
                className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3"
                key={band.key}
              >
                <div className="text-xs uppercase tracking-[0.16em] text-white/55">
                  {band.label}
                </div>
                <div className="mt-2 text-2xl font-black">
                  {band.participantCount}
                </div>
                <div className="text-sm text-white/70">participants</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
