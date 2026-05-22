import { cn } from "@workspace/ui/lib/utils";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";
import { computeLeaderboard } from "@/lib/leaderboard/engine";
import { getChallengeConfig } from "@/lib/leaderboard/registry";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: {
  params: Promise<{ challenge: string; year: string }>;
}): Promise<Metadata> {
  const { challenge, year } = await props.params;
  const yearNum = Number(year);
  const cfg = getChallengeConfig(challenge, yearNum);
  if (!cfg) return {};

  // Resolve origin robustly: env → headers → fallback
  function safeOriginFromEnv() {
    const envUrl = process.env.NEXT_PUBLIC_SITE_URL;
    if (envUrl) {
      try {
        return new URL(envUrl).origin;
      } catch {
        /* ignore */
      }
    }
    return undefined;
  }
  let origin = safeOriginFromEnv();
  if (!origin) {
    try {
      const hs = await headers();
      const host =
        hs.get("x-forwarded-host") || hs.get("host") || "onelifecrossfit.com";
      const proto =
        hs.get("x-forwarded-proto") ||
        (host.includes("localhost") ? "http" : "https");
      origin = `${proto}://${host}`;
    } catch {
      origin = "https://onelifecrossfit.com";
    }
  }

  const division = (cfg.divisions.keys?.[0] || "open").toString();
  const canonical = `${origin}/leaderboard/${cfg.slug}/${cfg.year}`;
  const ogImage = `${origin}/leaderboard/${cfg.slug}/${cfg.year}/image?division=${encodeURIComponent(division)}&width=1200&height=630`;
  const title = `${cfg.title} — ${cfg.year} Leaderboard`;
  const description = `Live leaderboard for ${cfg.title} ${cfg.year}. View podium and rankings by division.`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: "One Life CrossFit",
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export default async function LeaderboardPage(props: {
  params: Promise<{ challenge: string; year: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const { challenge, year } = await props.params;
  const yearNum = Number(year);
  const cfg = getChallengeConfig(challenge, yearNum);
  if (!cfg) return notFound();
  const challengeCfg = cfg; // narrow for TS

  const divisions = challengeCfg.divisions.keys.length
    ? challengeCfg.divisions.keys
    : ["open"];
  const results = await Promise.all(
    divisions.map(async (division) => ({
      division,
      data: await computeLeaderboard(challengeCfg, division),
    })),
  );

  const bgStyle = {
    backgroundColor: challengeCfg.theme?.backgroundColor,
    backgroundImage: challengeCfg.theme?.backgroundImageUrl
      ? `url(${challengeCfg.theme.backgroundImageUrl})`
      : undefined,
  };

  return (
    <main
      className={cn(
        "mx-auto max-w-5xl bg-cover bg-center px-4 py-10 text-foreground",
        challengeCfg.theme?.mode,
      )}
      style={bgStyle}
    >
      <div className="mb-6 flex items-center justify-between">
        {challengeCfg.theme?.logoUrl ? (
          <img
            src={challengeCfg.theme.logoUrl}
            alt={challengeCfg.title}
            style={{ width: 200, display: "flex" }}
          />
        ) : (
          <h1 className="text-3xl font-extrabold tracking-tight">
            {challengeCfg.title} — {year}
          </h1>
        )}
        <span className="text-sm text-muted-foreground">
          Division(s): {divisions.join(", ")}
        </span>
      </div>

      {results.map(({ division, data }) => (
        <section key={division} className="mb-12">
          <div className="mb-3 flex items-end justify-between">
            <h2 className="text-xl font-bold">
              {challengeCfg.title} — {division}
            </h2>
          </div>
          {/* Podium layout for Top 3 */}
          {(() => {
            const rows = data.rows || [];
            const top3 = rows.slice(0, 3);
            const rest = rows.slice(3);
            return (
              <div className="mt-2">
                <div className="grid grid-cols-1 sm:grid-cols-3 items-end justify-items-center gap-3">
                  {/* 2nd place (left) */}
                  <div className="w-full order-2 sm:order-none">
                    {top3[1] ? (
                      <Link
                        href={`/leaderboard/${challenge}/${year}/member/${encodeURIComponent(top3[1].member_id)}`}
                        className="group block"
                      >
                        <div className="mx-auto flex h-40 w-full max-w-xs flex-col items-center justify-center rounded-md border border-border bg-card p-3 text-center transition-colors group-hover:bg-foreground/25 group-hover:border-foreground/30">
                          <div className="text-3xl">🥈</div>
                          <div className="mt-1 line-clamp-1 text-sm font-medium">
                            {top3[1].member_name}
                          </div>
                          <div className="mt-1 text-2xl font-extrabold tabular-nums">
                            {top3[1].total.toFixed(2)}
                          </div>
                        </div>
                      </Link>
                    ) : (
                      <div />
                    )}
                  </div>

                  {/* 1st place (center, tallest) */}
                  <div className="w-full order-1 sm:order-none">
                    {top3[0] ? (
                      <Link
                        href={`/leaderboard/${challenge}/${year}/member/${encodeURIComponent(top3[0].member_id)}`}
                        className="group block"
                      >
                        <div className="mx-auto flex h-52 w-full max-w-xs flex-col items-center justify-center rounded-md border border-border bg-card p-4 text-center shadow-md transition-colors group-hover:bg-foreground/25 group-hover:border-foreground/30">
                          <div className="text-4xl">🥇</div>
                          <div className="mt-1 line-clamp-1 text-base font-semibold">
                            {top3[0].member_name}
                          </div>
                          <div className="mt-1 text-3xl font-extrabold tabular-nums">
                            {top3[0].total.toFixed(2)}
                          </div>
                        </div>
                      </Link>
                    ) : (
                      <div />
                    )}
                  </div>

                  {/* 3rd place (right) */}
                  <div className="w-full order-3 sm:order-none">
                    {top3[2] ? (
                      <Link
                        href={`/leaderboard/${challenge}/${year}/member/${encodeURIComponent(top3[2].member_id)}`}
                        className="group block"
                      >
                        <div className="mx-auto flex h-32 w-full max-w-xs flex-col items-center justify-center rounded-md border border-border bg-card p-3 text-center transition-colors group-hover:bg-foreground/25 group-hover:border-foreground/30">
                          <div className="text-3xl">🥉</div>
                          <div className="mt-1 line-clamp-1 text-sm font-medium">
                            {top3[2].member_name}
                          </div>
                          <div className="mt-1 text-2xl font-extrabold tabular-nums">
                            {top3[2].total.toFixed(2)}
                          </div>
                        </div>
                      </Link>
                    ) : (
                      <div />
                    )}
                  </div>
                </div>

                {/* Rest of the leaderboard in 2 columns on desktop (fill left column first, then right) */}
                {(() => {
                  const half = Math.ceil(rest.length / 2);
                  const left = rest.slice(0, half);
                  const right = rest.slice(half);
                  const Card = ({ r }: { r: (typeof rest)[number] }) => (
                    <Link
                      key={r.member_id}
                      href={`/leaderboard/${challenge}/${year}/member/${encodeURIComponent(r.member_id)}`}
                      className="group block"
                    >
                      <div className="flex items-center justify-between rounded-md border border-border bg-card p-3 transition-colors group-hover:bg-foreground/25 group-hover:border-foreground/30">
                        <div className="flex items-center gap-3 overflow-hidden">
                          <div className="min-w-10 text-right text-sm font-semibold tabular-nums">
                            {r.rank}
                          </div>
                          <div className="line-clamp-1 text-sm">
                            {r.member_name}
                          </div>
                        </div>
                        <div className="text-right text-xl font-extrabold tabular-nums">
                          {r.total.toFixed(2)}
                        </div>
                      </div>
                    </Link>
                  );
                  return (
                    <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-3">
                        {left.map((r) => (
                          <Card key={r.member_id} r={r} />
                        ))}
                      </div>
                      <div className="space-y-3">
                        {right.map((r) => (
                          <Card key={r.member_id} r={r} />
                        ))}
                      </div>
                    </div>
                  );
                })()}

                <p className="mt-3 text-xs text-muted-foreground">
                  Updated:{" "}
                  {new Date(data.updatedAt).toLocaleString("en-US", {
                    timeZone: challengeCfg.timezone,
                  })}
                </p>
              </div>
            );
          })()}
        </section>
      ))}
    </main>
  );
}
