"use client";

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { LegendPayload } from "recharts";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { BodyCompositionParticipantAnalysis } from "@/lib/leaderboard/body-composition-normalization";

type MetricKey =
  | "bodyWeight"
  | "muscleMass"
  | "reportedFatMass"
  | "bodyFatPct"
  | "muscleStabilizedBodyFatPct";

type AxisId = "pounds" | "pct";
type ChartAppearance = "public" | "review";

type ChartFrameProps = {
  children: (size: { height: number; width: number }) => ReactNode;
  className: string;
};

type BodyCompositionPerformanceChartProps = {
  analysis?: BodyCompositionParticipantAnalysis;
  appearance?: ChartAppearance;
  className?: string;
};

const METRICS = [
  "bodyWeight",
  "muscleMass",
  "reportedFatMass",
  "bodyFatPct",
  "muscleStabilizedBodyFatPct",
] as const satisfies MetricKey[];

const CHART_STYLES = {
  public: {
    grid: "var(--border)",
    axis: "var(--muted-foreground)",
    reference: "var(--muted-foreground)",
    tooltip: {
      backgroundColor: "var(--popover)",
      border: "1px solid var(--border)",
      borderRadius: 8,
      boxShadow: "var(--shadow-lg)",
      color: "var(--popover-foreground)",
    },
    tooltipLabel: {
      color: "var(--muted-foreground)",
      fontWeight: 500,
    },
  },
  review: {
    grid: "rgba(255,255,255,0.1)",
    axis: "rgba(255,255,255,0.65)",
    reference: "rgba(255,255,255,0.42)",
    tooltip: {
      backgroundColor: "#081018",
      border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: 16,
      color: "rgba(255,255,255,0.9)",
    },
    tooltipLabel: {
      color: "rgba(255,255,255,0.62)",
      fontWeight: 500,
    },
  },
} satisfies Record<
  ChartAppearance,
  {
    axis: string;
    grid: string;
    reference: string;
    tooltip: CSSProperties;
    tooltipLabel: CSSProperties;
  }
>;

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

function metricLabel(metric: MetricKey) {
  switch (metric) {
    case "bodyWeight":
      return "Weight change";
    case "muscleMass":
      return "SMM change";
    case "reportedFatMass":
      return "Fat mass change";
    case "bodyFatPct":
      return "BFP change";
    case "muscleStabilizedBodyFatPct":
      return "BFP adjusted* change";
  }
}

function metricColor(metric: MetricKey) {
  switch (metric) {
    case "bodyWeight":
      return "#d8a233";
    case "muscleMass":
      return "#7a5cff";
    case "reportedFatMass":
      return "#e85d5d";
    case "bodyFatPct":
      return "#2563eb";
    case "muscleStabilizedBodyFatPct":
      return "#10a36f";
  }
}

function metricAxis(metric: MetricKey): AxisId {
  return metric === "bodyFatPct" || metric === "muscleStabilizedBodyFatPct"
    ? "pct"
    : "pounds";
}

function formatDay(value: number) {
  return Math.abs(value) < 0.05 ? "Day 0" : `Day ${Math.round(value)}`;
}

function signed(value: number) {
  return value > 0 ? "+" : "";
}

function formatPounds(value: number) {
  return `${signed(value)}${value.toFixed(1)} lb`;
}

function formatPoundsTick(value: number) {
  return `${signed(value)}${value.toFixed(0)}`;
}

function formatPercentagePoint(value: number) {
  return `${signed(value)}${value.toFixed(1)} pp`;
}

function formatPercentagePointTick(value: number) {
  return `${signed(value)}${value.toFixed(0)}`;
}

function isMetricKey(value: unknown): value is MetricKey {
  return (
    typeof value === "string" &&
    (METRICS as readonly string[]).includes(value)
  );
}

function firstFiniteValue(
  scans: BodyCompositionParticipantAnalysis["scans"],
  key: MetricKey,
) {
  return scans.find((scan) => Number.isFinite(scan[key]))?.[key];
}

function relativeChange(value: number | undefined, baseline: number | undefined) {
  return Number.isFinite(value) && Number.isFinite(baseline)
    ? Number(((value ?? 0) - (baseline ?? 0)).toFixed(1))
    : undefined;
}

function chartLabel(
  scans: BodyCompositionParticipantAnalysis["scans"],
  scan: BodyCompositionParticipantAnalysis["scans"][number],
  index: number,
) {
  const scansOnSameDate = scans.filter(
    (candidate) => candidate.date === scan.date,
  ).length;
  return scansOnSameDate > 1 ? `${scan.label} #${index + 1}` : scan.label;
}

