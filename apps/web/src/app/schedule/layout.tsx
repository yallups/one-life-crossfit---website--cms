import { stegaClean } from "next-sanity";
import type { ReactElement, ReactNode } from "react";
import { OrganizationJsonLd, WebSiteJsonLd } from "@/components/json-ld";
import { sanityFetch } from "@/lib/sanity/live";
import { querySettingsData } from "@/lib/sanity/query";

export default async function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>): Promise<ReactElement> {
  const { data: settings } = await sanityFetch({
    query: querySettingsData,
    tags: ["sanity:type:settings"],
  });
  const cleanSettings = stegaClean(settings);
  return (
    <>
      <section aria-label="Page content" className="flex flex-col gap-4">
        {children}
      </section>
      {cleanSettings && <WebSiteJsonLd settings={cleanSettings} />}
      {cleanSettings && <OrganizationJsonLd settings={cleanSettings} />}
    </>
  );
}
