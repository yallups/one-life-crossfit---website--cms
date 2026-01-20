/**
 * Integration tests for Wodify API endpoints
 * Run with: npx tsx apps/web/scripts/test-wodify-integration.ts
 */

import {
  getWodifyClasses,
  getWodifyCoaches,
  getWodifyFormattedWorkouts,
  getWodifyLocations,
  getWodifyPrograms,
  getWodifyServices,
  getWodifyWorkouts,
} from "../src/lib/wodify";

type TestStatus = "ok" | "empty" | "skipped" | "error";

interface TestResult {
  name: string;
  status: TestStatus;
  error?: string;
  data?: any;
  itemCount?: number;
  notes?: string[];
}

const results: TestResult[] = [];

function log(message: string, data?: any) {
  console.log(`\n${message}`);
  if (data) console.log(JSON.stringify(data, null, 2));
}

function logResult(result: TestResult) {
  const icon =
    result.status === "ok"
      ? "✅"
      : result.status === "empty"
        ? "⚠️"
        : result.status === "skipped"
          ? "⏭️"
          : "❌";
  console.log(`\n${icon} ${result.name}`);
  if (result.itemCount !== undefined) {
    console.log(`   Items: ${result.itemCount}`);
  }
  if (result.error) {
    console.log(`   Error: ${result.error}`);
  }
  if (result.notes?.length) {
    console.log(`   Notes: ${result.notes.join(" | ")}`);
  }
}

function dateKeyFromClass(item?: any): string | undefined {
  if (!item) return undefined;
  if (item.start_date_time) return String(item.start_date_time).slice(0, 10);
  if (item.start_date) return String(item.start_date).slice(0, 10);
  return undefined;
}

function dateKeyFromWorkout(item?: any): string | undefined {
  if (!item) return undefined;
  if (item.date) return String(item.date).slice(0, 10);
  return undefined;
}

async function runTest(
  name: string,
  testFn: () => Promise<any>,
  opts: {
    allowEmpty?: boolean;
    skip?: boolean;
    skipReason?: string;
    notes?: string[];
  } = {},
): Promise<TestResult> {
  if (opts.skip) {
    const result: TestResult = {
      name,
      status: "skipped",
      notes: opts.skipReason ? [opts.skipReason] : undefined,
    };
    logResult(result);
    results.push(result);
    return result;
  }

  try {
    log(`Running: ${name}`);
    const data = await testFn();
    const itemCount = data?.items?.length ?? 0;
    const status: TestStatus =
      itemCount > 0 ? "ok" : (opts.allowEmpty ?? true) ? "empty" : "error";

    const result: TestResult = {
      name,
      status,
      itemCount,
      data,
      notes: opts.notes,
    };

    if (status === "error") result.error = "No items returned";

    logResult(result);
    results.push(result);
    return result;
  } catch (error: any) {
    const result: TestResult = {
      name,
      status: "error",
      error: error.message,
    };
    logResult(result);
    results.push(result);
    return result;
  }
}

