// import { PageBuilder } from "@/components/pagebuilder";

import type { Metadata } from "next";
import { draftMode } from "next/headers";
import { stegaClean } from "next-sanity";
import type { ReactElement } from "react";
import { PageBuilder } from "@/components/pagebuilder";
import { prefetchPageBuilderData } from "@/lib/block-prefetch";
import { sanityFetch } from "@/lib/sanity/live";
import { queryHomePageData } from "@/lib/sanity/query";
import { getSEOMetadata } from "@/lib/seo";

async function fetchHomePageData() {
  return await sanityFetch({
    query: queryHomePageData,
    tags: ["sanity:type:homePage", "sanity:route:/"],
  });
}

export async function generateMetadata(): Promise<Metadata> {
  const { data: homePageData } = await fetchHomePageData();
  return getSEOMetadata(
    homePageData
      ? {
          title: homePageData?.title ?? homePageData?.seoTitle ?? "",
          description:
            homePageData?.description ?? homePageData?.seoDescription ?? "",
          slug: homePageData?.slug,
          contentId: homePageData?._id,
          contentType: homePageData?._type,
        }
      : {},
  );
}

export default async function Page(): Promise<ReactElement> {
  const { data } = await fetchHomePageData();
  const homePageData = stegaClean(data);

  if (!homePageData) {
    return <div>No home page data</div>;
  }

  const { _id, _type, pageBuilder } = homePageData ?? {};

  const { isEnabled: preview } = await draftMode();
  const preloadedData = await prefetchPageBuilderData(pageBuilder ?? [], {
    preview,
  });

  return (
    <PageBuilder
      id={_id}
      pageBuilder={pageBuilder ?? []}
      type={_type}
      preloadedData={preloadedData}
    />
  );
}