function buildChartData(analysis: BodyCompositionParticipantAnalysis) {
  const baselines = Object.fromEntries(
    METRICS.map((metric) => [metric, firstFiniteValue(analysis.scans, metric)]),
  ) as Record<MetricKey, number | undefined>;

  return analysis.scans.map((scan, index) => ({
    ...scan,
    bodyWeight: relativeChange(scan.bodyWeight, baselines.bodyWeight),
    muscleMass: relativeChange(scan.muscleMass, baselines.muscleMass),
    reportedFatMass: relativeChange(
      scan.reportedFatMass,
      baselines.reportedFatMass,
    ),
    bodyFatPct: relativeChange(scan.bodyFatPct, baselines.bodyFatPct),
    muscleStabilizedBodyFatPct: relativeChange(
      scan.muscleStabilizedBodyFatPct,
      baselines.muscleStabilizedBodyFatPct,
    ),
    chartLabel: chartLabel(analysis.scans, scan, index),
  }));
}

export function BodyCompositionPerformanceChart({
  analysis,
  appearance = "public",
  className = "h-[360px] md:h-[440px]",
}: BodyCompositionPerformanceChartProps) {
  const [hidden, setHidden] = useState<Partial<Record<MetricKey, boolean>>>({});
  const styles = CHART_STYLES[appearance];
  const chartData = useMemo(
    () => (analysis ? buildChartData(analysis) : []),
    [analysis],
  );
  const dayTicks = useMemo(
    () => Array.from(new Set(chartData.map((scan) => scan.day))),
    [chartData],
  );

  const toggleMetric = (payload: LegendPayload) => {
    const dataKey = payload.dataKey;
    if (!isMetricKey(dataKey)) return;
    setHidden((current) => ({
      ...current,
      [dataKey]: !current[dataKey],
    }));
  };

  if (!analysis || chartData.length === 0) return null;

  return (
    <ChartFrame className={className}>
      {({ height, width }) => (
        <LineChart
          data={chartData}
          height={height}
          margin={{ top: 16, right: 12, left: 4, bottom: 8 }}
          width={width}
        >
          <CartesianGrid stroke={styles.grid} vertical={false} />
          <XAxis
            dataKey="day"
            domain={["dataMin", "dataMax"]}
            stroke={styles.axis}
            tick={{ fill: styles.axis }}
            tickFormatter={formatDay}
            ticks={dayTicks}
            type="number"
          />
          <YAxis
            domain={["auto", "auto"]}
            stroke={styles.axis}
            tick={{ fill: styles.axis }}
            tickFormatter={formatPoundsTick}
            width={46}
            yAxisId="pounds"
          />
          <YAxis
            domain={["auto", "auto"]}
            orientation="right"
            stroke={styles.axis}
            tick={{ fill: styles.axis }}
            tickFormatter={formatPercentagePointTick}
            width={52}
            yAxisId="pct"
          />
          <ReferenceLine
            stroke={styles.reference}
            strokeDasharray="4 4"
            strokeOpacity={0.45}
            y={0}
            yAxisId="pounds"
          />
          <ReferenceLine
            stroke={styles.reference}
            strokeDasharray="4 4"
            strokeOpacity={0.45}
            y={0}
            yAxisId="pct"
          />
          <Tooltip
            contentStyle={styles.tooltip}
            labelStyle={styles.tooltipLabel}
            formatter={(value, name, item) => {
              const numericValue =
                typeof value === "number"
                  ? value
                  : Number(Array.isArray(value) ? value[0] : value);
              const axis = isMetricKey(item.dataKey)
                ? metricAxis(item.dataKey)
                : "pounds";
              return [
                Number.isFinite(numericValue)
                  ? axis === "pct"
                    ? formatPercentagePoint(numericValue)
                    : formatPounds(numericValue)
                  : "—",
                typeof name === "string" ? name : `${name ?? ""}`,
              ];
            }}
            labelFormatter={(_, payload) => {
              const point = payload?.[0]?.payload as
                | { chartLabel?: string; day?: number }
                | undefined;
              const day =
                typeof point?.day === "number"
                  ? `Day ${point.day.toFixed(1)}`
                  : "";
              return [point?.chartLabel, day].filter(Boolean).join(" · ");
            }}
          />
          <Legend onClick={toggleMetric} wrapperStyle={{ cursor: "pointer" }} />
          {METRICS.map((metric) => (
            <Line
              connectNulls
              dataKey={metric}
              dot={{ r: metricAxis(metric) === "pct" ? 3 : 2 }}
              hide={hidden[metric]}
              key={metric}
              name={metricLabel(metric)}
              stroke={metricColor(metric)}
              strokeDasharray={
                metric === "muscleStabilizedBodyFatPct" ? "8 5" : undefined
              }
              strokeWidth={metric === "muscleStabilizedBodyFatPct" ? 3 : 2}
              type="monotone"
              yAxisId={metricAxis(metric)}
            />
          ))}
        </LineChart>
      )}
    </ChartFrame>
  );
}
