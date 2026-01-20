import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { computeLeaderboard } from "@/lib/leaderboard/engine";
import { getChallengeConfig } from "@/lib/leaderboard/registry";

export const dynamic = "force-dynamic"; // disable static rendering

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ challenge: string; year: string }> },
) {
  const params = await context.params;
  const { searchParams } = new URL(req.url);
  const division = searchParams.get("division") || undefined;

  const yearNum = Number(params.year);
  const cfg = getChallengeConfig(params.challenge, yearNum);
  if (!cfg) {
    return NextResponse.json(
      { error: `Unknown challenge ${params.challenge}/${params.year}` },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const data = await computeLeaderboard(cfg, division || undefined);
    return NextResponse.json(data, {
      headers: {
        "Cache-Control":
          "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  } catch (e: unknown) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "Failed to compute leaderboard",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
