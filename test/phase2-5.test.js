import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AgentOptimizer, RuleEngine, evaluateFixtures, generateDashboard, importCcusage, importHowIPrompt,
  importCursorOtlp, importOtlpTraces, importSkillusage, loadRulePlugin, mergeSessions, normalizeSession, startOtlpReceiver
} from "../src/index.js";

const otlp = {
  resourceSpans: [{
    resource: { attributes: [{ key: "service.name", value: { stringValue: "codex" } }, { key: "project.name", value: { stringValue: "demo" } }] },
    scopeSpans: [{ spans: [{
      traceId: "00112233445566778899aabbccddeeff", spanId: "0011223344556677", name: "run tests",
      startTimeUnixNano: "1767225600000000000",
      attributes: [
        { key: "session.id", value: { stringValue: "s1" } },
        { key: "gen_ai.input.messages", value: { stringValue: "[{\"role\":\"user\",\"content\":\"Implement x. Done when tests pass.\"}]" } },
        { key: "shell.command", value: { stringValue: "npm test" } },
        { key: "gen_ai.usage.input_tokens", value: { intValue: "12" } }
      ]
    }] }]
  }]
};

test("collector bridges merge prompt, cost and skill evidence by platform and session", () => {
  const timestamp = "2026-01-01T00:00:00Z";
  const prompt = importHowIPrompt({ conversations: [{ id: "s1", source: "codex", project: "demo", startedAt: timestamp, messages: [{ role: "user", content: "Implement x. Done when tests pass." }] }] });
  const usage = importCcusage({ type: "session", data: [{ session: "s1", agent: "codex", project: "demo", lastActivity: timestamp, models: "gpt-5", inputTokens: 10, costUSD: 0.1 }] });
  const skills = importSkillusage({ generatedAt: timestamp, skills: [{ name: "review", total: 2, projects: { demo: 2 }, auto: 1 }] }, { tool: "codex" });
  const merged = mergeSessions([...prompt, ...usage, ...skills]);
  assert.equal(merged.length, 1);
  const session = merged.find((item) => item.fields.session.status === "known");
  assert.deepEqual(session.fields.prompts.value, ["Implement x. Done when tests pass."]);
  assert.equal(session.fields.cost.value.amount, 0.1);
  assert.equal(session.fields.skillUsage.value[0].skill, "review");
  assert.equal(session.fieldProvenance.prompts[0].source, "howiprompt");
  assert.ok(session.rawEvidence.some((item) => item.type === "merge-source"));
});

test("OTLP JSON imports instrumented evidence conservatively", () => {
  const [session] = importOtlpTraces(otlp);
  assert.equal(session.fields.project.value, "demo");
  assert.equal(session.fields.usage.value.inputTokens, 12);
  assert.deepEqual(session.fields.testsExecuted.value, ["npm test"]);
  assert.equal(session.fields.model.status, "unavailable");
  assert.match(session.rawEvidence[0].location, /trace:/);
});

test("Cursor OTLP logs and metrics require a conversation id and retain partial observability", () => {
  const document = { resourceLogs: [{ resource: { attributes: [{ key: "service.name", value: { stringValue: "cursor" } }] }, scopeLogs: [{ logRecords: [{ timeUnixNano: "1767225600000000000", body: { stringValue: "skill.activated" }, attributes: [{ key: "cursor.conversation.id", value: { stringValue: "cursor-1" } }, { key: "skill.activated", value: { boolValue: true } }] }] }] }] };
  const [session] = importCursorOtlp(document);
  assert.equal(session.fields.session.value, "cursor-1");
  assert.equal(session.fields.prompts.status, "unavailable");
  assert.equal(session.fields.automationEvidence.value[0].automated, true);
  assert.equal(session.sourceFormat, "cursor-otlp-logs-metrics");
});

test("Cursor OTLP metric values retain token and cost evidence", () => {
  const document = { resourceMetrics: [{ scopeMetrics: [{ metrics: [
    { name: "cursor.token.usage.input", sum: { dataPoints: [{ asInt: "12", attributes: [{ key: "cursor.conversation.id", value: { stringValue: "cursor-2" } }] }] } },
    { name: "cursor.cost.usage", gauge: { dataPoints: [{ asDouble: 0.25, attributes: [{ key: "cursor.conversation.id", value: { stringValue: "cursor-2" } }] }] } }
  ] }] }] };
  const [session] = importCursorOtlp(document);
  assert.equal(session.fields.usage.value.inputTokens, 12);
  assert.equal(session.fields.cost.value.amount, 0.25);
});

test("time-window merge joins adjacent timestamps rather than fixed buckets", () => {
  const sessions = [
    normalizeSession({ id: "identified", tool: "codex", session: "s1", project: "demo", timestamp: "2026-01-01T10:04:59Z", prompts: ["Review this"] }),
    normalizeSession({ id: "unidentified", tool: "codex", project: "demo", timestamp: "2026-01-01T10:05:01Z", usage: { inputTokens: 4 } })
  ];
  const [merged] = mergeSessions(sessions);
  assert.equal(merged.fields.session.value, "s1");
  assert.equal(merged.fields.usage.value.inputTokens, 4);
});

