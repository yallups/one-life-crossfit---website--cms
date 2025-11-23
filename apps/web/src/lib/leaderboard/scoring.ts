// Helper factories to build MetricSpec.scoring functions

export function absolutePerUnit(unit: number, pointsPerUnit: number) {
  return ({ improvement }: { improvement: number }) => {
    if (!isFinite(improvement) || improvement <= 0) return 0;
    return (improvement / unit) * pointsPerUnit;
  };
}

export function absoluteScaledLinear(maxPoints: number, normalizeMax: number) {
  return ({ improvement }: { improvement: number }) => {
    if (!isFinite(improvement) || improvement <= 0) return 0;
    const norm = Math.max(0, Math.min(1, improvement / normalizeMax));
    return norm * maxPoints;
  };
}

// Linear points without flooring or cap: awards pointsPerUnit per 1 unit improvement
// Example: absoluteLinear(80) with improvement=2.5 → 200 points
export function absoluteLinear(pointsPerUnit: number) {
  return ({ improvement }: { improvement: number }) => {
    if (!isFinite(improvement) || improvement <= 0) return 0;
    return improvement * pointsPerUnit;
  };
}

export function relativeScaledMax(maxPoints: number) {
  const fn = ({ improvement, topImprovementInDivision }: {
    improvement: number;
    topImprovementInDivision?: number
  }) => {
    if (!isFinite(improvement) || improvement <= 0) return 0;
    const top = topImprovementInDivision ?? 0;
    if (top <= 0) return 0;
    const ratio = Math.max(0, Math.min(1, improvement / top));
    return ratio * maxPoints;
  };
  (fn as any)._method = "relative";
  return fn;
}

export function clampValue(v: number, min = 0, max = Infinity) {
  return Math.max(min, Math.min(max, v));
}

export function roundTo(v: number, decimals = 2) {
  const p = Math.pow(10, decimals);
  return Math.round(v * p) / p;
}
