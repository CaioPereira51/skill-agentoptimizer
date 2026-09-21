import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentOptimizer, FileHistoryStore, analyzeTrends, compareMetric, normalizeSession } from "../src/index.js";

test("trend classification handles improvement, regression, stable and insufficient data", () => {
  assert.equal(compareMetric({ id: "prompt_quality", value: 50 }, { id: "prompt_quality", value: 60 }).status, "improvement");
  assert.equal(compareMetric({ id: "rework_rate", value: 50 }, { id: "rework_rate", value: 60 }).status, "regression");
  assert.equal(compareMetric({ id: "prompt_quality", value: 50 }, { id: "prompt_quality", value: 52 }).status, "stable");
  assert.equal(compareMetric({ id: "prompt_quality", value: null }, { id: "prompt_quality", value: 52 }).status, "insufficient_data");
});

test("report exposes evidence and data limitations", () => {
  const result = new AgentOptimizer({ clock: () => new Date("2026-01-01T00:00:00Z") }).analyze([normalizeSession({ id: "r", prompts: ["fix it"] })]);
  assert.match(result.markdown, /Evidence:/);
  assert.match(result.markdown, /Confidence \/ Data Limitations/);
  assert.match(result.markdown, /testsExecuted: unknown/);
});

test("history persists audit, metrics, patterns, recommendations and period", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-optimizer-"));
  const store = new FileHistoryStore(root);
  const result = new AgentOptimizer({ clock: () => new Date("2026-01-01T00:00:00Z") }).analyze([normalizeSession({ id: "h", prompts: ["Implement x. Done when tests pass."], timestamp: "2025-12-31T00:00:00Z" })]);
  const paths = await store.save(result.audit, result.markdown);
  const audits = await store.list();
  assert.equal(audits.length, 1);
  assert.equal(audits[0].period.start, "2025-12-31T00:00:00.000Z");
  assert.match(await readFile(paths.markdownPath, "utf8"), /AgentOptimizer Audit/);
  assert.ok(JSON.parse(await readFile(join(root, "metrics.json"), "utf8")).metrics.length);
  assert.ok(Array.isArray(JSON.parse(await readFile(join(root, "patterns.json"), "utf8")).patterns));
  assert.match(await readFile(join(root, "recommendations.md"), "utf8"), /Recommendations/);
});

test("recurring semantic workflow yields automation opportunity", () => {
  const sessions = [
    normalizeSession({ id: "a", prompts: ["Investigue a causa e não altere código"] }),
    normalizeSession({ id: "b", prompts: ["Apenas diagnostique; do not implement"] })
  ];
  const audit = new AgentOptimizer().analyze(sessions).audit;
  assert.ok(audit.patterns.some((pattern) => pattern.pattern === "investigate-only"));
  assert.ok(audit.automationOpportunities.some((item) => item.type === "Skill"));
  assert.equal(audit.metrics.find((item) => item.id === "automation_coverage").status, "insufficient_data");
});

test("automation coverage only uses patterns with observed automation state", () => {
  const sessions = [
    normalizeSession({ id: "a", prompts: ["Investigue a causa e não altere código"], automationEvidence: [{ pattern: "investigate-only", automated: true }] }),
    normalizeSession({ id: "b", prompts: ["Apenas diagnostique; do not implement"] })
  ];
  const metric = new AgentOptimizer().analyze(sessions).audit.metrics.find((item) => item.id === "automation_coverage");
  assert.deepEqual([metric.value, metric.numerator, metric.denominator], [100, 1, 1]);
});

test("legacy context metric histories compare with lexical alignment", () => {
  const previous = { metrics: [{ id: "context_efficiency", value: 50 }] };
  const current = { metrics: [{ id: "context_lexical_alignment", value: 60 }] };
  assert.equal(analyzeTrends([previous, current])[0].status, "improvement");
});
