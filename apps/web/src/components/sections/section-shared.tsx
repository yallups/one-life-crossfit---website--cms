import { Badge } from "@workspace/ui/components/badge";
import { kebabCase } from "change-case";
import type { PagebuilderType } from "@/types";
import { RichText } from "../elements/rich-text";
import { SanityButtons } from "../elements/sanity-buttons";
import { BackgroundMedia } from "../shared/background-media";
import { MediaDisplay } from "../shared/media-display";
import { normalizeMedia } from "../shared/media-utils";

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
  const fallbackImage = (props as any)?.image; // for layout legacy support
  const { images, videos } = normalizeMedia(rawMedia, fallbackImage);

  const isCentered = variant === "centered";
  const isImageLeft = variant === "imageLeft";
  const isBackground = variant === "background";

  const gridCols = isCentered ? "" : "lg:grid-cols-2";
  const textAlign = isCentered
    ? "text-center"
    : "text-center lg:items-start lg:justify-items-start lg:text-left";

  const HeadingTag = heading;

  const TextContent = (
    <div
      className={`grid h-full grid-rows-[auto_1fr_auto] items-center justify-items-center gap-4 ${textAlign}`}
    >
      {badge && <Badge variant="secondary">{badge}</Badge>}
      <div className="grid gap-4">
        <HeadingTag className="text-balance font-semibold text-4xl lg:text-6xl">
          {title}
        </HeadingTag>
        <RichText
          className="font-normal text-base md:text-lg"
          richText={richText}
        />
      </div>
      <SanityButtons
        buttonClassName="w-full sm:w-auto"
        buttons={buttons}
        className="grid w-full gap-2 sm:w-fit sm:grid-flow-col lg:justify-start"
      />
    </div>
  );

  if (isBackground) {
    return (
      <section className={outerSectionClassName} id={kebabCase(title)}>
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
    <section className="mt-4 md:my-16" id={kebabCase(title)}>
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
