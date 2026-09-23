import { readdir, readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { homedir } from "node:os";
import { access } from "node:fs/promises";
import { normalizeMany } from "../normalize.js";

function parseJsonLine(line, lineNumber, warnings) {
  try {
    return JSON.parse(line);
  } catch (error) {
    warnings.push(`line ${lineNumber}: invalid JSON (${error.message})`);
    return null;
  }
}

function validTimestamp(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const date = new Date(value * 1000);
  return Number.isNaN(date.valueOf()) ? null : date;
}

function modelFor(models, sessionId) {
  const value = models?.get?.(sessionId);
  if (!value) return undefined;
  return value.modelId ?? value.model ?? undefined;
}

/**
 * Parse Codex's local history.jsonl into one raw AgentOptimizer record per session.
 * The history contains user prompts, not a complete transcript, so fields that the
 * source cannot prove are marked unavailable during normalization.
 */
export function parseCodexHistory(text, { models = new Map() } = {}) {
  const warnings = [];
  const grouped = new Map();

  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    const entry = parseJsonLine(line, index + 1, warnings);
    if (!entry) continue;
    if (typeof entry.text !== "string" || !entry.text.trim()) {
      warnings.push(`line ${index + 1}: missing prompt text`);
      continue;
    }
    const timestamp = validTimestamp(entry.ts);
    if (!timestamp) {
      warnings.push(`line ${index + 1}: invalid Unix timestamp`);
      continue;
    }
    const sessionId = String(entry.session_id ?? `unknown-line-${index + 1}`);
    if (!grouped.has(sessionId)) grouped.set(sessionId, []);
    grouped.get(sessionId).push({
      text: entry.text.trim(),
      timestamp,
      line: index + 1
    });
  }

  const records = [...grouped.entries()].map(([sessionId, prompts]) => {
    prompts.sort((left, right) => left.timestamp - right.timestamp || left.line - right.line);
    const model = modelFor(models, sessionId);
    return {
      id: `codex:${sessionId}`,
      tool: "codex",
      session: sessionId,
      task: prompts[0].text,
      prompts: prompts.map((item) => item.text),
      timestamp: prompts[0].timestamp.toISOString(),
      model,
      observability: {
        context: "unavailable",
        commands: "unavailable",
        filesRead: "unavailable",
        filesChanged: "unavailable",
        testsExecuted: "unavailable",
        result: "unavailable",
        interactions: "unavailable",
        cost: "unavailable",
        specArtifacts: "unavailable",
        validation: "unavailable",
        operations: "unavailable"
      },
      evidence: prompts.map((item) => ({
        type: "codex-history",
        location: `history.jsonl:${item.line}`
      }))
    };
  });

  return { records, warnings };
}

export function importCodexHistory(text, options = {}) {
  const { records, warnings } = parseCodexHistory(text, options);
  return normalizeMany(records, {
    source: options.source ?? "codex",
    format: "codex-history-jsonl",
    warnings,
    limitations: {
      context: "Codex history.jsonl does not include the context supplied to the model.",
      commands: "Codex history.jsonl does not include tool calls.",
      filesRead: "Codex history.jsonl does not include file reads.",
      filesChanged: "Codex history.jsonl does not include file changes.",
      testsExecuted: "Codex history.jsonl cannot prove which validations ran.",
      result: "Codex history.jsonl contains prompts, not assistant outcomes.",
      interactions: "Codex history.jsonl is a prompt history, not a complete ordered transcript.",
      cost: "Codex history.jsonl does not include token or cost data.",
      specArtifacts: "Codex history.jsonl does not identify specification artifacts.",
      validation: "Codex history.jsonl does not include validation results.",
      operations: "Codex history.jsonl does not include tool operations."
    }
  });
}

/** Locate Codex's prompt history without reading it. The caller still opts in
 * by selecting the --codex source. */
export async function findCodexHistoryPath() {
  const candidates = [
    process.env.CODEX_HOME ? resolve(process.env.CODEX_HOME, "history.jsonl") : undefined,
    resolve(homedir(), ".codex", "history.jsonl")
  ].filter(Boolean);
  for (const candidate of [...new Set(candidates)]) {
    try { await access(candidate); return candidate; } catch { /* try next known local location */ }
  }
  return undefined;
}

export async function findCodexSessionsPath() {
  const candidates = [
    process.env.CODEX_HOME ? resolve(process.env.CODEX_HOME, "sessions") : undefined,
    resolve(homedir(), ".codex", "sessions")
  ].filter(Boolean);
  for (const candidate of [...new Set(candidates)]) {
    try { await access(candidate); return candidate; } catch { /* try next known local location */ }
  }
  return undefined;
}

function textContent(content, acceptedTypes) {
  return (Array.isArray(content) ? content : [])
    .filter((item) => acceptedTypes.includes(item?.type) && typeof item.text === "string")
    .map((item) => item.text.trim()).filter(Boolean).join("\n");
}

