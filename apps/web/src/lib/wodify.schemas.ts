import { z } from "zod";

// Schema that tolerates various field names seen across Wodify docs/samples
export const WodifyLocationSchema = z.object({
  // Names
  name: z.string().optional().nullable(),
  locationName: z.string().optional().nullable(),

  // Phones
  phone: z.string().optional().nullable(),
  phoneNumber: z.string().optional().nullable(),
  telephone: z.string().optional().nullable(),
  phone_number: z.string().optional().nullable(),

  // Address lines
  address1: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  street: z.string().optional().nullable(),
  street_address_1: z.string().optional().nullable(),
  street_address_2: z.string().optional().nullable(),
  formatted_address: z.string().optional().nullable(),

  // City/State/Postal
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  stateCode: z.string().optional().nullable(),
  postalCode: z.string().optional().nullable(),
  zip: z.string().optional().nullable(),
  zip_code: z.string().optional().nullable(),

  // Country
  countryCode: z.string().optional().nullable(),
  country: z.string().optional().nullable(),

  // Geo
  latitude: z.union([z.string(), z.number()]).optional().nullable(),
  longitude: z.union([z.string(), z.number()]).optional().nullable(),
  geo: z
    .object({
      lat: z.union([z.string(), z.number()]).optional(),
      lng: z.union([z.string(), z.number()]).optional(),
    })
    .optional()
    .nullable(),

  // External maps/refs
  googlePlaceUrl: z.string().optional().nullable(),
  googleMapsUrl: z.string().optional().nullable(),
  mapsUrl: z.string().optional().nullable(),
})
  // Allow unknown extra properties so we’re resilient to API changes
  .passthrough();

export type WodifyLocation = z.infer<typeof WodifyLocationSchema>;

// Minimal fields we plan to use from Class payloads; tolerant to extras
export const WodifyClassSchema = z.object({
  id: z.union([z.string(), z.number()]),
  name: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  program_id: z.union([z.string(), z.number()]).optional().nullable(),
  program_name: z.string().optional().nullable(),
  location_id: z.union([z.string(), z.number()]).optional().nullable(),
  location: z.string().optional().nullable(),
  start_date_time: z.string().optional().nullable(),
  end_date_time: z.string().optional().nullable(),
  is_cancelled: z.boolean().optional().nullable(),
  class_limit: z.number().optional().nullable(),
  reserved: z.number().optional().nullable(),
  signed_in: z.number().optional().nullable(),
  waitlisted: z.number().optional().nullable(),
  available: z.number().optional().nullable(),
})
  .passthrough();

export type WodifyClass = z.infer<typeof WodifyClassSchema>;

// Coaches
export const WodifyCoachSchema = z.object({
  id: z.union([z.string(), z.number()]),
  first_name: z.string().optional().nullable(),
  last_name: z.string().optional().nullable(),
  picture_url: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
  biography: z.string().optional().nullable(),
  link_1: z.string().optional().nullable(),
  link_2: z.string().optional().nullable(),
  link_3: z.string().optional().nullable(),
  link_4: z.string().optional().nullable(),
  link_5: z.string().optional().nullable(),
  locations: z.string().optional().nullable(),
  programs: z.string().optional().nullable(),
  services: z.string().optional().nullable(),
})
  .passthrough();

export type WodifyCoach = z.infer<typeof WodifyCoachSchema>;
