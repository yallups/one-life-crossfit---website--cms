import 'server-only'

import { stegaClean } from 'next-sanity'
import { client } from '@/lib/sanity/client'
import { querySettingsData } from '@/lib/sanity/query'
import { handleErrors } from '@/utils'

import { ExerciseGymJsonLd, OrganizationJsonLd, WebSiteJsonLd } from './json-ld'
import { getPrimaryLocation } from '@/lib/location'

// Combined JSON-LD Component for pages with multiple structured data (Server Component)
export type CombinedJsonLdProps = {
  includeWebsite?: boolean;
  includeOrganization?: boolean;
}

export async function CombinedJsonLd({
  includeWebsite = false,
  includeOrganization = false,
}: CombinedJsonLdProps) {
  const settingsRes = await handleErrors(client.fetch(querySettingsData))
  const cleanSettings = stegaClean(settingsRes[0])

  // Load primary location via backend logic (Wodify first, fallback to Sanity)
  let wodifyPrimary: any = undefined
  try {
    const { location } = await getPrimaryLocation({ limit: 1 })
    wodifyPrimary = location || undefined
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
        <ExerciseGymJsonLd settings={cleanSettings} wodifyLocation={wodifyPrimary} />
      )}
    </>
  )
}