function userRequest(text) {
  const trimmed = text.trim();
  if (/^<(?:recommended_plugins|environment_context|permissions instructions|skills_instructions|app-context|developer)/i.test(trimmed)) return "";
  const attachmentRequest = trimmed.match(/## My request:\s*\n([\s\S]*)$/i);
  return (attachmentRequest?.[1] ?? trimmed).trim();
}

/** Parse a Codex Desktop rollout JSONL, which includes observable messages and tool calls. */
export function importCodexSessionTranscript(text, { source = "codex-session" } = {}) {
  const warnings = [];
  let meta = {};
  const prompts = [];
  const interactions = [];
  const operations = [];
  const usage = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    const entry = parseJsonLine(line, index + 1, warnings);
    if (!entry?.payload || typeof entry.payload !== "object") continue;
    const payload = entry.payload;
    if (entry.type === "session_meta") { meta = { ...meta, ...payload }; continue; }
    if (entry.type === "response_item" && payload.type === "message") {
      const user = payload.role === "user" ? userRequest(textContent(payload.content, ["input_text"])) : "";
      const assistant = payload.role === "assistant" ? textContent(payload.content, ["output_text"]) : "";
      if (user) { prompts.push(user); interactions.push({ role: "user", text: user }); }
      if (assistant) interactions.push({ role: "assistant", text: assistant });
    }
    if (entry.type === "response_item" && ["function_call", "custom_tool_call"].includes(payload.type) && payload.name) operations.push(`tool:${payload.name}`);
    if (entry.type === "token_usage_record" && payload.usage) usage.push(payload.usage);
  }
  if (!prompts.length) return [];
  const sessionId = String(meta.id ?? meta.session_id ?? basename(source, ".jsonl"));
  return normalizeMany([{
    id: `codex:${sessionId}`, tool: "codex", session: sessionId, task: prompts[0], prompts,
    interactions, operations, usage: usage.at(-1), project: meta.cwd,
    timestamp: meta.timestamp,
    observability: { context: "unavailable", commands: "unavailable", filesRead: "unavailable", filesChanged: "unavailable", testsExecuted: "unavailable", result: "unavailable", cost: "unavailable", specArtifacts: "unavailable", validation: "unavailable" },
    evidence: [{ type: "codex-session-transcript", location: source }]
  }], { source, format: "codex-session-jsonl", warnings, limitations: {
    context: "Codex session logs do not expose the complete model context.", commands: "Codex session logs do not prove shell command execution.", filesRead: "Codex session logs do not prove file reads.", filesChanged: "Codex session logs do not prove file changes.", testsExecuted: "Codex session logs do not prove validation execution.", result: "No task outcome is inferred from a transcript alone.", cost: "The session transcript does not provide normalized cost data.", specArtifacts: "Codex session logs do not identify specification artifacts.", validation: "Codex session logs do not provide normalized validation results."
  } });
}

export async function importCodexSessions(sessionsPath) {
  const files = await walkJsonl(resolve(sessionsPath));
  const sessions = [];
  for (const file of files) sessions.push(...importCodexSessionTranscript(await readFile(file, "utf8"), { source: file }));
  return sessions;
}

async function walkJsonl(root, current = root, output = []) {
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = resolve(current, entry.name);
    if (entry.isDirectory()) await walkJsonl(root, path, output);
    else if (entry.isFile() && entry.name.endsWith(".jsonl")) output.push(path);
  }
  return output;
}

/** Read model/provider metadata from Codex session JSONL files. */
export async function loadCodexSessionModels(sessionsPath) {
  const models = new Map();
  if (!sessionsPath) return models;
  let files;
  try {
    files = await walkJsonl(resolve(sessionsPath));
  } catch (error) {
    if (error.code === "ENOENT") return models;
    throw error;
  }

  for (const file of files) {
    const lines = (await readFile(file, "utf8")).split(/\r?\n/).slice(0, 400);
    let sessionId;
    let modelId;
    let modelProvider;
    for (const line of lines) {
      if (!line.trim()) continue;
      let entry;
      try { entry = JSON.parse(line); } catch { continue; }
      const payload = entry?.payload;
      if (!payload || typeof payload !== "object") continue;
      if (entry.type === "session_meta") {
        if (typeof payload.id === "string" && payload.id.trim()) sessionId = payload.id.trim();
        if (typeof payload.model === "string" && payload.model.trim()) modelId = payload.model.trim();
        if (typeof payload.model_provider === "string" && payload.model_provider.trim()) modelProvider = payload.model_provider.trim();
      }
      if (entry.type === "turn_context" && typeof payload.model === "string" && payload.model.trim()) modelId = payload.model.trim();
      if (sessionId && modelId && modelProvider) break;
    }
    if (!sessionId) sessionId = basename(file, ".jsonl");
    if (modelId || modelProvider) models.set(sessionId, { modelId, modelProvider, sourceFile: file });
  }
  return models;
}
