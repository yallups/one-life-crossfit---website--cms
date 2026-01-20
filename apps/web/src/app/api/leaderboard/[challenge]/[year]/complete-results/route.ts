import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  isWithinYmdRange,
  monthKeyFromYmd,
  scoringDate,
  weekKeyFromYmd,
} from "@/lib/leaderboard/date";
import {
  extractMetricWindows,
  latestByBucket,
  loadSubmissions,
  scoreHabits,
  scorePerformance,
} from "@/lib/leaderboard/engine";
import { getChallengeConfig } from "@/lib/leaderboard/registry";
import { roundTo } from "@/lib/leaderboard/scoring";
import type { DivisionKey } from "@/lib/leaderboard/types";

export const dynamic = "force-dynamic";

interface HabitAwardDetail {
  attempted: boolean;
  basePoints: number;
  awarded: number;
  reasons: string[];
}

interface DailySubmissionDetail {
  timestamp: string;
  dayOfChallenge: number;
  checkins: Record<string, boolean>;
  metrics: Record<string, number>;
  isLatestForWindow: boolean;
  notCountedReason?: string;
}

interface DailyWindowDetail {
  date: string;
  dayOfChallenge: number;
  submissions: DailySubmissionDetail[];
  countedSubmissionIndex: number;
  perHabitAwards: Record<string, HabitAwardDetail>;
  dailyPointsBeforeCap: number;
  dailyPointsAwarded: number;
  dailyCapApplied?: {
    cap: number;
    before: number;
    after: number;
  };
}

interface MemberCompleteResult {
  member_id: string;
  member_name: string;
  division: DivisionKey;
  rank: number;
  habitPoints: number;
  performancePoints: number;
  total: number;

  // Detailed daily windows with scoring breakdown
  dailyWindows: DailyWindowDetail[];

  // Performance metrics breakdown
  performanceMetrics: Record<
    string,
    {
      label: string;
      baseline?: number;
      final?: number;
      improvement: number;
      points: number;
      direction: "up" | "down";
    }
  >;
}

type PerformanceMetricDetail = {
  label: string;
  baseline?: number;
  final?: number;
  improvement: number;
  points: number;
  direction: "up" | "down";
};

interface CompleteResultsResponse {
  challenge: {
    id: string;
    slug: string;
    year: number;
    title: string;
    challengeWindow: { start: string; end: string };
  };
  config: {
    checkins: Array<{ key: string; label: string; points: number }>;
    performanceMetrics: Array<{
      key: string;
      label: string;
      kind: string;
      direction: "up" | "down";
    }>;
    weights: { habits: number; performance: number };
  };
  divisions: Record<DivisionKey, MemberCompleteResult[]>;
  generatedAt: string;
}

