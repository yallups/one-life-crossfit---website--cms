import { LayoutPanelTop } from "lucide-react";
import { defineField, defineType } from "sanity";

import { buttonsField } from "../common";
import { customRichText } from "../definitions/rich-text";

export const layout = defineType({
  name: "layout",
  title: "Layout",
  icon: LayoutPanelTop,
  type: "object",
  fields: [
    defineField({
      name: "badge",
      type: "string",
      title: "Badge",
      description:
        "Optional badge text displayed above the title, useful for highlighting new features or promotions",
    }),
    defineField({
      name: "title",
      type: "string",
      title: "Title",
      description:
        "The main heading text for the layout section that captures attention",
    }),
    defineField({
      name: "variant",
      type: "string",
      title: "Variant",
      description: "Choose how content and image are arranged",
      options: {
        layout: "radio",
        list: [
          { title: "Image Right (default)", value: "imageRight" },
          { title: "Image Left", value: "imageLeft" },
          { title: "Centered", value: "centered" },
          { title: "Background", value: "background" },
        ],
      },
      initialValue: "imageRight",
    }),
    customRichText(["block"]),
    defineField({
      name: "media",
      type: "array",
      title: "Media",
      description:
        "Add one or more images and/or a video. When multiple images are set, a carousel will autoplay.",
      of: [
        {
          type: "image",
          options: { hotspot: true },
        },
        {
          type: "file",
          name: "video",
          title: "Video",
          options: { accept: "video/*" },
        },
      ],
    }),
    buttonsField,
  ],
  preview: {
    select: {
      title: "title",
      variant: "variant",
    },
    prepare: ({ title, variant }) => ({
      title,
      subtitle: `Layout Block — ${variant ?? "imageRight"}`,
    }),
  },
});
