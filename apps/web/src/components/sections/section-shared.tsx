import { kebabCase } from "change-case";
import type { PagebuilderType } from "@/types";
import { BackgroundMedia } from "../shared/background-media";
import { MediaDisplay } from "../shared/media-display";
import { normalizeMedia } from "../shared/media-utils";
import { CommonTextComponent } from "@/components/shared/commom-text-sction";

export type SharedSectionProps = (
  | PagebuilderType<"hero">
  | PagebuilderType<"layout">
  ) & {
  heading: "h1" | "h2";
  backgroundFill: boolean; // true for Hero (full screen), false for Layout (media dictates height)
  outerSectionClassName: string;
};

export function SectionShared(props: SharedSectionProps) {
  const {
    title,
    buttons,
    badge,
    richText,
    variant,
    heading,
    backgroundFill,
    outerSectionClassName,
  } = (props as any) ?? {};
  const rawMedia = (props as any)?.media as any[] | undefined;
  const { images, videos } = normalizeMedia(rawMedia);

  const isCentered = variant === "centered";
  const isImageLeft = variant === "imageLeft";
  const isBackground = variant === "background";

  const gridCols = isCentered ? "" : "lg:grid-cols-2";

  const TextContent = (
    <CommonTextComponent isCentered={isCentered} heading={heading} badge={badge} title={title} richText={richText}
                         buttons={buttons} />
  );

  if (isBackground) {
    return (
      <section className={outerSectionClassName} id={kebabCase(title ?? "")}>
        <BackgroundMedia
          className={backgroundFill ? "size-full" : undefined}
          fill={backgroundFill}
          images={images}
          videos={videos}
        />
        {/* Overlay content */}
        <div
          className={
            backgroundFill
              ? "absolute top-0 right-0 bottom-0 left-0 z-10 grid min-h-screen place-items-center px-6 py-10 text-center text-foreground md:px-8 lg:py-16"
              : "dark container absolute top-0 right-0 bottom-0 left-0 mx-auto overflow-hidden rounded-3xl px-4 md:px-8"
          }
        >
          <div
            className={
              backgroundFill
                ? "mx-auto max-w-3xl"
                : "grid h-full place-items-center px-6 py-6 text-center text-white md:px-8 md:py-12 lg:py-16"
            }
          >
            {backgroundFill ? (
              <div className="mx-auto max-w-3xl">{TextContent}</div>
            ) : (
              <div className="mx-auto max-w-3xl">{TextContent}</div>
            )}
          </div>
        </div>
      </section>
    );
  }

  // Non-background variants
  return (
    <section className="mt-4 md:my-16" id={kebabCase(title ?? "")}>
      <div className="container mx-auto px-4 md:px-6">
        <div className={`grid items-center gap-8 ${gridCols}`}>
          {isCentered ? (
            <>
              {TextContent}
              <MediaDisplay images={images} videos={videos} />
            </>
          ) : (
            <>
              <div
                className={`${isImageLeft ? "order-1 lg:order-2" : "order-1"}`}
              >
                {TextContent}
              </div>
              <div
                className={`${
                  isImageLeft ? "order-2 lg:order-1" : "order-2"
                } flex content-center justify-center align-middle`}
              >
                <MediaDisplay images={images} videos={videos} />
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
