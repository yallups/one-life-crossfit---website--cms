import { CogIcon } from "lucide-react";
import { defineField, defineType } from "sanity";

const socialLinks = defineField({
  name: "socialLinks",
  title: "Social Media Links",
  description: "Add links to your social media profiles",
  type: "object",
  fields: [
    defineField({
      name: "linkedin",
      title: "LinkedIn URL",
      description: "Full URL to your LinkedIn profile/company page",
      type: "string",
    }),
    defineField({
      name: "facebook",
      title: "Facebook URL",
      description: "Full URL to your Facebook profile/page",
      type: "string",
    }),
    defineField({
      name: "yelp",
      title: "Yelp URL",
      description: "Full URL to your Yelp page",
      type: "string",
    }),
    defineField({
      name: "twitter",
      title: "Twitter/X URL",
      description: "Full URL to your Twitter/X profile",
      type: "string",
    }),
    defineField({
      name: "instagram",
      title: "Instagram URL",
      description: "Full URL to your Instagram profile",
      type: "string",
    }),
    defineField({
      name: "youtube",
      title: "YouTube URL",
      description: "Full URL to your YouTube channel",
      type: "string",
    }),
  ],
});

export const settings = defineType({
  name: "settings",
  type: "document",
  title: "Settings",
  description: "Global settings and configuration for your website",
  icon: CogIcon,
  fields: [
    defineField({
      name: "label",
      type: "string",
      initialValue: "Settings",
      title: "Label",
      description: "Label used to identify settings in the CMS",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "siteTitle",
      type: "string",
      title: "Site Title",
      description:
        "The main title of your website, used in browser tabs and SEO",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "siteDescription",
      type: "text",
      title: "Site Description",
      description: "A brief description of your website for SEO purposes",
      validation: (rule) => rule.required().min(50).max(160),
    }),
    defineField({
      name: "logo",
      type: "image",
      title: "Site Logo",
      description: "Upload your website logo",
      options: {
        hotspot: true,
      },
    }),
    defineField({
      name: "siteIcon",
      type: "image",
      title: "Site Icon",
      description: "Upload a square image used to generate favicons and the Apple touch icon.",
      options: {
        hotspot: true,
      },
    }),
    defineField({
      name: "contactEmail",
      type: "string",
      title: "Contact Email",
      description: "Primary contact email address for your website",
      validation: (rule) => rule.email(),
    }),
    defineField({
      name: "telephone",
      type: "string",
      title: "Telephone",
      description: "Primary phone number shown on the site and used in SEO JSON-LD. If a Wodify API token is configured, the site's default phone will come from your primary Wodify location; this field overrides the Wodify value. Block-level settings can override both. E.g. +1-805-123-4567",
      validation: (rule) => rule.min(7).warning("Provide a valid phone number"),
    }),
    defineField({
      name: "address",
      type: "object",
      title: "Address",
      description: "Business address used on the site and in SEO JSON-LD. If a Wodify API token is configured, the site's default address will pull from your primary Wodify location; values set here override the Wodify address. Block-level settings can override both.",
      fields: [
        defineField({
          name: "street",
          type: "string",
          title: "Street Address",
          validation: (rule) => rule.required().warning("Street is recommended"),
        }),
        defineField({
          name: "city",
          type: "string",
          title: "City",
          validation: (rule) => rule.required().warning("City is recommended"),
        }),
        defineField({
          name: "state",
          type: "string",
          title: "State/Region",
          validation: (rule) => rule.required().warning("State is recommended"),
        }),
        defineField({
          name: "zip",
          type: "string",
          title: "ZIP/Postal Code",
          validation: (rule) => rule.required().warning("ZIP is recommended"),
        }),
        defineField({
          name: "placeId",
          type: "string",
          title: "Google Place ID",
          description: "Optional: Google Maps Place ID for precise map and directions",
        }),
      ],
    }),
    defineField({
      name: "hours",
      type: "array",
      title: "Hours of Operation",
      description: "Weekly hours displayed in Contact Us and used across the site",
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
            defineField({ name: "closed", type: "boolean", title: "Closed", initialValue: false }),
            defineField({ name: "open", type: "string", title: "Opens (e.g. 5:30 AM)" }),
            defineField({ name: "close", type: "string", title: "Closes (e.g. 8:00 PM)" }),
          ],
        }),
      ],
    }),
    defineField({
      name: "googleReviewsFeaturableId",
      type: "string",
      title: "Featureable ID",
      description: "Featureable ID for Google Reviews",
    }),
    defineField({
      name: "wodifyApiToken",
      type: "string",
      title: "Wodify API Token",
      description:
        "Sensitive: Token used by the website server to call the Wodify API. Do not expose this value publicly. It is only read server-side.",
      validation: (rule) => rule.min(10).warning("Paste a valid Wodify API token"),
      options: {
        // Studio-only hint to reduce accidental exposure
        // (Note: this does not enforce server-side security; keep dataset private if possible.)
        // No direct 'secret' type exists; we add clear messaging instead.
      },
    }),
    socialLinks,
  ],
  preview: {
    select: {
      title: "label",
    },
    prepare: ({ title }) => ({
      title: title || "Untitled Settings",
      media: CogIcon,
    }),
  },
});
