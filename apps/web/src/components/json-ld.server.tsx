import "server-only";

import { stegaClean } from "next-sanity";
import { getPrimaryLocation } from "@/lib/location";
import { sanityFetch } from "@/lib/sanity/live";
import { querySettingsData } from "@/lib/sanity/query";
import {
  ExerciseGymJsonLd,
  OrganizationJsonLd,
  WebSiteJsonLd,
} from "./json-ld";

// Combined JSON-LD Component for pages with multiple structured data (Server Component)
export type CombinedJsonLdProps = {
  includeWebsite?: boolean;
  includeOrganization?: boolean;
};

export async function CombinedJsonLd({
  includeWebsite = false,
  includeOrganization = false,
}: CombinedJsonLdProps) {
  const { data: settings } = await sanityFetch({
    query: querySettingsData,
    tags: ["sanity:type:settings"],
  });
  const cleanSettings = stegaClean(settings);

  // Load primary location via backend logic (Wodify first, fallback to Sanity)
  let wodifyPrimary: any;
  try {
    const { location } = await getPrimaryLocation({ limit: 1 });
    wodifyPrimary = location || undefined;
  } catch (_) {
    // Silently ignore so JSON-LD still renders from Sanity settings
  }

  return (
    <>
      {includeWebsite && cleanSettings && (
        <WebSiteJsonLd settings={cleanSettings} />
      )}
      {includeOrganization && cleanSettings && (
        <OrganizationJsonLd settings={cleanSettings} />
      )}
      {includeOrganization && cleanSettings && (
        <ExerciseGymJsonLd
          settings={cleanSettings}
          wodifyLocation={wodifyPrimary}
        />
      )}
    </>
  );
}
