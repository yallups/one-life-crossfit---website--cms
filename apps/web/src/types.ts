import type {
  QueryBlogSlugPageDataResult,
  QueryHomePageDataResult,
  QueryImageTypeResult,
} from "@/lib/sanity/sanity.types";

type ExtraPageBuilderBlockMap = {
  wodifySchedule: {
    _type: "wodifySchedule";
    eyebrow?: string | null;
    title?: string | null;
    richText?: SanityRichTextProps;
    programs?: Array<string | null>;
    daysToShow?: number | string | null;
    showAvailability?: boolean | null;
    groupByDay?: boolean | null;
    showCoach?: boolean | null;
  };
  wodifyWod: {
    _type: "wodifyWod";
    eyebrow?: string | null;
    title?: string | null;
    richText?: SanityRichTextProps;
    programId?: string | null;
    showPublicNotes?: boolean | null;
    daysAhead?: number | string | null;
  };
};

export type PageBuilderBlockTypes =
  | NonNullable<
      NonNullable<QueryHomePageDataResult>["pageBuilder"]
    >[number]["_type"]
  | keyof ExtraPageBuilderBlockMap;

type PagebuilderBaseType<T extends PageBuilderBlockTypes> = Extract<
  NonNullable<NonNullable<QueryHomePageDataResult>["pageBuilder"]>[number],
  { _type: T }
>;

export type PagebuilderType<T extends PageBuilderBlockTypes> =
  PagebuilderBaseType<T> extends never
    ? T extends keyof ExtraPageBuilderBlockMap
      ? ExtraPageBuilderBlockMap[T]
      : never
    : PagebuilderBaseType<T>;

export type SanityButtonProps = NonNullable<
  NonNullable<PagebuilderType<"hero">>["buttons"]
>[number];

export type SanityImageProps = NonNullable<QueryImageTypeResult>;

export type SanityRichTextProps =
  NonNullable<QueryBlogSlugPageDataResult>["richText"];

export type SanityRichTextBlock = Extract<
  NonNullable<NonNullable<SanityRichTextProps>[number]>,
  { _type: "block" }
>;

export type Maybe<T> = T | null | undefined;
