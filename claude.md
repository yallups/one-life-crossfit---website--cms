# Wodify API Integration Reference

This document provides a reference for the Wodify API endpoints used in this project.

## Base URL
```
https://api.wodify.com
```

## Authentication
All requests require an API key passed via the `X-Api-Key` header:
```
X-Api-Key: your_api_key_here
```

The API key is securely stored in Sanity Settings under `wodifyApiToken` and accessed server-side only.

## Core Endpoints

### 1. Locations
**Endpoint:** `GET /v1/customers/locations`

**Description:** Retrieve a list of gym locations.

**Query Parameters:**
- `limit` (integer, optional): Page size (default: 50, max: 200)
- `offset` (integer, optional): Pagination offset (default: 0)

**Response:**
```json
{
  "locations": [
    {
      "id": 9721,
      "name": "One Life CrossFit",
      "street_address_1": "2627 Skyway Drive",
      "street_address_2": "Unit B",
      "city": "Santa Maria",
      "state": "California",
      "zip_code": "93455-1405",
      "country": "United States of America",
      "website": "onelifecrossfit.com",
      "phone_number": "8057140338",
      "email": "info@onelifecrossfit.com",
      "time_zone_iana": "America/Los_Angeles",
      "formatted_address": "2627 Skyway Drive<br/>Unit B<br/>Santa Maria, CA 93455-1405"
    }
  ],
  "pagination": {
    "page": 1,
    "page_size": 1,
    "has_more": false
  }
}
```

### 2. Classes (Schedule)
**Endpoint:** `GET /v1/classes` (base list), `GET /v1/classes/search` (preferred)

**Description:** Retrieve class schedule. Use the search endpoint with `q` for date and program filtering; the base list is for broad listings.

**Query Parameters (base list):**
- `sort` (string, optional): Sort order (e.g., `start_time`, `desc_start_time`)
- `page` (integer, optional): Page number (1-based, default: 1)
- `page_size` (integer, optional): Records per page (max: 100, default: 100)

**Search Query Parameters (preferred):**
- `q` (string, required): URL-encoded search clause(s)
- `sort` (string, optional): Sort order (e.g., `desc_start_time`)
- `page`, `page_size`

**Search Clause Syntax (unencoded):**
```
field|operator|value;field|operator|value
```

**CRITICAL: Field Names Must Use snake_case**
The search endpoint requires snake_case field names, NOT camelCase:
- ✅ `start_date_time` (correct)
- ❌ `startTime` (wrong - returns 422 error)
- ✅ `program_id` (correct)
- ❌ `programId` (wrong - returns 422 error)

**Common Class Filters (unencoded examples):**
- `start_date_time|gte|2024-01-01T00:00:00` (start date/time greater than or equal)
- `start_date_time|lte|2024-01-07T23:59:59` (start date/time less than or equal)
- `program_id|eq|15678` (program ID equals)
- `location_id|eq|9721` (location ID equals)
- `coach_id|eq|12345` (coach ID equals)

**Operators:**
- `gte` - greater than or equal (>=)
- `lte` - less than or equal (<=)
- `gt` - greater than (>)
- `lt` - less than (<)
- `eq` - equals (=)

**Working Example (unencoded):**
```
start_date_time|gte|2026-01-18T00:00:00;start_date_time|lte|2026-01-25T23:59:59;program_id|eq|93813
```

**URL-encoded Example:**
```
q=start_date_time%7Cgte%7C2026-01-18T00%3A00%3A00%3Bstart_date_time%7Clte%7C2026-01-25T23%3A59%3A59%3Bprogram_id%7Ceq%7C93813
```

**Sort Parameter:**
Also use snake_case for sorting: `sort=desc_start_date_time`

**Response:**
```json
{
  "classes": [
    {
      "id": "class_24680",
      "name": "CrossFit",
      "description": "High-intensity functional fitness",
      "program_id": "prog_gpp",
      "program_name": "CrossFit",
      "location_id": "loc_12345",
      "location": "One Life CrossFit",
      "start_date_time": "2025-11-05T17:00:00-08:00",
      "end_date_time": "2025-11-05T18:00:00-08:00",
      "is_cancelled": false,
      "class_limit": 18,
      "reserved": 12,
      "signed_in": 10,
      "waitlisted": 0,
      "available": 6
    }
  ],
  "pagination": {
    "page": 1,
    "page_size": 100,
    "has_more": false
  }
}
```

**Key Fields:**
- `start_date_time` / `end_date_time`: ISO 8601 datetime strings with timezone
- `class_limit`: Maximum capacity
- `reserved`: Number of reservations
- `available`: Spots still available
- `is_cancelled`: Whether the class is cancelled

### 3. Workouts (WOD - Workout of the Day)
**Endpoint:** `GET /v1/workouts`

**Description:** Retrieve workouts/WOD for specific dates and programs.

**Query Parameters:**
- `startDate` (string, optional): Start date in YYYY-MM-DD format
- `endDate` (string, optional): End date in YYYY-MM-DD format
- `locationId` (string, optional): Filter by location ID
- `programId` (string, optional): Filter by program ID
- `limit` (integer, optional): Page size (default: 50, max: 200)
- `offset` (integer, optional): Pagination offset (default: 0)

**Response:**
```json
{
  "data": [
    {
      "id": "wo_98765",
      "date": "2025-11-05",
      "title": "WOD: Cindy",
      "description": "AMRAP 20: 5 pull-ups, 10 push-ups, 15 air squats",
      "programId": "prog_gpp",
      "locationId": "loc_12345",
      "coachNotes": "Scale as needed",
      "publicNotes": "This is a benchmark workout!"
    }
  ],
  "limit": 50,
  "offset": 0,
  "total": 31
}
```

