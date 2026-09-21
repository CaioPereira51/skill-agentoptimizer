import { normalizeMany } from "../normalize.js";

function contentText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.filter((block) => block?.type === "text" && typeof block.text === "string").map((block) => block.text).join("\n");
}

function parseLines(text) {
  const rows = [];
  const warnings = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    try { rows.push({ entry: JSON.parse(line), line: index + 1 }); }
    catch (error) { warnings.push(`line ${index + 1}: invalid JSON (${error.message})`); }
  }
  return { rows, warnings };
}

function toolBlocks(message) {
  return Array.isArray(message?.content) ? message.content.filter((block) => block?.type === "tool_use") : [];
}

function pathFromTool(block) {
  return block?.input?.file_path ?? block?.input?.path;
}

export function parseClaudeCodeTranscript(text) {
  const { rows, warnings } = parseLines(text);
  const groups = new Map();
  for (const row of rows) {
    const entry = row.entry;
    const role = entry?.message?.role ?? (entry.type === "user" || entry.type === "assistant" ? entry.type : undefined);
    if (!role) continue;
    const sessionId = String(entry.sessionId ?? entry.session_id ?? "default");
    if (!groups.has(sessionId)) groups.set(sessionId, []);
    groups.get(sessionId).push({ ...row, role, message: entry.message ?? entry });
  }

  const records = [...groups.entries()].map(([sessionId, events]) => {
    const prompts = [];
    const interactions = [];
    const commands = [];
    const filesRead = [];
    const filesChanged = [];
    const testsExecuted = [];
    const operations = [];
    const models = [];
    for (const event of events) {
      const textValue = contentText(event.message.content ?? event.message.text);
      if (textValue) {
        interactions.push({ role: event.role, text: textValue, timestamp: event.entry.timestamp, evidence: { location: `transcript.jsonl:${event.line}` } });
        if (event.role === "user") prompts.push(textValue);
      }
      if (typeof event.message.model === "string") models.push(event.message.model);
      for (const block of toolBlocks(event.message)) {
        const name = String(block.name ?? "unknown");
        operations.push({ tool: name, input: block.input, location: `transcript.jsonl:${event.line}` });
        const path = pathFromTool(block);
        if (/^(read|glob|grep)$/i.test(name) && path) filesRead.push(path);
        if (/^(edit|write|notebookedit)$/i.test(name) && path) filesChanged.push(path);
        const command = block?.input?.command;
        if (typeof command === "string") {
          commands.push(command);
          if (/\b(test|lint|typecheck|build|pytest|cargo test|go test)\b/i.test(command)) testsExecuted.push(command);
        }
      }
    }
    const observedTools = operations.length > 0;
    return {
      id: `claude-code:${sessionId}`,
      tool: "claude-code",
      session: sessionId,
      task: prompts[0],
      prompts,
      interactions,
      model: models.at(-1),
      commands: observedTools ? commands : undefined,
      filesRead: observedTools ? [...new Set(filesRead)] : undefined,
      filesChanged: observedTools ? [...new Set(filesChanged)] : undefined,
      testsExecuted: observedTools ? [...new Set(testsExecuted)] : undefined,
      operations: observedTools ? operations : undefined,
      timestamp: events.map((event) => event.entry.timestamp).find(Boolean),
      observability: {
        context: "unavailable", result: "unavailable", cost: "unavailable", specArtifacts: "unavailable",
        validation: "unavailable",
        ...(!observedTools ? { commands: "unavailable", filesRead: "unavailable", filesChanged: "unavailable", testsExecuted: "unavailable", operations: "unavailable" } : {})
      },
      evidence: events.map((event) => ({ type: "claude-code-transcript", location: `transcript.jsonl:${event.line}` }))
    };
  });
  return { records, warnings };
}

export function importClaudeCodeTranscript(text, options = {}) {
  const { records, warnings } = parseClaudeCodeTranscript(text);
  return normalizeMany(records, {
    source: options.source ?? "claude-code",
    format: "claude-code-transcript-jsonl",
    warnings,
    limitations: {
      context: "Claude Code transcript exports do not prove the complete model context.",
      result: "No task outcome is inferred from transcript termination.",
      cost: "Cost is unavailable unless supplied by a separate collector.",
      specArtifacts: "Specification use is not inferred from repository presence.",
      validation: "Only observed validation commands are recorded in testsExecuted."
    }
  });
}
