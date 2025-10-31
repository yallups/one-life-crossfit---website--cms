import { ImageResponse } from "next/og";
import { client, urlFor } from "@/lib/sanity/client";

export const runtime = "edge";
export const contentType = "image/png";
export const size = { width: 32, height: 32 };

async function getIconUrl(targetSize: number) {
  // Fetch the icon image from Sanity settings
  const settings = await client.fetch<{ siteIcon?: { asset?: { _ref: string } } }>(
    `*[_type == "settings"][0]{ siteIcon }`
  );

  const ref = settings?.siteIcon?.asset?._ref;
  if (!ref) return null;

  // Build a high-DPR URL for crisp favicon rendering
  const dpr = 3;
  const url = urlFor({ _ref: ref })
    .width(targetSize * dpr)
    .height(targetSize * dpr)
    .fit("crop")
    .url();

  return url;
}

export default async function Icon() {
  const target = 32;
  const src = await getIconUrl(target);

  if (!src) {
    // Fallback: simple rounded square with initials
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#111827",
            color: "white",
            fontSize: 18,
            fontWeight: 700,
            borderRadius: 6,
          }}
        >
          OL
        </div>
      ),
      { width: target, height: target }
    );
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "transparent",
          overflow: "hidden",
          borderRadius: 6,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          width={target}
          height={target}
          alt="Site icon"
          style={{ width: target, height: target, objectFit: "cover" }}
        />
      </div>
    ),
    { width: target, height: target }
  );
}
