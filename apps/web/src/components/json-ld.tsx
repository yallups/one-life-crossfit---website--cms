import { stegaClean } from "next-sanity";
import type {
  Answer,
  Article,
  ContactPoint,
  ExerciseGym,
  FAQPage,
  ImageObject,
  Organization,
  Person,
  PostalAddress,
  Question,
  WebPage,
  WebSite,
  WithContext,
} from "schema-dts";

import { urlFor } from "@/lib/sanity/client";
import type { QueryBlogSlugPageDataResult, QuerySettingsDataResult } from "@/lib/sanity/sanity.types";
import { getBaseUrl } from "@/utils";

type RichTextChild = {
  _type: string;
  text?: string;
  marks?: string[];
  _key: string;
};

type RichTextBlock = {
  _type: string;
  children?: RichTextChild[];
  style?: string;
  _key: string;
};

// Flexible FAQ type that can accept different rich text structures
type FlexibleFaq = {
  _id: string;
  title: string;
  richText?: RichTextBlock[] | null;
};

// Utility function to safely extract plain text from rich text blocks
function extractPlainTextFromRichText(
  richText: RichTextBlock[] | null | undefined
): string {
  if (!Array.isArray(richText)) {
    return "";
  }

  return richText
    .filter((block) => block._type === "block" && Array.isArray(block.children))
    .map(
      (block) =>
        block.children
          ?.filter((child) => child._type === "span" && Boolean(child.text))
          .map((child) => child.text)
          .join("") ?? ""
    )
    .join(" ")
    .trim();
}

// Utility function to safely render JSON-LD
export function JsonLdScript<T>({ data, id }: { data: T; id: string }) {
  return (
    <script id={id} type="application/ld+json">
      {JSON.stringify(data, null, 0)}
    </script>
  );
}

// FAQ JSON-LD Component
type FaqJsonLdProps = {
  faqs: FlexibleFaq[];
};

export function FaqJsonLd({ faqs }: FaqJsonLdProps) {
  if (!faqs?.length) {
    return null;
  }

  const validFaqs = stegaClean(
    faqs.filter((faq) => faq?.title && faq?.richText)
  );

  if (!validFaqs.length) {
    return null;
  }

  const faqJsonLd: WithContext<FAQPage> = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: validFaqs.map(
      (faq): Question => ({
        "@type": "Question",
        name: faq.title,
        acceptedAnswer: {
          "@type": "Answer",
          text: extractPlainTextFromRichText(faq.richText),
        } as Answer,
      })
    ),
  };

  return <JsonLdScript data={faqJsonLd} id="faq-json-ld" />;
}

const IMAGE_SIZE_WIDTH = 1920;
const IMAGE_SIZE_HEIGHT = 1080;
const IMAGE_QUALITY = 80;

function buildSafeImageUrl(image?: { id?: string | null }) {
  if (!image?.id) {
    return;
  }
  return urlFor({ ...image, _id: image.id })
    .size(IMAGE_SIZE_WIDTH, IMAGE_SIZE_HEIGHT)
    .dpr(2)
    .auto("format")
    .quality(IMAGE_QUALITY)
    .url();
}

// Article JSON-LD Component
type ArticleJsonLdProps = {
  article: QueryBlogSlugPageDataResult;
  settings?: QuerySettingsDataResult;
};

export function ArticleJsonLd({
  article: rawArticle,
  settings,
}: ArticleJsonLdProps) {
  if (!rawArticle) {
    return null;
  }
  const article = stegaClean(rawArticle);

  const baseUrl = getBaseUrl();
  const articleUrl = `${baseUrl}${article.slug}`;
  const imageUrl = buildSafeImageUrl(article.image);

  const articleJsonLd: WithContext<Article> = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.description || undefined,
    image: imageUrl ? [imageUrl] : undefined,
    author: article.authors
      ? [
        {
          "@type": "Person",
          name: article.authors.name,
          url: `${baseUrl}`,
          image: article.authors.image
            ? ({
              "@type": "ImageObject",
              url: buildSafeImageUrl(article.authors.image),
            } as ImageObject)
            : undefined,
        } as Person,
      ]
      : [],
    publisher: {
      "@type": "Organization",
      name: settings?.siteTitle || "Website",
      logo: settings?.logo
        ? ({
          "@type": "ImageObject",
          url: settings.logo,
        } as ImageObject)
        : undefined,
    } as Organization,
    datePublished: new Date(
      article.publishedAt || article._createdAt || new Date().toISOString()
    ).toISOString(),
    dateModified: new Date(
      article._updatedAt || new Date().toISOString()
    ).toISOString(),
    url: articleUrl,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": articleUrl,
    } as WebPage,
  };

  return (
    <JsonLdScript data={articleJsonLd} id={`article-json-ld-${article.slug}`} />
  );
}

