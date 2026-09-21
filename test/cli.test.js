import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { INTERCHANGE_SCHEMA } from "../src/index.js";

const cli = resolve("bin/agent-optimizer.js");

function run(args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
}

test("CLI audits Codex history without persistence", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-optimizer-cli-"));
  const file = join(root, "history.jsonl");
  await writeFile(file, JSON.stringify({ session_id: "abc", ts: 10, text: "Audit this repository" }), "utf8");
  const result = run(["audit", "--codex-history", file, "--no-persist", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).sourceSummary[0], `${file}:codex-history-jsonl`);
});

test("CLI audits interchange documents", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-optimizer-cli-"));
  const file = join(root, "interchange.json");
  await writeFile(file, JSON.stringify({ schema: INTERCHANGE_SCHEMA, sessions: [{ id: "x", fields: { prompts: { status: "known", value: ["Review x"] } } }] }), "utf8");
  const result = run(["audit", "--interchange", file, "--no-persist", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).schemaVersion, 3);
});

test("CLI audits Claude Code transcript, Cursor export, and Cursor Markdown transcript", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-optimizer-cli-"));
  const claudeFile = join(root, "claude.jsonl");
  const cursorFile = join(root, "cursor.json");
  const cursorTranscriptFile = join(root, "cursor.md");
  await writeFile(claudeFile, [
    { type: "user", sessionId: "c", message: { role: "user", content: "Review this" } },
    { type: "assistant", sessionId: "c", message: { role: "assistant", content: "Reviewed" } }
  ].map((entry) => JSON.stringify(entry)).join("\n"), "utf8");
  await writeFile(cursorFile, JSON.stringify({ sessions: [{ id: "x", messages: [{ role: "user", content: "Review this" }] }] }), "utf8");
  await writeFile(cursorTranscriptFile, "# User\nReview this\n\n# Assistant\nReviewed", "utf8");

  const claude = run(["audit", "--claude-transcript", claudeFile, "--no-persist", "--json"]);
  const cursor = run(["audit", "--cursor-export", cursorFile, "--no-persist", "--json"]);
  const cursorTranscript = run(["audit", "--cursor-transcript", cursorTranscriptFile, "--no-persist", "--json"]);
  assert.equal(claude.status, 0, claude.stderr);
  assert.equal(cursor.status, 0, cursor.stderr);
  assert.equal(cursorTranscript.status, 0, cursorTranscript.stderr);
  assert.match(JSON.parse(claude.stdout).sourceSummary[0], /claude-code-transcript-jsonl/);
  assert.match(JSON.parse(cursor.stdout).sourceSummary[0], /cursor-export-json/);
  assert.match(JSON.parse(cursorTranscript.stdout).sourceSummary[0], /cursor-transcript-markdown/);
});