function improvementForMetric(
  kind: string,
  baseline?: number,
  final?: number,
  direction: "up" | "down" = "up",
) {
  if (baseline == null || final == null) return 0;
  if (!Number.isFinite(baseline) || !Number.isFinite(final)) return 0;
  if (kind === "percent_gain") {
    if (baseline <= 0) return 0;
    const pct = (final - baseline) / baseline;
    return Math.max(0, pct);
  } else {
    const delta = final - baseline;
    const raw = direction === "down" ? -delta : delta;
    return Math.max(0, raw);
  }
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ challenge: string; year: string }> },
) {
  const params = await context.params;
  const yearNum = Number(params.year);
  const cfg = getChallengeConfig(params.challenge, yearNum);

  if (!cfg) {
    return NextResponse.json(
      { error: `Unknown challenge ${params.challenge}/${params.year}` },
      { status: 404 },
    );
  }

  try {
    // Load all submissions
    const submissions = await loadSubmissions(cfg);

    // Get daily aggregates (latest per member per day)
    const dailies = latestByBucket(submissions, cfg).sort((a, b) =>
      a.timestamp.localeCompare(b.timestamp),
    );

    // Track member metadata
    const memberName = new Map<string, string>();
    const memberDivision = new Map<string, DivisionKey>();
    for (const d of dailies) {
      memberName.set(d.member_id, d.member_name);
      memberDivision.set(d.member_id, d.division);
    }

    // Calculate scores
    const habitByMember = scoreHabits(dailies, cfg);
    const perfByMember = scorePerformance(dailies, cfg, memberDivision);
    const metricWindowsByMember = extractMetricWindows(dailies, cfg);

    // Group by division
    const divisions = new Set<DivisionKey>(
      cfg.divisions.keys.length
        ? cfg.divisions.keys
        : Array.from(memberDivision.values()),
    );

    const divisionResults: Record<DivisionKey, MemberCompleteResult[]> = {};

    for (const div of divisions) {
      const membersInDiv = Array.from(memberDivision.entries())
        .filter(([_, d]) => d === div)
        .map(([m]) => m);

      const results: MemberCompleteResult[] = membersInDiv.map((memberId) => {
        const habit = habitByMember.get(memberId) ?? 0;
        const perf = perfByMember.get(memberId) ?? 0;
        const total =
          habit * cfg.weights.habits + perf * cfg.weights.performance;

        // Build detailed daily windows with ALL submissions and scoring details
        type RawSub = {
          timestamp: string;
          date: string;
          checkins: Record<string, boolean>;
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
          if (
            !isWithinYmdRange(
              date,
              cfg.challengeWindow.start,
              cfg.challengeWindow.end,
            )
          )
            continue;
          rawMine.push({
            timestamp: s.timestamp,
            date,
            checkins: s.checkins ?? {},
            metrics: s.metrics ?? {},
          });
        }

        // Group by date
        const byDate = new Map<string, RawSub[]>();
        for (const r of rawMine) {
          const list = byDate.get(r.date) || [];
          list.push(r);
          byDate.set(r.date, list);
        }

        // Track per-habit awarded points across windows for this member to enforce limits
        const limitsByKey = new Map(
          cfg.checkins.items.map((i) => [i.key, i.limits || []] as const),
        );
        const pointsByKey = new Map(
          cfg.checkins.items.map((i) => [i.key, i.points] as const),
        );
        const challengeWindow = cfg.challengeWindow;
        const awardedByHabitWindow = new Map<string, Map<string, number>>(); // habit -> windowKey -> points

        function windowKeysFor(habitKey: string, dateYmd: string) {
          const limits = limitsByKey.get(habitKey) || [];
          const keys: Array<{ key: string; max: number; label: string }> = [];
          for (const lim of limits) {
            if (lim.window === "day")
              keys.push({
                key: `day:${dateYmd}`,
                max: lim.maxPoints,
                label: `Daily cap (${lim.maxPoints})`,
              });
            else if (lim.window === "week")
              keys.push({
                key: `week:${weekKeyFromYmd(dateYmd, lim.weekStartsOn || "sun")}`,
                max: lim.maxPoints,
                label: `Weekly cap (${lim.maxPoints})`,
              });
            else if (lim.window === "month")
              keys.push({
                key: `month:${monthKeyFromYmd(dateYmd)}`,
                max: lim.maxPoints,
                label: `Monthly cap (${lim.maxPoints})`,
              });
            else if (lim.window === "challenge")
              keys.push({
                key: `challenge:${challengeWindow.start}-${challengeWindow.end}`,
                max: lim.maxPoints,
                label: `Challenge cap (${lim.maxPoints})`,
              });
          }
          return keys;
        }

        const cap = cfg.checkins.maxDailyPoints ?? null;
        const windows: DailyWindowDetail[] = [];
        const datesSorted = Array.from(byDate.keys()).sort();

        for (const date of datesSorted) {
          const subs = (byDate.get(date) || []).sort((a, b) =>
            a.timestamp.localeCompare(b.timestamp),
          );
          if (subs.length === 0) continue;

          const countedIndex = Math.max(0, subs.length - 1);
          const latest = subs[countedIndex];
          if (!latest) continue;

          const dayOfChallenge =
            Math.round(
              (new Date(date).getTime() -
                new Date(cfg.challengeWindow.start).getTime()) /
                (1000 * 60 * 60 * 24),
            ) + 1;

          const submissionsAudit: DailySubmissionDetail[] = subs.map(
            (s, idx) => ({
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
            }),
          );

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
                const hmap =
                  awardedByHabitWindow.get(key) || new Map<string, number>();
                if (!awardedByHabitWindow.has(key))
                  awardedByHabitWindow.set(key, hmap);
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
                  const hmap = awardedByHabitWindow.get(key);
                  if (!hmap) continue;
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
            dayOfChallenge,
            submissions: submissionsAudit,
            countedSubmissionIndex: countedIndex,
            perHabitAwards,
            dailyPointsBeforeCap: dailyBeforeCap,
            dailyPointsAwarded,
            dailyCapApplied,
          });
        }

        // Get performance metrics breakdown
        const metricWindows = metricWindowsByMember.get(memberId) || {
          baseline: {},
          final: {},
        };
        const performanceMetrics: Record<string, PerformanceMetricDetail> = {};

        for (const spec of cfg.performance.metrics) {
          const baseline = metricWindows.baseline[spec.key];
          const final = metricWindows.final[spec.key];
          const direction: "up" | "down" =
            spec.direction === "down" ? "down" : "up";
          const improvement = improvementForMetric(
            spec.kind,
            baseline,
            final,
            direction,
          );
          const points = spec.scoring({ improvement, baseline, final });

          const hide = Boolean(
            (spec as { sensitive?: boolean }).sensitive ?? false,
          );
          performanceMetrics[spec.key] = {
            label: spec.label,
            baseline: hide ? undefined : baseline,
            final: hide ? undefined : final,
            improvement,
            points,
            direction,
          };
        }

        return {
          member_id: memberId,
          member_name: memberName.get(memberId) ?? memberId,
          division: div,
          rank: 0, // Will be set after sorting
          habitPoints: roundTo(habit, 2),
          performancePoints: roundTo(perf, 2),
          total: roundTo(total, 2),
          dailyWindows: windows,
          performanceMetrics,
        };
      });

      // Sort by total and assign ranks
      results.sort((a, b) => {
        if (b.total !== a.total) return b.total - a.total;
        if (b.performancePoints !== a.performancePoints)
          return b.performancePoints - a.performancePoints;
        if (b.habitPoints !== a.habitPoints)
          return b.habitPoints - a.habitPoints;
        return 0;
      });
      results.forEach((r, i) => {
        r.rank = i + 1;
      });

      divisionResults[div] = results;
    }

    const response: CompleteResultsResponse = {
      challenge: {
        id: cfg.id,
        slug: cfg.slug,
        year: cfg.year,
        title: cfg.title,
        challengeWindow: cfg.challengeWindow,
      },
      config: {
        checkins: cfg.checkins.items.map((i) => ({
          key: i.key,
          label: i.label,
          points: i.points,
        })),
        performanceMetrics: cfg.performance.metrics.map((m) => ({
          key: m.key,
          label: m.label,
          kind: m.kind,
          direction: m.direction ?? "up",
        })),
        weights: cfg.weights,
      },
      divisions: divisionResults,
      generatedAt: new Date().toISOString(),
    };

    return NextResponse.json(response, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (e: unknown) {
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "Failed to generate complete results",
      },
      { status: 500 },
    );
  }
}
