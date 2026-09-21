import { normalizeMany } from "../normalize.js";

function messageText(message) {
  const value = message?.content ?? message?.text ?? message?.message;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((item) => typeof item === "string" ? item : item?.text ?? "").filter(Boolean).join("\n");
  return "";
}

function sessionsFrom(document) {
  if (Array.isArray(document)) return document;
  if (Array.isArray(document.sessions)) return document.sessions;
  if (Array.isArray(document.composers)) return document.composers;
  return [document];
}

export function importCursorExport(input, options = {}) {
  const document = typeof input === "string" ? JSON.parse(input) : input;
  const records = sessionsFrom(document).map((session, index) => {
    const messages = session.messages ?? session.bubbles ?? session.conversation ?? [];
    const interactions = messages.map((message) => ({
      role: message.role ?? (message.type === "ai" ? "assistant" : message.type),
      text: messageText(message),
      timestamp: message.timestamp
    })).filter((message) => message.text);
    const prompts = interactions.filter((message) => ["user", "human"].includes(message.role)).map((message) => message.text);
    return {
      id: `cursor:${session.id ?? session.composerId ?? session.conversationId ?? index + 1}`,
      tool: "cursor",
      session: String(session.id ?? session.composerId ?? session.conversationId ?? index + 1),
      task: prompts[0],
      prompts,
      interactions,
      model: session.model,
      timestamp: session.createdAt ?? session.timestamp,
      observability: {
        context: "unavailable", commands: "unavailable", filesRead: "unavailable", filesChanged: "unavailable",
        testsExecuted: "unavailable", result: "unavailable", cost: "unavailable", specArtifacts: "unavailable",
        validation: "unavailable", operations: "unavailable"
      },
      evidence: [{ type: "cursor-export", location: `session:${session.id ?? index + 1}` }]
    };
  });
  return normalizeMany(records, {
    source: options.source ?? "cursor",
    format: "cursor-export-json",
    limitations: {
      context: "Cursor conversation export does not prove complete model context.",
      commands: "Tool activity is unavailable in the supported conversation export.",
      filesRead: "File reads are unavailable in the supported conversation export.",
      filesChanged: "File changes are unavailable in the supported conversation export.",
      testsExecuted: "Validation execution is unavailable in the supported conversation export.",
      result: "No outcome is inferred from the last message."
    }
  });
}
