import { readdir, readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
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
