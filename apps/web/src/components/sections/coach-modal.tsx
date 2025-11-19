"use client";

import Image from "next/image";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@workspace/ui/components/sheet";
import type { WodifyCoach } from "./coach-types";
import { CoachLinks, CoachMetaBadges, getCoachLinks, splitCSV } from "./coach-parts";

export function CoachModal({
  open,
  onOpenChangeAction,
  coach,
  showLinks = true,
  side = "center",
}: {
  open: boolean;
  onOpenChangeAction: (open: boolean) => void;
  coach: WodifyCoach | null;
  showLinks?: boolean;
  side?: "top" | "right" | "bottom" | "left" | "center";
}) {
  if (!coach) return (
    <Sheet open={open} onOpenChange={onOpenChangeAction}>
      <SheetContent side={side} aria-hidden />
    </Sheet>
  );

  const fullName = [coach.first_name, coach.last_name].filter(Boolean).join(" ");
  const programs = splitCSV(coach.programs);
  const services = splitCSV(coach.services);
  const links = getCoachLinks(coach);

  return (
    <Sheet open={open} onOpenChange={onOpenChangeAction}>
      <SheetContent side={side} className="p-0">
        <div className="flex flex-col">
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
              <SheetHeader className="p-0">
                <SheetTitle className="truncate text-xl font-semibold leading-tight">{fullName}</SheetTitle>
                {coach.title && (
                  <SheetDescription className="text-muted-foreground">
                    {coach.title}
                  </SheetDescription>
                )}
              </SheetHeader>
              <CoachMetaBadges programs={programs} services={services} />
            </div>
          </div>

          {coach.biography && (
            <div className="border-t p-5">
              <div className="prose prose-zinc dark:prose-invert max-w-none">
                <div
                  className="text-sm leading-relaxed text-muted-foreground"
                  dangerouslySetInnerHTML={{ __html: coach.biography || "" }}
                />
              </div>
            </div>
          )}

          {showLinks && links.length > 0 && (
            <div className="border-t p-5">
              <CoachLinks links={links} />
            </div>
          )}

          <SheetFooter className="border-t p-4">
            {/* Footer can be extended if needed */}
          </SheetFooter>
        </div>
      </SheetContent>
    </Sheet>
  );
}
