import { Calendar } from "lucide-react";
import { defineField, defineType } from "sanity";
import { customRichText } from "../definitions/rich-text";

export const wodifySchedule = defineType({
  name: "wodifySchedule",
  title: "Wodify Schedule",
  type: "object",
  icon: Calendar,
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
      name: "programs",
      title: "Programs",
      type: "array",
      of: [{ type: "string" }],
      description:
        "List of program IDs or names to display in the schedule (e.g., CrossFit, Bootcamp, Abs & A$$). Leave empty to show all programs.",
    }),
    defineField({
      name: "daysToShow",
      title: "Days to Show",
      type: "number",
      description: "Number of days to display in the schedule",
      initialValue: 7,
      validation: (Rule) => Rule.min(1).max(14),
    }),
    defineField({
      name: "showAvailability",
      title: "Show Availability",
      type: "boolean",
      description: "Display remaining spots for each class",
      initialValue: true,
    }),
    defineField({
      name: "groupByDay",
      title: "Group by Day",
      type: "boolean",
      description: "Group classes by day (recommended for multi-day views)",
      initialValue: true,
    }),
    defineField({
      name: "showCoach",
      title: "Show Coach",
      type: "boolean",
      description: "Display coach name for each class",
      initialValue: false,
    }),
  ],
});
