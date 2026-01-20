import "server-only";

import { type NextRequest, NextResponse } from "next/server";
import {
  getWodifyClasses,
  getWodifyCoaches,
  getWodifyFormattedWorkouts,
  getWodifyLocations,
  getWodifyPrograms,
  getWodifyServices,
  getWodifyWorkouts,
} from "@/lib/wodify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TestStatus = "ok" | "empty" | "skipped" | "error";

interface TestResult {
  name: string;
  status: TestStatus;
  error?: string;
  itemCount?: number;
  sampleItem?: unknown;
  notes?: string[];
}

function getId(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  if (!("id" in value)) return undefined;
  const idValue = (value as { id?: string | number }).id;
  return idValue !== undefined ? String(idValue) : undefined;
}

function getName(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  if (!("name" in value)) return undefined;
  const nameValue = (value as { name?: string }).name;
  return nameValue ? String(nameValue) : undefined;
}

function dateKeyFromClass(item?: {
  start_date_time?: string;
  start_date?: string;
}): string | undefined {
  if (!item) return undefined;
  if (item.start_date_time) return String(item.start_date_time).slice(0, 10);
  if (item.start_date) return String(item.start_date).slice(0, 10);
  return undefined;
}

function dateKeyFromWorkout(item?: { date?: string }): string | undefined {
  if (!item) return undefined;
  if (item.date) return String(item.date).slice(0, 10);
  return undefined;
}

async function runTest(
  name: string,
  testFn: () => Promise<unknown>,
  opts: {
    allowEmpty?: boolean;
    skip?: boolean;
    skipReason?: string;
    notes?: string[];
  } = {},
): Promise<TestResult> {
  if (opts.skip) {
    return {
      name,
      status: "skipped",
      notes: opts.skipReason ? [opts.skipReason] : undefined,
    };
  }

  try {
    const data = await testFn();
    const items = (data as { items?: unknown[] })?.items ?? [];
    const itemCount = items.length ?? 0;
    const status: TestStatus =
      itemCount > 0 ? "ok" : (opts.allowEmpty ?? true) ? "empty" : "error";

    return {
      name,
      status,
      itemCount,
      sampleItem: items[0],
      notes: opts.notes,
      error: status === "error" ? "No items returned" : undefined,
    };
  } catch (error: unknown) {
    return {
      name,
      status: "error",
      error: error instanceof Error ? error.message : "Unknown error",
      itemCount: 0,
    };
  }
}

export async function GET(_req: NextRequest) {
  const results: TestResult[] = [];

  // Test 1: Locations
  const locationsResult = await runTest("Locations - Fetch all", async () => {
    return await getWodifyLocations({ page_size: 100 });
  });
  results.push(locationsResult);

  const locationSample = locationsResult?.sampleItem;
  const locationId = getId(locationSample);

  // Test 2: Programs
  const programsResult = await runTest("Programs - Fetch all", async () => {
    return await getWodifyPrograms({ page_size: 100 });
  });
  results.push(programsResult);

  const programSample = programsResult?.sampleItem;
  const programId = getId(programSample);
  const programName = getName(programSample);

  // Test 3: Coaches
  results.push(
    await runTest("Coaches - Fetch all", async () => {
      return await getWodifyCoaches();
    }),
  );

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
  results.push(classesBase);

  const classSample = classesBase?.sampleItem as
    | { start_date_time?: string; start_date?: string }
    | undefined;
  const classDateKey = dateKeyFromClass(classSample);

  // Test 5: Classes - Date filter (client-side)
  results.push(
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
    ),
  );

  // Test 6: Classes - Program filter (client-side)
  results.push(
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
    ),
  );

  // Test 7: Classes - Location filter (client-side)
  results.push(
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
    ),
  );

  // Test 8: Workouts - Base list
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
  results.push(workoutsBase);

  const workoutSample = workoutsBase?.sampleItem as
    | { date?: string }
    | undefined;
  const workoutDateKey = dateKeyFromWorkout(workoutSample);

  // Test 9: Workouts - Date filter (client-side)
  results.push(
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
    ),
  );

  // Test 10: Workouts - Program filter (client-side)
  results.push(
    await runTest(
      `Workouts - Program ID ${programId ?? "(none found)"}`,
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
    ),
  );

  // Test 11: Workouts - Program name (client-side)
  results.push(
    await runTest(
      `Workouts - Program name ${programName ?? "(none found)"}`,
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
    ),
  );

  // Test 12: Formatted Workouts (undocumented)
  results.push(
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
    ),
  );

  // Test 13: Services
  const servicesResult = await runTest("Services - Fetch all", async () => {
    return await getWodifyServices({ page_size: 100 });
  });
  results.push(servicesResult);

  // Calculate summary
  const passed = results.filter((r) => r.status === "ok").length;
  const empty = results.filter((r) => r.status === "empty").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const failed = results.filter((r) => r.status === "error").length;

  const summary = {
    total: results.length,
    passed,
    empty,
    skipped,
    failed,
    passRate: `${Math.round((passed / results.length) * 100)}%`,
  };

  // Diagnose issues
  const diagnosis: string[] = [];

  const classesTests = results.filter((r) => r.name.startsWith("Classes"));
  const workoutsTests = results.filter((r) => r.name.startsWith("Workouts"));

  if (!classesTests.some((r) => r.status === "ok")) {
    diagnosis.push("❌ NO CLASSES WORKING - Classes endpoint may be broken");
  }

  if (!workoutsTests.some((r) => r.status === "ok")) {
    diagnosis.push("❌ NO WORKOUTS WORKING - Workouts endpoint may be broken");
  }

  return NextResponse.json({
    summary,
    diagnosis,
    results,
    timestamp: new Date().toISOString(),
  });
}
