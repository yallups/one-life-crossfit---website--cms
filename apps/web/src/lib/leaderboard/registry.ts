import { parseToZonedISOString, scoringDate } from "./date";
import { absoluteLinear, absolutePerUnit } from "./scoring";
import type { ChallengeConfig, Member, SubmissionRow } from "./types";

// Helper to build a Google Sheets gviz CSV URL for a given sheet name.
function gvizCsvUrl(sheetId: string, sheetName: string) {
  const name = encodeURIComponent(sheetName);
  return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${name}`;
}

// FLEX THE HALLS 2025 CONFIG (example)
const FLEX_THE_HALLS_25_SHEET_ID =
  "1ogKeHd3C-SRxU1vQI32050-2G4qmgFAytQTjQDJOqlE";
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
    backgroundImageUrl:
      "https://cdn.sanity.io/images/kuaamikv/production/bc7332e2ac09e514a961497c1485954d3b6cd016-1295x864.png", // optional
    logoUrl:
      "https://cdn.sanity.io/images/kuaamikv/production/0cfb9bec9cc7340810a4e6eb94ce451920cdcb33-581x407.png", // optional
  },
  divisions: {
    keys: ["open"],
  },
  checkins: {
    items: [
      { key: "protein", label: "Hit protein target", points: 1 },
      { key: "water", label: "Hydration target", points: 1 },
      { key: "creatine", label: "Creatine", points: 1 },
      {
        key: "protein_powder_max1_scoop",
        label: "Protein powder ≤1 scoop",
        points: 1,
      },
      {
        key: "group_class",
        label: "Group Class participation",
        points: 1,
        limits: [{ window: "week", maxPoints: 5, weekStartsOn: "mon" }],
      },
      {
        key: "daily_program_done",
        label: "Daily program done",
        points: 1,
        limits: [{ window: "week", maxPoints: 5, weekStartsOn: "mon" }],
      },
      { key: "sleep_8h", label: "8h sleep", points: 1 },
      { key: "social_post", label: "Social post", points: 1 },
      {
        key: "inbody_scan",
        label: "InBody Scan",
        points: 5,
        limits: [{ window: "week", maxPoints: 5, weekStartsOn: "mon" }],
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
        direction: "up",
        kind: "percent_gain",
        scoring: absolutePerUnit(0.01, 100),
        sanityMax: 300,
        sensitive: true,
      },
      {
        key: "front_squat_3rm",
        label: "Front Squat 3RM",
        direction: "up",
        kind: "absolute_delta",
        scoring: absolutePerUnit(1, 10),
        sanityMax: 1000,
      },
      {
        key: "bench_press_3rm",
        label: "Bench Press 3RM",
        direction: "up",
        kind: "absolute_delta",
        scoring: absolutePerUnit(1, 10),
        sanityMax: 700,
      },
      {
        key: "sandbag_hold_sec",
        label: "Sandbag Hold (sec)",
        direction: "up",
        kind: "absolute_delta",
        scoring: absolutePerUnit(10, 10),
        sanityMax: 600,
      },
      {
        key: "plank_hold_sec",
        label: "Plank Hold (sec)",
        direction: "up",
        kind: "absolute_delta",
        scoring: absolutePerUnit(10, 10),
        sanityMax: 1200,
      },
      {
        key: "grip_strength_best",
        label: "Grip Strength (best)",
        direction: "up",
        kind: "absolute_delta",
        scoring: absolutePerUnit(1, 10),
        sanityMax: 500,
      },
      {
        key: "max_pushups_reps",
        label: "Max Push-ups (reps)",
        direction: "up",
        kind: "absolute_delta",
        scoring: absolutePerUnit(1, 10),
        sanityMax: 200,
      },
      {
        key: "max_pullups_reps",
        label: "Max Pull-ups (reps)",
        direction: "up",
        kind: "absolute_delta",
        scoring: absolutePerUnit(1, 10),
        sanityMax: 100,
      },
      {
        key: "bicep_circumference_in",
        label: "Arm Circumference (in)",
        direction: "up",
        kind: "percent_gain",
        scoring: absolutePerUnit(0.01, 10),
        sanityMax: 300,
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
    const ts =
      row["timestamp"] || row["Timestamp"] || row["Time"] || row["Date"];
    const id =
      row["member_id"] ||
      row["Email"] ||
      row["Email Address"] ||
      row["Member ID"] ||
      row["User"];
    const rawName = row["member_name"] || row["Name"] || row["Full Name"] || "";
    const name = rawName || (id ? id.split("@")[0] || id : undefined);
    const division = (
      row["division"] ||
      row["Division"] ||
      "open"
    ).toLowerCase();
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
      protein_powder_max1_scoop:
        truthy(row["protein_powder_max1_scoop"]) ||
        truthy(row["Protein powder max1 scoop"]) ||
        truthy(row["Protein Supplement"]) ||
        truthy(row["Protein Supplement (<=1 scoop)"]),
      group_class:
        truthy(row["group_class"]) ||
        truthy(row["Group class"]) ||
        truthy(row["Group Class"]),
      daily_program_done:
        truthy(row["daily_program_done"]) ||
        truthy(row["Body Building"]) ||
        truthy(row["Program Done"]) ||
        truthy(row["Daily program done"]),
      sleep_8h:
        truthy(row["sleep_8h"]) ||
        truthy(row["Sleep"]) ||
        truthy(row["Slept 8h"]) ||
        truthy(row["8h sleep"]),
      social_post:
        truthy(row["social_post"]) ||
        truthy(row["Social media"]) ||
        truthy(row["Social Post"]) ||
        truthy(row["Social post"]),
      inbody_scan: truthy(row["inbody_scan"]) || truthy(row["InBody Scan"]),
      daily_submission: true,
    };

    function toNum(v?: string) {
      if (v === "") return undefined;
      if (v === undefined) return undefined;
      const n = Number((v || "").toString().replace(/[^0-9.-]/g, ""));
      return isFinite(n) ? n : undefined;
    }

    function timeToSeconds(v?: string) {
      const s = (v ?? "").trim();
      if (!s) return undefined;
      // Support mm:ss or hh:mm:ss or plain seconds
      const mm = s.match(/^(\d+):(\d{2})(?::(\d{2}))?$/);
      if (mm) {
        const h = mm[3] ? Number(mm[1]) : 0;
        const m = mm[3] ? Number(mm[2]) : Number(mm[1]);
        const sec = mm[3] ? Number(mm[3]) : Number(mm[2]);
        return h * 3600 + m * 60 + sec;
      }
      const n = Number(s.replace(/[^0-9.-]/g, ""));
      return isFinite(n) ? n : undefined;
    }

    const metrics: Record<string, number> = {};
    const m = (k: string) =>
      toNum(row[k]) ?? toNum(row[k?.replaceAll?.("_", " ") as string]);

    // Muscle/arms (sensitive)
    const mm =
      m("inbody_muscle_mass_lb") ??
      toNum(row["Muscle Mass (Skeletal Muscle Mass - SMM on InBody)"]) ??
      toNum(row["Muscle Mass (lb)"]); // tolerate variants
    if (mm !== undefined) metrics["inbody_muscle_mass_lb"] = mm;
    const bc =
      m("bicep_circumference_in") ??
      toNum(row["Arm Circumference"]) ??
      toNum(row["Bicep Circumference (in)"]);
    if (bc !== undefined) metrics["bicep_circumference_in"] = bc;

    // Lifts
    const fs =
      m("front_squat_3rm") ??
      toNum(row["Front Squat 3RM"]) ??
      toNum(row["Front Squat 3 Rep Max"]);
    if (fs !== undefined) metrics["front_squat_3rm"] = fs;
    const bp =
      m("bench_press_3rm") ??
      toNum(row["Bench Press 3RM"]) ??
      toNum(row["Bench Press 3 Rep Max"]);
    if (bp !== undefined) metrics["bench_press_3rm"] = bp;

    // Time holds
    const sb =
      timeToSeconds(row["sandbag_hold_sec"]) ??
      timeToSeconds(row["Sandbag Hold (sec)"]) ??
      timeToSeconds(row["Sand Bag Hold Time"]) ??
      m("sandbag_hold_sec");
    if (sb !== undefined) metrics["sandbag_hold_sec"] = sb;
    const plank =
      timeToSeconds(row["Plank Hold Time"]) ??
      timeToSeconds(row["plank_hold_sec"]);
    if (plank !== undefined) metrics["plank_hold_sec"] = plank;

    // Others
    const grip =
      m("grip_strength_best") ?? toNum(row["Grip Strength (Best score)"]);
    if (grip !== undefined) metrics["grip_strength_best"] = grip;
    const push =
      m("max_pushups_reps") ??
      toNum(row["Max Push ups"]) ??
      toNum(row["Max Push-ups (reps)"]);
    if (push !== undefined) metrics["max_pushups_reps"] = push;
    const pull =
      m("max_pullups_reps") ??
      toNum(row["Max Pull ups"]) ??
      toNum(row["Max Pull-ups (reps)"]);
    if (pull !== undefined) metrics["max_pullups_reps"] = pull;

    const iso =
      parseToZonedISOString(ts, "America/Los_Angeles") ||
      new Date(ts).toISOString();
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
// Participant results are on the "Participant lookup" tab; use gid to avoid name mismatch
const SUMMER_SHRED_GID = "167548205";

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
      {
        key: "group_class",
        label: "Attended Group Class",
        points: 1,
        limits: [{ window: "week", maxPoints: 5, weekStartsOn: "sun" }],
      },
      {
        key: "bodybuilding",
        label: "Completed Bodybuilding session",
        points: 1,
        limits: [{ window: "week", maxPoints: 3, weekStartsOn: "sun" }],
      },
      {
        key: "social_media",
        label: "Posted on social media w/ tag & hashtag",
        points: 1,
        limits: [{ window: "week", maxPoints: 5, weekStartsOn: "sun" }],
      },
      {
        key: "inbody_scan",
        label: "Sent InBody Scan",
        points: 2,
        limits: [{ window: "week", maxPoints: 2, weekStartsOn: "sun" }],
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
      // Track baseline/final values from Participant lookup; only body fat % contributes to score per spec
      {
        key: "body_weight_lb",
        label: "Body Weight (lb)",
        kind: "absolute_delta",
        direction: "down",
        scoring: absolutePerUnit(1, 0), // tracked, not scored
        sanityMax: 600,
        sensitive: true,
      },
      {
        key: "inbody_muscle_mass_lb",
        label: "Muscle Mass (lb)",
        kind: "absolute_delta",
        direction: "up",
        scoring: absolutePerUnit(1, 0), // tracked, not scored
        sanityMax: 350,
        sensitive: true,
      },
      {
        key: "inbody_fat_mass_lb",
        label: "Body Fat Mass (lb)",
        kind: "absolute_delta",
        direction: "down",
        scoring: absolutePerUnit(1, 0), // tracked, not scored
        sanityMax: 300,
        sensitive: true,
      },
      {
        key: "inbody_body_fat_pct",
        label: "Body Fat Percentage (%)",
        kind: "absolute_delta",
        direction: "down",
        scoring: absoluteLinear(80), // 80 points per 1% body fat lost (awards partial points)
        sanityMax: 100,
        roundDisplayTo: 1,
        sensitive: true,
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
    // Use direct export URL for the specific tab by gid to avoid name mismatch issues
    url: `https://docs.google.com/spreadsheets/d/${SUMMER_SHRED_SHEET_ID}/export?format=csv&gid=${SUMMER_SHRED_GID}`,
  },
  mapCsvRow: (row) => {
    // Participant lookup is a summary sheet with before/after metrics per member.
    // We synthesize two submissions per row: one at baseline start, one at final end.
    const id =
      row["Email"] ||
      row["Email Address"] ||
      row["Member Email"] ||
      row["member_id"];
    const rawName =
      row["Name"] ||
      row["Full Name"] ||
      row["Member"] ||
      row["member_name"] ||
      "";
    const name = rawName || (id ? id.split("@")[0] || id : undefined);
    if (!id || !name) return undefined;

    const num = (v?: string) => {
      const n = Number((v || "").toString().replace(/[^0-9.-]/g, ""));
      return isFinite(n) ? n : undefined;
    };
    const pick = (...keys: string[]) => {
      for (const k of keys) {
        const v = row[k];
        if (v != null && String(v).trim() !== "") {
          const n = num(String(v));
          if (n != null) return n;
        }
      }
      return undefined;
    };

    // Tolerant header variants
    const bodyWeightBefore = pick(
      "Body Weight - Before",
      "Bodyweight - Before",
      "Body Weight Before",
      "Beginning Weight",
      "Start Weight",
      "BW Before",
      "body_weight_before",
    );
    const bodyWeightAfter = pick(
      "Body Weight - After",
      "Bodyweight - After",
      "Body Weight After",
      "Ending Weight",
      "Final Weight",
      "BW After",
      "body_weight_after",
    );

    const waistBefore = pick(
      "Waist - Before",
      "Waist Circumference - Before",
      "Waist Before",
      "Beginning Waist",
      "Start Waist",
      "waist_circumference_before",
    );
    const waistAfter = pick(
      "Waist - After",
      "Waist Circumference - After",
      "Waist After",
      "Ending Waist",
      "Final Waist",
      "waist_circumference_after",
    );

    // Muscle mass (SMM) in lb
    const muscleBefore = pick(
      "Muscle Mass - Before",
      "Skeletal Muscle Mass - Before",
      "SMM - Before",
      "Muscle - Before",
      "Skeletal Muscle Mass (lb) - Before",
      "Muscle Mass (lb) - Before",
      "Muscle Mass Before",
      "inbody_muscle_mass_lb_before",
    );
    const muscleAfter = pick(
      "Muscle Mass - After",
      "Skeletal Muscle Mass - After",
      "SMM - After",
      "Muscle - After",
      "Skeletal Muscle Mass (lb) - After",
      "Muscle Mass (lb) - After",
      "Muscle Mass After",
      "inbody_muscle_mass_lb_after",
    );

    // Body fat mass in lb
    const fatMassBefore = pick(
      "Body Fat Mass - Before",
      "Fat Mass - Before",
      "BFM - Before",
      "Body Fat (lb) - Before",
      "Body Fat Mass Before",
      "inbody_fat_mass_lb_before",
    );
    const fatMassAfter = pick(
      "Body Fat Mass - After",
      "Fat Mass - After",
      "BFM - After",
      "Body Fat (lb) - After",
      "Body Fat Mass After",
      "inbody_fat_mass_lb_after",
    );

    // Body fat percentage
    const bodyFatPctBefore = pick(
      "Body Fat % - Before",
      "% Body Fat - Before",
      "Bodyfat % - Before",
      "Body Fat Percentage - Before",
      "PBF - Before",
      "Body Fat % Before",
      "inbody_body_fat_pct_before",
    );
    const bodyFatPctAfter = pick(
      "Body Fat % - After",
      "% Body Fat - After",
      "Bodyfat % - After",
      "Body Fat Percentage - After",
      "PBF - After",
      "Body Fat % After",
      "inbody_body_fat_pct_after",
    );

    const baselineMetrics: Record<string, number> = {};
    const finalMetrics: Record<string, number> = {};
    if (bodyWeightBefore != null)
      baselineMetrics["body_weight_lb"] = bodyWeightBefore;
    if (bodyWeightAfter != null)
      finalMetrics["body_weight_lb"] = bodyWeightAfter;
    if (waistBefore != null)
      baselineMetrics["waist_circumference_in"] = waistBefore;
    if (waistAfter != null) finalMetrics["waist_circumference_in"] = waistAfter;
    if (muscleBefore != null)
      baselineMetrics["inbody_muscle_mass_lb"] = muscleBefore;
    if (muscleAfter != null)
      finalMetrics["inbody_muscle_mass_lb"] = muscleAfter;
    if (fatMassBefore != null)
      baselineMetrics["inbody_fat_mass_lb"] = fatMassBefore;
    if (fatMassAfter != null) finalMetrics["inbody_fat_mass_lb"] = fatMassAfter;
    if (bodyFatPctBefore != null)
      baselineMetrics["inbody_body_fat_pct"] = bodyFatPctBefore;
    if (bodyFatPctAfter != null)
      finalMetrics["inbody_body_fat_pct"] = bodyFatPctAfter;

    // If no metric data, skip row
    if (
      Object.keys(baselineMetrics).length === 0 &&
      Object.keys(finalMetrics).length === 0
    )
      return undefined;

    const baselineDate = `${summerShred2025.performance.baselineWindow.start} 20:00`;
    const finalDate = `${summerShred2025.performance.finalWindow.end} 20:00`;
    const baselineTs = parseToZonedISOString(
      baselineDate,
      summerShred2025.timezone,
    )!;
    const finalTs = parseToZonedISOString(finalDate, summerShred2025.timezone)!;

    const base: SubmissionRow = {
      timestamp: baselineTs,
      member_id: id,
      member_name: name,
      division: "open",
      checkins: {},
      metrics: baselineMetrics,
    };
    const fin: SubmissionRow = {
      timestamp: finalTs,
      member_id: id,
      member_name: name,
      division: "open",
      checkins: {},
      metrics: finalMetrics,
    };
    return [base, fin];
  },
};

