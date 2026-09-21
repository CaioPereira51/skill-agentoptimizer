import test from "node:test";
import assert from "node:assert/strict";
import { AgentOptimizer, classifyRework, normalizeSession } from "../src/index.js";

test("rework classifications cover first pass, one, multiple, and unknown", () => {
  const first = normalizeSession({ id: "first", interactions: ["assistant: done", "user: accepted"] });
  const one = normalizeSession({ id: "one", interactions: ["assistant: done", "user: corrija", "assistant: fixed", "user: accepted"] });
  const many = normalizeSession({ id: "many", interactions: ["user: faltou x", "user: isso quebrou", "user: accepted"] });
  const unknown = normalizeSession({ id: "unknown" });
  assert.equal(classifyRework(first).status, "accepted_first_pass");
  assert.equal(classifyRework(one).status, "single_rework");
  assert.equal(classifyRework(many).status, "multiple_reworks");
  assert.equal(classifyRework(unknown).status, "unknown");
});

test("first-pass and rework formulas exclude unknown sessions", () => {
  const sessions = [
    normalizeSession({ id: "first", interactions: ["accepted"] }),
    normalizeSession({ id: "redo", interactions: ["corrija", "accepted"] }),
    normalizeSession({ id: "unknown" })
  ];
  const audit = new AgentOptimizer({ clock: () => new Date("2026-01-01T00:00:00Z") }).analyze(sessions).audit;
  const fps = audit.metrics.find((item) => item.id === "first_pass_success");
  const rework = audit.metrics.find((item) => item.id === "rework_rate");
  assert.deepEqual([fps.value, fps.numerator, fps.denominator], [50, 1, 2]);
  assert.deepEqual([rework.value, rework.numerator, rework.denominator], [50, 1, 2]);
});

test("metrics use null instead of zero with no denominator", () => {
  const audit = new AgentOptimizer().analyze([normalizeSession({ id: "empty" })]).audit;
  for (const id of ["prompt_quality", "context_efficiency", "validation_coverage", "first_pass_success", "rework_rate", "agent_efficiency", "automation_coverage"]) {
    const metric = audit.metrics.find((item) => item.id === id);
    assert.equal(metric.value, null, id);
    assert.equal(metric.status, "insufficient_data", id);
  }
});

test("validation coverage denominator is explicit and deterministic", () => {
  const session = normalizeSession({ id: "v", task: "Update backend", filesChanged: ["src/a.js"], testsExecuted: ["unit tests passed"], validation: ["diff review"] });
  const metric = new AgentOptimizer().analyze([session]).audit.metrics.find((item) => item.id === "validation_coverage");
  assert.equal(metric.value, 100);
  assert.equal(metric.numerator, metric.denominator);
});
