import Link from "next/link";
import { computeChallengeReview } from "@/lib/leaderboard/review";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ challenge: string; year: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const p = await params;
  const sp = (await searchParams) || {};

  const rangeMode = typeof sp.rangeMode === "string" ? sp.rangeMode : "this_week";
  const week = typeof sp.week === "string" ? Number(sp.week) : undefined;
  const division = typeof sp.division === "string" ? sp.division : "all";

  const data = await computeChallengeReview(p.challenge, Number(p.year), division, {
    mode: rangeMode as any,
    week,
  });

  if (!data) {
    return <div className="p-6">Challenge not found.</div>;
  }

  const basePath = `/challenge-review/${p.challenge}/${p.year}`;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">{data.challenge.title} Review</h1>

      <div className="flex gap-2 flex-wrap">
        {["this_week", "last_week", "all"].map((mode) => (
          <Link
            key={mode}
            href={`${basePath}?rangeMode=${mode}&division=${division}`}
            className="px-3 py-1 border rounded"
          >
            {mode}
          </Link>
        ))}
        {data.range.weekOptions.map((w) => (
          <Link
            key={w.week}
            href={`${basePath}?rangeMode=week&week=${w.week}&division=${division}`}
            className="px-3 py-1 border rounded"
          >
            W{w.week}
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="border p-3">Avg Compliance: {Math.round(data.summary.averageComplianceRate * 100)}%</div>
        <div className="border p-3">Total Habit Points: {data.summary.totalHabitPoints}</div>
        <div className="border p-3">Total Weight Loss: {data.summary.totalWeightLoss} lb</div>
        <div className="border p-3">Total Fat Loss: {data.summary.totalFatMassLoss} lb</div>
      </div>

      <div>
        <h2 className="font-semibold">Top Impact</h2>
        <ul>
          {data.biggestImpact.topOverallImpact.map((m) => (
            <li key={m.memberId}>
              {m.memberName} — Score: {m.totalScoreToDate}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h2 className="font-semibold">Members</h2>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th>Name</th>
              <th>Compliance</th>
              <th>Score</th>
              <th>BF Δ</th>
              <th>Weight Δ</th>
            </tr>
          </thead>
          <tbody>
            {data.members.map((m) => (
              <tr key={m.memberId} className="border-t">
                <td>{m.memberName}</td>
                <td>{Math.round(m.complianceRate * 100)}%</td>
                <td>{m.totalScoreToDate}</td>
                <td>{m.bodyFatPctDelta ?? "-"}</td>
                <td>{m.weightDelta ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="border p-4">
        <h2 className="font-semibold">Weekly Script</h2>
        <p>
          This week, average compliance was {Math.round(data.summary.averageComplianceRate * 100)}%.
          The group lost {data.summary.totalWeightLoss} lb total and reduced body fat significantly.
        </p>
      </div>
    </div>
  );
}
