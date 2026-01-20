import "server-only";

import { unstable_cache } from "next/cache";
// Server-side Wodify REST client helpers
// Note: This module must only be imported/used in server code (Route Handlers, Server Actions)
// because it reads a secret token from Sanity.
import { client as sanityClient } from "@/lib/sanity/client";
import { getSecondsUntilPtMidnight } from "@/lib/schedule-utils";
import type { paths } from "@/types/wodify";
import type {
  WodifyClass,
  WodifyCoach,
  WodifyLocation,
  WodifyProgram,
  WodifyService,
  WodifyWorkout,
} from "./wodify.schemas";
import {
  WodifyClassSchema,
  WodifyCoachSchema,
  WodifyLocationSchema,
  WodifyProgramSchema,
  WodifyServiceSchema,
  WodifyWorkoutSchema,
} from "./wodify.schemas";

let wodifyToken: string | null = null;

// Fetch the Wodify API token securely from Sanity Settings (server-only)
async function getWodifyToken(): Promise<string | null> {
  if (wodifyToken) return wodifyToken;

  const data = await sanityClient.fetch<{ token?: string }>(
    `*[_type == "settings"][0]{ "token": wodifyApiToken }`,
  );
  wodifyToken = data?.token?.trim() ?? null;
  return wodifyToken;
}

const BASE_URL = "https://api.wodify.com";