**Get Single Workout:**
`GET /v1/workouts/{id}`

### 4. Coaches
**Endpoint:** `GET /v1/customers/coaches`

**Description:** Retrieve list of coaches/staff members.

**Note:** Response format may vary. The implementation normalizes various field name formats.

**Common Fields:**
- `id`: Coach identifier
- `first_name` / `last_name`: Coach name
- `picture_url`: Profile image URL
- `title`: Job title/position
- `biography`: Bio/description
- `link_1` through `link_5`: Social media links
- `locations`: Associated locations (CSV string)
- `programs`: Associated programs (CSV string)
- `services`: Associated services (CSV string)

### 5. Programs
**Endpoint:** `GET /v1/programs`

**Description:** Retrieve list of all programs (e.g., CrossFit, Bootcamp, Olympic Lifting).

**Query Parameters:**
- `limit` (integer, optional): Page size (default: 50, max: 200)
- `offset` (integer, optional): Pagination offset (default: 0)

**Response:**
```json
{
  "programs": [
    {
      "id": 15678,
      "name": "CrossFit",
      "description": "General functional fitness",
      "is_active": true,
      "location_id": 9721
    }
  ]
}
```

### 6. Appointments/Services
**Endpoint:** `GET /v1/appointments/services`

**Description:** Retrieve list of available services (e.g., Private Training, Nutrition).

**Note:** Use this endpoint to potentially fetch availability for private training and nutrition appointments. Exact response format needs verification.

### 7. Appointments/Availability
**Endpoint:** `GET /v1/appointments/availability` or `GET /v1/appointments/slots`

**Description:** Retrieve available appointment time slots for booking services.

**Query Parameters:**
- `startDate` (string, optional): Start date in YYYY-MM-DD format
- `endDate` (string, optional): End date in YYYY-MM-DD format
- `serviceId` (string, optional): Filter by service ID

**Note:** Not all Wodify accounts have API access to appointment availability. The implementation gracefully handles this by showing a custom message.

## Endpoints That Don't Exist

### Announcements ❌
**Research findings:** The Wodify API does **not** have a dedicated announcements endpoint. We've confirmed that none of these exist:
- `/v1/announcements` - Does not exist (404)
- `/v1/messages` - Only for sending messages, not retrieving announcements
- `/v1/notifications` - Does not exist (404)

**Alternatives:**
1. **Use WOD public notes** - The `/v1/workouts` endpoint includes `public_notes` which can serve as daily announcements
2. **Use Sanity CMS** - Create a custom announcements content type in Sanity for better control
3. **In-app chat** - Wodify has in-app chat APIs but these are for sending, not retrieving public announcements

The announcements block implementation attempts to check multiple potential endpoints but will gracefully return empty results if none are available.

## Implementation Notes

### Server-Side Architecture
All Wodify API calls are made server-side via:
1. **lib/wodify.ts** - Core API client functions with caching
2. **API Routes** - Next.js API routes at `/api/wodify/*` expose data to frontend
3. **Sanity Blocks** - Define configurable content blocks for CMS
4. **React Components** - Client components fetch from `/api/wodify/*` endpoints

### Caching Strategy
- API responses cached with `next: { revalidate: 600 }` (10 minutes)
- Some endpoints (like coaches) use longer cache (24 hours)
- Tagged with `['wodify']` for on-demand revalidation

### Schema Validation
All responses are validated using Zod schemas in `wodify.schemas.ts` to ensure type safety and handle API field variations.

### Important Data Notes (CRITICAL)

**Gym Data Status** (as of December 2024):
- **Workouts (WOD)**: Last entry is **June 2, 2022**
- **Classes**: Last entry is **April 30, 2022**

This means:
- ✅ The workouts and classes endpoints **ARE working correctly**
- ✅ They return all historical data from 2022
- ✅ Use `/v1/classes/search` with the `q` parameter for date/program filtering
- ⚠️ If no current data appears, the gym needs to create new workouts/classes in Wodify

**Response Structure Differences**:
- **Workouts** endpoint returns: `{ workouts: [...], limit, offset, total }`
- **Classes** endpoint returns: `{ classes: [...], pagination: {...} }`
- Use `workouts` key (not `data`) for workouts endpoint
- Field names differ from documentation:
  - Workouts use `name` for title, `comment` for description, `program` for program name

## Usage Examples

### Filtering Classes by Multiple Programs
To show classes from multiple programs (e.g., CrossFit and Bootcamp), you'll need to make multiple API calls and merge results, as the API's `programId` parameter typically filters to a single program.

### Getting Today's Workout
```typescript
const today = new Date().toISOString().split('T')[0];
const { data } = await wodifyFetch('/v1/workouts', {
  startDate: today,
  endDate: today,
  programId: 'your_program_id'
});
```

### Building a Week Schedule
```typescript
const startDate = '2025-12-24';
const endDate = '2025-12-31';
const { items } = await getWodifyClasses({
  startDate,
  endDate,
  programId: 'crossfit',
  sort: 'start_date_time'
});
```

## Error Handling
All endpoints should handle:
- 401 Unauthorized - Invalid or expired API key
- 404 Not Found - Resource doesn't exist
- 400 Bad Request - Invalid parameters

The implementation gracefully degrades by returning empty arrays on errors to prevent breaking the UI.
