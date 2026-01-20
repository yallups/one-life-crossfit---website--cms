import "server-only";

import { type NextRequest, NextResponse } from "next/server";
import { getSecondsUntilPtMidnight } from "@/lib/schedule-utils";
import { getWodifyClasses } from "@/lib/wodify";

export const runtime = "nodejs";

// GET /api/wodify/classes
export async function GET(req: NextRequest) {
  // Collect query params as-is
  const params: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((value, key) => {
    params[key] = value;
  });
  const wantsFresh = params.fresh === "1";
  if ("fresh" in params) {
    delete params.fresh;
  }

  try {
    const { items, pagination } = await getWodifyClasses(
      params,
      wantsFresh ? { cache: "no-store" } : undefined,
    );
    const maxAgeSeconds = getSecondsUntilPtMidnight();
    return new NextResponse(
      JSON.stringify({
        items,
        pagination,
        _meta: {
          source: "wodify",
          params,
          count: items.length,
        },
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": wantsFresh
            ? "no-store"
            : `public, s-maxage=${maxAgeSeconds}, stale-while-revalidate=0`,
        },
      },
    );
  } catch (err: unknown) {
    return new NextResponse(
      JSON.stringify({
        items: [],
        pagination: { page: 1, page_size: 0, has_more: false },
        _meta: {
          source: "error",
          error: err instanceof Error ? err.message : "Unknown error",
          params,
        },
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      },
    );
  }
}
