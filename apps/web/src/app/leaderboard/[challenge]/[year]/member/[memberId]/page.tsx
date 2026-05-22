import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";
import { Fragment } from "react";
import { getAdjustedBfpScoringConfig } from "@/lib/leaderboard/body-composition-normalization";
import { getChallengeConfig } from "@/lib/leaderboard/registry";
import MemberBodyCompositionChart from "./member-body-composition-chart";

export const dynamic = "force-dynamic";

export default async function MemberDetailPage(props: {
  params: Promise<{ challenge: string; year: string; memberId: string }>;
}): Promise<ReactElement> {
  const { challenge, year, memberId } = await props.params;
  const memberIdDecoded = decodeURIComponent(memberId);
  const yearNum = Number(year);
  const cfg = getChallengeConfig(challenge, yearNum);
  if (!cfg) return notFound();

  // Always fetch via API to ensure stable behavior in RSC (matches API route environment)
  const { headers } = await import("next/headers");
  const hs = await headers();
  const host = hs.get("x-forwarded-host") || hs.get("host");
  const proto =
    hs.get("x-forwarded-proto") ||
    (host?.includes("localhost") ? "http" : "https");
  if (!host) return notFound();
  const origin = `${proto}://${host}`;
  const res = await fetch(
    `${origin}/api/leaderboard/${challenge}/${year}/member/${encodeURIComponent(memberIdDecoded)}`,
    {
      cache: "no-store",
      headers: { Accept: "application/json" },
    },
  );
  if (res.status === 404) return notFound();
  if (!res.ok) throw new Error(`Failed to load member detail: ${res.status}`);
  const detail: any = await res.json();

  const adjustedBfpMetricKey = getAdjustedBfpScoringConfig(cfg)?.metricKeys
    .bodyFatPct;
  const metrics = detail.bodyComposition
    ? cfg.performance.metrics.filter((m) => m.key === adjustedBfpMetricKey)
    : cfg.performance.metrics;
  const habits = cfg.checkins.items;

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <Link
        className="flex items-center gap-1 transition-colors hover:text-accent"
        href={`${origin}/leaderboard/${challenge}/${year}/`}
      >
        <ChevronLeft className="size-5" />
        <span>Back to Leaderboard</span>
      </Link>
      <h1 className="mb-1 text-3xl font-extrabold tracking-tight">
        {detail.member_name}
      </h1>
      <p className="mb-6 text-muted-foreground">
        {cfg.title} — {year} · Division: {detail.division}
      </p>

      <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat
          label="Habit Points"
          value={Number(detail.habitPoints).toFixed(2)}
        />
        <Stat
          label="Performance Points"
          value={Number(detail.performancePoints).toFixed(2)}
        />
        <Stat label="Total" value={Number(detail.total).toFixed(2)} />
      </section>

      <MemberBodyCompositionChart analysis={detail.bodyComposition} />

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold">Daily Check-ins</h2>
        <div className="overflow-auto rounded-md border border-border">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75">
              <tr className="text-[11px] uppercase text-muted-foreground">
                <th className="border-b border-border px-2 py-2 text-left">
                  Date
                </th>
                {habits.map((h) => (
                  <th
                    key={h.key}
                    className="border-b border-border px-2 py-2 text-center"
                  >
                    {h.label}
                  </th>
                ))}
                <th className="border-b border-border px-2 py-2 text-right">
                  Daily
                </th>
              </tr>
            </thead>
            <tbody>
              {Array.isArray(detail.dailyWindows) &&
              detail.dailyWindows.length > 0
                ? detail.dailyWindows.map((w: any) => (
                    <Fragment key={w.date}>
                      {w.submissions.map((s: any, idx: number) => {
                        const counted = idx === w.countedIndex;
                        const rowTitle =
                          !counted && s.notCountedReason
                            ? s.notCountedReason
                            : undefined;
                        return (
                          <tr
                            key={w.date + "|" + s.timestamp}
                            className={[
                              "border-b border-border/60",
                              counted
                                ? ""
                                : "opacity-60 text-muted-foreground line-through",
                            ].join(" ")}
                            title={rowTitle}
                          >
                            <td
                              className="px-2 py-2 text-left tabular-nums text-nowrap"
                              title={new Date(s.timestamp).toLocaleTimeString(
                                "en-US",
                                {
                                  timeZone: cfg.timezone,
                                  year: "numeric",
                                  month: "2-digit",
                                  day: "2-digit",
                                  hour: "numeric",
                                  minute: "2-digit",
                                },
                              )}
                            >
                              {`Day: ${s.dayOfChallenge}`}
                            </td>
                            {habits.map((h) => {
                              const attempted = !!s.checkins?.[h.key];
                              const award = counted
                                ? w.perHabitAwards?.[h.key]
                                : undefined;
                              const awardedPoints =
                                counted && award
                                  ? Number(award.awarded ?? 0)
                                  : attempted
                                    ? h.points
                                    : 0;
                              const zeroed =
                                counted &&
                                attempted &&
                                award &&
                                Number(award.awarded) === 0;
                              const reduced =
                                counted &&
                                attempted &&
                                award &&
                                Number(award.awarded) > 0 &&
                                Number(award.awarded) < Number(award.basePoints);
                              const reasons = zeroed ? award.reasons || [] : [];
                              const title = counted
                                ? zeroed || reduced
                                  ? `${h.label} — awarded ${awardedPoints} of ${Number(award?.basePoints ?? h.points)}: ${(award?.reasons || []).join("; ")}`
                                  : h.label
                                : rowTitle || h.label;
                              const baseClasses = [
                                "inline-flex size-4 items-center justify-center rounded-sm border",
                                attempted
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "border-border",
                              ];
                              const classes = zeroed
                                ? baseClasses.concat([
                                    "line-through opacity-70",
                                    "bg-transparent text-muted-foreground border-dashed border-border",
                                  ])
                                : reduced
                                  ? baseClasses.concat([
                                      "bg-amber-500/15 text-amber-200 border-amber-400",
                                    ])
                                : baseClasses;
                              return (
                                <td
                                  key={h.key + idx}
                                  className="px-2 py-2 text-center"
                                >
                                  <span
                                    className={classes.join(" ")}
                                    aria-checked={attempted}
                                    role="checkbox"
                                    title={title}
                                  >
                                    {attempted ? "✓" : ""}
                                  </span>
                                  {attempted
                                    ? ` +${counted ? awardedPoints : h.points}`
                                    : ""}
                                </td>
                              );
                            })}
                            <td className="px-2 py-2 text-right tabular-nums font-medium">
                              {counted
                                ? Number(w.dailyPointsAwarded ?? 0).toFixed(2)
                                : "—"}
                              {counted && w.dailyCapApplied && (
                                <span
                                  className="ml-2 rounded-sm bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                                  title={`Daily cap applied: was ${w.dailyCapApplied.before}, capped at ${w.dailyCapApplied.cap}`}
                                >
                                  capped
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  ))
                : detail.dailyLogs.map((d: any) => (
                    <tr key={d.date} className="border-b border-border/60">
                      <td className="px-2 py-2 text-left tabular-nums">
                        {d.date}
                      </td>
                      {habits.map((h) => {
                        const done = !!d.checkins[h.key];
                        return (
                          <td key={h.key} className="px-2 py-2 text-center">
                            <span
                              className={[
                                "inline-flex size-4 items-center justify-center rounded-sm border",
                                done
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "border-border",
                              ].join(" ")}
                              aria-checked={done}
                              role="checkbox"
                              title={h.label}
                            >
                              {done ? "✓" : ""}
                            </span>{" "}
                            +{h.points}
                          </td>
                        );
                      })}
                      <td className="px-2 py-2 text-right tabular-nums font-medium">
                        {Number(d.dailyPoints).toFixed(2)}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Performance Improvements</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-center text-sm uppercase text-muted-foreground">
                <th className="border-b border-border px-2 py-2 text-left">
                  Metric
                </th>
                <th className="border-b border-border px-2 py-2">Baseline</th>
                <th className="border-b border-border px-2 py-2">Final</th>
                <th className="border-b border-border px-2 py-2">
                  Improvement
                </th>
                <th className="border-b border-border px-2 py-2">Scoring</th>
                <th className="border-b border-border px-2 py-2">Points</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((m) => {
                const imp = detail.improvements?.[m.key];
                const metricLabel =
                  detail.bodyComposition && m.key === adjustedBfpMetricKey
                    ? "BFP adjusted*"
                    : m.label;
                const improvement =
                  m.kind === "percent_gain"
                    ? `${fmtNum(100 * imp?.improvement)}%`
                    : fmtNum(imp?.improvement);
                const pointsPerUnit = m.scoring({
                  improvement: m.kind === "percent_gain" ? 0.01 : 1,
                  baseline: 100,
                  final: 120,
                });
                const unit = m.kind === "percent_gain" ? "%" : "unit";
                const dir = m.direction === "up" ? "gained" : "lost";

                return (
                  <tr key={m.key} className="border-b border-border/60">
                    <td className="px-2 py-2 text-left">{metricLabel}</td>
                    <td className="px-2 py-2 tabular-nums">
                      {fmtNum(imp?.baseline)}
                    </td>
                    <td className="px-2 py-2 tabular-nums">
                      {fmtNum(imp?.final)}
                    </td>
                    <td className="px-2 py-2 tabular-nums">{improvement}</td>
                    <td className="px-2 py-2 tabular-nums">{`${pointsPerUnit} points per ${unit} ${dir}`}</td>
                    <td className="px-2 py-2 tabular-nums">
                      {fmtNum(imp?.points)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Updated:{" "}
          {new Date(detail.updatedAt).toLocaleString("en-US", {
            timeZone: cfg.timezone,
          })}
        </p>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border p-4">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-2xl font-extrabold">{value}</div>
    </div>
  );
}

function fmtNum(n?: number) {
  if (n == null || !isFinite(n)) return "—";
  return Number(n).toFixed(2);
}
