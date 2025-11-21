import type { ChallengeConfig, SubmissionRow } from "./types";
import { absolutePerUnit, absoluteScaledLinear } from "./scoring";
import { parseToZonedISOString } from "./date";

// Helper to build a Google Sheets gviz CSV URL for a given sheet name.
function gvizCsvUrl(sheetId: string, sheetName: string) {
  const name = encodeURIComponent(sheetName);
  return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${name}`;
}

// FLEX THE HALLS 2025 CONFIG (example)
const FLEX_THE_HALLS_25_SHEET_ID = "1ogKeHd3C-SRxU1vQI32050-2G4qmgFAytQTjQDJOqlE";
// Prefer using the specific tab via gid to avoid name mismatches
const FLEX_THE_HALLS_25_GID = "1706604796";
export const flex2025: ChallengeConfig = {
  id: "flex-the-halls-challenge-2025",
  slug: "flex-the-halls-challenge",
  year: 2025,
  title: "Flex the Halls Challenge 2025",
  timezone: "America/Los_Angeles",
  checkinWindow: { startHour: 19, durationHours: 24 },
  challengeWindow: { start: "2025-11-17", end: "2025-12-27" },
  theme: {
    // backgroundColor: "#0B0F1A",
    // imageBackgroundColor: "#0B0F1A",
    backgroundImageUrl: "https://cdn.sanity.io/images/kuaamikv/production/bc7332e2ac09e514a961497c1485954d3b6cd016-1295x864.png", // optional
    logoUrl: "https://cdn.sanity.io/images/kuaamikv/production/0cfb9bec9cc7340810a4e6eb94ce451920cdcb33-581x407.png", // optional
  },
  divisions: {
    keys: ["open"],
  },
  checkins: {
    items: [
      { key: "protein", label: "Hit protein target", points: 1 },
      { key: "water", label: "Hydration target", points: 1 },
      { key: "creatine", label: "Creatine", points: 1 },
      { key: "protein_powder_max1_scoop", label: "Protein powder ≤1 scoop", points: 1 },
      {
        key: "group_class", label: "Group Class participation", points: 1,
        limits: [{ window: 'week', maxPoints: 5, weekStartsOn: 'mon' }]
      },
      {
        key: "daily_program_done", label: "Daily program done", points: 1,
        limits: [{ window: 'week', maxPoints: 5, weekStartsOn: 'mon' }]
      },
      { key: "sleep_8h", label: "8h sleep", points: 1 },
      { key: "social_post", label: "Social post", points: 1 },
      {
        key: 'inbody_scan',
        label: 'InBody Scan',
        points: 1,
        limits: [{ window: 'week', maxPoints: 1, weekStartsOn: 'mon' }]
      },
      { key: "daily_submission", label: "Submitted daily", points: 1 },
    ],
    // maxDailyPoints: 8,
  },
  performance: {
    baselineWindow: { start: "2025-11-16", end: "2025-11-22" },
    finalWindow: { start: "2025-12-22", end: "2025-12-27" },
    liveScoring: { mode: "latest_to_date", lockAfterEnd: true },
    metrics: [
      {
        key: "inbody_muscle_mass_lb",
        label: "Muscle Mass (lb)",
        kind: "absolute_delta",
        scoring: absolutePerUnit(0.1, 1),
        sanityMax: 300,
      },
      {
        key: "front_squat_3rm",
        label: "Front Squat 3RM",
        kind: "percent_gain",
        scoring: absoluteScaledLinear(15, 1), // full points at +100%
        sanityMax: 1000,
      },
      {
        key: "bench_press_3rm",
        label: "Bench Press 3RM",
        kind: "percent_gain",
        scoring: absoluteScaledLinear(15, 1), // full points at +100%
        sanityMax: 700,
      },
      {
        key: "sandbag_hold_sec",
        label: "Sandbag Hold (sec)",
        kind: "absolute_delta",
        scoring: absoluteScaledLinear(10, 60), // +60s → full scale
        sanityMax: 600,
      },
      {
        key: "max_pullups_reps",
        label: "Max Pull-ups (reps)",
        kind: "absolute_delta",
        scoring: absoluteScaledLinear(10, 10), // +10 reps → full scale
        sanityMax: 100,
      },
      {
        key: "max_pushups_reps",
        label: "Max Push-ups (reps)",
        kind: "absolute_delta",
        scoring: absoluteScaledLinear(10, 10), // +10 reps → full scale
        sanityMax: 100,
      },
    ],
  },
  weights: { habits: 1, performance: 1 },
  tieBreakers: [
    { type: "performance" },
    { type: "habits" },
    { type: "stable_member_hash" },
  ],
  dataSource: {
    type: "csv",
    // Use the specific tab via gid to avoid tab name mismatch issues
    url: `https://docs.google.com/spreadsheets/d/${FLEX_THE_HALLS_25_SHEET_ID}/export?format=csv&gid=${FLEX_THE_HALLS_25_GID}`,
  },
  mapCsvRow: (row) => {
    // Be tolerant of varied headers in Google Forms/Sheets
    const ts = row["timestamp"] || row["Timestamp"] || row["Time"] || row["Date"];
    const id = row["member_id"] || row["Email"] || row["Email Address"] || row["Member ID"] || row["User"];
    const rawName = row["member_name"] || row["Name"] || row["Full Name"] || "";
    const name = rawName || (id ? (id.split("@")[0] || id) : undefined);
    const division = (row["division"] || row["Division"] || "open").toLowerCase();
    if (!ts || !id || !name) return undefined;

    // Map checkins: treat any non-empty cell as true (some forms store descriptive text)
    function truthy(v?: string) {
      const s = (v ?? "").toString().trim();
      if (!s) return false;
      return !/^no$/i.test(s);
    }

    const checkins: Record<string, boolean> = {
      protein: truthy(row["protein"]) || truthy(row["Protein"]),
      water: truthy(row["water"]) || truthy(row["Water"]),
      creatine: truthy(row["creatine"]) || truthy(row["Creatine Supplement"]),
      protein_powder_max1_scoop: truthy(row["protein_powder_max1_scoop"]) || truthy(row["Protein powder max1 scoop"]) || truthy(row["Protein Supplement"]) || truthy(row["Protein Supplement (<=1 scoop)"]),
      group_class: truthy(row["group_class"]) || truthy(row["Group class"]) || truthy(row["Group Class"]),
      daily_program_done: truthy(row["daily_program_done"]) || truthy(row["Body Building"]) || truthy(row["Program Done"]) || truthy(row["Daily program done"]),
      sleep_8h: truthy(row["sleep_8h"]) || truthy(row["Sleep"]) || truthy(row["Slept 8h"]) || truthy(row["8h sleep"]),
      social_post: truthy(row["social_post"]) || truthy(row["Social media"]) || truthy(row["Social Post"]) || truthy(row["Social post"]),
      inbody_scan: truthy(row["inbody_scan"]) || truthy(row["InBody Scan"]),
      daily_submission: true,
    };

    function toNum(v?: string) {
      const n = Number((v || "").toString().replace(/[^0-9.\-]/g, ""));
      return isFinite(n) ? n : undefined;
    }

    const metrics: Record<string, number> = {};
    const m = (k: string) => toNum(row[k]) ?? toNum(row[k?.replaceAll?.("_", " ") as string]);
    const mm = m("inbody_muscle_mass_lb") ?? m("InBody Muscle Mass (lb)");
    if (mm !== undefined) metrics["inbody_muscle_mass_lb"] = mm;
    const bc = m("bicep_circumference_in") ?? m("Bicep Circumference (in)");
    if (bc !== undefined) metrics["bicep_circumference_in"] = bc;
    const bs = m("front_squat_3rm") ?? m("Front Squat 3RM");
    if (bs !== undefined) metrics["front_squat_3rm"] = bs;
    const bp = m("bench_press_3rm") ?? m("Bench Press 3RM");
    if (bp !== undefined) metrics["bench_press_3rm"] = bp;
    const sb = m("sandbag_hold_sec") ?? m("Sandbag Hold (sec)");
    if (sb !== undefined) metrics["sandbag_hold_sec"] = sb;
    const pu = m("max_pullups_reps") ?? m("Max Pull-ups (reps)");
    if (pu !== undefined) metrics["max_pullups_reps"] = pu;

    const iso = parseToZonedISOString(ts, "America/Los_Angeles") || new Date(ts).toISOString();
    return {
      timestamp: iso,
      member_id: id,
      member_name: name,
      division,
      checkins,
      metrics,
    } satisfies SubmissionRow;
  },
};