async function main() {
  console.log("🧪 Starting Wodify API Integration Tests\n");
  console.log("=".repeat(60));

  // Test 1: Locations
  const locationsResult = await runTest("Locations - Fetch all", async () => {
    return await getWodifyLocations({ page_size: 100 });
  });
  const locationSample = locationsResult?.data?.items?.[0];
  const locationId = locationSample?.id ? String(locationSample.id) : undefined;

  // Test 2: Programs
  const programsResult = await runTest("Programs - Fetch all", async () => {
    return await getWodifyPrograms({ page_size: 100 });
  });
  const programSample = programsResult?.data?.items?.[0];
  const programId = programSample?.id ? String(programSample.id) : undefined;
  const programName = programSample?.name
    ? String(programSample.name)
    : undefined;

  // Test 3: Coaches
  await runTest("Coaches - Fetch all", async () => {
    return await getWodifyCoaches();
  });

  // Test 4: Classes - Base list
  const classesBase = await runTest(
    "Classes - Base list (page_size 100)",
    async () => {
      return await getWodifyClasses({
        page_size: 100,
        sort: "desc_start_time",
      });
    },
    {
      notes: [
        "Date/program filters are applied locally when the API response is broad.",
      ],
    },
  );

  const classSample = classesBase?.data?.items?.[0];
  const classDateKey = dateKeyFromClass(classSample);

  // Test 5: Classes - Date filter (client-side)
  await runTest(
    `Classes - Filter by date ${classDateKey ?? "(none found)"}`,
    async () => {
      return await getWodifyClasses({
        startDate: classDateKey ?? "",
        endDate: classDateKey ?? "",
        page_size: 100,
        sort: "desc_start_time",
      });
    },
    {
      skip: !classDateKey,
      skipReason: "No class date available to test date filtering",
      notes: ["Filters applied based on returned data when needed."],
    },
  );

  // Test 6: Classes - Program filter (client-side)
  await runTest(
    `Classes - Filter by program ID ${programId ?? "(none found)"}`,
    async () => {
      return await getWodifyClasses({
        programId: programId ?? "",
        page_size: 100,
        sort: "desc_start_time",
      });
    },
    {
      skip: !programId,
      skipReason: "No program ID available to test filtering",
      notes: ["Filters applied based on returned data when needed."],
    },
  );

  // Test 7: Classes - Location filter (client-side)
  await runTest(
    `Classes - Filter by location ID ${locationId ?? "(none found)"}`,
    async () => {
      return await getWodifyClasses({
        locationId: locationId ?? "",
        page_size: 100,
        sort: "desc_start_time",
      });
    },
    {
      skip: !locationId,
      skipReason: "No location ID available to test filtering",
      notes: ["Filters applied based on returned data when needed."],
    },
  );

  // Test 8: Workouts - Base list (docs: sort + paging only)
  const workoutsBase = await runTest(
    "Workouts - Base list (page_size 100)",
    async () => {
      return await getWodifyWorkouts({ page_size: 100, sort: "desc_date" });
    },
    {
      notes: [
        "Date/program filters are applied locally (not supported by API)",
      ],
    },
  );

  const workoutSample = workoutsBase?.data?.items?.[0];
  const workoutDateKey = dateKeyFromWorkout(workoutSample);

  // Test 9: Workouts - Date filter (client-side)
  await runTest(
    `Workouts - Filter by date ${workoutDateKey ?? "(none found)"}`,
    async () => {
      return await getWodifyWorkouts({
        startDate: workoutDateKey ?? "",
        endDate: workoutDateKey ?? "",
        page_size: 100,
        sort: "desc_date",
      });
    },
    {
      skip: !workoutDateKey,
      skipReason: "No workout date available to test date filtering",
      notes: ["Client-side filter based on returned data"],
    },
  );

  // Test 10: Workouts - Program filter (client-side)
  await runTest(
    `Workouts - Filter by program ID ${programId ?? "(none found)"}`,
    async () => {
      return await getWodifyWorkouts({
        programId: programId ?? "",
        page_size: 100,
        sort: "desc_date",
      });
    },
    {
      skip: !programId,
      skipReason: "No program ID available to test filtering",
      notes: ["Client-side filter based on returned data"],
    },
  );

  // Test 11: Workouts - Program name (client-side)
  await runTest(
    `Workouts - Filter by program name ${programName ?? "(none found)"}`,
    async () => {
      return await getWodifyWorkouts({
        programId: programName ?? "",
        page_size: 100,
        sort: "desc_date",
      });
    },
    {
      skip: !programName,
      skipReason: "No program name available to test filtering",
      notes: ["Client-side filter based on returned data"],
    },
  );

  // Test 12: Formatted Workouts (undocumented)
  await runTest(
    `Workouts - Formatted (program ${programId ?? "(none found)"})`,
    async () => {
      const today = new Date().toISOString().slice(0, 10);
      return await getWodifyFormattedWorkouts({
        startDate: today,
        endDate: today,
        programId: programId ?? "",
      });
    },
    {
      skip: !programId,
      skipReason: "No program ID available to test formatted workouts",
      notes: ["Formatted endpoint not present in registry; may return empty"],
    },
  );

  // Test 14: Services
  const servicesResult = await runTest("Services - Fetch all", async () => {
    return await getWodifyServices({ page_size: 100 });
  });
  const serviceSample = servicesResult?.data?.items?.[0];
  const serviceId = serviceSample?.id ? String(serviceSample.id) : undefined;

  // Print summary
  console.log("\n\n" + "=".repeat(60));
  console.log("📊 TEST SUMMARY\n");

  const passed = results.filter((r) => r.status === "ok").length;
  const empty = results.filter((r) => r.status === "empty").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const failed = results.filter((r) => r.status === "error").length;

  console.log(`Total Tests: ${results.length}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`⚠️  Empty: ${empty}`);
  console.log(`⏭️  Skipped: ${skipped}`);
  console.log(`❌ Failed: ${failed}`);

  if (failed > 0) {
    console.log("\n❌ FAILED TESTS:");
    results
      .filter((r) => r.status === "error")
      .forEach((r) => {
        console.log(`   - ${r.name}: ${r.error}`);
      });
  }

  console.log("\n" + "=".repeat(60));

  // Diagnose common issues
  console.log("\n🔍 DIAGNOSIS:\n");

  const classesTests = results.filter((r) => r.name.startsWith("Classes"));
  const workoutsTests = results.filter((r) => r.name.startsWith("Workouts"));

  const anyClassesWork = classesTests.some((r) => r.status === "ok");
  const anyWorkoutsWork = workoutsTests.some((r) => r.status === "ok");

  if (!anyClassesWork) {
    console.log(
      "⚠️  NO CLASSES TESTS PASSED - Classes endpoint may be broken or require different parameters",
    );
  }

  if (!anyWorkoutsWork) {
    console.log(
      "⚠️  NO WORKOUTS TESTS PASSED - Workouts endpoint may be broken or require different parameters",
    );
  }

  console.log("\n✅ Tests completed!\n");
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
