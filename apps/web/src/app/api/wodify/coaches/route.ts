import 'server-only'

import { NextRequest, NextResponse } from 'next/server'
import { getWodifyCoaches } from '@/lib/wodify'

export const runtime = 'nodejs'

// GET /api/wodify/coaches
export async function GET(req: NextRequest) {
  const params: Record<string, string> = {}
  req.nextUrl.searchParams.forEach((value, key) => {
    params[key] = value
  })

  try {
    const { items } = await getWodifyCoaches(params)
    return new NextResponse(
      JSON.stringify({ items, _meta: { source: 'wodify' } }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=86400',
        },
      },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return new NextResponse(
      JSON.stringify({ items: [], _meta: { source: 'error', error: message } }),
      {
        status: 502,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      },
    )
  }
}