test("merge keeps unknown when another source marks the field unavailable", () => {
  const sessions = [
    normalizeSession({ id: "one", tool: "codex", session: "s1", cost: undefined, observability: { cost: "unknown" } }),
    normalizeSession({ id: "two", tool: "codex", session: "s1", observability: { cost: "unavailable" } })
  ];
  const [merged] = mergeSessions(sessions);
  assert.equal(merged.fields.cost.status, "unknown");
});

test("live OTLP receiver persists an auditable trace", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-optimizer-otel-"));
  const receiver = await startOtlpReceiver({ port: 0, historyDir: root, rawDir: join(root, "raw") });
  try {
    const response = await fetch(`${receiver.url}/v1/traces`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(otlp) });
    assert.equal(response.status, 200);
    const audits = await new (await import("../src/history.js")).FileHistoryStore(root).list();
    assert.equal(audits.length, 1);
    assert.equal(audits[0].sessionEvidence[0].source, "otlp");
  } finally { await receiver.close(); }
});

test("live Cursor OTLP buffers logs and metrics by conversation before auditing", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-optimizer-cursor-otel-"));
  const receiver = await startOtlpReceiver({ port: 0, historyDir: root, cursorBufferMs: 15 });
  const logs = { resourceLogs: [{ scopeLogs: [{ logRecords: [{ body: { stringValue: "skill.activated" }, attributes: [{ key: "cursor.conversation.id", value: { stringValue: "c1" } }, { key: "skill.activated", value: { boolValue: true } }] }] }] }] };
  const metrics = { resourceMetrics: [{ scopeMetrics: [{ metrics: [{ name: "cursor.token.usage.input", sum: { dataPoints: [{ asInt: "9", attributes: [{ key: "cursor.conversation.id", value: { stringValue: "c1" } }] }] } }] }] }] };
  try {
    const headers = { "content-type": "application/json" };
    assert.equal((await fetch(`${receiver.url}/v1/logs`, { method: "POST", headers, body: JSON.stringify(logs) })).status, 202);
    assert.equal((await fetch(`${receiver.url}/v1/metrics`, { method: "POST", headers, body: JSON.stringify(metrics) })).status, 202);
    const store = new (await import("../src/history.js")).FileHistoryStore(root);
    let audits = [];
    for (let attempt = 0; attempt < 20 && audits.length === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      audits = await store.list();
    }
    assert.equal(audits.length, 1);
    assert.equal(audits[0].sessionEvidence[0].fields.usage.value.inputTokens, 9);
  } finally { await receiver.close(); }
});

test("rules and plugins are schema-validated and cannot omit evidence", async () => {
  assert.throws(() => new RuleEngine([{ id: "invalid" }]), /analyze/);
  const engine = new RuleEngine([{ id: "bad", analyze: () => ({ id: "x", category: "x", title: "x", description: "x" }) }]);
  assert.throws(() => engine.analyze({ sessions: [] }), /traceable evidence/);
  const root = await mkdtemp(join(tmpdir(), "agent-optimizer-plugin-"));
  const file = join(root, "plugin.mjs");
  await writeFile(file, "export default {name:'demo',version:'1.0.0',rules:[{id:'demo-rule',analyze(){return []}}]};", "utf8");
  assert.equal((await loadRulePlugin(file)).rules[0].id, "demo-rule");
});

test("candidate artifacts require three occurrences and high confidence", () => {
  const sessions = ["a", "b", "c"].map((id) => normalizeSession({ id, prompts: ["Investigate the cause; do not implement code"] }));
  const audit = new AgentOptimizer().analyze(sessions).audit;
  assert.equal(audit.candidateArtifacts[0].kind, "Skill");
  assert.equal(audit.candidateArtifacts[0].recurrence, 3);
});

test("evaluation harness measures labeled precision and recall", () => {
  const result = evaluateFixtures([{ id: "eval1", sessions: [{ id: "eval1", prompts: ["fix it"] }], expectedFindingIds: ["prompt-quality:eval1:generic"] }]);
  assert.deepEqual(result.totals, { tp: 1, fp: 0, fn: 0 });
  assert.equal(result.f1, 1);
});

test("project baselines and longitudinal trends enforce three samples", () => {
  const optimizer = new AgentOptimizer({ clock: (() => { let day = 0; return () => new Date(Date.UTC(2026, 0, ++day)); })() });
  const audits = [];
  for (let index = 0; index < 3; index += 1) {
    const current = optimizer.analyze([normalizeSession({ id: `p${index}`, project: "demo", prompts: ["Implement x. Done when tests pass."] })], { previousAudits: audits }).audit;
    audits.push(current);
  }
  const baseline = audits.at(-1).projectBaselines.find((item) => item.project === "demo" && item.metricId === "prompt_quality");
  assert.equal(baseline.status, "calculated");
  assert.equal(baseline.sampleSize, 3);
  assert.equal(audits[1].trends.find((item) => item.metricId === "prompt_quality").status, "insufficient_data");
});

test("dashboard drills from metrics into escaped source evidence", () => {
  const audit = new AgentOptimizer().analyze([normalizeSession({ id: "dash", prompts: ["fix it"], evidence: [{ type: "file", location: "<unsafe>" }] })]).audit;
  const html = generateDashboard([audit]);
  assert.match(html, /Prompt Quality/);
  assert.match(html, /Session dash/);
  assert.match(html, /&lt;unsafe&gt;/);
  assert.doesNotMatch(html, /<unsafe>/);
});
