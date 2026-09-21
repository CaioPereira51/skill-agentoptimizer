import test from "node:test";
import assert from "node:assert/strict";
import { AgentOptimizer, normalizeSession } from "../src/index.js";

const analyze = (raw) => new AgentOptimizer({ clock: () => new Date("2026-01-01T00:00:00Z") }).analyze([normalizeSession(raw)]).audit;

test("generic prompt creates traceable prompt finding", () => {
  const audit = analyze({ id: "p", prompts: ["fix it"] });
  const finding = audit.findings.find((item) => item.id.includes("generic"));
  assert.ok(finding);
  assert.ok(finding.evidence.length > 0);
  assert.equal(finding.confidence, "HIGH");
});

test("well-scoped prompt avoids generic and missing-acceptance findings", () => {
  const audit = analyze({ id: "p", prompts: ["Implement cart validation without changing the API. Done when unit tests pass and invalid carts return an error."] });
  assert.equal(audit.findings.filter((item) => item.category === "prompt_quality").length, 0);
});

test("objective detection recognizes common English and Portuguese action forms", () => {
  const prompts = [
    "Update the parser without changing the public API. Done when tests pass.",
    "Implemente validação de carrinho sem alterar a API. Concluído quando os testes passarem.",
    "Atualize o endpoint sem alterar o contrato. Concluído quando os testes passarem.",
    "Revise o diff e reporte riscos acionáveis.",
    "How does this function treat empty input?"
  ];
  for (const [index, prompt] of prompts.entries()) {
    const audit = analyze({ id: `objective-${index}`, prompts: [prompt] });
    assert.equal(audit.findings.some((item) => item.id.includes("unclear-objective")), false, prompt);
  }
});

test("a short question with a concrete target is not generic", () => {
  const audit = analyze({ id: "question", prompts: ["What does this function do?"] });
  assert.equal(audit.findings.filter((item) => item.ruleId === "prompt-quality").length, 0);
});

test("prompt-quality rules evaluate multiple prompts independently", () => {
  const audit = analyze({ id: "turns", prompts: [
    "Investigate the cache failure without changing code. Return the cause and supporting evidence.",
    "Now implement the smallest fix and run the relevant tests."
  ] });
  assert.equal(audit.findings.filter((item) => item.id.includes("mixed-phases")).length, 0);
});

test("unknown prompts do not create prompt findings", () => {
  const audit = analyze({ id: "p" });
  assert.equal(audit.findings.filter((item) => item.category === "prompt_quality").length, 0);
  assert.equal(audit.metrics.find((item) => item.id === "prompt_quality").status, "insufficient_data");
});

test("known empty validation with code changes creates finding", () => {
  const audit = analyze({ id: "v", filesChanged: ["src/a.js"], testsExecuted: [], validation: [] });
  assert.ok(audit.findings.some((item) => item.ruleId === "validation"));
});

test("unknown validation never means no validation", () => {
  const audit = analyze({ id: "v", filesChanged: ["src/a.js"] });
  assert.equal(audit.findings.filter((item) => item.ruleId === "validation").length, 0);
});

test("documentation-only changes receive proportional validation advice", () => {
  const audit = analyze({ id: "docs", filesChanged: ["README.md"], testsExecuted: [], validation: [] });
  const finding = audit.findings.find((item) => item.ruleId === "validation");
  assert.match(finding.recommendation, /diff|links/i);
  assert.doesNotMatch(finding.recommendation, /unit/i);
});

test("complex multi-objective task is decomposed only without phase boundaries", () => {
  const mixed = analyze({ id: "d1", task: "Investigate architecture, implement refactor, add tests, document and review" });
  const phased = analyze({ id: "d2", task: "Phase 1 investigate architecture. Phase 2 implement refactor. Phase 3 add tests, document and review." });
  assert.ok(mixed.findings.some((item) => item.ruleId === "task-decomposition"));
  assert.equal(phased.findings.filter((item) => item.ruleId === "task-decomposition").length, 0);
});

test("spec audit differentiates observed absence from unknown", () => {
  const absent = analyze({ id: "s1", filesChanged: ["src/a.js"], specArtifacts: [] });
  const unknown = analyze({ id: "s2", filesChanged: ["src/a.js"] });
  assert.ok(absent.findings.some((item) => item.ruleId === "spec-discipline"));
  assert.equal(unknown.findings.filter((item) => item.ruleId === "spec-discipline").length, 0);
});

test("context changed-without-read finding has reduced confidence", () => {
  const audit = analyze({ id: "c", filesRead: ["src/a.js"], filesChanged: ["src/b.js"], context: [] });
  const finding = audit.findings.find((item) => item.id.includes("changed-without-read"));
  assert.ok(finding);
  assert.equal(finding.confidence, "MEDIUM");
});
