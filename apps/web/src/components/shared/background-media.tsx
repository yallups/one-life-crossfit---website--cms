"use client";

import { cn } from "@workspace/ui/lib/utils";
import type { SanityImageProps } from "@/types";
import { MediaDisplay } from "./media-display";

export type BackgroundMediaProps = {
  images: SanityImageProps[];
  videos?: { url: string; mimeType?: string }[] | undefined;
  className?: string;
  fill?: boolean; // when true, absolutely fill parent (Hero); when false, be in-flow (Layout)
  intervalMs?: number;
};

export function BackgroundMedia({
  images,
  videos,
  className = "",
  fill = false,
  intervalMs = 4000,
}: BackgroundMediaProps) {
  const wrapperPosition = fill ? "absolute inset-0" : "relative";

  if (!(images.length || videos?.length)) return null;

  return (
    <div
      className={cn(
        wrapperPosition,
        "-z-10 pointer-events-none brightness-50",
        fill && "olc-bg-slick",
        className
      )}
    >
      <MediaDisplay
        className="h-full w-full"
        heightClassName="h-full"
        images={images}
        intervalMs={intervalMs}
        itemClassName={cn(fill && "h-full")}
        rounded={false}
        videos={videos}
      />
    </div>
  );
}