const SUMMER_SHRED_2026_SHEET_ID =
  "1_cEs6UpI02eS1RQtsZTNGwNBajzzMSXaYToZDZZUVjk";
const SUMMER_SHRED_2026_FORM_RESPONSES_GID = "1595997590";
const SUMMER_SHRED_2026_REGISTRATION_TAB = "Registration";

function normalizeEmail(value?: string) {
  return (value ?? "").toString().trim().toLowerCase();
}

function normalizeDivision(value?: string): "men" | "women" | undefined {
  const raw = (value ?? "").toString().trim().toLowerCase();
  if (!raw) return undefined;
  if (raw === "men" || raw === "mens" || raw === "male" || raw === "m") {
    return "men";
  }
  if (
    raw === "women" ||
    raw === "womens" ||
    raw === "female" ||
    raw === "f" ||
    raw === "woman"
  ) {
    return "women";
  }
  return undefined;
}

function completedSummerShred2026InBodyScan(value?: string) {
  const raw = (value ?? "").toString().trim().toLowerCase();
  if (!raw) return false;
  if (raw === "i did not weigh in today") return false;
  if (raw === "i weighed in on the inbody today") return true;
  return raw !== "no" && raw !== "false" && raw !== "0";
}

function summerShred2026FocusBonusDate(
  ymd: string,
  checkins: Record<string, boolean>,
) {
  if (ymd < "2026-04-05" || ymd > "2026-05-17") return false;
  if (ymd <= "2026-04-11") return !!checkins.carbs;
  if (ymd <= "2026-04-18") return !!checkins.protein;
  if (ymd <= "2026-04-25") return !!checkins.sleep;
  if (ymd <= "2026-05-02") return !!checkins.carbs;
  if (ymd <= "2026-05-09") return !!checkins.fiber;
  return !!checkins.fasting;
}

