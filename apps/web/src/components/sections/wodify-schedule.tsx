"use client";

import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";
import slugify from "slugify";
import { useEffect, useMemo, useState } from "react";
import { RichText } from "@/components/elements/rich-text";
import {
  formatDateLabel,
  formatTimeFromParts,
  getDateKeyFromIso,
  getDateRangeKeys,
  getPtNowParts,
  getPtOffsetString,
  getWeekdayIndex,
  hasTimeZoneInfo,
  parseTimeToMinutes,
  SCHEDULE_TIME_ZONE,
} from "@/lib/schedule-utils";
import type { WodifyClass } from "@/lib/wodify.schemas";
import type { PagebuilderType } from "@/types";

export type WodifyScheduleBlockProps = PagebuilderType<"wodifySchedule"> & {
  className?: string;
  preloaded?: WodifySchedulePreloaded | WodifyClass[];
};

const SALES_PORTAL_BASE_URL =
  "https://onelifefitness.wodify.com/OnlineSalesPage/Main";

type ScheduleLocation = {
  name?: string | null;
  telephone?: string | null;
  address1?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  countryCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  googleMapsUrl?: string | null;
};

type WodifySchedulePreloaded = {
  items: WodifyClass[];
  location?: ScheduleLocation | null;
};

function buildSalesPortalLink(classItem: WodifyClass): string | null {
  if (!classItem?.id || !classItem.location_id) return null;
  const classId = String(classItem.id);
  const locationId = String(classItem.location_id);
  const q = `MembershipType|LocationId=${locationId}&ClassId=${classId}&HasProgramAccess=False`;
  return `${SALES_PORTAL_BASE_URL}?q=${encodeURIComponent(q)}`;
}

function sortClasses(items: WodifyClass[]) {
  return items.slice().sort((a, b) => {
    const aDate = getClassDateKey(a);
    const bDate = getClassDateKey(b);
    if (aDate !== bDate) return aDate.localeCompare(bDate);
    const aMinutes = getClassMinutesInPt(a.start_date_time, a.start_time) ?? 0;
    const bMinutes = getClassMinutesInPt(b.start_date_time, b.start_time) ?? 0;
    return aMinutes - bMinutes;
  });
}

function useSchedule(
  programIDs: string[] = [],
  daysToShow = 7,
  opts?: { initialData?: WodifyClass[] | null; refreshOnMount?: boolean },
) {
  const initialData = opts?.initialData ?? null;
  const refreshOnMount = opts?.refreshOnMount ?? true;
  const [data, setData] = useState<WodifyClass[] | null>(initialData);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!initialData);
  const programs = useMemo(
    () => programIDs.filter((p): p is string => Boolean(p) && p !== ""),
    [programIDs],
  );
  const dateRange = useMemo(() => getDateRangeKeys(daysToShow), [daysToShow]);

  useEffect(() => {
    if (initialData) {
      setData(initialData);
      setLoading(false);
    }
  }, [initialData]);

  const params = useMemo(() => {
    const u = new URLSearchParams();
    u.set("startDate", dateRange.startDate ?? "");
    u.set("endDate", dateRange.endDate ?? "");
    // CRITICAL: Wodify API requires snake_case sort parameter
    u.set("sort", "desc_start_date_time");
    u.set("page_size", "100");

    // Note: Wodify API typically only accepts one programId at a time
    // If multiple programs are needed, we'd need to make multiple calls
    if (programs.length === 1) {
      const [onlyProgram] = programs;
      if (onlyProgram) {
        u.set("programId", onlyProgram);
      }
    }

    return u.toString();
  }, [programs, dateRange.startDate, dateRange.endDate]);

  useEffect(() => {
    if (!refreshOnMount && initialData) return;
    let cancelled = false;
    setLoading(!initialData);
    setError(null);

    // If multiple programs specified, we need to fetch each separately and merge
    const fetchClasses = async () => {
      try {
        if (programs.length <= 1) {
          // Single program or all programs
          const url = `/api/wodify/classes?${params}&fresh=1`;
          const r = await fetch(url);
          if (!r.ok) throw new Error(`Failed to load schedule (${r.status})`);
          const json = await r.json();
          if (cancelled) return;
          const items = (json?.items ?? []) as WodifyClass[];
          setData(sortClasses(items));
        } else {
          // Multiple programs - fetch each and merge
          const promises = programs.map(async (programId) => {
            const u = new URLSearchParams();
            u.set("startDate", dateRange.startDate ?? "");
            u.set("endDate", dateRange.endDate ?? "");
            u.set("programId", programId);
            // CRITICAL: Wodify API requires snake_case sort parameter
            u.set("sort", "desc_start_date_time");
            u.set("page_size", "100");
            u.set("fresh", "1");
            const url = `/api/wodify/classes?${u.toString()}`;
            const r = await fetch(url);
            if (!r.ok) return [];
            const json = await r.json();
            return (json?.items ?? []) as WodifyClass[];
          });

          const results = await Promise.all(promises);
          const merged = results.flat();

          // Sort by start time
          const sorted = sortClasses(merged);

          if (cancelled) return;
          setData(sorted);
        }
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message || "Failed to load schedule");
      } finally {
        if (cancelled) return;
        setLoading(false);
      }
    };

    fetchClasses();

    return () => {
      cancelled = true;
    };
  }, [
    params,
    programs,
    dateRange.startDate,
    dateRange.endDate,
    initialData,
    refreshOnMount,
  ]);

  return { data, error, loading };
}

