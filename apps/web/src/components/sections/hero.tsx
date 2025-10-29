import type { PagebuilderType } from "@/types";
import { SectionShared } from "./section-shared";

export type HeroBlockProps = PagebuilderType<"hero">;

export function HeroBlock(props: HeroBlockProps) {
  return (
    <SectionShared
      {...(props as any)}
      backgroundFill={true}
      heading="h1"
      outerSectionClassName="-mt-16 relative dark h-screen"
    />
  );
}
