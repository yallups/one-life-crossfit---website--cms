import "server-only";

import { type NextRequest, NextResponse } from "next/server";
import { getWodifyFormattedWorkouts, getWodifyWorkouts } from "@/lib/wodify";

export const runtime = "nodejs";

// GET /api/wodify/workouts
export async function GET(req: NextRequest) {
  // Collect query params as-is
  const params: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((value, key) => {
    params[key] = value;
  });

  try {
    const useFormatted =
      params.formatted === "1" || params.formatted === "true";
    const { items, pagination } = useFormatted
      ? { ...(await getWodifyFormattedWorkouts(params)), pagination: null }
      : await getWodifyWorkouts(params);
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
          "Cache-Control": "public, s-maxage=600, stale-while-revalidate=86400",
        },
      },
    );
  } catch (err: unknown) {
    console.error("[Wodify Workouts API] Error:", err);
    // Return error details in development
    return new NextResponse(
      JSON.stringify({
        items: [],
        pagination: { limit: 0, offset: 0, total: 0 },
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
