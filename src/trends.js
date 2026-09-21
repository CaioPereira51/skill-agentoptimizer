const LOWER_IS_BETTER = new Set(["rework_rate"]);

export function compareMetric(previous, current, threshold = 3) {
  if (!previous || !current || previous.value == null || current.value == null) return { status: "insufficient_data", delta: null };
  const delta = Math.round((current.value - previous.value) * 100) / 100;
  if (Math.abs(delta) < threshold) return { status: "stable", delta };
  const rawImprovement = delta > 0;
  const improvement = LOWER_IS_BETTER.has(current.id) ? !rawImprovement : rawImprovement;
  return { status: improvement ? "improvement" : "regression", delta };
}

export function analyzeTrends(audits, threshold = 3) {
  if (!Array.isArray(audits) || audits.length < 2) return [];
  const previous = audits.at(-2); const current = audits.at(-1);
  const priorById = new Map(previous.metrics.map((metric) => [metric.id, metric]));
  return current.metrics.map((metric) => ({ metricId: metric.id, ...compareMetric(priorById.get(metric.id), metric, threshold), thresholdPercentagePoints: threshold }));
}
