import { notFound } from "next/navigation";
import { computeChallengeReview, type ReviewRangeMode } from "@/lib/leaderboard/review";
import { getChallengeConfig } from "@/lib/leaderboard/registry";
import ReviewClient from "./review-client";

type ChallengeReviewPageProps = {
  params: Promise<{ challenge: string; year: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function parseRangeMode(value: string | string[] | undefined): ReviewRangeMode {
  const candidate = Array.isArray(value) ? value[0] : value;
  switch (candidate) {
    case "this_week":
    case "last_week":
    case "week":
    case "all":
    case "custom":
      return candidate;
    default:
      return "this_week";
  }
}

function parseString(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ChallengeReviewPage({
  params,
  searchParams,
}: ChallengeReviewPageProps) {
  const { challenge, year } = await params;
  const yearNum = Number(year);
  const cfg = getChallengeConfig(challenge, yearNum);
  if (!cfg) notFound();

  const search = (await searchParams) ?? {};
  const rangeMode = parseRangeMode(search.rangeMode);
  const division = parseString(search.division) ?? "all";
  const weekValue = Number(parseString(search.week));
  const start = parseString(search.start);
  const end = parseString(search.end);

  const data = await computeChallengeReview(challenge, yearNum, division, {
    mode: rangeMode,
    week: Number.isFinite(weekValue) ? weekValue : undefined,
    start,
    end,
  });

  if (!data) notFound();

  return (
    <ReviewClient
      basePath={`/challenge-review/${challenge}/${year}`}
      data={data}
      divisions={cfg.divisions.keys}
    />
  );
}
