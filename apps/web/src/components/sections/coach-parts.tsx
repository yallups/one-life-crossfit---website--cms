"use client";

import { Badge } from "@workspace/ui/components/badge";
import type { WodifyCoach } from "./coach-types";

export function splitCSV(value?: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function getCoachLinks(coach?: Pick<WodifyCoach, "link_1" | "link_2" | "link_3" | "link_4" | "link_5"> | null): string[] {
  if (!coach) return [];
  return [coach.link_1, coach.link_2, coach.link_3, coach.link_4, coach.link_5].filter(Boolean) as string[];
}

export function CoachMetaBadges({ programs = [], services = [] }: { programs?: string[]; services?: string[] }) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
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
  );
}

export function CoachLinks({ links = [] }: { links?: string[] }) {
  if (!links.length) return null;
  return (
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
  );
}
