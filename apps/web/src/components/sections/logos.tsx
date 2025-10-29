import { Badge } from "@workspace/ui/components/badge";
import Link from "next/link";
import Slider from "react-infinite-logo-slider";
import { SanityImage } from "@/components/elements/sanity-image";
import type { PagebuilderType } from "@/types";
import { RichText } from "../elements/rich-text";

export type LogosBlockProps = PagebuilderType<"logos">;

export function Logos({
  richText,
  title,
  eyebrow,
  images = [],
}: LogosBlockProps) {
  return (
    <section className="my-6 md:my-16" id="features">
      <div className="container mx-auto px-4 md:px-8">
        <div className="rounded-3xl bg-muted px-4 py-16">
          <div className="mx-auto max-w-3xl space-y-8 text-center">
            {eyebrow && (
              <Badge
                className="bg-zinc-200 dark:text-black"
                variant="secondary"
              >
                {eyebrow}
              </Badge>
            )}
            <h2 className="text-balance font-semibold text-3xl md:text-5xl">
              {title}
            </h2>
            <div className="text-lg text-muted-foreground">
              <RichText className="text-balance" richText={richText} />
            </div>
            <div className="flex justify-center">
              <Slider
                blurBorderColor={"#fff"}
                blurBorders={false}
                duration={40}
                pauseOnHover={true}
                width="250px"
              >
                {images.map((logo) => (
                  <Slider.Slide>
                    <Link href={logo.url ?? "#"} target={"_blank"}>
                      <SanityImage image={logo.image} />
                    </Link>
                  </Slider.Slide>
                ))}
              </Slider>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
