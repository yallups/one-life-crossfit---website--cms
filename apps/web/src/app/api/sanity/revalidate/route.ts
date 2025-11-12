import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // avoid caching this route

function bad(status = 400, message = "Bad request") {
  return NextResponse.json({ ok: false, message }, { status });
}

export async function POST(req: NextRequest) {
  const secret = process.env.SANITY_REVALIDATE_SECRET;
  const url = new URL(req.url);
  const token = url.searchParams.get("secret") || req.headers.get("x-sanity-secret");

  if (!secret || token !== secret) return bad(401, "Invalid secret");

  let body: any;
  try {
    body = await req.json();
  } catch {
    return bad(400, "Invalid JSON");
  }

  // Sanity webhooks can send either {document:{...}} or the document directly
  const doc = body?.document ?? body ?? {};
  const type: string | undefined = doc?._type;
  const id: string | undefined = doc?._id;
  const slug: string | undefined = doc?.slug?.current;

  // Build tag set
  const tags = new Set<string>();
  if (type) tags.add(`sanity:type:${type}`);
  if (id) tags.add(`sanity:id:${id}`);
  if (slug) {
    // Slugs in this app include leading segments like "/blog/..." or "/..."
    const clean = slug.replace(/^\/+/, "");
    tags.add(`sanity:page:${clean}`);
    tags.add(`sanity:blog:${clean}`);
    tags.add(`sanity:route:/${clean}`);
  }

  // Global-ish
  tags.add("sanity:sitemap");

  // Home page special case
  if (type === "homePage") {
    tags.add("sanity:type:homePage");
    tags.add("sanity:route:/");
  }

  // Blog index special case
  if (type === "blog" || type === "blogIndex") {
    tags.add("sanity:route:/blog");
  }

  // Apply tag revalidation
  for (const t of tags) revalidateTag(t, "max");

  // Path-based revalidation (optional but useful for immediate page refresh)
  if (type === "homePage") revalidatePath("/");
  if (type === "blog" || type === "blogIndex") revalidatePath("/blog");
  if (slug) {
    // Support both base pages and blog posts
    const clean = slug.replace(/^\/+/, "");
    revalidatePath(`/${clean}`);
  }

  // Revalidate metadata routes affected by settings and routing
  if (type === "settings") {
    revalidatePath("/");
    revalidatePath("/blog");
    revalidatePath("/schedule");
    revalidatePath("/icon");
    revalidatePath("/apple-icon");
  }

  revalidatePath("/sitemap.xml");

  return NextResponse.json({ ok: true, tags: Array.from(tags) });
}
