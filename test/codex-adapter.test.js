import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { importCodexHistory, loadCodexSessionModels, parseCodexHistory, valueOf } from "../src/index.js";

test("Codex history groups and orders prompts by session", () => {
  const text = [
    JSON.stringify({ session_id: "two", ts: 20, text: "Second session" }),
    JSON.stringify({ session_id: "one", ts: 15, text: "Follow up: fix it" }),
    JSON.stringify({ session_id: "one", ts: 10, text: "Implement the parser" })
  ].join("\n");
  const sessions = importCodexHistory(text);
  assert.equal(sessions.length, 2);
  const first = sessions.find((session) => session.id === "codex:one");
  assert.deepEqual(valueOf(first.fields.prompts), ["Implement the parser", "Follow up: fix it"]);
  assert.equal(valueOf(first.fields.task), "Implement the parser");
  assert.equal(first.fields.result.status, "unavailable");
  assert.equal(first.fields.interactions.status, "unavailable");
});

test("Codex history reports malformed or incomplete rows without inventing sessions", () => {
  const { records, warnings } = parseCodexHistory('{bad}\n{"session_id":"x","ts":1}\n');
  assert.equal(records.length, 0);
  assert.match(warnings.join("\n"), /line 1: invalid JSON/);
  assert.match(warnings.join("\n"), /line 2: missing prompt text/);
});

test("Codex session metadata enriches imported model information", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-optimizer-codex-"));
  const nested = join(root, "2026", "09", "21");
  await mkdir(nested, { recursive: true });
  await writeFile(join(nested, "session.jsonl"), [
    JSON.stringify({ type: "session_meta", payload: { id: "abc", model_provider: "openai" } }),
    JSON.stringify({ type: "turn_context", payload: { model: "gpt-5" } })
  ].join("\n"), "utf8");
  const models = await loadCodexSessionModels(root);
  const [session] = importCodexHistory(JSON.stringify({ session_id: "abc", ts: 10, text: "Audit this" }), { models });
  assert.equal(valueOf(session.fields.model), "gpt-5");
});
