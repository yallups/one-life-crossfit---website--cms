import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { computeMemberDetail } from "@/lib/leaderboard/engine";
import { getChallengeConfig } from "@/lib/leaderboard/registry";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  context: {
    params: Promise<{ challenge: string; year: string; memberId: string }>;
  },
) {
  const params = await context.params;
  const yearNum = Number(params.year);
  const cfg = getChallengeConfig(params.challenge, yearNum);
  if (!cfg) {
    return NextResponse.json(
      { error: `Unknown challenge ${params.challenge}/${params.year}` },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const detail = await computeMemberDetail(cfg, params.memberId);
    if (!detail) {
      return NextResponse.json(
        { error: "Member not found for this challenge" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(detail, {
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
        error: e instanceof Error ? e.message : "Failed to load member detail",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
