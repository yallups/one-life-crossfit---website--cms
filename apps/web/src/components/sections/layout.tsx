import type { PagebuilderType } from "@/types";
import { SectionShared } from "./section-shared";

export type LayoutBlockProps = PagebuilderType<"layout">;

export function LayoutBlock(props: LayoutBlockProps) {
  return (
    <SectionShared
      {...(props as any)}
      backgroundFill={false}
      heading="h2"
      outerSectionClassName="relative mt-4 md:my-16"
    />
  );
}
