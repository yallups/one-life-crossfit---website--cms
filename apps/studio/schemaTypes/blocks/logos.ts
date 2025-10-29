import { PhoneIcon } from "lucide-react";
import { defineField, defineType } from "sanity";

import { customRichText } from "../definitions/rich-text";

export const logos = defineType({
  name: "logos",
  type: "object",
  icon: PhoneIcon,
  fields: [
    defineField({
      name: "eyebrow",
      title: "Eyebrow",
      type: "string",
      description:
        "The smaller text that sits above the title to provide context",
    }),
    defineField({
      name: "title",
      title: "Title",
      type: "string",
      description: "The large text that is the primary focus of the block",
    }),
    customRichText(["block"]),
    defineField({
      name: "images",
      title: "Logos",
      type: "array",
      description: "list of logos to display in this section",
      of: [
        defineField({
          name: "Logo",
          type: "object",
          fields: [
            defineField({
              name: "image",
              type: "image",
              title: "Image",
              description: "Image of the logo",
            }),
            defineField({
              name: "url",
              type: "customUrl",
            }),
          ],
        }),
      ],
    }),
  ],
  preview: {
    select: {
      title: "title",
    },
    prepare: ({ title }) => ({
      title,
      subtitle: "Logos Block",
    }),
  },
});
