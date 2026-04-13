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
  const parts = fmt
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, p) => {
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

/**
 * Parse a Google Sheets/Forms timestamp string as a wall time in the given IANA time zone
 * and return an ISO string for the correct UTC instant. This prevents environment-dependent
 * parsing (UTC vs local) from shifting the date bucket on Vercel.
 */
export function parseToZonedISOString(
  tsRaw: string,
  timeZone: string,
): string | undefined {
  if (!tsRaw) return undefined;
  const s = String(tsRaw).trim();
  // If the string already contains an explicit timezone (Z or ±hh:mm), trust it.
  if (/Z$|[+-]\d{2}:?\d{2}$/.test(s)) {
    const d = new Date(s);
    if (isFinite(d.getTime())) return d.toISOString();
  }

  // Try common formats from Google Sheets/Forms
  // 1) M/D/YYYY HH:MM(:SS)? (AM/PM optional)
  let m = s.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?$/,
  );
  if (m) {
    const mon = Number(m[1]);
    const day = Number(m[2]);
    const year = Number(m[3]);
    let hour = Number(m[4]);
    const minute = Number(m[5]);
    const second = m[6] ? Number(m[6]) : 0;
    const ampm = m[7]?.toLowerCase();
    if (ampm) {
      if (ampm === "pm" && hour < 12) hour += 12;
      if (ampm === "am" && hour === 12) hour = 0;
    }
    return wallTimeToInstantISO(
      { year, month: mon, day, hour, minute, second },
      timeZone,
    );
  }

  // 2) YYYY-MM-DD[ T]HH:MM(:SS)? (no timezone)
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    const hour = Number(m[4]);
    const minute = Number(m[5]);
    const second = m[6] ? Number(m[6]) : 0;
    return wallTimeToInstantISO(
      { year, month, day, hour, minute, second },
      timeZone,
    );
  }

  // Fallback: attempt native parse. This may be environment dependent, but it's last resort.
  const d = new Date(s);
  if (isFinite(d.getTime())) return d.toISOString();
  return undefined;
}

function wallTimeToInstantISO(
  wall: {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second?: number;
  },
  timeZone: string,
): string | undefined {
  const second = wall.second ?? 0;
  // Start with the wall components treated as UTC, then adjust by the difference
  const seed = new Date(
    Date.UTC(
      wall.year,
      Math.max(0, wall.month - 1),
      wall.day,
      wall.hour,
      wall.minute,
      second,
    ),
  );
  const zp = getZonedParts(seed, timeZone);

  // Compute day difference between intended wall date and the current zoned date of the seed
  const wallMidUTC = Date.UTC(wall.year, Math.max(0, wall.month - 1), wall.day);
  const zonedMidUTC = Date.UTC(zp.year, Math.max(0, zp.month - 1), zp.day);
  const dayDiff = Math.round((wallMidUTC - zonedMidUTC) / 86_400_000);

  const totalWallMin = wall.hour * 60 + wall.minute;
  const totalZonedMin = zp.hour * 60 + zp.minute;
  const timeMinDiff = totalWallMin - totalZonedMin;

  const deltaMs = (dayDiff * 1440 + timeMinDiff) * 60_000;
  const adjusted = new Date(seed.getTime() + deltaMs);

  // Verify; if still off by an hour due to DST rounding quirks, do a second correction
  const zp2 = getZonedParts(adjusted, timeZone);
  if (
    zp2.year !== wall.year ||
    zp2.month !== wall.month ||
    zp2.day !== wall.day ||
    zp2.hour !== wall.hour ||
    zp2.minute !== wall.minute
  ) {
    const totalZonedMin2 = zp2.hour * 60 + zp2.minute;
    const timeMinDiff2 = totalWallMin - totalZonedMin2;
    const adjusted2 = new Date(adjusted.getTime() + timeMinDiff2 * 60_000);
    return adjusted2.toISOString();
  }
  return adjusted.toISOString();
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
    bucketDate = {
      year: prevParts.year,
      month: prevParts.month,
      day: prevParts.day,
    };
  }
  return formatYMD(bucketDate);
}

export function calendarDate(tsIso: string, timeZone: string) {
  const parts = getZonedParts(new Date(tsIso), timeZone);
  return formatYMD({ year: parts.year, month: parts.month, day: parts.day });
}

export function isWithinYmdRange(
  ymd: string,
  startYmd: string,
  endYmd: string,
) {
  return ymd >= startYmd && ymd <= endYmd;
}

export function todayYmd(timeZone: string) {
  const parts = getZonedParts(new Date(), timeZone);
  return formatYMD({ year: parts.year, month: parts.month, day: parts.day });
}

export function weekKeyFromYmd(
  ymd: string,
  weekStartsOn: "sun" | "mon" = "sun",
) {
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
