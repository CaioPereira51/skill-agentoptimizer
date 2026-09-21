import test from "node:test";
import assert from "node:assert/strict";
import { importText, normalizeSession, valueOf } from "../src/index.js";

test("normalization distinguishes unknown from observed empty", () => {
  const unknown = normalizeSession({ id: "unknown" });
  const empty = normalizeSession({ id: "empty", testsExecuted: [] });
  assert.equal(unknown.fields.testsExecuted.status, "unknown");
  assert.equal(empty.fields.testsExecuted.status, "known");
  assert.deepEqual(valueOf(empty.fields.testsExecuted), []);
});

test("explicit unavailable state is preserved", () => {
  const session = normalizeSession({ id: "x", observability: { cost: "unavailable" } }, { limitations: { cost: "export omits cost" } });
  assert.deepEqual(session.fields.cost, { status: "unavailable", reason: "export omits cost" });
});

test("JSON and Markdown imports produce the same semantic core", () => {
  const json = importText(JSON.stringify({ id: "same", tool: "agent", task: "Review docs", prompts: ["Review docs"], filesRead: ["README.md"], result: "success" }), "json")[0];
  const markdown = importText("## Session: same\n---\nid: same\ntool: agent\ntask: Review docs\n---\nPrompt: Review docs\nFiles Read: README.md\nResult: success", "md")[0];
  assert.equal(valueOf(json.fields.tool), valueOf(markdown.fields.tool));
  assert.equal(valueOf(json.fields.task), valueOf(markdown.fields.task));
  assert.deepEqual(valueOf(json.fields.prompts), valueOf(markdown.fields.prompts));
  assert.deepEqual(valueOf(json.fields.filesRead), valueOf(markdown.fields.filesRead));
});

test("invalid JSONL reports exact line", () => {
  assert.throws(() => importText('{"id":1}\nnot-json', "jsonl"), /line 2/);
});

test("structured JSON logs import one session per line", () => {
  const sessions = importText('{"id":"one","prompts":["Analyze x"]}\n{"id":"two","prompts":["Analyze y"]}', "log");
  assert.deepEqual(sessions.map((session) => session.id), ["one", "two"]);
});

test("invalid normalized input is rejected", () => {
  assert.throws(() => normalizeSession(null), /object/);
});
