# Wodify Block Configuration Guide

This guide provides instructions for configuring the Wodify content blocks in Sanity CMS.

## Finding Your Wodify Identifiers

### Method 1: Using the Browser Developer Tools

The easiest way to find your specific IDs is to call the Wodify API directly from your browser:

1. Open your browser's Developer Console (F12 or Right-click > Inspect > Console)
2. Run these commands (replace `YOUR_API_KEY` with your actual Wodify API key from Sanity Settings):

```javascript
// Set your API key
const apiKey = 'YOUR_API_KEY';
const headers = { 'X-Api-Key': apiKey, 'Accept': 'application/json' };

// Fetch Programs
fetch('https://api.wodify.com/v1/programs', { headers })
  .then(r => r.json())
  .then(data => console.table(data.programs || data.data || data));

// Fetch Locations
fetch('https://api.wodify.com/v1/customers/locations', { headers })
  .then(r => r.json())
  .then(data => console.table(data.locations || data));

// Fetch Coaches
fetch('https://api.wodify.com/v1/customers/coaches', { headers })
  .then(r => r.json())
  .then(data => console.table(data.coaches || data.Coaches || data));

// Fetch Classes (to see program IDs in action)
const today = new Date().toISOString().split('T')[0];
fetch(`https://api.wodify.com/v1/classes?startDate=${today}&page_size=50`, { headers })
  .then(r => r.json())
  .then(data => console.table(data.classes || data));
```

### Method 2: Call Your API Routes

You can also call your own API routes which are already authenticated:

```javascript
// Programs (from classes)
fetch('/api/wodify/classes?startDate=2025-12-24&endDate=2026-01-24')
  .then(r => r.json())
  .then(data => {
    const programs = new Map();
    data.items.forEach(c => programs.set(c.program_id, c.program_name));
    console.table(Array.from(programs, ([id, name]) => ({id, name})));
  });

// Coaches
fetch('/api/wodify/coaches')
  .then(r => r.json())
  .then(data => console.table(data.items));

// Locations
fetch('/api/wodify/locations')
  .then(r => r.json())
  .then(data => console.table(data.items));
```

---

## Block Configuration Examples

### 1. Wodify Schedule

**Use Case:** Display live class schedule for one or more programs

**Configuration Example:**
```yaml
Title: "This Week's Schedule"
Programs:
  - "15678"  # CrossFit (example ID)
  - "15679"  # Bootcamp (example ID)
Days to Show: 7
Show Availability: true
Group by Day: true
Show Coach: true
```

**Finding Program IDs:**
- Look at the `program_id` field from the classes API
- Common program types: CrossFit, Bootcamp, Olympic Lifting, Yoga, etc.
- You can leave Programs empty to show ALL programs

---

### 2. Wodify Workout of the Day (WOD)

**Use Case:** Display the daily workout for a specific program

**Configuration Example:**
```yaml
Title: "Today's WOD"
Program ID: "15678"  # Required - one program only
Show Public Notes: true
Days Ahead: 0  # 0 = today only, 1 = today + tomorrow, etc.
```

**Note:** This block requires a single program ID. Get it from the classes or programs API.

---

### 3. Wodify Coaches

**Use Case:** Display team member directory with filtering

**Configuration Example:**
```yaml
Title: "Meet Our Coaches"
Filters:
  Locations: ["One Life CrossFit"]
  Programs: ["CrossFit", "Bootcamp"]
  Services: ["Personal Training"]
Layout: cards
Show Links: true
Items per Row: 3
```

**Finding Values:**
- Coach IDs come from `/v1/customers/coaches`
- The `programs`, `locations`, and `services` fields are typically CSV strings
- Filter values are case-insensitive partial matches

---

### 4. Wodify Announcements

**Use Case:** Display gym announcements or important messages

**Configuration Example:**
```yaml
Title: "Announcements"
Program ID: "15678"  # Optional - leave empty for all
Max Announcements: 5
Layout: cards  # or "list"
```

**Important Note:**
Based on API documentation research, Wodify **does not have a dedicated announcements endpoint**. The implementation tries multiple potential endpoints:
- `/v1/announcements`
- `/v1/messages`
- `/v1/notifications`
- `/v1/customers/announcements`

If none of these work, you have a few options:
1. **Use public notes in WOD** - The workout endpoint has a `public_notes` field that can serve as announcements
2. **Use Sanity CMS directly** - Create a custom announcements content type in Sanity
3. **Contact Wodify support** - Ask if they have an announcements API available

---

## Common Program Examples

Based on typical CrossFit gym setups, your programs might include:

- **CrossFit** - General group classes
- **Bootcamp** - Beginner-friendly or bootcamp-style classes
- **Olympic Lifting** - Barbell technique classes
- **Open Gym** - Unsupervised workout time
- **Abs & A$$** - Core/glute focused classes
- **Yoga** or **Mobility** - Recovery classes
- **Teens** or **Kids** - Youth programs

Use the API calls above to find your exact program IDs and names.

---

## Troubleshooting

### Issue: "No data found" or empty results

**Solutions:**
1. Verify your Wodify API token is set in Sanity Settings (`wodifyApiToken`)
2. Check that your Wodify account has API access enabled
3. Try the API calls directly in your browser console to verify the data exists
4. Check the date ranges - make sure you're querying current/future dates

### Issue: Program IDs don't work

**Solutions:**
1. Program IDs may be numeric (e.g., `15678`) or strings (e.g., `"prog_crossfit"`)
2. Try both the `program_id` and `program_name` - some endpoints accept either
3. Some endpoints only work with one program at a time (like WOD)

### Issue: Announcements showing "unavailable"

**Solutions:**
1. This is expected - Wodify likely doesn't expose announcements via API
2. Use the WOD `public_notes` field for daily announcements
3. Create a custom Sanity content type for gym announcements
4. Use social media embeds for announcements

## Testing Your Configuration

After setting up a block:

1. **Preview in Sanity Studio** - Use Sanity's preview mode
2. **Check Browser Console** - Look for any API errors
3. **Test Different Date Ranges** - Ensure data loads for current dates
4. **Verify Filtering** - Test with different program/location filters

---

## API Rate Limits

The blocks implement caching to respect API limits:
- **Classes/Schedule**: 10 minutes (600s)
- **Workouts**: 10 minutes (600s)
- **Coaches**: 24 hours (86400s)
- **Locations**: 10 minutes (600s)
Caching is handled automatically by Next.js on the server side.

---

## Need Help?

If you need specific IDs for your gym:

1. Contact Wodify Support for API documentation specific to your tenant
2. Use the browser console methods above to inspect your actual data
3. Check the Network tab in browser DevTools when using the Wodify web app to see API calls
