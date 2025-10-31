import { OrganizationJsonLd, WebSiteJsonLd } from "@/components/json-ld";
import { handleErrors } from "@/utils";
import { client } from "@/lib/sanity/client";
import { querySettingsData } from "@/lib/sanity/query";
import { stegaClean } from "next-sanity";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {

  const [res] = await handleErrors(client.fetch(querySettingsData));

  const cleanSettings = stegaClean(res);
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