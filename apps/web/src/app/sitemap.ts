import type { MetadataRoute } from "next";

import { sanityFetch } from "@/lib/sanity/live";
import { querySitemapData } from "@/lib/sanity/query";
import type { QuerySitemapDataResult } from "@/lib/sanity/sanity.types";
import { getBaseUrl } from "@/utils";

export const revalidate = 3600; // refresh at least hourly, plus webhook-driven

type Page = QuerySitemapDataResult["slugPages"][number];

const baseUrl = getBaseUrl();

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { data } = await sanityFetch({
    query: querySitemapData,
    tags: ["sanity:sitemap"],
  });
  const { slugPages, blogPages } =
    data ?? ({ slugPages: [], blogPages: [] } as QuerySitemapDataResult);
  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    ...slugPages.map((page: Page) => ({
      url: `${baseUrl}${page.slug}`,
      lastModified: new Date(page.lastModified ?? new Date()),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...blogPages.map((page: Page) => ({
      url: `${baseUrl}${page.slug}`,
      lastModified: new Date(page.lastModified ?? new Date()),
      changeFrequency: "weekly" as const,
      priority: 0.5,
    })),
  ];
}
