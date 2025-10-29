import { dataset, projectId } from "@/config";
import type { SanityImageProps } from "@/types";

export type NormalizedMedia = {
  images: SanityImageProps[];
  videos: { url: string; mimeType?: string }[];
};

// Build a Sanity CDN file URL from an asset reference like: file-<id>-<ext>
function buildSanityFileUrlFromRef(
  ref: string | undefined | null
): string | null {
  if (!ref || typeof ref !== "string") return null;
  // expected pattern: file-<hash>-<ext>
  const match = ref.match(/^file-([A-Za-z0-9]+)-([A-Za-z0-9]+)$/);
  if (!match) return null;
  const [, id, ext] = match;
  return `https://cdn.sanity.io/files/${projectId}/${dataset}/${id}.${ext}`;
}

/**
 * Normalize Sanity media from a media[] array (image or file/video) and optional legacy image fallback
 */
export function normalizeMedia(
  rawMedia: any[] | undefined,
  fallbackImage?: any
): NormalizedMedia {
  const images: SanityImageProps[] = [];
  const videos: { url: string; mimeType?: string }[] = [];

  if (Array.isArray(rawMedia)) {
    for (const m of rawMedia) {
      if (m && m._type === "image") {
        images.push(m as SanityImageProps);
        continue;
      }

      // Handle Sanity file/video types
      if (m && (m._type === "file" || m._type === "video")) {
        const asset: any = (m as any).asset;
        const mimeType: string | undefined = (m as any).mimeType;

        // If Studio query returned a direct url (e.g., with file asset), use it
        const directUrl: string | undefined = (m as any).url ?? asset?.url;
        if (typeof directUrl === "string" && directUrl.length > 0) {
          if (!mimeType || mimeType.startsWith("video/")) {
            videos.push({ url: directUrl, mimeType });
          }
          continue;
        }

        // If we only have a reference, build URL from _ref like: file-<id>-<ext>
        const ref: string | undefined = asset?._ref;
        const built = buildSanityFileUrlFromRef(
          ref ?? (typeof m?._ref === "string" ? m._ref : undefined)
        );
        if (built) {
          // If mimeType not provided, best-effort detect from extension
          const ext = built.split(".").pop()?.toLowerCase();
          const guessed = ext
            ? ext === "mp4" || ext === "mov" || ext === "webm"
              ? `video/${ext === "mov" ? "quicktime" : ext}`
              : undefined
            : undefined;
          videos.push({ url: built, mimeType: mimeType ?? guessed });
        }
      }
    }
  }

  if (!images.length && fallbackImage) {
    images.push(fallbackImage as SanityImageProps);
  }

  return { images, videos };
}
