import { AgentOptimizer } from "./optimizer.js";
import { normalizeMany } from "./normalize.js";

function expectedIds(fixture) { return new Set(fixture.expectedFindingIds ?? []); }

export function evaluateFixtures(fixtures, { rules, plugins, clock = () => new Date("2000-01-01T00:00:00.000Z") } = {}) {
  if (!Array.isArray(fixtures)) throw new TypeError("Evaluation fixtures must be an array");
  const cases = fixtures.map((fixture, index) => {
    const sessions = normalizeMany(fixture.sessions ?? [], { source: `eval:${fixture.id ?? index + 1}`, format: "evaluation-fixture" });
    const audit = new AgentOptimizer({ rules, plugins, clock }).analyze(sessions).audit;
    const expected = expectedIds(fixture);
    const actual = new Set(audit.findings.map((finding) => finding.id));
    const truePositives = [...actual].filter((id) => expected.has(id));
    const falsePositives = [...actual].filter((id) => !expected.has(id));
    const falseNegatives = [...expected].filter((id) => !actual.has(id));
    return { id: fixture.id ?? `case-${index + 1}`, truePositives, falsePositives, falseNegatives };
  });
  const totals = cases.reduce((sum, item) => ({
    tp: sum.tp + item.truePositives.length,
    fp: sum.fp + item.falsePositives.length,
    fn: sum.fn + item.falseNegatives.length
  }), { tp: 0, fp: 0, fn: 0 });
  const precision = totals.tp + totals.fp ? totals.tp / (totals.tp + totals.fp) : 1;
  const recall = totals.tp + totals.fn ? totals.tp / (totals.tp + totals.fn) : 1;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  return { cases, totals, precision, recall, f1 };
}
