import "server-only";

import { type NextRequest, NextResponse } from "next/server";
import { getWodifyPrograms } from "@/lib/wodify";

export const runtime = "nodejs";

// GET /api/wodify/programs
export async function GET(req: NextRequest) {
  // Collect query params as-is
  const params: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((value, key) => {
    params[key] = value;
  });

  try {
    const { items } = await getWodifyPrograms(params);
    return new NextResponse(
      JSON.stringify({ items, _meta: { source: "wodify" } }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control":
            "public, s-maxage=86400, stale-while-revalidate=604800",
        },
      },
    );
  } catch (_err: unknown) {
    // Graceful fallback: empty list without exposing details
    return new NextResponse(
      JSON.stringify({
        items: [],
        _meta: { source: "sanity-fallback", error: "unavailable" },
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
