import { ComponentProps, ReactNode } from "react";
import { RichText } from "@/components/elements/rich-text";
import { Badge } from "@workspace/ui/components/badge";
import { SanityButtons } from "@/components/elements/sanity-buttons";

export function CommonTextComponent({ badge, buttons, children, heading: HeadingTag, isCentered, richText, title }: {
  badge?: string,
  title?: string,
  children?: ReactNode,
  richText?: ComponentProps<typeof RichText>['richText'],
  buttons: ComponentProps<typeof SanityButtons>['buttons'],
  heading: "h1" | "h2",
  isCentered?: boolean
}) {
  const textAlign = isCentered
    ? "text-center"
    : "text-center lg:items-start lg:justify-items-start lg:text-left";

  return <div
    className={`grid h-full grid-rows-[auto_1fr_auto] items-center justify-items-center gap-4 ${textAlign}`}
  >
    {badge && <Badge variant="secondary">{badge}</Badge>}
    <div className="grid gap-4">
      <HeadingTag className="text-balance font-semibold text-4xl lg:text-6xl">
        {title}
      </HeadingTag>
      {richText !== undefined ? <RichText
        className="font-normal text-base md:text-lg"
        richText={richText}
      /> : children}
    </div>
    <SanityButtons
      buttonClassName="w-full sm:w-auto"
      buttons={buttons}
      className="grid w-full gap-2 sm:w-fit sm:grid-flow-col lg:justify-start"
    />
  </div>;
}