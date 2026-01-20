import { Dumbbell } from "lucide-react";
import { defineField, defineType } from "sanity";
import { customRichText } from "../definitions/rich-text";

export const wodifyWod = defineType({
  name: "wodifyWod",
  title: "Wodify Workout of the Day",
  type: "object",
  icon: Dumbbell,
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
    customRichText(["block", "image"]),
    defineField({
      name: "programId",
      title: "Program ID",
      type: "string",
      description:
        "Program ID or name to display WOD for (e.g., CrossFit, Bootcamp). Required.",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "showPublicNotes",
      title: "Show Public Notes",
      type: "boolean",
      description: "Display public notes/announcements for the workout",
      initialValue: true,
    }),
    defineField({
      name: "daysAhead",
      title: "Days Ahead",
      type: "number",
      description: "Number of days to show workouts ahead (0 = today only)",
      initialValue: 0,
      validation: (Rule) => Rule.min(0).max(7),
    }),
  ],
});