// Generic REST helper for Wodify calls
async function wodifyFetch<T>(
  path: string,
  params: Record<string, string | number | boolean> = {},
  opts: RequestInit = {},
): Promise<T> {
  const token = await getWodifyToken();
  if (!token)
    throw new Error("Wodify API token is not configured in Sanity Settings.");

  const url = new URL(path.startsWith("http") ? path : `${BASE_URL}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && `${v}` !== "")
      url.searchParams.set(k, String(v));
  }

  console.log("[Wodify] Fetch", { path, url: url.toString(), params });

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "X-Api-Key": token,
      Accept: "application/json",
    },
    next: { revalidate: 600, tags: ["wodify"] },
    ...opts,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[Wodify] Request failed", {
      path,
      status: res.status,
      statusText: res.statusText,
      text,
    });
    throw new Error(
      `Wodify request failed: ${res.status} ${res.statusText} ${text}`,
    );
  }

  const resp = (await res.json()) as Promise<T>;
  const itemCount =
    (resp as any)?.data?.length ||
    (resp as any)?.classes?.length ||
    (resp as any)?.workouts?.length ||
    (resp as any)?.coaches?.length ||
    (resp as any)?.programs?.length ||
    "unknown";

  // Check if response is an error object
  if ((resp as any)?.HTTPCode || (resp as any)?.ErrorCode) {
    console.error("[Wodify] API returned error", {
      path,
      error: {
        HTTPCode: (resp as any)?.HTTPCode,
        ErrorCode: (resp as any)?.ErrorCode,
        DeveloperMessage: (resp as any)?.DeveloperMessage,
        UserMessage: (resp as any)?.UserMessage,
      },
    });
  } else {
    console.log("[Wodify] Response", { path, itemCount });
  }

  return resp;
}

// Specific API: Locations
// Use OpenAPI-generated types for the 200 response
type ListLocations200 =
  paths["/v1/customers/locations"]["get"]["responses"][200]["content"]["application/json"];
// Infer the item type if the response is a paged object with `data: []`
type LocationItemFromPaged = ListLocations200 extends { data: (infer I)[] }
  ? I
  : unknown;

export async function getWodifyLocations(
  params: Record<string, string | number | boolean> = {},
) {
  // The API may return either a paged object `{ data: [...] }` or a bare array.
  const data = await wodifyFetch<ListLocations200>(
    `/v1/customers/locations`,
    params,
  );

  const rawItems = data.locations;

  const items: WodifyLocation[] = [];
  if (Array.isArray(rawItems)) {
    for (const it of rawItems) {
      const parsed = WodifyLocationSchema.safeParse(it);
      if (parsed.success) items.push(parsed.data);
    }
  }
  return { items } as { items: WodifyLocation[] };
}

// Specific API: Classes (schedule)
// Use OpenAPI-generated types for the 200 response
type ListClasses200 =
  paths["/v1/classes"]["get"]["responses"][200]["content"]["application/json"];

export type WodifyClassesResult = {
  items: WodifyClass[];
  pagination?: {
    page?: number;
    page_size?: number;
    has_more?: boolean;
  } | null;
};

export async function getWodifyClasses(
  params: Record<string, string | number | boolean> = {},
  opts?: RequestInit,
): Promise<WodifyClassesResult> {
  const startDate = params.startDate ? String(params.startDate) : undefined;
  const endDate = params.endDate ? String(params.endDate) : undefined;
  const programId = params.programId ? String(params.programId) : undefined;
  const locationId = params.locationId ? String(params.locationId) : undefined;
  const coachId = params.coachId ? String(params.coachId) : undefined;

  const apiParams: Record<string, string | number | boolean> = {};
  if (params.sort) {
    apiParams.sort = params.sort;
  } else if (startDate || endDate) {
    // Note: Use snake_case for sort parameter in search endpoint
    apiParams.sort = "desc_start_date_time";
  }
  if (params.page) apiParams.page = params.page;
  if (params.page_size) apiParams.page_size = params.page_size;

  const hasFilters = Boolean(
    startDate || endDate || programId || locationId || coachId,
  );

  const formatDateTime = (value: string, endOfDay = false) => {
    if (value.includes("T")) return value;
    return endOfDay ? `${value}T23:59:59` : `${value}T00:00:00`;
  };

  const buildSearchQuery = () => {
    const clauses: string[] = [];
    // CRITICAL: Wodify /v1/classes/search API requires:
    // 1. Field names in snake_case (start_date_time, NOT startTime)
    // 2. Unquoted values (no quotes around datetimes or numeric IDs)
    // 3. Operators: gte (>=), lte (<=), gt (>), lt (<), eq (=)
    // Example: start_date_time|gte|2026-01-18T00:00:00;program_id|eq|93813
    if (startDate) {
      clauses.push(`start_date_time|gte|${formatDateTime(startDate)}`);
    }
    if (endDate) {
      clauses.push(`start_date_time|lte|${formatDateTime(endDate, true)}`);
    }
    if (programId) clauses.push(`program_id|eq|${programId}`);
    if (locationId) clauses.push(`location_id|eq|${locationId}`);
    if (coachId) clauses.push(`coach_id|eq|${coachId}`);
    return clauses.join(";");
  };

  const extractItems = (payload: any) => {
    const rawItemsCandidate =
      payload?.classes ??
      payload?.Classes ??
      payload?.data ??
      payload?.items ??
      payload?.results ??
      payload;
    return Array.isArray(rawItemsCandidate) ? rawItemsCandidate : undefined;
  };

  // Use search endpoint for filtered queries, base endpoint for unfiltered
  let data: ListClasses200;
  let rawItems: unknown[] | undefined;

  const fetchOpts = opts ?? {
    next: { revalidate: getSecondsUntilPtMidnight(), tags: ["wodify:classes"] },
  };

  if (hasFilters) {
    // Use search endpoint with q parameter for date/program filtering
    try {
      data = await wodifyFetch<ListClasses200>(
        `/v1/classes/search`,
        {
          ...apiParams,
          q: buildSearchQuery(),
        },
        fetchOpts,
      );
      rawItems = extractItems(data);
    } catch (error) {
      // If search fails, fall back to base endpoint
      console.warn(
        "[Wodify] Search endpoint failed, falling back to base endpoint:",
        error,
      );
      data = await wodifyFetch<ListClasses200>(
        `/v1/classes`,
        apiParams,
        fetchOpts,
      );
      rawItems = extractItems(data);
    }
  } else {
    // No filters - use base endpoint
    data = await wodifyFetch<ListClasses200>(
      `/v1/classes`,
      apiParams,
      fetchOpts,
    );
    rawItems = extractItems(data);
  }

  const pagination = (data as any)?.pagination ?? null;

  const items: WodifyClass[] = [];
  if (Array.isArray(rawItems)) {
    for (const it of rawItems) {
      const raw = it as any;
      const normalized = {
        ...raw,
        id: raw.id ?? raw.class_id ?? raw.classId ?? raw.classID,
        name: raw.name ?? raw.class_name ?? raw.className ?? raw.title,
        description: raw.description ?? raw.notes ?? raw.comment ?? raw.details,
        program_id:
          raw.program_id ??
          raw.programId ??
          raw.programID ??
          raw.program?.id ??
          raw.program?.programId,
        program_name:
          raw.program_name ??
          raw.programName ??
          raw.program ??
          raw.program?.name,
        location_id:
          raw.location_id ??
          raw.locationId ??
          raw.locationID ??
          raw.location?.id,
        location: raw.location ?? raw.locationName ?? raw.location?.name,
        start_date_time:
          raw.start_date_time ??
          raw.startDateTime ??
          raw.startTime ??
          raw.start_date ??
          raw.startDate ??
          raw.date,
        end_date_time:
          raw.end_date_time ??
          raw.endDateTime ??
          raw.endTime ??
          raw.end_date ??
          raw.endDate,
        start_date:
          raw.start_date ??
          raw.startDate ??
          raw.start_date_time?.slice(0, 10) ??
          raw.startDateTime?.slice(0, 10) ??
          raw.startTime?.slice(0, 10),
        end_date:
          raw.end_date ??
          raw.endDate ??
          raw.end_date_time?.slice(0, 10) ??
          raw.endDateTime?.slice(0, 10) ??
          raw.endTime?.slice(0, 10),
        start_time:
          raw.start_time ??
          raw.startTime ??
          raw.start_date_time?.slice(11, 19) ??
          raw.startDateTime?.slice(11, 19),
        end_time:
          raw.end_time ??
          raw.endTime ??
          raw.end_date_time?.slice(11, 19) ??
          raw.endDateTime?.slice(11, 19),
        class_limit: raw.class_limit ?? raw.classLimit ?? raw.capacity,
        reserved: raw.reserved ?? raw.registeredCount ?? raw.registered,
        signed_in: raw.signed_in ?? raw.signedIn,
        waitlisted: raw.waitlisted ?? raw.waitlistCount ?? raw.waitlistedCount,
        available: raw.available,
        coach_id: raw.coach_id ?? raw.coachId ?? raw.coach?.id,
        coach_name: raw.coach_name ?? raw.coachName ?? raw.coach?.name,
        is_cancelled:
          raw.is_cancelled ??
          raw.isCancelled ??
          (typeof raw.status === "string"
            ? raw.status.toLowerCase().includes("cancel")
            : undefined),
      };

      if (
        normalized.available === undefined &&
        typeof normalized.class_limit === "number" &&
        typeof normalized.reserved === "number"
      ) {
        normalized.available = Math.max(
          0,
          normalized.class_limit - normalized.reserved,
        );
      }

      const parsed = WodifyClassSchema.safeParse(normalized);
      if (parsed.success) items.push(parsed.data);
    }
  }

  const startKey = startDate?.slice(0, 10);
  const endKey = endDate?.slice(0, 10);
  const programKey = programId?.toLowerCase();
  const locationKey = locationId?.toLowerCase();
  const coachKey = coachId?.toLowerCase();

  const matchesFilters = (item: WodifyClass) => {
    const dateKey = item.start_date_time?.slice(0, 10) ?? item.start_date ?? "";
    const inRange =
      (!startKey || dateKey >= startKey) && (!endKey || dateKey <= endKey);

    const programMatch = programKey
      ? [item.program_id, item.program_name]
          .filter((v) => v !== undefined && v !== null)
          .some((v) => String(v).toLowerCase() === programKey)
      : true;

    const locationMatch = locationKey
      ? String(item.location_id ?? "").toLowerCase() === locationKey
      : true;

    const coachMatch = coachKey
      ? String(item.coach_id ?? "").toLowerCase() === coachKey
      : true;

    return { inRange, programMatch, locationMatch, coachMatch };
  };

  const filtered = items.filter((item) => {
    const match = matchesFilters(item);
    return (
      match.inRange &&
      match.programMatch &&
      match.locationMatch &&
      match.coachMatch
    );
  });

  if (filtered.length > 0 || (!startKey && !endKey)) {
    return { items: filtered, pagination };
  }

  const candidates = items.filter((item) => {
    const match = matchesFilters(item);
    return match.programMatch && match.locationMatch && match.coachMatch;
  });

  if (candidates.length === 0) {
    return { items: filtered, pagination };
  }

  const parseDate = (value?: string | null) => {
    if (!value) return undefined;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? undefined : d;
  };

  const parseTimeParts = (item: WodifyClass) => {
    const timeStr = item.start_time ?? item.start_date_time?.slice(11, 19);
    if (!timeStr) return undefined;
    const [h, m, s] = timeStr.split(":").map((v) => Number(v));
    if ([h, m, s].some((v) => Number.isNaN(v))) return undefined;
    return { h, m, s };
  };

  const templates = new Map<string, WodifyClass>();
  for (const item of candidates) {
    const key =
      (item as any).recurring_class_id && (item as any).recurring_class_id !== 0
        ? `recurring-${(item as any).recurring_class_id}`
        : `${item.name ?? ""}-${item.program_id ?? ""}-${item.start_time ?? ""}`;
    const existing = templates.get(key);
    const itemDate = parseDate(item.start_date_time ?? item.start_date);
    const existingDate = existing
      ? parseDate(existing.start_date_time ?? existing.start_date)
      : undefined;
    if (!existing || (itemDate && existingDate && itemDate > existingDate)) {
      templates.set(key, item);
    }
  }

  const start = startKey ? new Date(startKey) : new Date();
  const end = endKey ? new Date(endKey) : new Date(start);
  const projected: WodifyClass[] = [];
  const maxDays = 21;
  let days = 0;

  for (
    let d = new Date(start);
    d <= end && days < maxDays;
    d.setDate(d.getDate() + 1), days += 1
  ) {
    const dow = d.getUTCDay();
    for (const template of templates.values()) {
      const baseDate = parseDate(
        template.start_date_time ?? template.start_date,
      );
      if (!baseDate) continue;
      if (baseDate.getUTCDay() !== dow) continue;

      const timeParts = parseTimeParts(template);
      if (!timeParts) continue;
      const startUtc = new Date(
        Date.UTC(
          d.getUTCFullYear(),
          d.getUTCMonth(),
          d.getUTCDate(),
          timeParts.h,
          timeParts.m,
          timeParts.s,
        ),
      );

      let endUtc: Date | undefined;
      if (template.end_date_time) {
        const endTemplate = parseDate(template.end_date_time);
        if (endTemplate && baseDate) {
          const duration = endTemplate.getTime() - baseDate.getTime();
          endUtc = new Date(startUtc.getTime() + duration);
        }
      }

      const id = `${template.id}-proj-${startUtc.toISOString().slice(0, 10)}`;
      projected.push({
        ...template,
        id,
        start_date_time: startUtc.toISOString(),
        start_date: startUtc.toISOString().slice(0, 10),
        start_time: template.start_time ?? startUtc.toISOString().slice(11, 19),
        end_date_time: endUtc ? endUtc.toISOString() : template.end_date_time,
        end_date: endUtc
          ? endUtc.toISOString().slice(0, 10)
          : template.end_date,
        reserved: undefined,
        signed_in: undefined,
        waitlisted: undefined,
        available: undefined,
      });
    }
  }

  return { items: projected, pagination };
}

// Specific API: Workouts (WOD)
type ListWorkouts200 =
  paths["/v1/workouts"]["get"]["responses"][200]["content"]["application/json"];

export type WodifyWorkoutsResult = {
  items: WodifyWorkout[];
  pagination?: {
    limit?: number;
    offset?: number;
    total?: number;
  } | null;
};

export async function getWodifyWorkouts(
  params: Record<string, string | number | boolean> = {},
): Promise<WodifyWorkoutsResult> {
  const startDate = params.startDate ? String(params.startDate) : undefined;
  const endDate = params.endDate ? String(params.endDate) : undefined;
  const programId = params.programId ? String(params.programId) : undefined;
  const locationId = params.locationId ? String(params.locationId) : undefined;

  const apiParams: Record<string, string | number | boolean> = {};

  // Pass date filters to API
  if (startDate) apiParams.startDate = startDate;
  if (endDate) apiParams.endDate = endDate;
  if (programId) apiParams.programId = programId;
  if (locationId) apiParams.locationId = locationId;

  // Handle sorting
  if (params.sort) {
    apiParams.sort = params.sort;
  } else if (startDate || endDate) {
    apiParams.sort = "desc_date";
  }

  // Handle pagination
  const limit = params.limit ? Number(params.limit) : undefined;
  const offset = params.offset ? Number(params.offset) : undefined;
  const pageSize = params.page_size ? Number(params.page_size) : limit;
  const page = params.page
    ? Number(params.page)
    : pageSize && offset !== undefined
      ? Math.floor(offset / pageSize) + 1
      : undefined;

  if (limit) apiParams.limit = limit;
  if (offset) apiParams.offset = offset;
  if (pageSize) apiParams.page_size = pageSize;
  if (page) apiParams.page = page;

  const data = await wodifyFetch<ListWorkouts200>(`/v1/workouts`, apiParams);
  // The API returns { workouts: [...], pagination: {...} }
  const rawItems = (data as any)?.workouts as unknown[] | undefined;
  const pagination = (data as any)?.pagination ?? null;

  const items: WodifyWorkout[] = [];
  if (Array.isArray(rawItems)) {
    for (const it of rawItems) {
      // Normalize field names - API uses different names than documented
      const record =
        typeof it === "object" && it !== null
          ? (it as Record<string, any>)
          : {};
      const normalized = {
        ...record,
        id: record.id,
        date: record.date,
        title: record.name || record.title,
        description:
          record.linkified_comment || record.comment || record.description,
        program_id: record.program_id,
        program_name: record.program || record.program_name,
        public_notes: record.public_notes || record.publicNotes || record.notes,
      };
      const parsed = WodifyWorkoutSchema.safeParse(normalized);
      if (parsed.success) items.push(parsed.data);
    }
  }

  const startKey = startDate?.slice(0, 10);
  const endKey = endDate?.slice(0, 10);
  const programKey = programId?.toLowerCase();

  const filtered = items.filter((item) => {
    const dateKey = item.date ?? "";
    const inRange =
      (!startKey || dateKey >= startKey) && (!endKey || dateKey <= endKey);

    const programMatch = programKey
      ? [item.program_id, item.program_name]
          .filter((v) => v !== undefined && v !== null)
          .some((v) => String(v).toLowerCase() === programKey)
      : true;

    return inRange && programMatch;
  });

  return { items: filtered, pagination };
}

export type WodifyFormattedWorkoutsResult = {
  items: WodifyWorkout[];
};

const FORMATTED_WORKOUT_PATH = "/v1/workouts/formattedworkout";

function extractFormattedWorkouts(payload: any, fallbackDate?: string) {
  const apiWod = payload?.APIWod ?? payload?.apiWod ?? payload?.api_wod;
  const source = apiWod ?? payload;
  const header =
    source?.WodHeader ?? source?.wodHeader ?? source?.wod_header ?? {};
  const formattedHtml =
    source?.FormattedWOD ??
    source?.formattedWod ??
    source?.formatted_wod ??
    source?.formatted_workout ??
    source?.formattedWorkout ??
    source?.workout_html ??
    source?.workout;

  const normalized = {
    ...source,
    id:
      header?.Id ??
      header?.id ??
      source?.id ??
      source?.workout_id ??
      source?.workoutId,
    date:
      header?.Date ??
      header?.date ??
      source?.date ??
      source?.workout_date ??
      source?.workoutDate ??
      fallbackDate,
    title:
      (header?.Name ?? header?.name ?? source?.title) ||
      source?.name ||
      source?.workout_name,
    description:
      formattedHtml ||
      source?.linkified_comment ||
      source?.comment ||
      source?.description,
    program_id:
      source?.program_id ??
      source?.programId ??
      header?.ProgramId ??
      header?.programId,
    program_name:
      source?.program_name ??
      source?.program ??
      source?.programName ??
      header?.ProgramName ??
      header?.programName,
    public_notes: source?.public_notes || source?.publicNotes || source?.notes,
  };

  const parsed = WodifyWorkoutSchema.safeParse(normalized);
  return parsed.success ? [parsed.data] : [];
}

// extractAnnouncements function removed - Wodify API does not support announcements

export async function getWodifyFormattedWorkouts(
  params: Record<string, string | number | boolean> = {},
): Promise<WodifyFormattedWorkoutsResult> {
  const programId = params.programId ? String(params.programId) : undefined;
  let locationId = params.locationId ? String(params.locationId) : undefined;

  const startDate = params.startDate
    ? String(params.startDate).slice(0, 10)
    : undefined;
  const endDate = params.endDate
    ? String(params.endDate).slice(0, 10)
    : startDate;
  const dates: string[] = [];

  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const maxDays = 14;
    for (let i = 0; i < maxDays; i += 1) {
      const current = new Date(start);
      current.setDate(start.getDate() + i);
      if (current > end) break;
      dates.push(current.toISOString().slice(0, 10));
    }
  } else if (startDate) {
    dates.push(startDate);
  }

  if (dates.length === 0) {
    dates.push(new Date().toISOString().slice(0, 10));
  }

  let programName: string | undefined;
  let locationName: string | undefined;

  if (programId) {
    try {
      const programs = await getWodifyPrograms({ page_size: 100 });
      const match = programs.items.find(
        (p) =>
          String(p.id).toLowerCase() === programId.toLowerCase() ||
          String(p.name ?? "").toLowerCase() === programId.toLowerCase(),
      );
      programName = match?.name ?? programId;
    } catch {
      programName = programId;
    }
  }

  try {
    const locations = await getWodifyLocations({ page_size: 100 });
    const resolvedLocationId =
      locationId ??
      (locations.items[0]?.id ? String(locations.items[0]?.id) : "");
    locationId = resolvedLocationId || undefined;
    if (resolvedLocationId) {
      const match = locations.items.find(
        (l) =>
          String((l as any).id ?? "").toLowerCase() ===
            resolvedLocationId.toLowerCase() ||
          String(l.name ?? "").toLowerCase() ===
            resolvedLocationId.toLowerCase(),
      );
      locationName = match?.name ?? resolvedLocationId;
    } else {
      locationName = locations.items[0]?.name ?? undefined;
    }
  } catch {
    locationName = locationId;
  }

  if (!programName || !locationName) {
    return { items: [] };
  }

  const items: WodifyWorkout[] = [];

  for (const date of dates) {
    try {
      const payload = await wodifyFetch<any>(
        FORMATTED_WORKOUT_PATH,
        {
          date,
          location_id: locationId ?? "",
          program: programName ?? "",
        },
        {
          next: { revalidate: 600, tags: ["wodify:formatted-workouts"] },
        },
      );

      const formatted = extractFormattedWorkouts(payload, date);
      items.push(...formatted);
    } catch {}
  }

  return { items };
}

// Coaches
export type WodifyCoachesResult = {
  items: WodifyCoach[];
};

export async function getWodifyCoaches(
  params: Record<string, string | number | boolean> = {},
): Promise<WodifyCoachesResult> {
  const data = await wodifyFetch<any>(`/v1/customers/coaches`, params, {
    next: { revalidate: 24 * 60 * 60, tags: ["/v1/customers/coaches"] },
  });

  // Try a variety of common envelope shapes
  const tryArrays: unknown[] = [
    (data as any)?.coaches,
    (data as any)?.Coaches,
    (data as any)?.staff,
    (data as any)?.Staff,
    (data as any)?.employees,
    (data as any)?.coaches?.data,
    (data as any)?.data,
    (data as any)?.items,
    (data as any)?.results,
    data,
  ];

  let rawItems: unknown;
  for (const candidate of tryArrays) {
    if (Array.isArray(candidate)) {
      rawItems = candidate;
      break;
    }
  }

  // Extra: some APIs return { data: { coaches: [...] } }
  if (!Array.isArray(rawItems)) {
    const maybeNested =
      (data as any)?.data?.coaches ?? (data as any)?.response?.coaches;
    if (Array.isArray(maybeNested)) rawItems = maybeNested;
  }

  const items: WodifyCoach[] = [];
  const normalize = (it: any): any => {
    if (!it || typeof it !== "object") return it;
    const pick = (obj: any, keys: string[]): any => {
      for (const k of keys) {
        if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "")
          return obj[k];
      }
      return undefined;
    };

    const id = pick(it, ["id", "Id", "coachId", "CoachId"]);
    const firstName = pick(it, ["first_name", "firstName", "FirstName"]);
    const lastName = pick(it, ["last_name", "lastName", "LastName"]);
    const picture = pick(it, [
      "picture_url",
      "pictureUrl",
      "imageUrl",
      "photoUrl",
      "PhotoUrl",
    ]);
    const title = pick(it, ["title", "jobTitle", "position", "Title"]);
    const biography = pick(it, ["biography", "bio", "Bio", "Biography"]);

    const link1 = pick(it, ["link_1", "link1", "facebook", "Facebook"]);
    const link2 = pick(it, ["link_2", "link2", "instagram", "Instagram"]);
    const link3 = pick(it, [
      "link_3",
      "link3",
      "linkedin",
      "LinkedIn",
      "linkedinUrl",
    ]);
    const link4 = pick(it, ["link_4", "link4", "website", "Website"]);
    const link5 = pick(it, ["link_5", "link5", "x", "twitter", "Twitter"]);

    // locations/programs/services may come as arrays or delimited strings
    const join = (v: any): string | undefined => {
      if (v == null) return undefined;
      if (Array.isArray(v))
        return v
          .map((s) => String(s))
          .filter(Boolean)
          .join(", ");
      return String(v);
    };
    const locations = join(
      pick(it, ["locations", "location", "locationsCsv", "Locations"]),
    );
    const programs = join(
      pick(it, ["programs", "program", "programNames", "Programs"]),
    );
    const services = join(
      pick(it, ["services", "service", "serviceNames", "Services"]),
    );

    return {
      ...it,
      id,
      first_name: firstName,
      last_name: lastName,
      picture_url: picture,
      title,
      biography,
      link_1: link1,
      link_2: link2,
      link_3: link3,
      link_4: link4,
      link_5: link5,
      locations,
      programs,
      services,
    };
  };

  if (Array.isArray(rawItems)) {
    for (const it of rawItems) {
      const normalized = normalize(it);
      const parsed = WodifyCoachSchema.safeParse(normalized);
      if (parsed.success) items.push(parsed.data);
    }
  }
  return { items };
}

// Deterministic key for caching
function paramsCacheKey(
  params: Record<string, string | number | boolean> = {},
): string {
  const entries = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && `${v}` !== "")
    .map(([k, v]) => [k, String(v)] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return JSON.stringify(entries);
}

// Server cache wrapper for coaches; defaults to 24h revalidate
export const WODIFY_COACHES_TAG = "wodify:coaches";

export async function getCachedWodifyCoaches(
  params: Record<string, string | number | boolean> = {},
  revalidateSeconds = 60 * 60 * 24,
): Promise<WodifyCoachesResult> {
  const key = ["wodify-coaches", paramsCacheKey(params)];
  const runner = unstable_cache(
    async () => {
      return await getWodifyCoaches(params);
    },
    key,
    { revalidate: revalidateSeconds, tags: [WODIFY_COACHES_TAG] },
  );
  return runner();
}

export function filterCoaches(
  items: WodifyCoach[],
  filters?: { locations?: string[]; programs?: string[]; services?: string[] },
): WodifyCoach[] {
  const splitCSV = (value?: string | null | string[]) => {
    if (!value) return [];
    if (Array.isArray(value))
      return value.map((s) => String(s).trim()).filter(Boolean);
    // Split on common delimiters: comma, semicolon, pipe, slash
    return value
      .split(/[,;|/]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  };

  const locs = (filters?.locations ?? []).map((s) => s.trim().toLowerCase());
  const progs = (filters?.programs ?? []).map((s) => s.trim().toLowerCase());
  const svcs = (filters?.services ?? []).map((s) => s.trim().toLowerCase());

  const matchCategory = (selected: string[], candidate: string[]) =>
    selected.length === 0 || selected.some((s) => candidate.includes(s));

  return items.filter((c) => {
    const cLocs = splitCSV(c.locations).map((s) => s.toLowerCase());
    const cProgs = splitCSV(c.programs).map((s) => s.toLowerCase());
    const cSvcs = splitCSV(c.services).map((s) => s.toLowerCase());

    return (
      matchCategory(locs, cLocs) &&
      matchCategory(progs, cProgs) &&
      matchCategory(svcs, cSvcs)
    );
  });
}

// Announcements functionality removed - Wodify API does not support announcements

// Services (for appointments/bookings)
export type WodifyServicesResult = {
  items: WodifyService[];
};

export async function getWodifyServices(
  params: Record<string, string | number | boolean> = {},
): Promise<WodifyServicesResult> {
  try {
    const data = await wodifyFetch<any>(`/v1/appointments/services`, params, {
      next: { revalidate: 3600, tags: ["wodify:services"] },
    });

    // Try various response formats
    const tryArrays: unknown[] = [
      (data as any)?.services,
      (data as any)?.data,
      (data as any)?.items,
      data,
    ];

    let rawItems: unknown;
    for (const candidate of tryArrays) {
      if (Array.isArray(candidate)) {
        rawItems = candidate;
        break;
      }
    }

    const items: WodifyService[] = [];
    if (Array.isArray(rawItems)) {
      for (const it of rawItems) {
        const normalized = {
          ...it,
          name: it.name || it.service_name || it.serviceName,
        };
        const parsed = WodifyServiceSchema.safeParse(normalized);
        if (parsed.success) items.push(parsed.data);
      }
    }
    return { items };
  } catch (e) {
    return { items: [] };
  }
}

// Programs
export type WodifyProgramsResult = {
  items: WodifyProgram[];
};

export async function getWodifyPrograms(
  params: Record<string, string | number | boolean> = {},
): Promise<WodifyProgramsResult> {
  try {
    const data = await wodifyFetch<any>(`/v1/programs`, params, {
      next: { revalidate: 86400, tags: ["wodify:programs"] },
    });

    // Try various response formats
    const tryArrays: unknown[] = [
      (data as any)?.programs,
      (data as any)?.data,
      (data as any)?.items,
      data,
    ];

    let rawItems: unknown;
    for (const candidate of tryArrays) {
      if (Array.isArray(candidate)) {
        rawItems = candidate;
        break;
      }
    }

    const items: WodifyProgram[] = [];
    if (Array.isArray(rawItems)) {
      for (const it of rawItems) {
        const normalized = {
          ...it,
          name: it.name || it.program_name || it.programName,
        };
        const parsed = WodifyProgramSchema.safeParse(normalized);
        if (parsed.success) items.push(parsed.data);
      }
    }
    return { items };
  } catch (e) {
    return { items: [] };
  }
}
