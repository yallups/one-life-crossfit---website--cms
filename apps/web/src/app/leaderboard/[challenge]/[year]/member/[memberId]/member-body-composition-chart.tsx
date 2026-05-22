import { BodyCompositionPerformanceChart } from "@/components/leaderboard/body-composition-performance-chart";
import type { BodyCompositionParticipantAnalysis } from "@/lib/leaderboard/body-composition-normalization";

export default function MemberBodyCompositionChart({
  analysis,
}: {
  analysis?: BodyCompositionParticipantAnalysis;
}) {
  if (!analysis || analysis.scans.length === 0) return null;

  return (
    <section className="mb-8 rounded-md border border-border bg-card/70 p-4">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Performance Chart</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Entered body-composition measurements with the adjusted BFP used for
          scoring. Pound-based measurements are shown as change from the first
          scan; BFP lines are shown as percentage-point change from the first
          scan.
        </p>
      </div>

      <BodyCompositionPerformanceChart analysis={analysis} />

      <div className="mt-4 rounded-md border border-border bg-background/60 p-3 text-sm text-muted-foreground">
        <p>
          <span className="font-semibold text-foreground">BFP adjusted*</span>{" "}
          estimates body-fat percentage from measured weight change while
          limiting how much short-term SMM loss and deep weight cuts count as
          fat loss.
        </p>
        <p className="mt-2">
          The calculation starts from the first scan&apos;s weight and BFP,
          builds an early SMM baseline, caps SMM loss at 1% of that baseline,
          then credits weight loss as fat loss using a depth-of-cut curve: full
          credit through the first 3% of starting body weight lost, then a
          sharper reduction for deeper cuts.
        </p>
      </div>
    </section>
  );
}