// SUMMER SHRED 2025 (retroactive) using the provided Google Sheet as data source
// Sheet link provided by user:
// https://docs.google.com/spreadsheets/d/12paFULTx_tdDddzzUPDmZ9jVHA8f16sKLniygv9fDk4/edit?usp=sharing
// We will use gviz CSV for the sheet named "Form Responses 1" by default. Adjust sheetName if needed.
const SUMMER_SHRED_SHEET_ID = "12paFULTx_tdDddzzUPDmZ9jVHA8f16sKLniygv9fDk4";
const SUMMER_SHRED_SHEET_NAME = "Form Responses 1"; // Change if your tab name differs

export const summerShred2025: ChallengeConfig = {
  id: "summer-shred-challenge-2025",
  slug: "summer-shred-challenge",
  year: 2025,
  title: "Summer Shred Challenge 2025",
  timezone: "America/Los_Angeles",
  checkinWindow: { startHour: 19, durationHours: 24 },
  theme: {
    backgroundColor: "#0B0F1A",
    imageBackgroundColor: "#0B0F1A",
  },
  // Example dates; adjust if your challenge dates differ
  challengeWindow: { start: "2025-04-06", end: "2025-05-18" },
  divisions: {
    keys: ["open"],
  },
  checkins: {
    // Adjusted to match the actual Summer Shred sheet headers (see CSV):
    // "Protein","Carbs","Sleep","Fiber","Fasting","Group class","Body Building","Social media","InBody Scan"
    items: [
      { key: "protein", label: "Protein target met", points: 1 },
      { key: "carbs", label: "Avoided processed carbs", points: 1 },
      { key: "sleep", label: "8 hours in bed", points: 1 },
      { key: "fiber", label: "30g Fiber", points: 1 },
      { key: "fasting", label: "Time-restricted eating window", points: 1 },
      { key: "group_class", label: "Attended Group Class", points: 1 },
      { key: "bodybuilding", label: "Completed Bodybuilding session", points: 1 },
      {
        key: "social_media",
        label: "Posted on social media w/ tag & hashtag",
        points: 1,
        limits: [{ window: "week", maxPoints: 5, weekStartsOn: "sun" }]
      },
      {
        key: "inbody_scan",
        label: "Sent InBody Scan",
        points: 2,
        limits: [{ window: "week", maxPoints: 2, weekStartsOn: "sun" }]
      },
      { key: "daily_submission", label: "Submitted daily", points: 1 },
    ],
    // Keep the cap at 8 so even if more than 8 habits are true, max per day is 8
    maxDailyPoints: 8,
  },
  performance: {
    // Example baseline/final windows; adjust to your real dates
    baselineWindow: { start: "2025-04-06", end: "2025-05-18" },
    finalWindow: { start: "2025-04-06", end: "2025-05-18" },
    metrics: [
      // For weight loss challenges you might include body weight delta, waist, etc.
      {
        key: "body_weight_lb",
        label: "Body Weight (lb)",
        kind: "absolute_delta",
        direction: "down",
        // Negative improvements (weight loss) should count positively.
        scoring: absolutePerUnit(1, 1), // points per 1 lb change
        sanityMax: 500,
      },
      {
        key: "waist_circumference_in",
        label: "Waist Circumference (in)",
        kind: "absolute_delta",
        scoring: absolutePerUnit(0.5, 1),
        sanityMax: 80,
      },
    ],
  },
  weights: { habits: 1, performance: 1 },
  tieBreakers: [{ type: "performance" }, { type: "habits" }, { type: "stable_member_hash" }],
  dataSource: {
    type: "csv",
    url: gvizCsvUrl(SUMMER_SHRED_SHEET_ID, SUMMER_SHRED_SHEET_NAME),
  },
  mapCsvRow: (row) => {
    // Map Summer Shred CSV (headers observed via gviz CSV):
    // "Timestamp","Email","Protein","Carbs","Sleep","Fiber","Fasting","Group class","Body Building","Social media","InBody Scan"
    const ts = row["Timestamp"] || row["timestamp"];
    const id = row["Email"] || row["Email Address"] || row["member_id"];
    // Derive a display name from email if no name column is present
    const rawName = row["Name"] || row["Full Name"] || row["member_name"] || "";
    const name = rawName || (id ? (id.split("@")[0] || id) : undefined);
    if (!ts || !id || !name) return undefined;

    // Treat any non-empty cell as true (these columns contain descriptive text when completed)
    const truthy = (v?: string) => (v ?? "").toString().trim().length > 0 && !/^no$/i.test((v ?? "").trim());
    // Generic number parser (not used for this sheet but kept for future metrics)
    const num = (v?: string) => {
      const n = Number((v || "").toString().replace(/[^0-9.\-]/g, ""));
      return isFinite(n) ? n : undefined;
    };

    const checkins: Record<string, boolean> = {
      protein: truthy(row["Protein"]),
      carbs: truthy(row["Carbs"]),
      sleep: truthy(row["Sleep"]),
      fiber: truthy(row["Fiber"]),
      fasting: truthy(row["Fasting"]),
      group_class: truthy(row["Group class"]),
      bodybuilding: truthy(row["Body Building"]),
      social_media: truthy(row["Social media"]),
      inbody_scan: truthy(row["InBody Scan"]),
      daily_submission: true,
    };

    const metrics: Record<string, number> = {};
    // If future Summer Shred tabs include measurements, map them here (e.g., Body Weight, Waist)
    const bw = num(row["Body Weight (lb)"] || row["body_weight_lb"]);
    if (bw !== undefined) metrics["body_weight_lb"] = bw;
    const waist = num(row["Waist (in)"] || row["waist_circumference_in"]);
    if (waist !== undefined) metrics["waist_circumference_in"] = waist;

    const iso = parseToZonedISOString(ts, "America/Los_Angeles") || new Date(ts).toISOString();
    return {
      timestamp: iso,
      member_id: id,
      member_name: name,
      division: "open",
      checkins,
      metrics,
    };
  },
};

export const registry: ChallengeConfig[] = [flex2025, summerShred2025];

export function getChallengeConfig(slug: string, year: number): ChallengeConfig | undefined {
  return registry.find((c) => c.slug === slug && c.year === year);
}
