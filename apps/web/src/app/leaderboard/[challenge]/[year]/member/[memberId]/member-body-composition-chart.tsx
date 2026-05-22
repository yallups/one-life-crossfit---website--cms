"use client";

import type { ReactNode } from "react";
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

type ChartFrameProps = {
  children: (size: { height: number; width: number }) => ReactNode;
  className: string;
};

const METRICS = [
  "bodyWeight",
  "muscleMass",
  "reportedFatMass",
  "bodyFatPct",
  "muscleStabilizedBodyFatPct",
] as const satisfies MetricKey[];

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

function metricAxis(metric: MetricKey) {
  return metric === "bodyFatPct" || metric === "muscleStabilizedBodyFatPct"
    ? "pct"
    : "pounds";
}

function formatDay(value: number) {
  return Math.abs(value) < 0.05 ? "Day 0" : `Day ${Math.round(value)}`;
}

function formatPounds(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)} lb`;
}

function formatPoundsTick(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(0)}`;
}

function formatPercent(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)} pp`;
}

function formatPercentTick(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(0)}`;
}

function isMetricKey(value: unknown): value is MetricKey {
  return (
    typeof value === "string" &&
    (METRICS as readonly string[]).includes(value)
  );
}

function firstFiniteValue(
  scans: BodyCompositionParticipantAnalysis["scans"],
  key:
    | "bodyWeight"
    | "muscleMass"
    | "reportedFatMass"
    | "bodyFatPct"
    | "muscleStabilizedBodyFatPct",
) {
  return scans.find((scan) => Number.isFinite(scan[key]))?.[key];
}

function relativeChange(value: number | undefined, baseline: number | undefined) {
  return Number.isFinite(value) && Number.isFinite(baseline)
    ? Number(((value ?? 0) - (baseline ?? 0)).toFixed(1))
    : undefined;
}

export default function MemberBodyCompositionChart({
  analysis,
}: {
  analysis?: BodyCompositionParticipantAnalysis;
}) {
  const [hidden, setHidden] = useState<Partial<Record<MetricKey, boolean>>>({});
  const chartData = useMemo(() => {
    if (!analysis) return [];

    const baselineWeight = firstFiniteValue(analysis.scans, "bodyWeight");
    const baselineMuscleMass = firstFiniteValue(analysis.scans, "muscleMass");
    const baselineFatMass = firstFiniteValue(analysis.scans, "reportedFatMass");
    const baselineBodyFatPct = firstFiniteValue(analysis.scans, "bodyFatPct");
    const baselineAdjustedBodyFatPct = firstFiniteValue(
      analysis.scans,
      "muscleStabilizedBodyFatPct",
    );

    return analysis.scans.map((scan, index) => ({
      ...scan,
      bodyWeight: relativeChange(scan.bodyWeight, baselineWeight),
      muscleMass: relativeChange(scan.muscleMass, baselineMuscleMass),
      reportedFatMass: relativeChange(scan.reportedFatMass, baselineFatMass),
      bodyFatPct: relativeChange(scan.bodyFatPct, baselineBodyFatPct),
      muscleStabilizedBodyFatPct: relativeChange(
        scan.muscleStabilizedBodyFatPct,
        baselineAdjustedBodyFatPct,
      ),
      chartLabel:
        analysis.scans.filter((candidate) => candidate.date === scan.date)
          .length > 1
          ? `${scan.label} #${index + 1}`
          : scan.label,
    }));
  }, [analysis]);
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

  if (!analysis || chartData.length === 0) {
    return null;
  }

  return (
    <section className="mb-8 rounded-md border border-border bg-card/70 p-4">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Performance Chart</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Entered body-composition measurements with the adjusted BFP used for
          scoring. Pound-based measurements are shown as change from the first
          scan; BFP lines are shown as percentage-point change from the first
          scan.
        </p>
      </div>

      <ChartFrame className="h-[360px] md:h-[440px]">
        {({ height, width }) => (
          <LineChart
            data={chartData}
            height={height}
            margin={{ top: 16, right: 12, left: 4, bottom: 8 }}
            width={width}
          >
            <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
            <XAxis
              dataKey="day"
              domain={["dataMin", "dataMax"]}
              tickFormatter={formatDay}
              ticks={dayTicks}
              type="number"
            />
            <YAxis
              domain={["auto", "auto"]}
              tickFormatter={formatPoundsTick}
              width={46}
              yAxisId="pounds"
            />
            <YAxis
              domain={["auto", "auto"]}
              orientation="right"
              tickFormatter={formatPercentTick}
              width={52}
              yAxisId="pct"
            />
            <ReferenceLine
              stroke="hsl(var(--muted-foreground))"
              strokeDasharray="4 4"
              strokeOpacity={0.45}
              y={0}
              yAxisId="pounds"
            />
            <ReferenceLine
              stroke="hsl(var(--muted-foreground))"
              strokeDasharray="4 4"
              strokeOpacity={0.45}
              y={0}
              yAxisId="pct"
            />
            <Tooltip
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
                      ? formatPercent(numericValue)
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
                  typeof point?.day === "number" ? `Day ${point.day.toFixed(1)}` : "";
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

      <div className="mt-4 rounded-md border border-border bg-background/60 p-3 text-sm text-muted-foreground">
        <p>
          <span className="font-semibold text-foreground">BFP adjusted*</span>{" "}
          estimates body-fat percentage from measured weight change while
          limiting how much short-term SMM loss and deep weight cuts count as
          fat loss.
        </p>
        <p className="mt-2">
          The calculation starts from the first scan&apos;s weight and BFP,
          builds an early SMM baseline, caps SMM loss at 1% of that baseline,
          then credits weight loss as fat loss using a depth-of-cut curve: full
          credit through the first 3% of starting body weight lost, then a
          sharper reduction for deeper cuts.
        </p>
      </div>
    </section>
  );
}
