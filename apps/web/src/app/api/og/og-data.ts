import { sanityFetch } from "@/lib/sanity/live";
import {
  queryBlogPageOGData,
  queryGenericPageOGData,
  queryHomePageOGData,
  querySlugPageOGData,
} from "@/lib/sanity/query";
import { handleErrors } from "@/utils";

export async function getHomePageOGData(id: string) {
  return await handleErrors(
    sanityFetch({
      query: queryHomePageOGData,
      params: { id },
      stega: false,
      tags: ["sanity:type:homePage", `sanity:id:${id}`],
    }).then((r) => r.data),
  );
}

export async function getSlugPageOGData(id: string) {
  return await handleErrors(
    sanityFetch({
      query: querySlugPageOGData,
      params: { id },
      stega: false,
      tags: ["sanity:type:page", `sanity:id:${id}`],
    }).then((r) => r.data),
  );
}

export async function getBlogPageOGData(id: string) {
  return await handleErrors(
    sanityFetch({
      query: queryBlogPageOGData,
      params: { id },
      stega: false,
      tags: ["sanity:type:blog", `sanity:id:${id}`],
    }).then((r) => r.data),
  );
}

export async function getGenericPageOGData(id: string) {
  return await handleErrors(
    sanityFetch({
      query: queryGenericPageOGData,
      params: { id },
      stega: false,
      tags: [`sanity:id:${id}`],
    }).then((r) => r.data),
  );
}
