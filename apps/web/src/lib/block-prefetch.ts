import 'server-only'

import type { PageBuilderBlockTypes, PagebuilderType } from '@/types'
import { filterCoaches, getCachedWodifyCoaches, getWodifyCoaches } from '@/lib/wodify'
import { getPrimaryLocation } from '@/lib/location'

export type PrefetchContext = {
  preview?: boolean
  locale?: string
}

// Generic resolver type constrained by block _type
export type Resolver<T extends PageBuilderBlockTypes> = (
  block: PagebuilderType<T>,
  ctx: PrefetchContext
) => Promise<unknown | null>

const resolveWodifyCoaches: Resolver<'wodifyCoaches'> = async (block, ctx) => {
  try {
    const filters = (block as any)?.filters ?? undefined

    // In preview mode, bypass cache to avoid staleness
    const { items } = ctx.preview
      ? await getWodifyCoaches()
      : await getCachedWodifyCoaches()

    const filtered = filterCoaches(items, filters)

    return filtered
  } catch (e) {
    console.error('Resolver[wodifyCoaches] error', e)
    return null
  }
}

const resolveContactUs: Resolver<'contactUs'> = async (_block, _ctx) => {
  try {
    const { location } = await getPrimaryLocation()
    if (!location) return null

    // Map to ContactUs address shape
    const address = {
      street: location.address1 ?? undefined,
      city: location.city ?? undefined,
      state: location.state ?? undefined,
      zip: location.postalCode ?? undefined,
      placeId: undefined as string | undefined,
    }

    return {
      wodify: {
        telephone: location.telephone ?? undefined,
        address,
        googleMapsUrl: location.googleMapsUrl ?? undefined,
      },
    }
  } catch (e) {
    console.error('Resolver[contactUs] error', e)
    return null
  }
}

// Registry mapping block _type to its resolver
export const BLOCK_PREFETCHERS = {
  wodifyCoaches: resolveWodifyCoaches,
  contactUs: resolveContactUs,
} as const

type Registry = typeof BLOCK_PREFETCHERS

type BaseBlock = { _key: string; _type: string }

export async function prefetchPageBuilderData(
  blocks: ReadonlyArray<BaseBlock> | undefined,
  ctx: PrefetchContext,
): Promise<Record<string, unknown> | undefined> {
  if (!Array.isArray(blocks) || blocks.length === 0) return undefined

  const out: Record<string, unknown> = {}

  for (const block of blocks) {
    const type = block?._type as keyof Registry
    const resolver = BLOCK_PREFETCHERS[type] as Resolver<any> | undefined
    if (!resolver) continue

    out[block._key] = await resolver(block as any, ctx)
  }

  return out
}
