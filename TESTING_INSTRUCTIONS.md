# Wodify API Testing Instructions

## Quick Test

I've added comprehensive testing and debugging tools. Here's how to use them:

### 1. Run Your Dev Server

```bash
pnpm dev
```

### 2. Open the Test Page

Navigate to: **http://localhost:3000/wodify-test.html**

This page will automatically:
- ✅ Run all endpoint tests
- ✅ Show which endpoints work
- ✅ Display full responses
- ✅ Highlight issues with empty results
- ✅ Show the exact URLs being called

### 3. Check the Console Logs

Open your terminal where `pnpm dev` is running. You'll see detailed logs like:

```
[Wodify] Fetch { path: '/v1/workouts', url: 'https://api.wodify.com/v1/workouts?startDate=2025-12-20&endDate=2025-12-24&programId=Bootcamp', params: {...} }
[Wodify] Response { path: '/v1/workouts', itemCount: 0 }
```

This will tell us:
- What URL was called
- What parameters were sent
- How many items were returned

## What I Fixed

### 1. Added Better Error Handling
- All API routes now return error details in `_meta.error`
- Console logging shows exact requests/responses
- No more silent failures

### 2. Added Metadata to Responses
Every response now includes:
```json
{
  "items": [...],
  "_meta": {
    "source": "wodify",
    "params": { "startDate": "...", "programId": "..." },
    "count": 5,
    "error": "..." // if error occurred
  }
}
```

### 3. Created Comprehensive Test Page
The test page at `/wodify-test.html` tests:
- ✅ All endpoints
- ✅ Different parameter combinations
- ✅ Your specific failing queries
- ✅ Shows duration and status codes

## Debugging Your Issues

### Issue 1: Workouts with Bootcamp programId
**Query:** `/api/wodify/workouts?startDate=2025-12-20&endDate=2025-12-24&programId=Bootcamp`

**Possible causes:**
1. Wodify may expect a numeric ID (e.g., `93798`) instead of name (`Bootcamp`)
2. The program name might be case-sensitive or have different spelling
3. There may be no workouts posted for that date range

**The test page will show:**
- Test with program name: `programId=Bootcamp`
- Test with program ID: `programId=93798`
- Which one returns results

### Issue 2: Classes sort not working
**Query:** `/api/wodify/classes?startDate=2025-12-25&endDate=2026-01-01&sort=desc_start_date_time&programId=93798`

**Possible causes:**
1. Wodify API might not support `desc_start_date_time` format
2. May need to use `sort=-start_date_time` or different format
3. programId filtering might not work as expected

**The test page will show:**
- Test with ascending sort: `sort=start_date_time`
- Test with descending sort: `sort=desc_start_date_time`
- Whether results are actually sorted correctly

## Next Steps

1. **Run the test page** and review results
2. **Check terminal logs** for the exact Wodify API calls
3. **Share the results** - tell me:
   - Which tests show "⚠️ Empty Result"
   - What the console logs say about those requests
   - Whether there are any error messages

4. **I'll fix** based on what we learn:
   - If programId needs different format
   - If sort parameter needs adjustment
   - If date formats are wrong
   - If we need to use different endpoints

## Alternative: View IDs Page

If test page reveals the issues, you can use the cleaner ID viewer:
**http://localhost:3000/wodify-ids.html**

This shows all your IDs in a nice formatted view (once we confirm endpoints work).

## What to Look For

In the test results, check:

1. **Program IDs** - Are they numeric (93798) or strings ("Bootcamp")?
2. **Empty workouts** - Do ANY workout queries return results?
3. **Classes filtering** - Do unfiltered classes work but filtered ones don't?
4. **Error messages** - Any 400/404/500 errors in the responses?

Once you run the tests and check the logs, we'll know exactly what needs to be fixed!
