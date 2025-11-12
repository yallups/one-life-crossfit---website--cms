import { sanityFetch } from "./sanity/live";
import { queryGlobalSeoSettings, queryNavbarData } from "./sanity/query";

export const getNavigationData = async () => {
  const [navbarData, settingsData] = await Promise.all([
    sanityFetch({ query: queryNavbarData, tags: ["sanity:type:navbar"] }),
    sanityFetch({ query: queryGlobalSeoSettings, tags: ["sanity:type:settings"] }),
  ]);

  return { navbarData: navbarData.data, settingsData: settingsData.data };
};
