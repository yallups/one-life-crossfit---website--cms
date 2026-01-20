import "server-only";

import { stegaClean } from "next-sanity";
import { sanityFetch } from "@/lib/sanity/live";
import { querySettingsData } from "@/lib/sanity/query";
import { getWodifyLocations } from "@/lib/wodify";

export type NormalizedLocation = {
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

// Normalize a Wodify location object into our minimal shape
function normalizeWodifyLocation(raw: any): NormalizedLocation {
  if (!raw || typeof raw !== "object") return {};
  const lat = raw.latitude ?? raw?.geo?.lat;
  const lng = raw.longitude ?? raw?.geo?.lng;
  return {
    name: raw.name ?? raw.locationName ?? null,
    telephone:
      raw.phone ?? raw.phoneNumber ?? raw.telephone ?? raw.phone_number ?? null,
    address1:
      raw.address1 ?? raw.address ?? raw.street ?? raw.street_address_1 ?? null,
    city: raw.city ?? null,
    state: raw.state ?? raw.stateCode ?? null,
    postalCode: raw.postalCode ?? raw.zip ?? raw.zip_code ?? null,
    countryCode: raw.countryCode ?? raw.country ?? "US",
    latitude: typeof lat === "string" ? Number.parseFloat(lat) : (lat ?? null),
    longitude: typeof lng === "string" ? Number.parseFloat(lng) : (lng ?? null),
    googleMapsUrl:
      raw.googlePlaceUrl ?? raw.googleMapsUrl ?? raw.mapsUrl ?? null,
  };
}

// Build a fallback location from Sanity Settings
function buildFallbackFromSettings(s: any): NormalizedLocation {
  const clean = stegaClean(s);
  const addr = clean?.address || {};
  return {
    name: clean?.siteTitle || null,
    telephone: clean?.telephone || null,
    address1: addr?.street || null,
    city: addr?.city || null,
    state: addr?.state || null,
    postalCode: addr?.zip || null,
    countryCode: "US",
    latitude: null,
    longitude: null,
    googleMapsUrl: null,
  };
}

export type PrimaryLocationResult = {
  location: NormalizedLocation | null;
  source: "wodify" | "sanity";
};

export type LocationsResult = {
  items: NormalizedLocation[];
  source: "wodify" | "sanity";
};

// Backend encapsulated business logic to get locations (Wodify first, fallback to Sanity)
export async function getLocations(
  params: Record<string, string | number | boolean> = {},
): Promise<LocationsResult> {
  // Try Wodify first
  try {
    const res = await getWodifyLocations(params);
    const raw = Array.isArray(res?.items) ? res.items : [];
    const items = raw
      .map((r) => normalizeWodifyLocation(r))
      .filter(Boolean) as NormalizedLocation[];
    if (items.length > 0) return { items, source: "wodify" };
  } catch (_) {
    console.log("fail", _);
    // ignore and fall back
  }

  // Fallback: Sanity settings (single location from Settings)
  const { data: settings } = await sanityFetch({
    query: querySettingsData,
    tags: ["sanity:type:settings"],
    stega: false,
  });
  return { items: [buildFallbackFromSettings(settings)], source: "sanity" };
}

// Backend encapsulated business logic to get the primary location
export async function getPrimaryLocation(
  params: Record<string, string | number | boolean> = {},
): Promise<PrimaryLocationResult> {
  const { items, source } = await getLocations(params);
  return { location: items[0] ?? null, source };
}
