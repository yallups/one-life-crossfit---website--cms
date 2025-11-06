import 'server-only'

import { NextRequest, NextResponse } from 'next/server'
import { getWodifyClasses } from '@/lib/wodify'

export const runtime = 'nodejs'

// GET /api/wodify/classes
export async function GET(req: NextRequest) {
  // Collect query params as-is
  const params: Record<string, string> = {}
  req.nextUrl.searchParams.forEach((value, key) => {
    params[key] = value
  })

  try {
    const { items, pagination } = await getWodifyClasses(params)
    return new NextResponse(
      JSON.stringify({ items, pagination, _meta: { source: 'wodify' } }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=86400',
        },
      },
    )
  } catch (err: any) {
    // Graceful fallback: empty list without exposing details
    return new NextResponse(
      JSON.stringify({ items: [], pagination: { page: 1, page_size: 0, has_more: false }, _meta: { source: 'sanity-fallback', error: 'unavailable' } }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
    )
  }
}