// Organization JSON-LD Component
type OrganizationJsonLdProps = {
  settings: QuerySettingsDataResult;
};

// Organization JSON-LD Component
 type ExercisesGymJsonLdProps = {
  settings: QuerySettingsDataResult;
  wodifyLocation?: import("@/lib/location").NormalizedLocation | null;
};

export function OrganizationJsonLd({ settings }: OrganizationJsonLdProps) {
  if (!settings) {
    return null;
  }

  const baseUrl = getBaseUrl();

  const socialLinks = settings.socialLinks
    ? (Object.values(settings.socialLinks).filter(Boolean) as string[])
    : undefined;

  const organizationJsonLd: WithContext<Organization> = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: settings.siteTitle,
    description: settings.siteDescription || undefined,
    url: baseUrl,
    logo: settings.logo
      ? ({
        "@type": "ImageObject",
        url: settings.logo,
      } as ImageObject)
      : undefined,
    contactPoint: settings.contactEmail
      ? ({
        "@type": "ContactPoint",
        email: settings.contactEmail,
        contactType: "customer service",
      } as ContactPoint)
      : undefined,
    sameAs: socialLinks?.length ? socialLinks : undefined,
  };

  return <JsonLdScript data={organizationJsonLd} id="organization-json-ld" />;
}

export function ExerciseGymJsonLd({ settings, wodifyLocation }: ExercisesGymJsonLdProps) {
  if (!settings) {
    return null;
  }

  const baseUrl = getBaseUrl();

  // Prefer Wodify location data when available, fall back to Sanity settings
  const loc = (wodifyLocation ?? {}) as any;

  // Name
  const name = (loc.name || loc.locationName || settings.siteTitle) as string;

  // Telephone
  const telephone = (loc.phone || loc.phoneNumber || loc.telephone || settings.telephone) as string | undefined;

  // Address fields from Wodify (common field names guessed from APIs)
  const streetAddress = (loc.address1 || loc.address || loc.street || settings.address?.street) as string | undefined;
  const addressLocality = (loc.city || settings.address?.city) as string | undefined;
  const addressRegion = (loc.state || loc.stateCode || settings.address?.state) as string | undefined;
  const postalCode = (loc.postalCode || loc.zip || settings.address?.zip) as string | undefined;
  const addressCountry = ((loc.countryCode || loc.country || 'US') as string | undefined);

  // Optional geo coordinates
  const latitude = (loc.latitude || (loc.geo && loc.geo.lat) || undefined) as number | string | undefined;
  const longitude = (loc.longitude || (loc.geo && loc.geo.lng) || undefined) as number | string | undefined;

  // External references
  const sameAsCandidate = (loc.googlePlaceUrl || loc.googleMapsUrl || loc.mapsUrl || undefined) as string | undefined;

  const organizationJsonLd: WithContext<ExerciseGym> = {
    "@context": "https://schema.org",
    "@type": "ExerciseGym",
    "@id": `${baseUrl}/#local`,
    name,
    description: settings.siteDescription || undefined,
    url: baseUrl,
    logo: settings.logo
      ? ({
        "@type": "ImageObject",
        url: settings.logo,
      } as ImageObject)
      : undefined,
    image: settings.logo
      ? ({
        "@type": "ImageObject",
        url: settings.logo,
      } as ImageObject)
      : undefined,
    priceRange: "$$",
    telephone: telephone || undefined,
    address: (streetAddress || addressLocality || addressRegion || postalCode)
      ? ({
        "@type": "PostalAddress",
        streetAddress: streetAddress,
        addressLocality: addressLocality,
        addressRegion: addressRegion,
        postalCode: postalCode,
        addressCountry: addressCountry,
      } as PostalAddress)
      : undefined,
    geo: (latitude && longitude)
      ? {
        "@type": "GeoCoordinates",
        latitude: typeof latitude === 'string' ? parseFloat(latitude) : latitude,
        longitude: typeof longitude === 'string' ? parseFloat(longitude) : longitude,
      }
      : undefined,
    sameAs: sameAsCandidate || 'https://maps.app.goo.gl/f3VSenK6u712JnGQA',
  };

  return <JsonLdScript data={organizationJsonLd} id="exercisegym-json-ld" />;
}

// Website JSON-LD Component
type WebSiteJsonLdProps = {
  settings: QuerySettingsDataResult;
};

export function WebSiteJsonLd({ settings }: WebSiteJsonLdProps) {
  if (!settings) {
    return null;
  }

  const baseUrl = getBaseUrl();

  const websiteJsonLd: WithContext<WebSite> = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: settings.siteTitle,
    description: settings.siteDescription || undefined,
    url: baseUrl,
    publisher: {
      "@type": "Organization",
      name: settings.siteTitle,
    } as Organization,
  };

  return <JsonLdScript data={websiteJsonLd} id="website-json-ld" />;
}