function ClassCard({
  classItem,
  showAvailability,
  showCoach,
  isPast,
}: {
  classItem: WodifyClass;
  showAvailability: boolean;
  showCoach: boolean;
  isPast: boolean;
}) {
  const startTime = formatClassTime(
    classItem.start_date_time,
    classItem.start_time,
  );
  const endTime = formatClassTime(classItem.end_date_time, classItem.end_time);

  const hasAvailability =
    classItem.available !== null && classItem.available !== undefined;
  const available = classItem.available ?? 0;
  const isFull = hasAvailability ? available <= 0 : false;
  const isCancelled = classItem.is_cancelled ?? false;
  const bookingHref = buildSalesPortalLink(classItem);
  const showBookLink = Boolean(bookingHref) && !isCancelled && !isPast;

  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-3 text-card-foreground shadow-sm transition-all hover:shadow-md",
        isPast && "cursor-not-allowed opacity-60",
        isCancelled && "opacity-50",
      )}
      aria-disabled={isPast}
    >
      <div className="space-y-2">
        <div className="space-y-1">
          <h4 className="text-sm font-semibold">{classItem.name || "Class"}</h4>
          <p className="text-xs text-muted-foreground">
            {startTime}
            {endTime && ` - ${endTime}`}
          </p>
          {classItem.program_name && (
            <div className="text-[11px] text-muted-foreground">
              {classItem.program_name}
            </div>
          )}
        </div>
        {showCoach && classItem.coach_name && (
          <p className="text-xs text-muted-foreground">
            Coach: {classItem.coach_name}
          </p>
        )}
        {classItem.description && (
          <p className="text-xs text-muted-foreground">
            {classItem.description}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {showAvailability && !isCancelled && hasAvailability ? (
            <div
              className={cn(
                "text-xs font-medium",
                isPast
                  ? "text-muted-foreground"
                  : isFull
                    ? "text-destructive"
                    : "text-green-600",
              )}
            >
              {isPast ? "Class over!" : isFull ? "Full" : `${available} spots`}
            </div>
          ) : null}
          {showBookLink && bookingHref && (
            <Button asChild size="sm" variant="outline">
              <a href={bookingHref} rel="noreferrer noopener" target="_blank">
                Book
              </a>
            </Button>
          )}
          {isCancelled && (
            <Badge variant="destructive" className="text-xs">
              Cancelled
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}

function extractTimePart(value?: string | null): string | null {
  if (!value) return null;
  const timePart = value.includes("T") ? value.split("T")[1] : value;
  if (!timePart) return null;
  return timePart.replace(/Z|[+-]\d{2}:\d{2}$/i, "").split(".")[0] ?? null;
}

function getClassDateKey(classItem: WodifyClass): string {
  if (classItem.start_date) return classItem.start_date;
  const dateTime = classItem.start_date_time;
  if (dateTime && /^\d{4}-\d{2}-\d{2}T/.test(dateTime)) {
    if (!hasTimeZoneInfo(dateTime)) {
      return dateTime.split("T")[0] ?? getDateKeyFromIso(dateTime);
    }
    return getDateKeyFromIso(dateTime);
  }
  return getDateKeyFromIso(classItem.start_date);
}

function getPtPartsFromDateTime(dateTime: string) {
  const date = new Date(dateTime);
  const dateKey = getDateKeyFromIso(dateTime);
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: SCHEDULE_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  return { dateKey, time };
}

function formatClassTime(
  dateTime?: string | null,
  time?: string | null,
): string {
  const directMinutes = parseTimeToMinutes(time);
  if (directMinutes !== null) {
    return formatTimeFromParts(
      Math.floor(directMinutes / 60),
      directMinutes % 60,
    );
  }
  if (dateTime && hasTimeZoneInfo(dateTime)) {
    const { time: ptTime } = getPtPartsFromDateTime(dateTime);
    const minutes = parseTimeToMinutes(ptTime);
    if (minutes === null) return "";
    return formatTimeFromParts(Math.floor(minutes / 60), minutes % 60);
  }
  const fallback = time ?? extractTimePart(dateTime);
  const minutes = parseTimeToMinutes(fallback);
  if (minutes === null) return "";
  return formatTimeFromParts(Math.floor(minutes / 60), minutes % 60);
}

function getClassMinutesInPt(
  dateTime?: string | null,
  time?: string | null,
): number | null {
  const directMinutes = parseTimeToMinutes(time);
  if (directMinutes !== null) return directMinutes;
  if (dateTime && hasTimeZoneInfo(dateTime)) {
    const { time: ptTime } = getPtPartsFromDateTime(dateTime);
    return parseTimeToMinutes(ptTime);
  }
  const fallback = time ?? extractTimePart(dateTime);
  return parseTimeToMinutes(fallback);
}

function isClassPast(
  classItem: WodifyClass,
  todayKey: string,
  nowMinutes: number,
): boolean {
  const classDateKey = getClassDateKey(classItem);
  if (classDateKey !== todayKey) return false;
  const endMinutes =
    getClassMinutesInPt(classItem.end_date_time, classItem.end_time) ??
    getClassMinutesInPt(classItem.start_date_time, classItem.start_time);
  if (endMinutes === null) return false;
  return endMinutes < nowMinutes;
}

function normalizeTimeString(time?: string | null): string | null {
  if (!time) return null;
  const parts = time.split(":");
  if (parts.length === 2) return `${time}:00`;
  return time;
}

function resolveDateTime(
  dateTime?: string | null,
  date?: string | null,
  time?: string | null,
): string | null {
  if (date && time) {
    const baseTime = normalizeTimeString(time);
    if (!baseTime) return null;
    const offset = getPtOffsetString(date, baseTime);
    return `${date}T${baseTime}${offset}`;
  }
  if (dateTime && hasTimeZoneInfo(dateTime)) return dateTime;
  const dateKey = dateTime?.split("T")[0] ?? date ?? null;
  if (!dateKey) return null;
  const baseTime =
    normalizeTimeString(time ?? extractTimePart(dateTime)) ?? "00:00:00";
  const offset = getPtOffsetString(dateKey, baseTime);
  return `${dateKey}T${baseTime}${offset}`;
}

function buildScheduleEventSchema(
  items: WodifyClass[],
  location: ScheduleLocation | null,
) {
  const address =
    location?.address1 ||
    location?.city ||
    location?.state ||
    location?.postalCode
      ? {
          "@type": "PostalAddress",
          streetAddress: location?.address1 ?? undefined,
          addressLocality: location?.city ?? undefined,
          addressRegion: location?.state ?? undefined,
          postalCode: location?.postalCode ?? undefined,
          addressCountry: location?.countryCode ?? undefined,
        }
      : undefined;

  const geo =
    typeof location?.latitude === "number" &&
    typeof location?.longitude === "number"
      ? {
          "@type": "GeoCoordinates",
          latitude: location.latitude,
          longitude: location.longitude,
        }
      : undefined;

  const basePlace =
    location?.name || address || geo
      ? {
          "@type": "Place",
          name: location?.name ?? undefined,
          address,
          geo,
          url: location?.googleMapsUrl ?? undefined,
        }
      : undefined;

  return items
    .map((item) => {
      const locationName =
        item.location ?? item.program_name ?? basePlace?.name;
      const place =
        basePlace || locationName
          ? {
              ...(basePlace ?? { "@type": "Place" }),
              name: locationName ?? basePlace?.name ?? undefined,
            }
          : undefined;
      const startDate = resolveDateTime(
        item.start_date_time,
        item.start_date,
        item.start_time,
      );
      if (!startDate) return null;
      const endDate = resolveDateTime(
        item.end_date_time,
        item.end_date,
        item.end_time,
      );
      return {
        "@type": "Event",
        name: item.name ?? item.program_name ?? "Class",
        startDate,
        endDate: endDate ?? undefined,
        description: item.description ?? undefined,
        eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
        eventStatus: item.is_cancelled
          ? "https://schema.org/EventCancelled"
          : "https://schema.org/EventScheduled",
        location: place ?? undefined,
      };
    })
    .filter(Boolean);
}

function getDurationMinutes(classItem: WodifyClass): number | null {
  const startDateTime = classItem.start_date_time;
  const endDateTime = classItem.end_date_time;
  if (startDateTime && endDateTime) {
    const start = new Date(startDateTime);
    const end = new Date(endDateTime);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      return Math.round((end.getTime() - start.getTime()) / 60000);
    }
  }

  const startMinutes = getClassMinutesInPt(startDateTime, classItem.start_time);
  const endMinutes = getClassMinutesInPt(endDateTime, classItem.end_time);
  if (startMinutes === null || endMinutes === null) return null;
  return endMinutes - startMinutes;
}

export function WodifySchedule({
  eyebrow,
  title,
  richText,
  programs = [],
  daysToShow = 7,
  showAvailability = true,
  groupByDay = true,
  showCoach = false,
  className,
  preloaded,
}: WodifyScheduleBlockProps) {
  const sectionId = useMemo(() => {
    if (!title) return undefined;
    return slugify(String(title), { lower: true, strict: true });
  }, [title]);
  const resolvedPreloaded = useMemo<WodifySchedulePreloaded | null>(() => {
    if (!preloaded) return null;
    if (Array.isArray(preloaded)) {
      return { items: preloaded, location: null };
    }
    return preloaded;
  }, [preloaded]);
  const preloadedItems = resolvedPreloaded?.items;
  const location = resolvedPreloaded?.location ?? null;
  const dateRange = useMemo(
    () => getDateRangeKeys(Number(daysToShow)),
    [daysToShow],
  );
  const nowParts = useMemo(() => getPtNowParts(), []);

  const { data, error, loading } = useSchedule(
    programs as string[],
    Number(daysToShow),
    {
      initialData: preloadedItems ?? null,
      refreshOnMount: true,
    },
  );

  const filteredData = useMemo(() => {
    if (!data) return null;
    return data.filter((cls) => {
      const duration = getDurationMinutes(cls);
      return duration === null || duration > 1;
    });
  }, [data]);

  const dayBuckets = useMemo(() => {
    if (!filteredData || !groupByDay) return null;

    const groups = new Map<string, WodifyClass[]>();
    for (const cls of filteredData) {
      const dateKey = getClassDateKey(cls);
      if (!dateKey) continue;
      if (!groups.has(dateKey)) {
        groups.set(dateKey, []);
      }
      groups.get(dateKey)!.push(cls);
    }

    return dateRange.days.map((dateKey) => {
      const classes = groups.get(dateKey) ?? [];
      classes.sort((a, b) => {
        const aTime = a.start_date_time ?? "";
        const bTime = b.start_date_time ?? "";
        return aTime.localeCompare(bTime);
      });
      return {
        dateKey,
        dateLabel: formatDateLabel(dateKey),
        classes,
      };
    });
  }, [filteredData, groupByDay, dateRange.days]);

  const desktopDayBuckets = useMemo(() => {
    if (!dayBuckets) return null;
    if (dayBuckets.length === 7) {
      return [...dayBuckets].sort(
        (a, b) => getWeekdayIndex(a.dateKey) - getWeekdayIndex(b.dateKey),
      );
    }
    return dayBuckets;
  }, [dayBuckets]);

  const scheduleJsonLd = useMemo(() => {
    if (!filteredData || filteredData.length === 0) return null;
    const events = buildScheduleEventSchema(filteredData, location);
    if (events.length === 0) return null;
    return {
      "@context": "https://schema.org",
      "@graph": events,
    };
  }, [filteredData, location]);

  return (
    <section id={sectionId} className={cn("my-8 md:my-16", className)}>
      {scheduleJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(scheduleJsonLd),
          }}
        />
      )}
      <div className="container mx-auto px-4 md:px-6">
        <div className="mx-auto max-w-3xl space-y-4 text-center">
          {eyebrow && (
            <Badge className="bg-zinc-200 dark:text-black" variant="secondary">
              {eyebrow}
            </Badge>
          )}
          {title && (
            <h2 className="text-balance text-3xl font-semibold md:text-5xl">
              {title}
            </h2>
          )}
          {richText && (
            <div className="text-lg text-muted-foreground">
              <RichText className="text-balance" richText={richText as any} />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="mt-8">
          {loading && (
            <div className="text-center text-muted-foreground">
              Loading schedule…
            </div>
          )}
          {error && <div className="text-center text-destructive">{error}</div>}
          {!loading &&
            !error &&
            (!filteredData || filteredData.length === 0) && (
              <div className="text-center text-muted-foreground">
                No classes scheduled.
              </div>
            )}

          {!loading && !error && filteredData && filteredData.length > 0 && (
            <>
              {groupByDay && dayBuckets && desktopDayBuckets ? (
                <>
                  <div className="space-y-8 md:hidden">
                    {dayBuckets.map(({ dateKey, dateLabel, classes }) => (
                      <div key={dateKey}>
                        <h3 className="mb-4 text-xl font-semibold">
                          {dateLabel}
                        </h3>
                        <div className="space-y-3">
                          {classes.length > 0 ? (
                            classes.map((cls) => (
                              <ClassCard
                                key={String(cls.id)}
                                classItem={cls}
                                showAvailability={showAvailability ?? true}
                                showCoach={showCoach ?? false}
                                isPast={
                                  dateKey === dateRange.todayKey &&
                                  isClassPast(
                                    cls,
                                    nowParts.dateKey,
                                    nowParts.minutes,
                                  )
                                }
                              />
                            ))
                          ) : (
                            <div className="text-sm text-muted-foreground">
                              No classes scheduled.
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="hidden md:block">
                    <div className="overflow-x-auto pb-2">
                      <div className="flex w-full min-w-[1024px] gap-3 text-sm">
                        {desktopDayBuckets.map(
                          ({ dateKey, dateLabel, classes }) => (
                            <div
                              key={dateKey}
                              className={cn(
                                "flex flex-col gap-3",
                                classes.length > 0
                                  ? "min-w-[9.5rem] flex-1"
                                  : "w-6",
                              )}
                            >
                              <div className="space-y-3">
                                {classes.length > 0 ? (
                                  <>
                                    <h3 className="border-b pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                      {dateLabel}
                                    </h3>
                                    {classes.map((cls) => (
                                      <ClassCard
                                        key={String(cls.id)}
                                        classItem={cls}
                                        showAvailability={
                                          showAvailability ?? true
                                        }
                                        showCoach={showCoach ?? false}
                                        isPast={
                                          dateKey === dateRange.todayKey &&
                                          isClassPast(
                                            cls,
                                            nowParts.dateKey,
                                            nowParts.minutes,
                                          )
                                        }
                                      />
                                    ))}
                                  </>
                                ) : (
                                  <div className="flex min-h-[10rem] items-center justify-center text-xs text-muted-foreground">
                                    <div
                                      className="flex items-center gap-2"
                                      style={{ writingMode: "vertical-rl" }}
                                    >
                                      <span className="text-xs font-semibold uppercase tracking-wide">
                                        {dateLabel}
                                      </span>
                                      <span className="text-xs">
                                        No Classes scheduled
                                      </span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-3">
                  {filteredData.map((cls) => (
                    <ClassCard
                      key={String(cls.id)}
                      classItem={cls}
                      showAvailability={showAvailability ?? true}
                      showCoach={showCoach ?? false}
                      isPast={false}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
