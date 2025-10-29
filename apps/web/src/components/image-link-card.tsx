import { cn } from "@workspace/ui/lib/utils";
import Link from "next/link";
import { SanityButtons } from "@/components/elements/sanity-buttons";
import type { PagebuilderType } from "@/types";
import { SanityImage } from "./elements/sanity-image";

type ImageLinkCard = NonNullable<
  NonNullable<PagebuilderType<"imageLinkCards">["cards"]>
>[number];

export type CTACardProps = {
  card: ImageLinkCard;
  className?: string;
};

export function CTACard({ card, className }: CTACardProps) {
  const { image, description, title, href, buttons } = card ?? {};
  const Comp = (buttons?.length ?? 0 > 0) ? "div" : Link;

  return (
    <Comp
      className={cn(
        "group relative flex flex-col space-y-2 overflow-hidden rounded-3xl p-4 md:p-6",
        className
      )}
      href={href ?? "#"}
    >
      {image?.id && (
        <SanityImage
          className="-inset-4 pointer-events-none object-cover"
          height={1080}
          image={image}
          loading="eager"
          width={1920}
        />
      )}
      <div className="z-[2] mb-4 flex grow-1 flex-col space-y-2 duration-500">
        <h3 className="font-[500] text-primary text-xl transition-colors delay-150 duration-300">
          {title}
        </h3>
        <p className="text-primary text-sm transition-opacity delay-150 duration-300">
          {description}
        </p>
      </div>
      <SanityButtons
        buttonClassName={"grow-2"}
        buttons={buttons ?? []}
        className={"w-full flex-row-reverse space-x-2 self-end"}
        size={"lg"}
      />
    </Comp>
  );
}
