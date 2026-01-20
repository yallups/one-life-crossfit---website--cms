/**
 * Script to fetch all Wodify identifiers (programs, coaches, locations, etc.)
 * Run with: npx tsx apps/web/scripts/fetch-wodify-ids.ts
 */

import {
  getWodifyClasses,
  getWodifyCoaches,
  getWodifyLocations,
} from "../src/lib/wodify";

async function main() {
  console.log("🔍 Fetching Wodify identifiers...\n");

  try {
    // Fetch locations
    console.log("📍 Locations:");
    const { items: locations } = await getWodifyLocations();
    locations.forEach((loc) => {
      console.log(`  - ID: ${loc.id}`);
      console.log(`    Name: ${loc.name || loc.locationName}`);
      console.log(
        `    Address: ${loc.formatted_address || loc.street_address_1}`,
      );
      console.log("");
    });

    // Fetch coaches
    console.log("\n👥 Coaches:");
    const { items: coaches } = await getWodifyCoaches();
    coaches.forEach((coach) => {
      console.log(`  - ID: ${coach.id}`);
      console.log(`    Name: ${coach.first_name} ${coach.last_name}`);
      console.log(`    Programs: ${coach.programs || "N/A"}`);
      console.log(`    Services: ${coach.services || "N/A"}`);
      console.log("");
    });

    // Fetch classes to extract program IDs
    console.log("\n📅 Programs (extracted from classes):");
    const today = new Date();
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 30);
    const startDate = today.toISOString().split("T")[0] ?? "";
    const endDate = nextWeek.toISOString().split("T")[0] ?? "";

    const { items: classes } = await getWodifyClasses({
      startDate,
      endDate,
      page_size: 100,
    });

    // Extract unique programs
    const programs = new Map<string | number, string>();
    classes.forEach((cls) => {
      if (cls.program_id && cls.program_name) {
        programs.set(cls.program_id, cls.program_name);
      }
    });

    programs.forEach((name, id) => {
      console.log(`  - ID: ${id}`);
      console.log(`    Name: ${name}`);
      console.log("");
    });

    console.log("\n✅ Done!");
  } catch (error: any) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

main();
