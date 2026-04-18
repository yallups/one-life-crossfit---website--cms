import Link from "next/link";
import { computeChallengeReview } from "@/lib/leaderboard/review";
import ReviewClient from "./review-client";

export default async function Page({ params, searchParams }: any) {
  const p = await params;
  const sp = (await searchParams) || {};

  const rangeMode = typeof sp.rangeMode === "string" ? sp.rangeMode : "this_week";
  const week = typeof sp.week === "string" ? Number(sp.week) : undefined;
  const division = typeof sp.division === "string" ? sp.division : "all";

  const data = await computeChallengeReview(p.challenge, Number(p.year), division, {
    mode: rangeMode,
    week,
  });

  if (!data) return <div className="p-6">Challenge not found.</div>;

  const basePath = `/challenge-review/${p.challenge}/${p.year}`;

  return (
    <div className="p-6 space-y-6 bg-black text-white min-h-screen">
      <h1 className="text-3xl font-bold">{data.challenge.title} Review</h1>

      <div className="flex gap-2 flex-wrap">
        {["this_week", "last_week", "all"].map((mode) => (
          <Link key={mode} href={`${basePath}?rangeMode=${mode}&division=${division}`} className="px-3 py-1 border">
            {mode}
          </Link>
        ))}
        {data.range.weekOptions.map((w) => (
          <Link key={w.week} href={`${basePath}?rangeMode=week&week=${w.week}&division=${division}`} className="px-3 py-1 border">
            W{w.week}
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="border p-3">Compliance: {Math.round(data.summary.averageComplianceRate * 100)}%</div>
        <div className="border p-3">Weight Loss: {data.summary.totalWeightLoss} lb</div>
        <div className="border p-3">Fat Loss: {data.summary.totalFatMassLoss} lb</div>
        <div className="border p-3">Participants: {data.summary.totalParticipants}</div>
      </div>

      <ReviewClient data={data} />
    </div>
  );
}
