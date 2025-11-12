import { OrganizationJsonLd, WebSiteJsonLd } from "@/components/json-ld";
import { querySettingsData } from "@/lib/sanity/query";
import { sanityFetch } from "@/lib/sanity/live";
import { stegaClean } from "next-sanity";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { data: settings } = await sanityFetch({ query: querySettingsData, tags: ["sanity:type:settings"] });
  const cleanSettings = stegaClean(settings);
  return (
    <>
      <section
        aria-label="Page content"
        className="flex flex-col gap-4"
      >
        {children}
      </section>
      {cleanSettings && (
        <WebSiteJsonLd settings={cleanSettings} />
      )}
      {cleanSettings && (
        <OrganizationJsonLd settings={cleanSettings} />
      )}

    </>
  );
}