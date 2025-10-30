import type { PagebuilderType } from "@/types";

import { Badge } from "@workspace/ui/components/badge";
import { useTheme } from "next-themes";
import type { NameDisplay } from "react-google-reviews/dist/cjs/types/types/review";
import { RichText } from "@/components/elements/rich-text";
import { lazy, Suspense } from "react";

const GoogleReviewsComponent = lazy(() => import("@/components/shared/google-reviews"))

type GoogleReviewsProps = PagebuilderType<"googleReviews">;

export function GoogleReviews({
  eyebrow,
  title,
  richText,
  ...props
}: GoogleReviewsProps) {
  const { resolvedTheme } = useTheme();

  return (
    <section className="my-16" id={`google-reviews-${title}`}>
      <div className="mx-auto px-4 md:px-6">
        <div className="flex w-full flex-col items-center">
          <div className="flex flex-col items-center space-y-4 text-center sm:space-y-6 md:text-center">
            <Badge variant="secondary">{eyebrow}</Badge>
            <h2 className="text-balance font-semibold text-3xl md:text-5xl">
              {title}
            </h2>
            <RichText className="text-balance" richText={richText} />
          </div>
          <div className="mt-16 max-w-full">
            <Suspense fallback={<div aria-busy="true">Loading reviews…</div>}>
              <GoogleReviewsComponent
                {...props}
                featurableId={props.googleReviewsFeaturableId ?? ""}
                nameDisplay={props.nameDisplay as NameDisplay}
                theme={resolvedTheme as "light" | "dark"}
              />
            </Suspense>
          </div>
        </div>
      </div>
    </section>
  );
}
