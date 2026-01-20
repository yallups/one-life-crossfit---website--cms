export const SCHEDULE_TIME_ZONE = "America/Los_Angeles";

const DATE_KEY_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: SCHEDULE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function formatDateKeyInTimeZone(date: Date): string {
  return DATE_KEY_FORMATTER.format(date);
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  const [yearStr, monthStr, dayStr] = dateKey.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (!year || !month || !day) return dateKey;
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

export function getDateRangeKeys(daysToShow: number) {
  const todayKey = formatDateKeyInTimeZone(new Date());
  const safeDays = Math.max(1, Math.floor(daysToShow));
  const days: string[] = [];
  for (let i = 0; i < safeDays; i += 1) {
    days.push(addDaysToDateKey(todayKey, i));
  }
  return {
    startDate: days[0],
    endDate: days[days.length - 1],
    days,
    todayKey,
  };
}

export function getDateKeyFromIso(isoString?: string | null): string {
  if (!isoString) return "";
  const dateOnlyMatch = /^\d{4}-\d{2}-\d{2}$/.test(isoString);
  const dateTimeWithoutZone =
    /^\d{4}-\d{2}-\d{2}T/.test(isoString) && !hasTimeZoneInfo(isoString);
  const normalized = dateOnlyMatch
    ? `${isoString}T12:00:00Z`
    : dateTimeWithoutZone
      ? `${isoString}Z`
      : isoString;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return "";
  return formatDateKeyInTimeZone(date);
}

export function formatDateLabel(dateKey: string): string {
  if (!dateKey) return "";
  const date = new Date(`${dateKey}T12:00:00Z`);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: SCHEDULE_TIME_ZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

export function formatTimeLabel(isoString?: string | null): string {
  if (!isoString) return "";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: SCHEDULE_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export function getWeekdayIndex(dateKey: string): number {
  if (!dateKey) return 0;
  const date = new Date(`${dateKey}T12:00:00Z`);
  return date.getUTCDay();
}

export function parseTimeToMinutes(time?: string | null): number | null {
  if (!time) return null;
  const parts = time.split(":").map((v) => Number(v));
  if (parts.length < 2 || parts.some((v) => Number.isNaN(v))) return null;
  const [h, m] = parts;
  if (h === undefined || m === undefined) return null;
  return h * 60 + m;
}

export function formatTimeFromParts(hours: number, minutes: number): string {
  const period = hours >= 12 ? "PM" : "AM";
  const normalized = hours % 12 || 12;
  return `${normalized}:${String(minutes).padStart(2, "0")} ${period}`;
}

export function hasTimeZoneInfo(value?: string | null): boolean {
  if (!value) return false;
  return /([Zz]|[+-]\d{2}:\d{2})$/.test(value);
}

export function getPtNowParts() {
  const now = new Date();
  const dateKey = formatDateKeyInTimeZone(now);
  const timeParts = new Intl.DateTimeFormat("en-US", {
    timeZone: SCHEDULE_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  const [h, m] = timeParts.split(":").map((v) => Number(v));
  if (
    h === undefined ||
    m === undefined ||
    Number.isNaN(h) ||
    Number.isNaN(m)
  ) {
    return { dateKey, minutes: 0 };
  }
  return { dateKey, minutes: h * 60 + m };
}

export function getPtOffsetString(dateKey: string, time: string): string {
  const isoGuess = `${dateKey}T${time}Z`;
  const date = new Date(isoGuess);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SCHEDULE_TIME_ZONE,
    timeZoneName: "shortOffset",
  }).formatToParts(date);
  const offsetPart = parts.find((part) => part.type === "timeZoneName")?.value;
  if (!offsetPart) return "-08:00";
  const match = /GMT([+-]\d{1,2})/.exec(offsetPart);
  if (!match) return "-08:00";
  const hours = Number(match[1]);
  const sign = hours >= 0 ? "+" : "-";
  const abs = Math.abs(hours);
  return `${sign}${String(abs).padStart(2, "0")}:00`;
}

export function getSecondsUntilPtMidnight(): number {
  const todayKey = formatDateKeyInTimeZone(new Date());
  const nextDateKey = addDaysToDateKey(todayKey, 1);
  const offset = getPtOffsetString(nextDateKey, "00:00:00");
  const nextMidnight = new Date(`${nextDateKey}T00:00:00${offset}`);
  const now = new Date();
  const diffMs = nextMidnight.getTime() - now.getTime();
  return Math.max(60, Math.floor(diffMs / 1000));
}
