import { MapPinned } from "lucide-react";
import { defineField, defineType } from "sanity";

export const contactUs = defineType({
  name: "contactUs",
  type: "object",
  title: "Contact Us",
  icon: MapPinned,
  fields: [
    defineField({
      name: "eyebrow",
      type: "string",
      title: "Eyebrow",
    }),
    defineField({
      name: "title",
      type: "string",
      title: "Title",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "richText",
      type: "richText",
      title: "Intro",
      description: "Optional intro rich text displayed above the contact details",
    }),
    defineField({
      name: "email",
      type: "string",
      title: "Email (override)",
      description: "If empty, defaults to Settings → Contact Email",
      validation: (Rule) => Rule.email(),
    }),
    defineField({
      name: "telephone",
      type: "string",
      title: "Telephone (override)",
      description:
        "If empty, defaults to Settings → Telephone. E.g. +1-805-123-4567",
    }),
    defineField({
      name: "address",
      type: "object",
      title: "Address (override)",
      description: "If empty, defaults to Settings → Address",
      fields: [
        defineField({ name: "street", type: "string", title: "Street" }),
        defineField({ name: "city", type: "string", title: "City" }),
        defineField({ name: "state", type: "string", title: "State/Region" }),
        defineField({ name: "zip", type: "string", title: "ZIP/Postal Code" }),
      ],
    }),
    defineField({
      name: "hours",
      type: "array",
      title: "Hours of Operation (override)",
      description: "If empty, defaults to Settings → Hours of Operation",
      of: [
        defineField({
          name: "dayHours",
          type: "object",
          title: "Day",
          fields: [
            defineField({
              name: "day",
              type: "string",
              title: "Day",
              options: {
                list: [
                  { title: "Monday", value: "monday" },
                  { title: "Tuesday", value: "tuesday" },
                  { title: "Wednesday", value: "wednesday" },
                  { title: "Thursday", value: "thursday" },
                  { title: "Friday", value: "friday" },
                  { title: "Saturday", value: "saturday" },
                  { title: "Sunday", value: "sunday" },
                ],
                layout: "dropdown",
              },
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: "closed",
              type: "boolean",
              title: "Closed",
              initialValue: false,
            }),
            defineField({ name: "open", type: "string", title: "Opens (e.g. 5:30 AM)" }),
            defineField({ name: "close", type: "string", title: "Closes (e.g. 8:00 PM)" }),
          ],
        }),
      ],
    }),
    defineField({
      name: "showMap",
      type: "boolean",
      title: "Show Google Map",
      initialValue: true,
    }),
    defineField({
      name: "mapQuery",
      type: "string",
      title: "Map Query (override)",
      description:
        "Optional query for the map iframe. If empty, we build it from the address",
    }),
    defineField({
      name: "googleMapsUrl",
      type: "string",
      title: "Google Maps URL (override)",
      description:
        "Optional link used for the 'Get Directions' button. If empty, we build a maps link from the address",
    }),
  ],
  preview: {
    select: { title: "title" },
    prepare: ({ title }) => ({ title: title || "Contact Us" }),
  },
});
