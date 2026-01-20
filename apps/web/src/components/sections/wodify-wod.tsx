"use client";

import { Badge } from "@workspace/ui/components/badge";
import { cn } from "@workspace/ui/lib/utils";
import { useEffect, useMemo, useState } from "react";
import { RichText } from "@/components/elements/rich-text";
import type { WodifyWorkout } from "@/lib/wodify.schemas";
import type { PagebuilderType } from "@/types";

export type WodifyWodBlockProps = PagebuilderType<"wodifyWod"> & {
  className?: string;
  preloaded?: WodifyWorkout[];
};

function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateString;
  }
}

function useWorkouts(programId: string, daysAhead = 0) {
  const [data, setData] = useState<WodifyWorkout[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const params = useMemo(() => {
    const today = new Date();
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + daysAhead);

    const startDateStr = today.toISOString().split("T")[0] ?? "";
    const endDateStr = endDate.toISOString().split("T")[0] ?? "";

    const u = new URLSearchParams();
    u.set("startDate", startDateStr);
    u.set("endDate", endDateStr);
    if (programId) {
      u.set("programId", programId);
    }
    u.set("formatted", "1");
    u.set("page_size", "100");
    u.set("sort", "desc_date");

    return u.toString();
  }, [programId, daysAhead]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const url = `/api/wodify/workouts?${params}`;
    fetch(url)
      .then(async (r) => {
        if (!r.ok) throw new Error(`Failed to load workouts (${r.status})`);
        return r.json();
      })
      .then((json) => {
        if (cancelled) return;
        setData((json?.items ?? []) as WodifyWorkout[]);
      })
      .catch((e: any) => {
        if (cancelled) return;
        setError(e?.message || "Failed to load workouts");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [params]);

  return { data, error, loading };
}

function WorkoutCard({
  workout,
  showPublicNotes,
}: {
  workout: WodifyWorkout;
  showPublicNotes: boolean;
}) {
  const formattedDate = workout.date ? formatDate(workout.date) : "";

  return (
    <div className="rounded-xl border bg-card p-6 text-card-foreground shadow-sm">
      <div className="space-y-4">
        {formattedDate && (
          <p className="text-sm font-medium text-muted-foreground">
            {formattedDate}
          </p>
        )}

        {workout.title && (
          <h3 className="text-2xl font-bold">{workout.title}</h3>
        )}

        {workout.program_name && (
          <Badge variant="secondary" className="text-sm">
            {workout.program_name}
          </Badge>
        )}

        {workout.description && (
          <div
            className="prose prose-sm max-w-none dark:prose-invert"
            dangerouslySetInnerHTML={{ __html: workout.description }}
          />
        )}

        {showPublicNotes && workout.public_notes && (
          <div className="rounded-lg bg-muted p-4">
            <p className="text-sm font-semibold text-muted-foreground">
              Notes:
            </p>
            <div
              className="mt-2 text-sm"
              dangerouslySetInnerHTML={{ __html: workout.public_notes }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export function WodifyWod({
  eyebrow,
  title,
  richText,
  programId,
  showPublicNotes = true,
  daysAhead = 0,
  className,
  preloaded,
}: WodifyWodBlockProps) {
  const { data, error, loading } =
    preloaded !== undefined
      ? { data: preloaded, error: null as string | null, loading: false }
      : useWorkouts(programId as string, daysAhead as number);

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
            <h2 className="text-balance text-3xl font-semibold md:text-5xl">
              {title}
            </h2>
          )}
          {richText && (
            <div className="text-lg text-muted-foreground">
              <RichText className="text-balance" richText={richText as any} />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="mx-auto mt-8 max-w-4xl">
          {loading && (
            <div className="text-center text-muted-foreground">
              Loading workout…
            </div>
          )}
          {error && <div className="text-center text-destructive">{error}</div>}
          {!loading && !error && (!data || data.length === 0) && (
            <div className="text-center text-muted-foreground">
              No workout posted yet.
            </div>
          )}

          {!loading && !error && data && data.length > 0 && (
            <div className="space-y-6">
              {data.map((workout) => (
                <WorkoutCard
                  key={String(workout.id)}
                  workout={workout}
                  showPublicNotes={showPublicNotes ?? true}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
