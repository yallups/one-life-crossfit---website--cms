"use client";

import { useOptimistic } from "@sanity/visual-editing/react";
import { createDataAttribute } from "next-sanity";
import { useCallback, useMemo } from "react";
import { Logos } from "@/components/sections/logos";
import { dataset, projectId, studioUrl } from "@/config";
import type { QueryHomePageDataResult } from "@/lib/sanity/sanity.types";
import type { PageBuilderBlockTypes, PagebuilderType } from "@/types";
import { CTABlock } from "./sections/cta";
import { FaqAccordion } from "./sections/faq-accordion";
import { FeatureCardsWithIcon } from "./sections/feature-cards-with-icon";
import { HeroBlock } from "./sections/hero";
import { ImageLinkCards } from "./sections/image-link-cards";
import { LayoutBlock } from "./sections/layout";
import { SubscribeNewsletter } from "./sections/subscribe-newsletter";
import { GoogleReviews } from "@/components/sections/google-reviews";
import { WodifyCoaches } from "@/components/sections/wodify-coaches";
import { ContactUs } from "@/components/sections/contact-us";

// More specific and descriptive type aliases
type PageBuilderBlock = NonNullable<
  NonNullable<QueryHomePageDataResult>["pageBuilder"]
>[number];

export type PageBuilderProps = {
  readonly pageBuilder?: PageBuilderBlock[];
  readonly id: string;
  readonly type: string;
  readonly preloadedData?: Record<string, any>;
};

type SanityDataAttributeConfig = {
  readonly id: string;
  readonly type: string;
  readonly path: string;
};

// Strongly typed component mapping with proper component signatures
const BLOCK_COMPONENTS = {
  cta: CTABlock as React.ComponentType<PagebuilderType<"cta">>,
  faqAccordion: FaqAccordion as React.ComponentType<
    PagebuilderType<"faqAccordion">
  >,
  hero: HeroBlock as React.ComponentType<PagebuilderType<"hero">>,
  layout: LayoutBlock as React.ComponentType<PagebuilderType<"layout">>,
  featureCardsIcon: FeatureCardsWithIcon as React.ComponentType<
    PagebuilderType<"featureCardsIcon">
  >,
  subscribeNewsletter: SubscribeNewsletter as React.ComponentType<
    PagebuilderType<"subscribeNewsletter">
  >,
  imageLinkCards: ImageLinkCards as React.ComponentType<
    PagebuilderType<"imageLinkCards">
  >,
  googleReviews: GoogleReviews as React.ComponentType<
    PagebuilderType<"googleReviews">
  >,
  logos: Logos as React.ComponentType<PagebuilderType<"logos">>,
  wodifyCoaches: WodifyCoaches as React.ComponentType<PagebuilderType<"wodifyCoaches">>,
  contactUs: ContactUs as React.ComponentType<PagebuilderType<"contactUs">>,
} as const satisfies Record<PageBuilderBlockTypes, React.ComponentType<any>>;

/**
 * Helper function to create consistent Sanity data attributes
 */
function createSanityDataAttribute(config: SanityDataAttributeConfig): string {
  return createDataAttribute({
    id: config.id,
    baseUrl: studioUrl,
    projectId,
    dataset,
    type: config.type,
    path: config.path,
  }).toString();
}

/**
 * Error fallback component for unknown block types
 */
function UnknownBlockError({
  blockType,
  blockKey,
}: {
  blockType: string;
  blockKey: string;
}) {
  return (
    <div
      aria-label={`Unknown block type: ${blockType}`}
      className="flex items-center justify-center rounded-lg border-2 border-muted-foreground/20 border-dashed bg-muted p-8 text-center text-muted-foreground"
      key={`${blockType}-${blockKey}`}
      role="alert"
    >
      <div className="space-y-2">
        <p>Component not found for block type:</p>
        <code className="rounded bg-background px-2 py-1 font-mono text-sm">
          {blockType}
        </code>
      </div>
    </div>
  );
}

/**
 * Hook to handle optimistic updates for page builder blocks
 */
function useOptimisticPageBuilder(
  initialBlocks: PageBuilderBlock[],
  documentId: string
) {
  return useOptimistic<PageBuilderBlock[], any>(
    initialBlocks,
    (currentBlocks, action) => {
      if (action.id === documentId && action.document?.pageBuilder) {
        return action.document.pageBuilder;
      }
      return currentBlocks;
    }
  );
}

/**
 * Custom hook for block component rendering logic
 */
function useBlockRenderer(id: string, type: string, preloadedData?: Record<string, any>) {
  const createBlockDataAttribute = useCallback(
    (blockKey: string) =>
      createSanityDataAttribute({
        id,
        type,
        path: `pageBuilder[_key=="${blockKey}"]`,
      }),
    [id, type]
  );

  const renderBlock = useCallback(
    (block: PageBuilderBlock, _index: number) => {
      // Map _type to component. Allow fallback for newly added blocks not in type mapping yet.
      let Component = BLOCK_COMPONENTS[
        block._type as keyof typeof BLOCK_COMPONENTS
        ] as React.ComponentType<any> | undefined;


      if (!Component) {
        return (
          <UnknownBlockError
            blockKey={block._key}
            blockType={block._type}
            key={`${block._type}-${block._key}`}
          />
        );
      }

      const extraProps = (() => {
        const pre = preloadedData?.[block._key];
        const hasPre = pre !== undefined;
        if (hasPre) {
          return { preloaded: pre } as Record<string, unknown>;
        }
        return {} as Record<string, unknown>;
      })();

      return (
        <div
          data-sanity={createBlockDataAttribute(block._key)}
          key={`${block._type}-${block._key}`}
        >
          <Component {...(block as any)} {...extraProps} />
        </div>
      );
    },
    [createBlockDataAttribute, preloadedData]
  );

  return { renderBlock };
}

/**
 * PageBuilder component for rendering dynamic content blocks from Sanity CMS
 */
export function PageBuilder({
  pageBuilder: initialBlocks = [],
  id,
  type,
  preloadedData,
}: PageBuilderProps) {
  const blocks = useOptimisticPageBuilder(initialBlocks, id);
  const { renderBlock } = useBlockRenderer(id, type, preloadedData);

  const containerDataAttribute = useMemo(
    () => createSanityDataAttribute({ id, type, path: "pageBuilder" }),
    [id, type]
  );

  if (!blocks.length) {
    return null;
  }

  return (
    <section
      aria-label="Page content"
      className="flex flex-col gap-16"
      data-sanity={containerDataAttribute}
    >
      {blocks.map(renderBlock)}
    </section>
  );
}
