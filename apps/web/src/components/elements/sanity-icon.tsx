import { cn } from "@workspace/ui/lib/utils";
import { memo } from "react";

type IconProps = {
  icon?:
    | {
        svg?: string | null;
        name?: string | null;
      }
    | string
    | null;
  alt?: string; // Add alt text prop for accessibility
  className?: string;
};

export const SanityIcon = memo(function SanityIconUnmemorized({
  icon,
  className,
  alt: altText = "sanity-icon",
}: IconProps) {
  const alt = typeof icon === "object" && icon?.name ? icon?.name : altText;
  const svg = typeof icon === "object" ? icon?.svg : icon;

  if (!svg) {
    return null;
  }

  return (
    <span
      className={cn(
        "sanity-icon flex size-12 items-center justify-center",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: svg }}
      title={alt}
    />
  );
});
