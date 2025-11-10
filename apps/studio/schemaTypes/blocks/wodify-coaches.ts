import { UsersRound } from "lucide-react";
import { defineField, defineType } from "sanity";
import { customRichText } from "../definitions/rich-text";

export const wodifyCoaches = defineType({
  name: "wodifyCoaches",
  title: "Wodify Coaches",
  type: "object",
  icon: UsersRound,
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
      validation: (Rule) => Rule.required(),
    }),
    customRichText(["block"]),
    defineField({
      name: "filters",
      title: "Filters",
      type: "object",
      options: { collapsible: true, collapsed: false },
      fields: [
        defineField({
          name: "locations",
          title: "Locations",
          type: "array",
          of: [{ type: "string" }],
          description:
            "Optional list of location names/codes to filter coaches by.",
        }),
        defineField({
          name: "programs",
          title: "Programs",
          type: "array",
          of: [{ type: "string" }],
          description:
            "Optional list of program names/codes to filter coaches by.",
        }),
        defineField({
          name: "services",
          title: "Services",
          type: "array",
          of: [{ type: "string" }],
          description:
            "Optional list of services to filter coaches by.",
        }),
      ],
    }),
    defineField({
      name: "layout",
      title: "Layout",
      type: "string",
      options: {
        list: [
          { title: "Cards Grid", value: "cards" },
          { title: "List", value: "list" },
        ],
      },
      initialValue: "cards",
    }),
    defineField({
      name: "showLinks",
      title: "Show Links",
      type: "boolean",
      initialValue: true,
    }),
    defineField({
      name: "itemsPerRow",
      title: "Items per Row (Desktop)",
      type: "number",
      initialValue: 3,
      validation: (Rule) => Rule.min(1).max(4),
    }),
  ],
});
