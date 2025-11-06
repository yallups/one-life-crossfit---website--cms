import 'server-only'

import { NextRequest, NextResponse } from 'next/server'
import { getLocations } from "@/lib/location";

export const runtime = 'nodejs'

// GET /api/wodify/locations
export async function GET(req: NextRequest) {
  // Forward query params as-is
  const params: Record<string, string> = {}
  req.nextUrl.searchParams.forEach((value, key) => {
    params[key] = value
  })

  const { items, source } = await getLocations(params)

  return new NextResponse(
    JSON.stringify({ items, _meta: { source } }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=86400',
      },
    },
  )
}
