import 'server-only'

// Server-side Wodify REST client helpers
// Note: This module must only be imported/used in server code (Route Handlers, Server Actions)
// because it reads a secret token from Sanity.
import { client as sanityClient } from "@/lib/sanity/client";
import type { WodifyClass, WodifyCoach, WodifyLocation } from "./wodify.schemas";
import { WodifyClassSchema, WodifyCoachSchema, WodifyLocationSchema } from "./wodify.schemas";
import type { paths } from "@/types/wodify";
import { unstable_cache } from "next/cache";

let wodifyToken: string | null = null;

// Fetch the Wodify API token securely from Sanity Settings (server-only)
async function getWodifyToken(): Promise<string | null> {
  if (wodifyToken) return wodifyToken;

  const data = await sanityClient.fetch<{ token?: string }>(
    `*[_type == "settings"][0]{ "token": wodifyApiToken }`
  );
  wodifyToken = data?.token?.trim() ?? null;
  return wodifyToken
}

const BASE_URL = 'https://api.wodify.com';

// Generic REST helper for Wodify calls
async function wodifyFetch<T>(path: string, params: Record<string, string | number | boolean> = {}): Promise<T> {
  const token = await getWodifyToken();
  if (!token) throw new Error("Wodify API token is not configured in Sanity Settings.");

  const url = new URL(path.startsWith('http') ? path : `${BASE_URL}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && `${v}` !== '') url.searchParams.set(k, String(v));
  }

  // console.log('[Wodify] Fetch', { path, url: url.toString(), params });

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      "X-Api-Key": token,
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Wodify request failed: ${res.status} ${res.statusText} ${text}`);
  }

  const resp = await res.json() as Promise<T>;

  return resp;
}

// Specific API: Locations
// Use OpenAPI-generated types for the 200 response
type ListLocations200 = paths['/v1/customers/locations']['get']['responses'][200]['content']['application/json']
// Infer the item type if the response is a paged object with `data: []`
type LocationItemFromPaged = ListLocations200 extends { data: (infer I)[] } ? I : unknown

export async function getWodifyLocations(params: Record<string, string | number | boolean> = {}) {
  // The API may return either a paged object `{ data: [...] }` or a bare array.
  const data = await wodifyFetch<ListLocations200>(`/v1/customers/locations`, params);

  const rawItems = data.locations

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
type ListClasses200 = paths['/v1/classes']['get']['responses'][200]['content']['application/json']

export type WodifyClassesResult = {
  items: WodifyClass[];
  pagination?: {
    page?: number;
    page_size?: number;
    has_more?: boolean;
  } | null;
}

export async function getWodifyClasses(params: Record<string, string | number | boolean> = {}): Promise<WodifyClassesResult> {
  const data = await wodifyFetch<ListClasses200>(`/v1/classes`, params);
  const rawItems = (data as any)?.classes as unknown[] | undefined;
  const pagination = (data as any)?.pagination ?? null;

  const items: WodifyClass[] = [];
  if (Array.isArray(rawItems)) {
    for (const it of rawItems) {
      const parsed = WodifyClassSchema.safeParse(it);
      if (parsed.success) items.push(parsed.data);
    }
  }
  return { items, pagination };
}

// Coaches
export type WodifyCoachesResult = {
  items: WodifyCoach[];
}

export async function getWodifyCoaches(
  params: Record<string, string | number | boolean> = {}
): Promise<WodifyCoachesResult> {
  const data = await wodifyFetch<any>(`/v1/customers/coaches`, params);

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

  let rawItems: unknown = undefined;
  for (const candidate of tryArrays) {
    if (Array.isArray(candidate)) {
      rawItems = candidate;
      break;
    }
  }

  // Extra: some APIs return { data: { coaches: [...] } }
  if (!Array.isArray(rawItems)) {
    const maybeNested = (data as any)?.data?.coaches ?? (data as any)?.response?.coaches;
    if (Array.isArray(maybeNested)) rawItems = maybeNested;
  }

  const items: WodifyCoach[] = [];
  const normalize = (it: any): any => {
    if (!it || typeof it !== 'object') return it
    const pick = (obj: any, keys: string[]): any => {
      for (const k of keys) {
        if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k]
      }
      return undefined
    }

    const id = pick(it, ['id', 'Id', 'coachId', 'CoachId'])
    const firstName = pick(it, ['first_name', 'firstName', 'FirstName'])
    const lastName = pick(it, ['last_name', 'lastName', 'LastName'])
    const picture = pick(it, ['picture_url', 'pictureUrl', 'imageUrl', 'photoUrl', 'PhotoUrl'])
    const title = pick(it, ['title', 'jobTitle', 'position', 'Title'])
    const biography = pick(it, ['biography', 'bio', 'Bio', 'Biography'])

    const link1 = pick(it, ['link_1', 'link1', 'facebook', 'Facebook'])
    const link2 = pick(it, ['link_2', 'link2', 'instagram', 'Instagram'])
    const link3 = pick(it, ['link_3', 'link3', 'linkedin', 'LinkedIn', 'linkedinUrl'])
    const link4 = pick(it, ['link_4', 'link4', 'website', 'Website'])
    const link5 = pick(it, ['link_5', 'link5', 'x', 'twitter', 'Twitter'])

    // locations/programs/services may come as arrays or delimited strings
    const join = (v: any): string | undefined => {
      if (v == null) return undefined
      if (Array.isArray(v)) return v.map((s) => String(s)).filter(Boolean).join(', ')
      return String(v)
    }
    const locations = join(pick(it, ['locations', 'location', 'locationsCsv', 'Locations']))
    const programs = join(pick(it, ['programs', 'program', 'programNames', 'Programs']))
    const services = join(pick(it, ['services', 'service', 'serviceNames', 'Services']))

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
    }
  }

  if (Array.isArray(rawItems)) {
    for (const it of rawItems) {
      const normalized = normalize(it)
      const parsed = WodifyCoachSchema.safeParse(normalized);
      if (parsed.success) items.push(parsed.data);
    }
  }
  return { items };
}

// Deterministic key for caching
function paramsCacheKey(params: Record<string, string | number | boolean> = {}): string {
  const entries = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && `${v}` !== "")
    .map(([k, v]) => [k, String(v)] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return JSON.stringify(entries);
}

// Server cache wrapper for coaches; defaults to 24h revalidate
export const WODIFY_COACHES_TAG = 'wodify:coaches';

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
    if (!value) return []
    if (Array.isArray(value)) return value.map((s) => String(s).trim()).filter(Boolean)
    // Split on common delimiters: comma, semicolon, pipe, slash
    return value
      .split(/[,;|/]+/)
      .map((s) => s.trim())
      .filter(Boolean)
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
