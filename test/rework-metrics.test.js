import test from "node:test";
import assert from "node:assert/strict";
import { AgentOptimizer, classifyRework, normalizeSession } from "../src/index.js";

test("rework classifications cover first pass, one, multiple, and unknown", () => {
  const first = normalizeSession({ id: "first", interactions: ["assistant: completed implementation", "user: accepted"] });
  const one = normalizeSession({ id: "one", interactions: ["assistant: done", "user: corrija", "assistant: fixed", "user: accepted"] });
  const many = normalizeSession({ id: "many", interactions: ["assistant: done", "user: faltou x", "assistant: fixed", "user: isso quebrou", "assistant: fixed again", "user: accepted"] });
  const unknown = normalizeSession({ id: "unknown" });
  assert.equal(classifyRework(first).status, "accepted_first_pass");
  assert.equal(classifyRework(one).status, "single_rework");
  assert.equal(classifyRework(many).status, "multiple_reworks");
  assert.equal(classifyRework(unknown).status, "unknown");
});

test("first-pass and rework formulas exclude unknown sessions", () => {
  const sessions = [
    normalizeSession({ id: "first", interactions: ["assistant: done", "user: accepted"] }),
    normalizeSession({ id: "redo", interactions: ["assistant: done", "user: corrija", "assistant: fixed", "user: accepted"] }),
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
  for (const id of ["prompt_quality", "context_lexical_alignment", "validation_coverage", "first_pass_success", "rework_rate", "agent_efficiency", "automation_coverage"]) {
    const metric = audit.metrics.find((item) => item.id === id);
    assert.equal(metric.value, null, id);
    assert.equal(metric.status, "insufficient_data", id);
  }
});

test("an initial correction-like request is not counted as rework", () => {
  const classification = classifyRework(normalizeSession({ id: "initial", interactions: ["user: fix it"] }));
  assert.equal(classification.status, "unknown");
  assert.equal(classification.events[0].type, "request");
});

test("explicit typed interactions produce high-confidence rework", () => {
  const classification = classifyRework(normalizeSession({ id: "typed", interactions: [
    { type: "implementation", role: "assistant", text: "implemented" },
    { type: "correction", role: "user", text: "change the behavior" },
    { type: "implementation", role: "assistant", text: "updated" },
    { type: "acceptance", role: "user", text: "approved" }
  ] }));
  assert.equal(classification.status, "single_rework");
  assert.equal(classification.confidence, "HIGH");
});

test("typed correction and acceptance still require prior agent work", () => {
  const correction = classifyRework(normalizeSession({ id: "typed-initial-correction", interactions: [{ type: "correction", role: "user", text: "fix it" }] }));
  const acceptance = classifyRework(normalizeSession({ id: "typed-initial-acceptance", interactions: [{ type: "acceptance", role: "user", text: "accepted" }] }));
  assert.equal(correction.status, "unknown");
  assert.equal(correction.events[0].type, "request");
  assert.equal(acceptance.status, "unknown");
});

test("validation coverage denominator is explicit and deterministic", () => {
  const session = normalizeSession({ id: "v", task: "Update backend", filesChanged: ["src/a.js"], testsExecuted: ["unit tests passed"], validation: ["diff review"] });
  const metric = new AgentOptimizer().analyze([session]).audit.metrics.find((item) => item.id === "validation_coverage");
  assert.equal(metric.value, 100);
  assert.equal(metric.numerator, metric.denominator);
});
