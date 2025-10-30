"use client";

import { cn } from "@workspace/ui/lib/utils";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { SanityImageProps } from "@/types";
import { SanityImage } from "../elements/sanity-image";
import type Slick from "react-slick";

const Slider = lazy(() => import("react-slick"));

export type MediaDisplayProps = {
  images: SanityImageProps[];
  videos?: { url: string; mimeType?: string }[] | undefined;
  rounded?: boolean;
  className?: string;
  heightClassName?: string; // e.g. "h-96"
  itemClassName?: string;
  intervalMs?: number;
};

/**
 * Displays media as follows:
 * - If there is more than one item (images and/or video), always run a carousel.
 * - When mixing images and video, advance on interval for images and on ended for video.
 * - If there is only a single image, just render it.
 * - If there is only a single video, loop it.
 */
export function MediaDisplay({
  images,
  videos,
  rounded = true,
  className = "",
  heightClassName = "",
  itemClassName = "",
  intervalMs = 4000,
}: MediaDisplayProps) {
  const items = useMemo(() => {
    const imageItems = images.map((img) => ({
      type: "image" as const,
      image: img,
    }));
    const videoItems = (videos ?? []).map((v) => ({
      type: "video" as const,
      url: v.url,
    }));
    return [...imageItems, ...videoItems];
  }, [images, videos]);

  const firstImage = useMemo(() => items.find(({ type }) => type === 'image'), [items]);

  const [index, setIndex] = useState(0);
  const sliderRef = useRef<Slick | null>(null);
  const videoRefs = useRef<Record<number, HTMLVideoElement | null>>({});

  // Reset index when items change
  useEffect(() => {
    setIndex(0);
  }, [items.length]);

  const multiple = items.length > 1;
  const current = items[index];
  const isVideoCurrent = current?.type === "video";

  if (!items.length) return null;

  // Single item cases
  if (!multiple && current !== undefined) {
    if (current?.type === "video") {
      return (
        <div
          className={`${heightClassName} w-full overflow-hidden ${className}`}
        >
          <video
            autoPlay
            className={cn(
              `${rounded ? "rounded-3xl" : ""} h-full w-full object-cover`,
              itemClassName
            )}
            loop
            muted
            playsInline
            src={current?.url}
          />
        </div>
      );
    }
    // single image
    return (
      <div className={`${heightClassName} w-full ${className}`}>
        <SanityImage
          className={cn(
            "w-full object-cover",
            rounded && "rounded-3xl",
            itemClassName
          )}
          fetchPriority="high"
          height={800}
          image={current.image}
          loading="eager"
          width={800}
        />
      </div>
    );
  }

  // Carousel (mixed images and/or video) using react-slick
  return (
    <div
      className={cn(
        "relative w-full overflow-hidden",
        heightClassName,
        className
      )}
    >
      <Suspense fallback={
        <div className={heightClassName} aria-busy="true">
          {firstImage &&
            <SingleMedia current={firstImage} heightClassName={heightClassName} itemClassName={itemClassName} />}
        </div>
      }>
        <Slider
          afterChange={(next) => {
            const item = items[next];
            if (!sliderRef.current) return;
            if (item?.type === "image") {
              sliderRef.current.slickPlay();
            } else {
              sliderRef.current.slickPause();
              if (videoRefs.current[next]) {
                videoRefs.current[next].currentTime = 0;
                videoRefs.current[next].play();
              }
            }
          }}
          arrows={false}
          autoplay={items.length > 1 && !isVideoCurrent}
          autoplaySpeed={intervalMs}
          beforeChange={(_old, next) => setIndex(next)}
          className="h-full w-full"
          cssEase="ease"
          dots={false}
          draggable={false}
          fade
          infinite={items.length > 1}
          lazyLoad="ondemand"
          pauseOnHover={false}
          ref={sliderRef}
          speed={600}
          swipe={false}
        >
          {items.map((item, idx) => (
            <div className="h-full w-full" key={idx}>
              {item.type === "image" ? (
                <SanityImage
                  className={cn(
                    "h-full w-full object-cover",
                    rounded && "rounded-3xl",
                    itemClassName
                  )}
                  fetchPriority={idx === 0 ? "high" : "auto"}
                  height={1200}
                  image={item.image}
                  loading={idx === 0 ? "eager" : "lazy"}
                  width={2000}
                />
              ) : (
                <video
                  ref={(el) => {
                    videoRefs.current[idx] = el;
                  }}
                  autoPlay
                  className={cn(
                    "h-full w-full object-cover",
                    rounded && "rounded-3xl",
                    itemClassName
                  )}
                  loop={false}
                  muted
                  onEnded={() => {
                    if (sliderRef.current) {
                      sliderRef.current.slickNext();
                    }
                  }}
                  playsInline
                  src={item.url}
                />
              )}
            </div>
          ))}
        </Slider>
      </Suspense>
    </div>
  );
}

type VideoItem = { url: string; mimeType?: string };

export type SingleMediaProps = {
  current:
    | { type: "image"; image: SanityImageProps }
    | { type: "video"; url: VideoItem["url"] };
  rounded?: boolean;
  className?: string;
  heightClassName?: string;
  itemClassName?: string;
};

export function SingleMedia({
  current,
  rounded = true,
  className = "",
  heightClassName = "",
  itemClassName = "",
}: SingleMediaProps) {
  if (current?.type === "video") {
    return (
      <div className={`${heightClassName} w-full overflow-hidden ${className}`}>
        <video
          autoPlay
          className={cn(
            `${rounded ? "rounded-3xl" : ""} h-full w-full object-cover`,
            itemClassName
          )}
          loop
          muted
          playsInline
          src={current?.url}
        />
      </div>
    );
  }

  return (
    <div className={`${heightClassName} w-full ${className}`}>
      <SanityImage
        className={cn(
          "w-full object-cover",
          rounded && "rounded-3xl",
          itemClassName
        )}
        fetchPriority="high"
        height={800}
        image={current.image}
        loading="eager"
        width={800}
      />
    </div>
  );
}