function mapSummerShred2026RegistrationRow(
  row: Record<string, string>,
): Member | undefined {
  const id = normalizeEmail(
    row["Email"] ||
      row["Email Address"] ||
      row["Member Email"] ||
      row["member_id"],
  );
  if (!id) return undefined;

  const firstName = (row["First Name"] || row["first_name"] || "").trim();
  const lastName = (row["Last Name"] || row["last_name"] || "").trim();
  const combinedName = `${firstName} ${lastName}`.trim();
  const rawName =
    combinedName ||
    row["Name"] ||
    row["Full Name"] ||
    row["Member"] ||
    row["member_name"] ||
    "";
  const name = rawName.toString().trim() || id.split("@")[0] || id;
  const division = normalizeDivision(
    row["Division"] ||
      row["division"] ||
      row["Sex"] ||
      row["Gender"] ||
      row["Category"] ||
      row["Group"],
  );

  return {
    id,
    name,
    profile: {
      division,
    },
  };
}

export const summerShred2026: ChallengeConfig = {
  id: "summer-shred-challenge-2026",
  slug: "summer-shred-challenge",
  year: 2026,
  title: "Summer Shred Challenge 2026",
  timezone: "America/Los_Angeles",
  checkinWindow: { startHour: 19, durationHours: 24 },
  challengeWindow: { start: "2026-04-05", end: "2026-05-17" },
  theme: {
    mode: "light",
    backgroundColor: "#0B0F1A",
    imageBackgroundColor: "#0B0F1A",
    backgroundImageUrl:
      "https://onelifecrossfit.com/images/challenges/summer-shred-challenge-2026-bg.png",
  },
  divisions: {
    keys: ["men", "women"],
    resolveDivisionForMember: (member) =>
      normalizeDivision(member.profile?.division as string | undefined) ||
      "open",
  },
  checkins: {
    items: [
      { key: "carbs", label: "No processed carbs", points: 1 },
      {
        key: "protein",
        label: "Protein",
        points: 1,
      },
      { key: "sleep", label: "8 hours in bed", points: 1 },
      { key: "fiber", label: "30g fiber", points: 1 },
      { key: "fasting", label: "6-hour eating window", points: 1 },
      { key: "weekly_focus_bonus", label: "Weekly focus bonus", points: 2 },
      {
        key: "group_class",
        label: "Attended group class",
        points: 1,
        limits: [{ window: "week", maxPoints: 5, weekStartsOn: "mon" }],
      },
      {
        key: "bodybuilding",
        label: "Completed bodybuilding session",
        points: 2,
        limits: [{ window: "week", maxPoints: 6, weekStartsOn: "mon" }],
      },
      { key: "social_media", label: "Tagged OLC on social media", points: 1 },
      {
        key: "inbody_scan",
        label: "Completed InBody scan",
        points: 10,
        limits: [{ window: "week", maxPoints: 10, weekStartsOn: "mon" }],
      },
    ],
    creditWindows: [
      {
        key: "inbody_scan",
        start: "2026-04-04",
        end: "2026-04-04",
        creditDate: "2026-04-05",
      },
    ],
  },
  performance: {
    baselineWindow: { start: "2026-04-04", end: "2026-05-17" },
    finalWindow: { start: "2026-04-05", end: "2026-05-17" },
    liveScoring: { mode: "latest_to_date", lockAfterEnd: true },
    metrics: [
      {
        key: "body_weight_lb",
        label: "Body Weight (lb)",
        kind: "absolute_delta",
        direction: "down",
        scoring: absolutePerUnit(1, 0),
        sanityMax: 700,
        sensitive: true,
      },
      {
        key: "inbody_muscle_mass_lb",
        label: "Muscle Mass (lb)",
        kind: "absolute_delta",
        direction: "up",
        scoring: absolutePerUnit(1, 0),
        sanityMax: 400,
        sensitive: true,
      },
      {
        key: "inbody_fat_mass_lb",
        label: "Body Fat Mass (lb)",
        kind: "absolute_delta",
        direction: "down",
        scoring: absolutePerUnit(1, 0),
        sanityMax: 300,
        sensitive: true,
      },
      {
        key: "inbody_body_fat_pct",
        label: "Body Fat Percentage (%)",
        kind: "absolute_delta",
        direction: "down",
        scoring: absoluteLinear(80),
        sanityMax: 100,
        roundDisplayTo: 1,
        sensitive: true,
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
    url: `https://docs.google.com/spreadsheets/d/${SUMMER_SHRED_2026_SHEET_ID}/export?format=csv&gid=${SUMMER_SHRED_2026_FORM_RESPONSES_GID}`,
  },
  registration: {
    dataSource: {
      type: "csv",
      url: gvizCsvUrl(
        SUMMER_SHRED_2026_SHEET_ID,
        SUMMER_SHRED_2026_REGISTRATION_TAB,
      ),
    },
    mapCsvRow: mapSummerShred2026RegistrationRow,
  },
  mapCsvRow: (row) => {
    const timestampRaw = row["Timestamp"] || row["timestamp"];
    const email = normalizeEmail(row["Email"] || row["Email Address"]);
    if (!timestampRaw || !email) return undefined;

    const truthy = (value?: string) => {
      const s = (value ?? "").toString().trim().toLowerCase();
      if (!s) return false;
      return s !== "no" && s !== "false" && s !== "0";
    };

    const toNum = (value?: string) => {
      const text = (value ?? "").toString().trim();
      if (!text) return undefined;
      const n = Number(text.replace(/[^0-9.-]/g, ""));
      return Number.isFinite(n) ? n : undefined;
    };

    const iso =
      parseToZonedISOString(timestampRaw, "America/Los_Angeles") ||
      new Date(timestampRaw).toISOString();
    const date = scoringDate(iso, "America/Los_Angeles", 19);

    const checkins: Record<string, boolean> = {
      carbs: truthy(row["Carbs 🍞 🥯 🥨 🥐"]),
      protein: truthy(row["Protein 🥩 🍗 🍖"]),
      sleep: truthy(row["Sleep 🛌 😴 💤"]),
      fiber: truthy(row["Fiber 🥦 🍠 🍓"]),
      fasting: truthy(row["Fasting 🤤"]),
      group_class: truthy(row["Group class 🏋 🏃‍♂️ 🤸‍♂️"]),
      bodybuilding: truthy(row["Body Building 🏋️"]),
      social_media: truthy(row["Social media 🤳"]),
      inbody_scan: completedSummerShred2026InBodyScan(
        row["Completed weekly InBody Scan 📉"] ||
          row["Completed InBody Scan 📉"],
      ),
    };

    if (summerShred2026FocusBonusDate(date, checkins)) {
      checkins.weekly_focus_bonus = true;
    }

    const metrics: Record<string, number> = {};
    const weight = toNum(row["Weight (in lbs)"]);
    if (weight != null) metrics.body_weight_lb = weight;
    const muscle = toNum(row["SMM (Skeletal Muscle Mass)"]);
    if (muscle != null) metrics.inbody_muscle_mass_lb = muscle;
    const fatMass = toNum(row["Body Fat Mass"]);
    if (fatMass != null) metrics.inbody_fat_mass_lb = fatMass;
    const bodyFatPct = toNum(row["PBF (Percent Body Fat)"]);
    if (bodyFatPct != null) metrics.inbody_body_fat_pct = bodyFatPct;

    return {
      timestamp: iso,
      member_id: email,
      member_name: email.split("@")[0] || email,
      checkins,
      metrics,
    } satisfies SubmissionRow;
  },
};

export const registry: ChallengeConfig[] = [
  flex2025,
  summerShred2025,
  summerShred2026,
];

export function getChallengeConfig(
  slug: string,
  year: number,
): ChallengeConfig | undefined {
  return registry.find((c) => c.slug === slug && c.year === year);
}
