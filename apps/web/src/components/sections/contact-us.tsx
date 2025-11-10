import type { Maybe } from "@/types";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Mail, MapPinned, Phone } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { RichText } from "@/components/elements/rich-text";

// Types are relaxed to avoid requiring a regenerate of sanity.types.ts
// Matches fields selected in GROQ contactUsBlock + defaults from settings
export type ContactUsBlock = {
  _key: string;
  _type: "contactUs";
  eyebrow?: Maybe<string>;
  title?: Maybe<string>;
  richText?: any;
  email?: Maybe<string>;
  telephone?: Maybe<string>;
  address?: Maybe<{ street?: string; city?: string; state?: string; zip?: string; placeId?: string }>;
  hours?: Maybe<Array<{ day?: string; closed?: boolean; open?: string; close?: string }>>;
  showMap?: boolean;
  mapQuery?: Maybe<string>;
  googleMapsUrl?: Maybe<string>;
  defaults?: Maybe<{
    email?: Maybe<string>;
    telephone?: Maybe<string>;
    address?: Maybe<{ street?: string; city?: string; state?: string; zip?: string; placeId?: string }>;
    hours?: Maybe<Array<{ day?: string; closed?: boolean; open?: string; close?: string }>>;
  }>;
};

const DAY_ORDER = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

function formatAddress(addr?: ContactUsBlock["address"] | null): string | null {
  if (!addr) return null;
  const parts = [addr.street, [addr.city, addr.state].filter(Boolean).join(", "), addr.zip]
    .filter(Boolean)
    .join("\n");
  return parts || null;
}

function buildMapsQuery(
  address: ContactUsBlock["address"] | null | undefined,
  overrideQuery?: string | null
): string | null {
  if (overrideQuery && overrideQuery.trim().length > 0) return overrideQuery.trim();
  if (!address) return null;
  const parts = [address.street, address.city, address.state, address.zip]
    .filter(Boolean)
    .join(",+");
  return parts || null;
}

function buildEmbedSrc(params: {
  placeId?: string | null;
  query?: string | null | undefined;
  apiKey?: string
}): string | null {
  const { placeId, query, apiKey } = params;
  if (!apiKey) return null;
  if (placeId && placeId.trim()) {
    return `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(`place_id:${placeId}`)}`;
  }
  if (query && query.trim()) {
    return `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(query)}`;
  }
  return null;
}

function buildDirectionsHref(
  address: ContactUsBlock["address"] | null | undefined,
  mapsUrl?: string | null,
  query?: string | null
): string | null {
  if (mapsUrl && mapsUrl.trim()) return mapsUrl;
  // const placeId = address?.placeId?.trim();
  // if (placeId) {
  //   return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`place_id:${placeId}`)}`;
  // }
  const q = query ?? buildMapsQuery(address);
  if (!q) return null;

  return `https://www.google.com/maps/dir/${(q)}`;
}

function HoursTable({ hours }: { hours?: ContactUsBlock["hours"] | null }) {
  if (!hours || hours.length === 0) return null;
  const byDay = [...hours].sort((a, b) => {
    const ai = DAY_ORDER.indexOf((a.day || "").toLowerCase() as any);
    const bi = DAY_ORDER.indexOf((b.day || "").toLowerCase() as any);
    return ai - bi;
  });
  return (
    <div className="mt-6">
      <h3 className="mb-2 font-medium text-lg">Hours</h3>
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {byDay.map((h) => {
          const d = (h.day || "").toLowerCase();
          const title = d
            ? d.charAt(0).toUpperCase() + d.slice(1)
            : "Day";
          return (
            <div key={`${d}-${h.open}-${h.close}`} className="flex items-center justify-between rounded-md border p-3">
              <dt className="text-sm text-muted-foreground">{title}</dt>
              <dd className="text-sm font-medium">
                {h.closed ? "Closed" : [h.open, h.close].filter(Boolean).join(" – ")}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

export function ContactUs(props: ContactUsBlock & { preloaded?: any }) {
  const wodify = (props as any)?.preloaded?.wodify as
    | { telephone?: string; address?: ContactUsBlock["address"]; googleMapsUrl?: string }
    | undefined;

  // Precedence: block-level overrides > Settings defaults > Wodify defaults
  const email = props.email ?? props.defaults?.email ?? undefined;
  const telephone = props.telephone ?? props.defaults?.telephone ?? wodify?.telephone ?? undefined;
  const address = {
    street: props.address?.street ?? props.defaults?.address?.street ?? wodify?.address?.street ?? undefined,
    city: props.address?.city ?? props.defaults?.address?.city ?? wodify?.address?.city ?? undefined,
    state: props.address?.state ?? props.defaults?.address?.state ?? wodify?.address?.state ?? undefined,
    zip: props.address?.zip ?? props.defaults?.address?.zip ?? wodify?.address?.zip ?? undefined,
    placeId: props.address?.placeId ?? props.defaults?.address?.placeId ?? wodify?.address?.placeId ?? undefined,
  };
  const hours = props.hours ?? props.defaults?.hours ?? undefined;

  const query = buildMapsQuery(address, props.mapQuery);
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const embedSrc = buildEmbedSrc({ placeId: address?.placeId, query, apiKey });
  const directionsHref = buildDirectionsHref(address, props.googleMapsUrl ?? wodify?.googleMapsUrl, query);

  const addressText = formatAddress(address);

  return (
    <section className="px-4 py-8 sm:py-12 md:py-16" id={`contact-us-${props._key}`}>
      <div className="container mx-auto">
        <div className="mx-auto max-w-5xl">
          {props.eyebrow && (
            <Badge variant="secondary" className="mb-4">{props.eyebrow}</Badge>
          )}
          {props.title && (
            <h2 className="text-balance font-semibold text-3xl md:text-5xl">{props.title}</h2>
          )}
          {props.richText && (
            <RichText className="mt-3 text-muted-foreground" richText={props.richText} />
          )}

          <div className="mt-8 grid gap-8 lg:grid-cols-2">
            <div className="space-y-6">
              {addressText && (
                <div>
                  <div className="flex items-center gap-2 font-medium">
                    <MapPinned className="size-4" aria-hidden /> <span>Address</span>
                  </div>
                  <address className="mt-2 whitespace-pre-line not-italic text-sm text-muted-foreground">
                    {addressText}
                  </address>
                  {directionsHref && (
                    <div className="mt-2">
                      <Button asChild size="sm" variant="outline">
                        <a href={directionsHref} target="_blank" rel="noopener noreferrer">
                          Get Directions
                        </a>
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {(telephone || email) && (
                <div className="grid gap-4 sm:grid-cols-2">
                  {telephone && (
                    <a
                      href={`tel:${telephone}`}
                      className={cn(
                        "flex items-center gap-3 rounded-md border p-3 transition-colors hover:bg-accent",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      )}
                    >
                      <Phone className="size-4" aria-hidden />
                      <span className="text-sm">{telephone}</span>
                    </a>
                  )}

                  {email && (
                    <a
                      href={`mailto:${email}`}
                      className={cn(
                        "flex items-center gap-3 rounded-md border p-3 transition-colors hover:bg-accent",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      )}
                    >
                      <Mail className="size-4" aria-hidden />
                      <span className="text-sm">{email}</span>
                    </a>
                  )}
                </div>
              )}

              <HoursTable hours={hours} />
            </div>

            {props.showMap !== false && embedSrc && (
              <div className="overflow-hidden rounded-xl border bg-muted/20">
                <iframe
                  title="Location map"
                  src={embedSrc}
                  className="h-[320px] w-full md:h-full"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
