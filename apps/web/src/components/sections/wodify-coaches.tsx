"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { cn } from "@workspace/ui/lib/utils";
import { RichText } from "@/components/elements/rich-text";
import { PagebuilderType } from "@/types";
import { Badge } from "@workspace/ui/components/badge";
import { CoachModal } from "./coach-modal";
import { CoachLinks, CoachMetaBadges, getCoachLinks, splitCSV } from "./coach-parts";
import type { WodifyCoach } from "./coach-types";

export type WodifyCoachesBlockProps = PagebuilderType<"wodifyCoaches"> & {
  className?: string;
  preloaded?: WodifyCoach[];
};

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

function CoachCard({ coach, showLinks, onReadMore }: {
  coach: WodifyCoach;
  showLinks: boolean;
  onReadMore?: (coach: WodifyCoach) => void
}) {
  const fullName = [coach.first_name, coach.last_name].filter(Boolean).join(" ");
  const links = getCoachLinks(coach);
  const programs = splitCSV(coach.programs);
  const services = splitCSV(coach.services);

  const bio = coach.biography || "";
  const MAX = 260; // peek length
  const isLong = bio.length > MAX;
  const displayBio = !isLong ? bio : bio.slice(0, MAX) + "…";

  // const locations = splitCSV(coach.locations);

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
          <CoachMetaBadges programs={programs} services={services} />
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
              onClick={() => onReadMore?.(coach)}
            >
              Read more
            </button>
          )}
        </div>
      )}

      {/* Links */}
      {showLinks && links.length > 0 && (
        <div className="border-t p-5">
          <CoachLinks links={links} />
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

  const [selectedCoach, setSelectedCoach] = useState<WodifyCoach | null>(null);
  const [open, setOpen] = useState(false);

  const gridCols = useMemo(() => {
    const cols = Math.max(1, Math.min(4, Number(itemsPerRow) || 3));
    return `grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-${cols}`;
  }, [itemsPerRow]);

  const handleReadMore = (coach: WodifyCoach) => {
    setSelectedCoach(coach);
    setOpen(true);
  };


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
                  <CoachCard key={String(coach.id)} coach={coach} showLinks={showLinks ?? false}
                             onReadMore={handleReadMore} />
                ))}
              </div>
            ) : (
              <div className={gridCols}>
                {data.map((coach) => (
                  <CoachCard key={String(coach.id)} coach={coach} showLinks={showLinks ?? false}
                             onReadMore={handleReadMore} />
                ))}
              </div>
            )
          )}
        </div>
      </div>

      {/* Modal for full coach details using common UI Sheet */}
      <CoachModal
        open={open}
        onOpenChangeAction={(o) => {
          setOpen(o);
          if (!o) setSelectedCoach(null);
        }}
        coach={selectedCoach}
        showLinks={showLinks ?? undefined}
      />
    </section>
  );
}
