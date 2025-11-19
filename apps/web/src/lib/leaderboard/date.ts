// Minimal timezone helpers without external deps
// Uses Intl.DateTimeFormat to get parts in a given IANA time zone.

export function getZonedParts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(date).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== "literal") acc[p.type] = p.value;
    return acc;
  }, {});
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

export function formatYMD(d: { year: number; month: number; day: number }) {
  const mm = String(d.month).padStart(2, "0");
  const dd = String(d.day).padStart(2, "0");
  return `${d.year}-${mm}-${dd}`;
}

export function addDaysUTC(date: Date, days: number) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export function scoringDate(tsIso: string, timeZone: string, startHour = 19) {
  const ts = new Date(tsIso);
  const parts = getZonedParts(ts, timeZone);
  // Build a Date representing the same local-date at startHour in the specified TZ.
  // Compare hour to startHour to decide window bucket date.
  let bucketDate: { year: number; month: number; day: number } = {
    year: parts.year,
    month: parts.month,
    day: parts.day,
  };
  if (parts.hour < startHour) {
    // move to previous day in that timezone
    const utc = new Date(ts.toISOString());
    const prev = addDaysUTC(utc, -1);
    const prevParts = getZonedParts(prev, timeZone);
    bucketDate = { year: prevParts.year, month: prevParts.month, day: prevParts.day };
  }
  return formatYMD(bucketDate);
}

export function isWithinYmdRange(ymd: string, startYmd: string, endYmd: string) {
  return ymd >= startYmd && ymd <= endYmd;
}

export function todayYmd(timeZone: string) {
  const parts = getZonedParts(new Date(), timeZone);
  return formatYMD({ year: parts.year, month: parts.month, day: parts.day });
}

export function weekKeyFromYmd(ymd: string, weekStartsOn: "sun" | "mon" = "sun") {
  // Compute a simple week key using the week start date (YYYY-MM-DD) as the key.
  const parts = ymd.split("-");
  const y = Number(parts[0] ?? 1970);
  const m = Number(parts[1] ?? 1);
  const d = Number(parts[2] ?? 1);
  // Create date in UTC (safe as ymd is a canonical bucket already)
  const dt = new Date(Date.UTC(y, Math.max(0, m - 1), d));
  const day = dt.getUTCDay(); // 0(Sun)-6(Sat)
  const offset = weekStartsOn === "mon" ? (day === 0 ? 6 : day - 1) : day; // days since week start
  const start = new Date(dt);
  start.setUTCDate(dt.getUTCDate() - offset);
  const sy = start.getUTCFullYear();
  const sm = start.getUTCMonth() + 1;
  const sd = start.getUTCDate();
  const startKey = formatYMD({ year: sy, month: sm, day: sd });
  return `${startKey}`; // using start date as canonical key
}

export function monthKeyFromYmd(ymd: string) {
  const [y, m] = ymd.split("-");
  return `${y}-${m}`;
}
