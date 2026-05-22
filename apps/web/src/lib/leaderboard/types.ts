// Leaderboard types and dynamic challenge configuration

export type DivisionKey = string; // e.g., "men", "women", "masters", "open"
export type DailyCheckinKey = string; // arbitrary per challenge
export type MetricKey = string; // arbitrary per challenge

export interface Member {
  id: string;
  name: string;
  // free-form profile to help compute division if needed
  profile?: Record<string, unknown>;
}

export interface SubmissionRow {
  timestamp: string; // ISO8601
  member_id: string;
  member_name: string;
  division?: DivisionKey; // optional; challenge config may compute
  checkins?: Record<DailyCheckinKey, boolean>;
  metrics?: Record<MetricKey, number>;
}

export interface CheckinItem {
  key: DailyCheckinKey;
  label: string;
  points: number;
  // Optional per-habit point limits over a rolling window
  // Example: InBody scan worth 2 points with a max of 2 points per week
  // limits: [ { window: 'week', maxPoints: 2, weekStartsOn: 'sun' } ]
  limits?: Array<{
    window: "day" | "week" | "month" | "challenge";
    maxPoints: number;
    weekStartsOn?: "sun" | "mon"; // only for window==='week'
  }>;
}

export type MetricKind = "absolute_delta" | "percent_gain";

export interface MetricSpec {
  key: MetricKey;
  label: string;
  kind: MetricKind;
  direction?: "up" | "down"; // default: "up"; "down" means lower is better
  scoring: (args: {
    improvement: number; // already clamped >= 0
    baseline: number | undefined;
    final: number | undefined;
    topImprovementInDivision?: number; // for relative method
  }) => number;
  sanityMax?: number; // guard-rail upper bound for value ingestion
  roundDisplayTo?: number;
  // If true, baseline and final raw values are hidden from UI/detail exports while still scoring on improvement
  sensitive?: boolean;
}

export interface ChallengeConfig {
  id: string; // e.g., "flex-the-halls-challenge-2025"
  slug: string; // e.g., "flex-the-halls-challenge"
  year: number; // e.g., 2025
  title: string;
  timezone: string; // IANA TZ, e.g., "America/Los_Angeles"
  checkinWindow: { startHour: number; durationHours: number }; // daily window, e.g., 19 → 19+24
  challengeWindow: { start: string; end: string }; // ISO yyyy-mm-dd

  // Optional theming/branding per challenge
  theme?: {
    // Optional scoped theme mode for the leaderboard page container.
    mode?: "light" | "dark";
    // Background color for web page (CSS color string)
    backgroundColor?: string;
    // Background image URL for web page (e.g., CDN/public path)
    backgroundImageUrl?: string;
    // Background color for generated images (PNG)
    imageBackgroundColor?: string;
    // Logo URL to display in header instead of title (web + image)
    logoUrl?: string;
  };

  divisions: {
    keys: DivisionKey[];
    resolveDivisionForMember?: (m: Member) => DivisionKey;
  };

  checkins: {
    items: CheckinItem[];
    maxDailyPoints?: number | null;
    creditWindows?: Array<{
      key: string;
      start: string;
      end: string;
      creditDate?: string;
    }>;
  };

  performance: {
    baselineWindow: { start: string; end: string }; // yyyy-mm-dd
    finalWindow: { start: string; end: string }; // yyyy-mm-dd
    metrics: MetricSpec[];
    liveScoring?: {
      mode: "latest_to_date" | "final_window_only"; // default: final_window_only
      lockAfterEnd?: boolean; // if true, after challenge end keep the last computed final
    };
  };

  weights: { habits: number; performance: number };
  tieBreakers: Array<
    | { type: "performance" }
    | { type: "habits" }
    | { type: "earliest_registration" }
    | { type: "stable_member_hash" }
  >;

  // Data source (public). Prefer published CSV URLs.
  dataSource: {
    type: "csv";
    url: string; // Published CSV URL from Google Sheets
    // Optional: name of sheet/tab if using the gviz API or CSV query; not required for published CSV URL
    // sheet?: string;
  };

  // Optional registration roster keyed by member id (usually email). Use this when
  // form submissions do not contain enough data to derive display names or divisions.
  registration?: {
    dataSource: {
      type: "csv";
      url: string;
    };
    mapCsvRow: (row: Record<string, string>) => Member | undefined;
  };

  // Challenge-specific mapping from raw CSV row (header:value) to normalized SubmissionRow(s)
  // Allow returning multiple synthetic submissions from a single CSV row (e.g., baseline and final)
  mapCsvRow: (
    row: Record<string, string>,
  ) => SubmissionRow | SubmissionRow[] | undefined;
}

export interface DailyScore {
  member_id: string;
  date: string; // yyyy-mm-dd bucket
  points: number;
}

export interface MemberScores {
  member_id: string;
  member_name: string;
  division: DivisionKey;
  habitPoints: number;
  performancePoints: number;
  total: number;
  rank: number;
}

export interface LeaderboardResponse {
  challengeId: string;
  challengeTitle: string;
  division: DivisionKey;
  updatedAt: string; // iso
  rows: MemberScores[];
}
