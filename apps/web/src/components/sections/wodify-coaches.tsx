"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Badge } from "@workspace/ui/components/badge";
import { cn } from "@workspace/ui/lib/utils";
import { RichText } from "@/components/elements/rich-text";
import { PagebuilderType } from "@/types";

// Basic shape based on WodifyCoach schema
export type WodifyCoach = {
  id: string | number;
  first_name?: string | null;
  last_name?: string | null;
  picture_url?: string | null;
  title?: string | null;
  biography?: string | null;
  link_1?: string | null;
  link_2?: string | null;
  link_3?: string | null;
  link_4?: string | null;
  link_5?: string | null;
  locations?: string | null; // comma-separated
  programs?: string | null; // comma-separated
  services?: string | null; // comma-separated
};

export type WodifyCoachesBlockProps = PagebuilderType<"wodifyCoaches"> & {
  className?: string;
  preloaded?: WodifyCoach[];
};

function splitCSV(value?: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function useCoaches(filters?: {
  locations?: string[];
  programs?: string[];
  services?: string[];
}) {
  const [data, setData] = useState<WodifyCoach[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Construct query params - passthrough to the API even if API ignores some
  const search = useMemo(() => {
    const u = new URLSearchParams();
    if (filters?.locations?.length)
      u.set("locations", filters.locations.join(","));
    if (filters?.programs?.length) u.set("programs", filters.programs.join(","));
    if (filters?.services?.length) u.set("services", filters.services.join(","));
    return u.toString();
  }, [filters]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const url = "/api/wodify/coaches" + (search ? `?${search}` : "");
    fetch(url)
      .then(async (r) => {
        if (!r.ok) throw new Error(`Failed to load coaches (${r.status})`);
        return r.json();
      })
      .then((json) => {
        if (cancelled) return;
        const raw: WodifyCoach[] = (json?.items ?? []) as WodifyCoach[];
        // Client-side filter to ensure block-level filters always work
        const locs = (filters?.locations ?? []).map((s) => s.toLowerCase());
        const progs = (filters?.programs ?? []).map((s) => s.toLowerCase());
        const svcs = (filters?.services ?? []).map((s) => s.toLowerCase());

        const filtered = raw.filter((c) => {
          const cLocs = splitCSV(c.locations).map((s) => s.toLowerCase());
          const cProgs = splitCSV(c.programs).map((s) => s.toLowerCase());
          const cSvcs = splitCSV(c.services).map((s) => s.toLowerCase());

          const matchCategory = (selected: string[], candidate: string[]) =>
            selected.length === 0 || selected.some((s) => candidate.includes(s));

          return (
            matchCategory(locs, cLocs) &&
            matchCategory(progs, cProgs) &&
            matchCategory(svcs, cSvcs)
          );
        });

        setData(filtered);
      })
      .catch((e: any) => {
        if (cancelled) return;
        setError(e?.message || "Failed to load coaches");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [search, filters?.locations, filters?.programs, filters?.services]);

  return { data, error, loading };
}

function CoachCard({ coach, showLinks }: { coach: WodifyCoach; showLinks: boolean }) {
  const [expanded, setExpanded] = useState(false);

  const fullName = [coach.first_name, coach.last_name].filter(Boolean).join(" ");
  const links = [coach.link_1, coach.link_2, coach.link_3, coach.link_4, coach.link_5].filter(Boolean) as string[];

  const bio = coach.biography || "";
  const MAX = 260; // peek length
  const isLong = bio.length > MAX;
  const displayBio = expanded || !isLong ? bio : bio.slice(0, MAX) + "…";

  // const locations = splitCSV(coach.locations);
  const programs = splitCSV(coach.programs);
  const services = splitCSV(coach.services);

  return (
    <article className="overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-sm">
      <div className="flex gap-4 p-5">
        <div className="relative aspect-square h-28 w-28 shrink-0 overflow-hidden rounded-xl bg-muted">
          {coach.picture_url ? (
            <Image src={coach.picture_url} alt={fullName} fill sizes="112px" className="object-cover" />
          ) : (
            <div className="grid h-full w-full place-items-center text-muted-foreground">
              <span className="text-2xl">👤</span>
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-xl font-semibold leading-tight">{fullName}</h3>
          {coach.title && <p className="text-muted-foreground">{coach.title}</p>}
          {/* Meta chips */}
          <div className="mt-2 flex flex-wrap gap-2">
            {/*{locations.map((l) => (*/}
            {/*  <Badge key={"loc-" + l} variant="secondary" className="bg-muted text-xs">*/}
            {/*    {l}*/}
            {/*  </Badge>*/}
            {/*))}*/}
            {programs.map((p) => (
              <Badge key={"prog-" + p} variant="secondary" className="bg-muted text-xs">
                {p}
              </Badge>
            ))}
            {services.map((s) => (
              <Badge key={"svc-" + s} variant="secondary" className="bg-muted text-xs">
                {s}
              </Badge>
            ))}
          </div>
        </div>
      </div>
      {/* Biography */}
      {bio && (
        <div className="border-t p-5">
          {/*<RichText richText={displayBio} />*/}
          <p className="text-sm leading-relaxed text-muted-foreground"
             dangerouslySetInnerHTML={{ __html: displayBio }} />
          {isLong && (
            <button
              type="button"
              className="mt-2 text-sm font-medium text-primary hover:underline"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
            >
              {expanded ? "Show less" : "Read more"}
            </button>
          )}
        </div>
      )}

      {/* Links */}
      {showLinks && links.length > 0 && (
        <div className="border-t p-5">
          <div className="flex flex-wrap gap-3">
            {links.map((href, i) => (
              <a
                key={href + i}
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                href={href}
                target="_blank"
                rel="noopener noreferrer"
              >
                Link {i + 1}
              </a>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

export function WodifyCoaches({
  eyebrow,
  title,
  richText,
  filters,
  layout = "cards",
  showLinks = true,
  itemsPerRow = 3,
  className,
  preloaded,
}: WodifyCoachesBlockProps) {
  const { data, error, loading } = preloaded !== undefined
    ? { data: preloaded, error: null as string | null, loading: false }
    : useCoaches(filters as any);

  const gridCols = useMemo(() => {
    const cols = Math.max(1, Math.min(4, Number(itemsPerRow) || 3));
    return `grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-${cols}`;
  }, [itemsPerRow]);

  return (
    <section className={cn("my-8 md:my-16", className)}>
      <div className="container mx-auto px-4 md:px-6">
        <div className="mx-auto max-w-3xl space-y-4 text-center">
          {eyebrow && (
            <Badge className="bg-zinc-200 dark:text-black" variant="secondary">
              {eyebrow}
            </Badge>
          )}
          {title && (
            <h2 className="text-balance text-3xl font-semibold md:text-5xl">{title}</h2>
          )}
          {richText && (
            <div className="text-lg text-muted-foreground">
              <RichText className="text-balance" richText={richText as any} />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="mt-8">
          {loading && (
            <div className="text-center text-muted-foreground">Loading coaches…</div>
          )}
          {error && (
            <div className="text-center text-destructive">{error}</div>
          )}
          {!loading && !error && (!data || data.length === 0) && (
            <div className="text-center text-muted-foreground">No coaches found.</div>
          )}

          {!loading && !error && data && data.length > 0 && (
            layout === "list" ? (
              <div className="space-y-4">
                {data.map((coach) => (
                  <CoachCard key={String(coach.id)} coach={coach} showLinks={showLinks ?? false} />
                ))}
              </div>
            ) : (
              <div className={gridCols}>
                {data.map((coach) => (
                  <CoachCard key={String(coach.id)} coach={coach} showLinks={showLinks ?? false} />
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </section>
  );
}
