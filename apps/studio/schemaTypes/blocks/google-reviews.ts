import { MessageCircleMore } from "lucide-react";
import { defineField, defineType } from "sanity";
import { customRichText } from "../definitions/rich-text";

export const googleReviews = defineType({
  name: "googleReviews",
  type: "object",
  icon: MessageCircleMore,
  // many of the props on `ReactGoogleReviews`
  fields: [
    defineField({
      name: "eyebrow",
      title: "Eyebrow Text",
      type: "string",
      description: "Optional text displayed above the title",
    }),
    defineField({
      name: "title",
      title: "Section Title",
      type: "string",
      description: "The main heading for this cards section",
      validation: (Rule) => Rule.required(),
    }),
    customRichText(["block"]),
    defineField({
      name: "reviewsNumber",
      type: "number",
      title: "Number of Reviews",
      description: "Maximum number of reviews to display",
      validation: (Rule) => Rule.required().min(1),
    }),
    defineField({
      name: "layout",
      type: "string",
      title: "Layout",
      description: "Layout of the reviews",
      options: {
        list: [
          { title: "Carousel", value: "carousel" },
          { title: "Badge", value: "badge" },
          // {title: "Custom", value: "custom"}
        ],
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "showDots",
      type: "boolean",
      title: "Show Dots",
      description: "Whether to hide Carousel Dots",
      initialValue: false,
    }),
    defineField({
      name: "autoplay",
      type: "boolean",
      title: "Autoplay",
      description: "Enable carousel autoplay",
      initialValue: false,
    }),
    defineField({
      name: "autoplaySpeed",
      type: "number",
      title: "Autoplay Speed",
      description: "Speed in milliseconds between slides",
      initialValue: 5000,
    }),
    defineField({
      name: "accessibility",
      title: "Accessibility",
      type: "boolean",
      initialValue: true,
      description: "Enable accessibility features",
    }),
    defineField({
      name: "dateDisplay",
      title: "Date Display",
      type: "string",
      options: {
        list: [
          { title: "Absolute", value: "absolute" },
          { title: "Relative", value: "relative" },
        ],
      },
      initialValue: "absolute",
      description: "How to display review dates",
    }),
    defineField({
      name: "hideEmptyReviews",
      title: "Hide Empty Reviews",
      type: "boolean",
      initialValue: false,
      description: "Hide reviews with no content",
    }),
    defineField({
      name: "maxCharacters",
      title: "Max Characters",
      type: "number",
      initialValue: 200,
      description: "Maximum number of characters to display in reviews",
    }),
    defineField({
      name: "logoVariant",
      title: "Logo Variant",
      type: "string",
      options: {
        list: [
          { title: "Full", value: "full" },
          { title: "Icon", value: "icon" },
        ],
      },
      initialValue: "full",
      description: "Logo display variant",
    }),
    defineField({
      name: "nameDisplay",
      title: "Name Display",
      type: "string",
      options: {
        list: [
          { title: "First and Last Initials", value: "firstAndLastInitials" },
          { title: "Full Name", value: "fullName" },
          { title: "First Name Only", value: "firstNamesOnly" },
        ],
      },
      initialValue: "firstAndLastInitials",
      description: "How to display reviewer names",
    }),
    defineField({
      name: "structuredData",
      title: "Structured Data",
      type: "boolean",
      initialValue: true,
      description: "Include structured data for SEO",
    }),
  ],
});
