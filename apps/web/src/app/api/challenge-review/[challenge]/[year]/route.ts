import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  computeChallengeReview,
  type ReviewParticipantMode,
  type ReviewRangeMode,
} from "@/lib/leaderboard/review";

export const dynamic = "force-dynamic";

function parseRangeMode(value: string | null): ReviewRangeMode {
  switch (value) {
    case "this_week":
    case "last_week":
    case "week":
    case "all":
    case "custom":
      return value;
    default:
      return "this_week";
  }
}

function parseParticipantMode(value: string | null): ReviewParticipantMode {
  return value === "eligible" ? "eligible" : "all";
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ challenge: string; year: string }> },
) {
  const params = await context.params;
  const year = Number(params.year);
  if (!Number.isFinite(year)) {
    return NextResponse.json({ error: "Invalid year" }, { status: 400 });
  }

  const search = req.nextUrl.searchParams;
  const rangeMode = parseRangeMode(search.get("rangeMode"));
  const weekParam = search.get("week");
  const week = weekParam ? Number(weekParam) : undefined;
  const division = search.get("division") || "all";
  const start = search.get("start") || undefined;
  const end = search.get("end") || undefined;
  const participantMode = parseParticipantMode(search.get("participants"));

  const review = await computeChallengeReview(
    params.challenge,
    year,
    division,
    {
      mode: rangeMode,
      week: Number.isFinite(week) ? week : undefined,
      start,
      end,
      participantMode,
    },
  );

  if (!review) {
    return NextResponse.json(
      { error: `Unknown challenge ${params.challenge}/${params.year}` },
      { status: 404 },
    );
  }

  return NextResponse.json(review, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
