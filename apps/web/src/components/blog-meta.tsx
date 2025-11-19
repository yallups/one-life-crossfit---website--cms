"use client";
import type { QueryBlogSlugPageDataResult } from "@/lib/sanity/sanity.types";
import { SanityImage } from "./elements/sanity-image";

export type BlogMetaProps = {
  author: NonNullable<QueryBlogSlugPageDataResult>["authors"] | null | undefined;
  publishedAt: string | null | undefined;
  className?: string;
};

function AuthorAvatar({
  author,
}: {
  author: BlogMetaProps["author"];
}) {
  if (!author?.image) return null;
  return (
    <SanityImage
      alt={author?.name ?? "Author image"}
      className="size-8 flex-none rounded-full bg-gray-50"
      height={40}
      image={author.image}
      width={40}
    />
  );
}

function formatDate(date?: string | null) {
  if (!date) return "";
  try {
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

export function BlogMeta({ author, publishedAt, className }: BlogMetaProps) {
  const dateLabel = formatDate(publishedAt ?? null);
  return (
    <div className={"my-4 flex items-baseline gap-x-4 text-xs " + (className ?? "")}>
      <div className="flex items-center gap-x-2 font-semibold  text-sm/6">
        <span>By:</span>
        <AuthorAvatar author={author} />
        {author?.name}
      </div>
      {publishedAt ? (
        <time className="text-muted-foreground" dateTime={publishedAt ?? undefined}>
          {dateLabel}
        </time>
      ) : null}
    </div>
  );
}

export default BlogMeta;
