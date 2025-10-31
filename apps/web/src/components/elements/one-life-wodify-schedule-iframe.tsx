"use client"
import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { useIsMobile } from "@/hooks/use-is-mobile";

// Important: keep the initial SSR and the first client render identical
// to avoid hydration mismatches. We start with a constant height and
// only adjust after mount on the client.
const INITIAL_IFRAME_HEIGHT = 1600; // must match SSR output exactly
const MOBILE_IFRAME_HEIGHT = 2300;
const IFRAME_ORIGIN = "https://onelifefitness.wodify.com";

export function Schedule() {
  const { resolvedTheme } = useTheme();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [height, setHeight] = useState<number>(INITIAL_IFRAME_HEIGHT);
  const isMobile = useIsMobile()

  // Build the src only from stable values; the theme param may change,
  // but that will just reload the iframe. That doesn't affect hydration.
  const src = useMemo(() =>
      `${IFRAME_ORIGIN}/OnlineSalesPage/WebIntegration?IsDarkMode=${resolvedTheme === 'dark' ? 'True' : 'False'}&LocationId=9721&&ProgramId=124903,93813,93798,125629,121385,104287,117637`,
    [resolvedTheme]
  );

  useEffect(() => {
    if (isMobile) {
      setHeight((h) => Math.max(h, MOBILE_IFRAME_HEIGHT));
    }
  }, [isMobile])

  return (
    <section className="my-6 md:my-16 w-full" id="schedule">
      <iframe
        ref={iframeRef}
        src={src}
        width="100%"
        height={height}
        scrolling="no"
        style={{ display: "block", border: 0 }}
      />
    </section>
  )
}