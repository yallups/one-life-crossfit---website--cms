import 'server-only'

// Server-side Wodify REST client helpers
// Note: This module must only be imported/used in server code (Route Handlers, Server Actions)
// because it reads a secret token from Sanity.
import { client as sanityClient } from "@/lib/sanity/client";
import type { WodifyLocation, WodifyClass, WodifyCoach } from "./wodify.schemas";
import { WodifyLocationSchema, WodifyClassSchema, WodifyCoachSchema } from "./wodify.schemas";
import type { paths } from "@/types/wodify";

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

  console.log('url', url.toString())
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

  return res.json() as Promise<T>;
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

  console.log('raw', data)
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

export async function getWodifyCoaches(params: Record<string, string | number | boolean> = {}): Promise<WodifyCoachesResult> {
  const data = await wodifyFetch<any>(`/v1/customers/coaches`, params);
  const rawItems = (data as any)?.coaches as unknown[] | undefined;

  const items: WodifyCoach[] = [];
  if (Array.isArray(rawItems)) {
    for (const it of rawItems) {
      const parsed = WodifyCoachSchema.safeParse(it);
      if (parsed.success) items.push(parsed.data);
    }
  }
  return { items };
}
