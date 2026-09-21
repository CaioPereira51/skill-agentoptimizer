import test from "node:test";
import assert from "node:assert/strict";
import { importClaudeCodeTranscript, importCursorExport, importCursorTranscript, valueOf } from "../src/index.js";

test("Claude Code transcript captures ordered messages and observed tool evidence", () => {
  const transcript = [
    { type: "user", sessionId: "c1", timestamp: "2026-01-01T00:00:00Z", message: { role: "user", content: "Implement parser" } },
    { type: "assistant", sessionId: "c1", timestamp: "2026-01-01T00:00:01Z", message: { role: "assistant", model: "claude-test", content: [
      { type: "text", text: "Working" },
      { type: "tool_use", name: "Read", input: { file_path: "src/parser.js" } },
      { type: "tool_use", name: "Bash", input: { command: "npm test" } }
    ] } },
    { type: "user", sessionId: "c1", timestamp: "2026-01-01T00:00:02Z", message: { role: "user", content: "accepted" } }
  ].map((entry) => JSON.stringify(entry)).join("\n");
  const [session] = importClaudeCodeTranscript(transcript);
  assert.deepEqual(valueOf(session.fields.prompts), ["Implement parser", "accepted"]);
  assert.deepEqual(valueOf(session.fields.filesRead), ["src/parser.js"]);
  assert.deepEqual(valueOf(session.fields.testsExecuted), ["npm test"]);
  assert.equal(valueOf(session.fields.model), "claude-test");
  assert.equal(session.fields.result.status, "unavailable");
});

test("Cursor export captures conversation but keeps tool evidence unavailable", () => {
  const [session] = importCursorExport({ sessions: [{ id: "cursor-1", messages: [
    { role: "user", content: "Review the API" },
    { role: "assistant", content: "Reviewed" }
  ] }] });
  assert.deepEqual(valueOf(session.fields.prompts), ["Review the API"]);
  assert.equal(valueOf(session.fields.interactions).length, 2);
  assert.equal(session.fields.filesRead.status, "unavailable");
  assert.equal(session.fields.testsExecuted.status, "unavailable");
});

test("Cursor Markdown transcript captures only explicit conversation messages", () => {
  const [session] = importCursorTranscript("# User\nReview the API\n\n# Assistant\nI reviewed it.", { source: "chat.md" });
  assert.deepEqual(valueOf(session.fields.prompts), ["Review the API"]);
  assert.equal(valueOf(session.fields.interactions).length, 2);
  assert.equal(session.fields.filesRead.status, "unavailable");
  assert.equal(session.sourceFormat, "cursor-transcript-markdown");
});
